-- =====================================================================
-- Phase 2 — Lobbies, session lifecycle & incident detection
-- =====================================================================
-- Adds:
--   * player identity helper (ensure_player)
--   * lobby join codes + membership (lobby_members)
--   * session participants (session_players)
--   * create_lobby / join_lobby / start_session (multiplayer-aware)
--   * incident detection in sim_tick (coal-out, overspeed at switch)
--   * end_session() to freeze score + close the session
--   * new tunables in sim_config
-- =====================================================================

-- ---------------------------------------------------------------------
-- New tunables (mirrors shared/constants.ts additions).
-- ---------------------------------------------------------------------
alter table sim_config
  add column if not exists overspeed_margin_aiguillage numeric not null default 0.20,
  add column if not exists stop_epsilon_kmh            numeric not null default 0.5;

update sim_config
   set overspeed_margin_aiguillage = 0.20,
       stop_epsilon_kmh = 0.5
 where id;

-- ---------------------------------------------------------------------
-- Lobby join code.
-- ---------------------------------------------------------------------
alter table lobbies add column if not exists code text;
create unique index if not exists idx_lobbies_code on lobbies(code) where code is not null;

-- ---------------------------------------------------------------------
-- Lobby membership (who is in a lobby).
-- ---------------------------------------------------------------------
create table if not exists lobby_members (
  lobby_id  uuid not null references lobbies(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);

-- ---------------------------------------------------------------------
-- Session participants (who took part in a given session — basis for
-- Phase 6 reward split). Minimal now, extended later.
-- ---------------------------------------------------------------------
create table if not exists session_players (
  session_id uuid not null references game_sessions(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, player_id)
);

-- =====================================================================
-- Identity: upsert a player row for the current auth user.
-- =====================================================================
create or replace function ensure_player(p_pseudo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into players (auth_uid, pseudo)
    values (auth.uid(), coalesce(nullif(trim(p_pseudo), ''), 'Mécano'))
  on conflict (auth_uid) do update set pseudo = excluded.pseudo
  returning id into v_id;
  return v_id;
end$$;

-- =====================================================================
-- Lobbies: create (with join code) & join by code.
-- =====================================================================
create or replace function create_lobby(p_nom text)
returns table(id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; v_player uuid;
begin
  v_player := (select p.id from players p where p.auth_uid = auth.uid());
  if v_player is null then raise exception 'Joueur inconnu (appelle ensure_player)'; end if;
  -- Short, human-shareable code; retry on the rare collision.
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from lobbies l where l.code = v_code);
  end loop;
  insert into lobbies (nom, cree_par, code)
    values (coalesce(nullif(trim(p_nom), ''), 'Convoi'), v_player, v_code)
    returning lobbies.id into v_id;
  insert into lobby_members (lobby_id, player_id) values (v_id, v_player)
    on conflict do nothing;
  return query select v_id, v_code;
end$$;

create or replace function join_lobby(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lobby uuid; v_player uuid;
begin
  v_player := (select p.id from players p where p.auth_uid = auth.uid());
  if v_player is null then raise exception 'Joueur inconnu (appelle ensure_player)'; end if;
  v_lobby := (select l.id from lobbies l
               where l.code = upper(trim(p_code)) and l.statut = 'en_cours');
  if v_lobby is null then raise exception 'Lobby introuvable pour ce code'; end if;
  insert into lobby_members (lobby_id, player_id) values (v_lobby, v_player)
    on conflict do nothing;
  return v_lobby;
end$$;

-- =====================================================================
-- start_session — multiplayer-aware: one active session per lobby,
-- seeds session_players from the current lobby membership.
-- (Replaces the Phase 1 version.)
-- =====================================================================
create or replace function start_session(p_lobby uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_session uuid; cfg sim_config%rowtype;
begin
  -- Idempotent: if a session is already running for this lobby, return it.
  select id into v_session from game_sessions
   where lobby_id = p_lobby and statut = 'en_cours' limit 1;
  if v_session is not null then return v_session; end if;

  select * into cfg from sim_config where id;
  insert into game_sessions (lobby_id) values (p_lobby) returning id into v_session;
  insert into train_state (session_id, niveau_charbon, timestamp_dernier_tick)
    values (v_session, cfg.charbon_max, now());
  insert into session_players (session_id, player_id)
    select v_session, player_id from lobby_members where lobby_id = p_lobby
    on conflict do nothing;
  return v_session;
end$$;

-- =====================================================================
-- end_session — freeze the score and close the session. Idempotent.
-- =====================================================================
create or replace function end_session(p_session uuid, p_cause text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update game_sessions g set
      statut             = 'terminee',
      cause_fin          = p_cause,
      terminee_le        = now(),
      distance_totale_km = coalesce(
        (select ts.distance_parcourue from train_state ts where ts.session_id = p_session),
        g.distance_totale_km)
   where g.id = p_session and g.statut = 'en_cours';
end$$;

-- =====================================================================
-- sim_tick — now also detects incidents and ends the session.
-- Incidents (configurable):
--   * deraillement_aiguillage: crossing an 'aiguillage' point above its
--     target speed by more than overspeed_margin_aiguillage.
--   * panne_charbon: fuel hits 0 AND the train has coasted to a stop
--     (recoverable until then — add coal in time to survive).
-- Delay (retard) NEVER ends the game — it only degrades the score.
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
  dt         numeric;
  pente      numeric;
  accel      numeric;
  new_vit    numeric;
  dist_delta numeric;
  new_pos    numeric;
  new_charbon numeric;
  conso      numeric;
  vcible     numeric;
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

    pente := track_gradient_at(ts.distance_parcourue);

    accel := 0;
    if ts.niveau_charbon > 0 then
      accel := ts.throttle * cfg.accel_max_kmh_s;
    end if;
    accel := accel
             - ts.brake * cfg.brake_max_kmh_s
             - cfg.rolling_resistance_kmh_s
             - cfg.gradient_drag_per_permille * pente;

    new_vit := greatest(0, least(ts.vitesse + accel * dt, cfg.vitesse_max_kmh));
    dist_delta := ((ts.vitesse + new_vit) / 2.0) * dt / 3600.0;
    new_pos := ts.distance_parcourue + dist_delta;

    conso := (
        cfg.charbon_base_conso_per_s
      + cfg.charbon_speed_conso_per_kmh_s * new_vit
      + cfg.charbon_gradient_conso_per_permille_s * greatest(pente, 0)
    ) * dt;
    new_charbon := greatest(0, ts.niveau_charbon - conso);

    vcible := track_target_speed_at(ts.distance_parcourue);

    update train_state t set
      vitesse                = new_vit,
      distance_parcourue     = new_pos,
      niveau_charbon         = new_charbon,
      retard_accumule_km     = t.retard_accumule_km
                                 + greatest(0, (vcible - new_vit)) * dt / 3600.0,
      timestamp_dernier_tick = now()
    where t.session_id = ts.session_id;

    update game_sessions set distance_totale_km = new_pos where id = ts.session_id;

    -- --- Incident checks (after applying movement) --------------------
    -- Overspeed through a switch crossed during this step → derailment.
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

    -- Out of coal AND stopped → dead train.
    if new_charbon <= 0 and new_vit <= cfg.stop_epsilon_kmh then
      perform end_session(ts.session_id, 'panne_charbon');
      continue;
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- RLS for the new tables (cooperative trust: authenticated read; writes
-- go through SECURITY DEFINER functions).
-- =====================================================================
alter table lobby_members   enable row level security;
alter table session_players enable row level security;

do $$
begin
  execute 'create policy lm_read on lobby_members   for select using (auth.role() = ''authenticated'')';
  execute 'create policy sp_read on session_players for select using (auth.role() = ''authenticated'')';
exception when duplicate_object then null;
end$$;

-- Live roster updates.
alter publication supabase_realtime add table lobby_members;
