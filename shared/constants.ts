/**
 * SIMULATION CONSTANTS — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------------
 * These are the canonical, tunable parameters for the train simulation.
 *
 * IMPORTANT — no duplicated *logic*:
 *   The authoritative simulation runs server-side ONLY, inside the Postgres
 *   function `sim_tick()` (see supabase/migrations). The frontend never
 *   simulates the train; it only displays server state and sends actions.
 *
 *   Postgres cannot import TypeScript, so the numeric values below are
 *   mirrored in the migration `0001_phase1_foundations.sql` as a
 *   `sim_config` table seeded with these same values. The SQL reads them
 *   from `sim_config` at runtime, so tuning happens in ONE place (the DB row),
 *   and this file documents the canonical defaults + units for the client.
 *
 * Units:
 *   - speed:        km/h
 *   - acceleration: km/h per second
 *   - distance:     km
 *   - gradient:     per mille (‰), positive = uphill (montée)
 *   - charbon:      abstract fuel units (0..CHARBON_MAX)
 *   - time:         seconds
 */

export const SIM = {
  /** Physical ceiling of train speed (km/h). */
  VITESSE_MAX_KMH: 120,

  /** Max acceleration at full throttle, before drag (km/h per second). */
  ACCEL_MAX_KMH_S: 2.0,
  /** Max deceleration at full brake (km/h per second). */
  BRAKE_MAX_KMH_S: 4.0,
  /** Constant rolling/air resistance always slowing the train (km/h per second). */
  ROLLING_RESISTANCE_KMH_S: 0.3,
  /** Extra drag per ‰ of uphill gradient (km/h per second per ‰). Downhill assists. */
  GRADIENT_DRAG_PER_PERMILLE: 0.15,

  /** Fuel tank capacity. */
  CHARBON_MAX: 100,
  /** Baseline fuel burn just to keep the boiler alive (units per second). */
  CHARBON_BASE_CONSO_PER_S: 0.02,
  /** Extra fuel burn scaling with speed (units per (km/h · second)). */
  CHARBON_SPEED_CONSO_PER_KMH_S: 0.003,
  /** Extra fuel burn per ‰ of uphill gradient (units per (‰ · second)). */
  CHARBON_GRADIENT_CONSO_PER_PERMILLE_S: 0.02,
  /** Fuel added by one "ajouter du charbon" action. */
  CHARBON_ADD_PER_ACTION: 10,

  /**
   * Delay (retard) beyond which it is considered non-recoverable.
   * Design decision (Phase 1): crossing this only tanks the score — it does
   * NOT trigger a game over. Game over stays reserved for hard incidents.
   */
  RETARD_CRITIQUE_KM: 50,

  /**
   * Target wall-clock interval between server ticks (seconds).
   * The tick is time-based (it reads real elapsed time from the DB), so the
   * simulation stays correct even if the actual cron cadence drifts or the
   * server was down for a while (handles "reprise après coupure").
   */
  TICK_TARGET_INTERVAL_S: 5,

  /**
   * Safety clamp: if the gap since the last tick is larger than this (e.g.
   * server outage), advance the sim by at most this many seconds per tick to
   * avoid a huge single-step jump. Configurable.
   */
  TICK_MAX_DT_S: 30,
} as const;

export type SimConfig = typeof SIM;
