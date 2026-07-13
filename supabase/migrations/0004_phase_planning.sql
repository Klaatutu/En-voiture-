-- =====================================================================
-- Planning — scheduled actions along the (known) track (Virtual Regatta core)
-- =====================================================================
-- The route is known in advance, so players lay down actions keyed to a
-- position ("at km 8, throttle 100%"). The server executes the plan
-- automatically as the train reaches each position (a tunable autopilot).
--
-- Physics is factored into ONE function `sim_step` used by the live tick
-- (and later by the forward preview) — no duplicated simulation logic.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planned actions (session-scoped).
--   action_type: 'throttle' | 'brake'  -> value in 0..1 (lever position)
--                'charbon'             -> adds one coal load (value ignored)
-- ---------------------------------------------------------------------
create table if not exists planned_actions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references game_sessions(id) on delete cascade,
  position_km numeric(10,3) not null,
  action_type text not null check (action_type in ('throttle','brake','charbon')),
  value       numeric(5,3) not null default 0,
  applied     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_planned_actions_session
  on planned_actions(session_id, position_km);

-- =====================================================================
-- sim_step — ONE authoritative physics step. Pure (no writes); used by the
-- live tick and (later) the forward preview so both stay identical.
-- =====================================================================
create or replace function sim_step(
  p_vitesse  numeric,
  p_charbon  numeric,
  p_position numeric,
  p_throttle numeric,
  p_brake    numeric,
  p_dt       numeric,
  out o_vitesse      numeric,
  out o_charbon      numeric,
  out o_position     numeric,
  out o_retard_delta numeric
)
language plpgsql stable set search_path = public as $$
declare
  cfg sim_config%rowtype; pente numeric; accel numeric;
  new_vit numeric; dist_delta numeric; conso numeric; vcible numeric;
begin
  select * into cfg from sim_config where id;
  pente := track_gradient_at(p_position);

  accel := 0;
  if p_charbon > 0 then accel := p_throttle * cfg.accel_max_kmh_s; end if;
  accel := accel
           - p_brake * cfg.brake_max_kmh_s
           - cfg.rolling_resistance_kmh_s
           - cfg.gradient_drag_per_permille * pente;

  new_vit    := greatest(0, least(p_vitesse + accel * p_dt, cfg.vitesse_max_kmh));
  dist_delta := ((p_vitesse + new_vit) / 2.0) * p_dt / 3600.0;
  conso := (
      cfg.charbon_base_conso_per_s
    + cfg.charbon_speed_conso_per_kmh_s * new_vit
    + cfg.charbon_gradient_conso_per_permille_s * greatest(pente, 0)
  ) * p_dt;
  vcible := track_target_speed_at(p_position);

  o_vitesse      := new_vit;
  o_charbon      := greatest(0, p_charbon - conso);
  o_position     := p_position + dist_delta;
  o_retard_delta := greatest(0, (vcible - new_vit)) * p_dt / 3600.0;
end$$;

-- =====================================================================
-- sim_tick — now uses sim_step and applies planned actions crossed during
-- the step (the autopilot). Incident detection unchanged.
-- =====================================================================
create or replace function sim_tick()
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg          sim_config%rowtype;
  ts           train_state%rowtype;
  pa           planned_actions%rowtype;
  dt           numeric;
  new_vit      numeric;
  new_charbon  numeric;
  new_pos      numeric;
  retard_delta numeric;
  new_throttle numeric;
  new_brake    numeric;
begin
  select * into cfg from sim_config where id;

  for ts in
    select t.*
      from train_state t
      join game_sessions g on g.id = t.session_id
     where g.statut = 'en_cours'
     for update of t skip locked
  loop
    dt := extract(epoch from (now() - ts.timestamp_dernier_tick));
    if dt <= 0 then continue; end if;
    dt := least(dt, cfg.tick_max_dt_s);

    select o_vitesse, o_charbon, o_position, o_retard_delta
      into new_vit, new_charbon, new_pos, retard_delta
      from sim_step(ts.vitesse, ts.niveau_charbon, ts.distance_parcourue,
                    ts.throttle, ts.brake, dt);

    -- Apply planned actions whose position was crossed this step.
    new_throttle := ts.throttle;
    new_brake    := ts.brake;
    for pa in
      select * from planned_actions
       where session_id = ts.session_id and applied = false
         and position_km >  ts.distance_parcourue
         and position_km <= new_pos
       order by position_km
    loop
      if pa.action_type = 'throttle' then
        new_throttle := greatest(0, least(1, pa.value));
      elsif pa.action_type = 'brake' then
        new_brake := greatest(0, least(1, pa.value));
      elsif pa.action_type = 'charbon' then
        new_charbon := least(cfg.charbon_max, new_charbon + cfg.charbon_add_per_action);
      end if;
      update planned_actions set applied = true where id = pa.id;
    end loop;

    update train_state t set
      vitesse                = new_vit,
      distance_parcourue     = new_pos,
      niveau_charbon         = new_charbon,
      throttle               = new_throttle,
      brake                  = new_brake,
      retard_accumule_km     = t.retard_accumule_km + retard_delta,
      timestamp_dernier_tick = now()
    where t.session_id = ts.session_id;

    update game_sessions set distance_totale_km = new_pos where id = ts.session_id;

    -- Incident: overspeed through a switch crossed this step.
    if exists (
      select 1 from track_profile tp
       where tp.type_point = 'aiguillage'
         and tp.position_km >  ts.distance_parcourue
         and tp.position_km <= new_pos
         and new_vit > tp.vitesse_cible * (1 + cfg.overspeed_margin_aiguillage)
    ) then
      perform end_session(ts.session_id, 'deraillement_aiguillage');
      continue;
    end if;

    -- Incident: out of coal and stopped.
    if new_charbon <= 0 and new_vit <= cfg.stop_epsilon_kmh then
      perform end_session(ts.session_id, 'panne_charbon');
      continue;
    end if;
  end loop;
end$$;

-- =====================================================================
-- Planned-action RPCs.
-- =====================================================================
create or replace function add_planned_action(
  p_session uuid, p_position numeric, p_type text, p_value numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pos numeric;
begin
  -- Cannot plan behind the train's current position.
  select distance_parcourue into v_pos from train_state where session_id = p_session;
  if v_pos is not null and p_position < v_pos then p_position := v_pos; end if;
  insert into planned_actions (session_id, position_km, action_type, value)
    values (p_session, p_position, p_type, coalesce(p_value, 0))
    returning id into v_id;
  return v_id;
end$$;

create or replace function delete_planned_action(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from planned_actions where id = p_id and applied = false;
$$;

-- =====================================================================
-- RLS + Realtime for planned_actions.
-- =====================================================================
alter table planned_actions enable row level security;
do $$
begin
  execute 'create policy pa_read on planned_actions for select using (auth.role() = ''authenticated'')';
exception when duplicate_object then null;
end$$;

alter publication supabase_realtime add table planned_actions;
