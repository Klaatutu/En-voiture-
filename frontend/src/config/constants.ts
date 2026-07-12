/**
 * Re-export the canonical simulation constants for client-side display use
 * ONLY (gauge maxima, formatting). The client must never run the simulation —
 * that lives server-side in sim_tick(). Keeping a single import point makes
 * that boundary explicit.
 */
export { SIM } from '@shared/constants';
export type { SimConfig } from '@shared/constants';
