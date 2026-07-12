-- =====================================================================
-- Phase 1 — Foundations & train simulation
-- =====================================================================
-- Scope of this migration:
--   * Minimal player/lobby tables (FK integrity only; fleshed out later)
--   * track_profile          (shared route reference, not session-scoped)
--   * game_sessions          (session-scoped)
--   * train_state            (session-scoped, authoritative live state)
--   * sim_config             (single tunable row mirroring shared/constants.ts)
--   * sim_tick()             (THE authoritative simulation step)
--   * pg_cron schedule       (drives sim_tick on an interval)
--   * Player action RPCs      (set throttle/brake, add coal, set switch)
--   * RLS (cooperative trust model — simple, permissive)
--   * Realtime publication for train_state & game_sessions
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_cron;     -- scheduled sim tick

-- ---------------------------------------------------------------------
-- Persistent (player) — minimal for Phase 1
-- ---------------------------------------------------------------------
create table if not exists players (
  id                  uuid primary key default gen_random_uuid(),
  auth_uid            uuid unique,                 -- links to auth.users (nullable for now)
  pseudo              text not null,
  monnaie_persistante bigint not null default 0,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Session-scoped: lobbies (minimal for Phase 1)
-- ---------------------------------------------------------------------
create table if not exists lobbies (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  cree_par   uuid references players(id) on delete set null,
  statut     text not null default 'en_cours' check (statut in ('en_cours','termine')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Route reference (SHARED, not session-scoped): the fixed track profile.
-- The layout is identical for every session; only progress along it is
-- session-specific. Serves both the server sim and the planning screen.
-- ---------------------------------------------------------------------
create table if not exists track_profile (
  id            uuid primary key default gen_random_uuid(),
  position_km   numeric(10,3) not null,
  pente         numeric(6,2)  not null default 0,   -- ‰, + = uphill
  vitesse_cible numeric(6,2)  not null,             -- km/h
  type_point    text not null check (type_point in
                  ('ligne_droite','aiguillage','gare','montee','descente')),
  libelle       text not null default '',
  unique (position_km)
);
create index if not exists idx_track_profile_position on track_profile(position_km);

-- ---------------------------------------------------------------------
-- Session-scoped: game_sessions
-- ---------------------------------------------------------------------
create table if not exists game_sessions (
  id                 uuid primary key default gen_random_uuid(),
  lobby_id           uuid not null references lobbies(id) on delete cascade,
  distance_totale_km numeric(12,3) not null default 0,
  statut             text not null default 'en_cours' check (statut in ('en_cours','terminee')),
  cause_fin          text,
  demarree_le        timestamptz not null default now(),
  terminee_le        timestamptz
);
create index if not exists idx_sessions_statut on game_sessions(statut);
create index if not exists idx_sessions_lobby on game_sessions(lobby_id);

-- ---------------------------------------------------------------------
-- Session-scoped: train_state (one row per session, live authoritative state)
-- ---------------------------------------------------------------------
create table if not exists train_state (
  session_id              uuid primary key references game_sessions(id) on delete cascade,
  vitesse                 numeric(7,3) not null default 0,       -- km/h
  distance_parcourue      numeric(12,3) not null default 0,      -- km (position on track)
  niveau_charbon          numeric(7,3) not null default 100,     -- fuel units
  throttle                numeric(4,3) not null default 0 check (throttle between 0 and 1),
  brake                   numeric(4,3) not null default 0 check (brake between 0 and 1),
  etat_aiguillage_courant text not null default 'neutre'
                            check (etat_aiguillage_courant in ('gauche','droite','neutre')),
  conducteur_actif_id     uuid references players(id) on delete set null,
  retard_accumule_km      numeric(12,3) not null default 0,
  mode_veille             boolean not null default false,        -- deliberate slowdown
  timestamp_dernier_tick  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- sim_config — ONE row mirroring shared/constants.ts (single tuning point)
-- ---------------------------------------------------------------------
create table if not exists sim_config (
  id                                    boolean primary key default true check (id),
  vitesse_max_kmh                       numeric not null,
  accel_max_kmh_s                       numeric not null,
  brake_max_kmh_s                       numeric not null,
  rolling_resistance_kmh_s              numeric not null,
  gradient_drag_per_permille            numeric not null,
  charbon_max                           numeric not null,
  charbon_base_conso_per_s              numeric not null,
  charbon_speed_conso_per_kmh_s         numeric not null,
  charbon_gradient_conso_per_permille_s numeric not null,
  charbon_add_per_action                numeric not null,
  retard_critique_km                    numeric not null,
  tick_target_interval_s                numeric not null,
  tick_max_dt_s                         numeric not null
);

insert into sim_config (
  id, vitesse_max_kmh, accel_max_kmh_s, brake_max_kmh_s, rolling_resistance_kmh_s,
  gradient_drag_per_permille, charbon_max, charbon_base_conso_per_s,
  charbon_speed_conso_per_kmh_s, charbon_gradient_conso_per_permille_s,
  charbon_add_per_action, retard_critique_km, tick_target_interval_s, tick_max_dt_s
) values (
  true, 120, 2.0, 4.0, 0.3,
  0.15, 100, 0.02,
  0.003, 0.02,
  10, 50, 5, 30
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Helper: gradient (‰) at a given position on the track.
-- Uses the pente of the nearest track point at or before the position.
-- ---------------------------------------------------------------------
create or replace function track_gradient_at(p_position_km numeric)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select pente
       from track_profile
      where position_km <= p_position_km
      order by position_km desc
      limit 1),
    0
  );
$$;

-- ---------------------------------------------------------------------
-- Helper: target speed (km/h) at a given position (for retard calc & planning).
-- ---------------------------------------------------------------------
create or replace function track_target_speed_at(p_position_km numeric)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select vitesse_cible
       from track_profile
      where position_km <= p_position_km
      order by position_km desc
      limit 1),
    (select vitesse_cible from track_profile order by position_km asc limit 1),
    0
  );
$$;

-- =====================================================================
-- sim_tick() — THE authoritative simulation step.
-- Time-based: computes dt from real elapsed time, so it is robust to
-- irregular cron cadence and to server outages (reprise après coupure).
-- Idempotent per real time: advancing by dt=0 is a no-op.
-- =====================================================================
create or replace function sim_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg        sim_config%rowtype;
  ts         train_state%rowtype;
  dt         numeric;      -- effective seconds since last tick
  pente      numeric;      -- ‰ at current position
  accel      numeric;      -- km/h per second this step
  new_vit    numeric;
  dist_delta numeric;      -- km advanced this step
  conso      numeric;      -- fuel burned this step
  vcible     numeric;      -- target speed for retard calc
begin
  select * into cfg from sim_config where id;

  for ts in
    select t.*
      from train_state t
      join game_sessions g on g.id = t.session_id
     where g.statut = 'en_cours'
     for update of t skip locked
  loop
    -- Effective dt, clamped to avoid a huge jump after downtime.
    dt := extract(epoch from (now() - ts.timestamp_dernier_tick));
    if dt <= 0 then
      continue;
    end if;
    dt := least(dt, cfg.tick_max_dt_s);

    pente := track_gradient_at(ts.distance_parcourue);

    -- Acceleration model. Throttle only produces power when fuel remains.
    accel := 0;
    if ts.niveau_charbon > 0 then
      accel := ts.throttle * cfg.accel_max_kmh_s;
    end if;
    accel := accel
             - ts.brake * cfg.brake_max_kmh_s
             - cfg.rolling_resistance_kmh_s
             - cfg.gradient_drag_per_permille * pente;   -- +pente uphill slows, -pente assists

    new_vit := ts.vitesse + accel * dt;
    -- Clamp to [0, vitesse_max]
    new_vit := greatest(0, least(new_vit, cfg.vitesse_max_kmh));

    -- Distance advanced using average speed across the step.
    dist_delta := ((ts.vitesse + new_vit) / 2.0) * dt / 3600.0;

    -- Fuel consumption (higher with speed and uphill gradient).
    conso := (
        cfg.charbon_base_conso_per_s
      + cfg.charbon_speed_conso_per_kmh_s * new_vit
      + cfg.charbon_gradient_conso_per_permille_s * greatest(pente, 0)
    ) * dt;

    -- Retard: accumulate the shortfall vs the track's target speed while the
    -- train is behind it. Deliberate slowdown (mode_veille) still accrues
    -- retard by design — that is the strategic trade-off. Only a bad score,
    -- never a game over (Phase 1 decision).
    vcible := track_target_speed_at(ts.distance_parcourue);

    update train_state t set
      vitesse                = new_vit,
      distance_parcourue     = t.distance_parcourue + dist_delta,
      niveau_charbon         = greatest(0, t.niveau_charbon - conso),
      retard_accumule_km     = t.retard_accumule_km
                                 + greatest(0, (vcible - new_vit)) * dt / 3600.0,
      timestamp_dernier_tick = now()
    where t.session_id = ts.session_id;

    -- Keep the session distance mirror in sync (score source).
    update game_sessions
       set distance_totale_km = ts.distance_parcourue + dist_delta
     where id = ts.session_id;
  end loop;
end;
$$;

-- Schedule the tick. pg_cron (>=1.5, as on Supabase) accepts sub-minute
-- interval syntax like '5 seconds'. Cadence is a config concern; the tick
-- itself is time-based so exact cadence is not load-bearing.
select cron.schedule('en-voiture-sim-tick', '5 seconds', $$select sim_tick();$$);

-- =====================================================================
-- Player action RPCs (server-authoritative). Phase 1 = permissive
-- (cooperative trust). Conductor-only locking arrives in Phase 3.
-- =====================================================================
create or replace function action_set_throttle(p_session uuid, p_value numeric)
returns void language sql security definer set search_path = public as $$
  update train_state set throttle = greatest(0, least(1, p_value))
   where session_id = p_session;
$$;

create or replace function action_set_brake(p_session uuid, p_value numeric)
returns void language sql security definer set search_path = public as $$
  update train_state set brake = greatest(0, least(1, p_value))
   where session_id = p_session;
$$;

create or replace function action_add_charbon(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cfg sim_config%rowtype;
begin
  select * into cfg from sim_config where id;
  update train_state
     set niveau_charbon = least(cfg.charbon_max, niveau_charbon + cfg.charbon_add_per_action)
   where session_id = p_session;
end;
$$;

create or replace function action_set_aiguillage(p_session uuid, p_value text)
returns void language sql security definer set search_path = public as $$
  update train_state set etat_aiguillage_courant = p_value
   where session_id = p_session and p_value in ('gauche','droite','neutre');
$$;

create or replace function action_set_mode_veille(p_session uuid, p_value boolean)
returns void language sql security definer set search_path = public as $$
  update train_state set mode_veille = p_value where session_id = p_session;
$$;

-- =====================================================================
-- RLS — cooperative trust model: any authenticated user may read/act.
-- (Anti-cheat is explicitly out of scope; the server is authoritative for
--  the simulation math regardless.)
-- =====================================================================
alter table players       enable row level security;
alter table lobbies       enable row level security;
alter table game_sessions enable row level security;
alter table train_state   enable row level security;
alter table track_profile enable row level security;
alter table sim_config    enable row level security;

do $$
begin
  -- Readable by anyone authenticated.
  execute 'create policy p_read on players       for select using (auth.role() = ''authenticated'')';
  execute 'create policy l_read on lobbies        for select using (auth.role() = ''authenticated'')';
  execute 'create policy s_read on game_sessions  for select using (auth.role() = ''authenticated'')';
  execute 'create policy t_read on train_state    for select using (auth.role() = ''authenticated'')';
  execute 'create policy tp_read on track_profile for select using (true)';
  execute 'create policy cfg_read on sim_config   for select using (true)';

  -- Writes go through SECURITY DEFINER RPCs, but allow basic inserts for
  -- lobby/session bootstrap in Phase 1.
  execute 'create policy p_write on players       for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  execute 'create policy l_write on lobbies        for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  execute 'create policy s_write on game_sessions  for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
end$$;

-- =====================================================================
-- Realtime: broadcast train_state + game_sessions changes to clients.
-- =====================================================================
alter publication supabase_realtime add table train_state;
alter publication supabase_realtime add table game_sessions;

-- =====================================================================
-- Convenience: start a fresh session for a lobby with an initialised train.
-- =====================================================================
create or replace function start_session(p_lobby uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_session uuid; cfg sim_config%rowtype;
begin
  select * into cfg from sim_config where id;
  insert into game_sessions (lobby_id) values (p_lobby) returning id into v_session;
  insert into train_state (session_id, niveau_charbon, timestamp_dernier_tick)
    values (v_session, cfg.charbon_max, now());
  return v_session;
end;
$$;
