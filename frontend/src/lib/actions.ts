import { supabase } from './supabase';

/**
 * Thin wrappers over the server-authoritative action RPCs. The client only
 * *requests* changes; sim_tick() applies the physics. No simulation here.
 *
 * IMPORTANT: supabase-js query builders are LAZY — the HTTP request is only
 * sent when the builder is awaited or `.then()`-ed. These wrappers therefore
 * attach a `.then()` so the request actually fires (and errors surface),
 * even when the caller does not await the result.
 */
const logError =
  (label: string) =>
  ({ error }: { error: unknown }) => {
    if (error) console.error(`[action:${label}]`, error);
    return error;
  };

export const trainActions = {
  setThrottle: (session: string, value: number) =>
    supabase
      .rpc('action_set_throttle', { p_session: session, p_value: value })
      .then(logError('throttle')),

  setBrake: (session: string, value: number) =>
    supabase
      .rpc('action_set_brake', { p_session: session, p_value: value })
      .then(logError('brake')),

  addCharbon: (session: string) =>
    supabase.rpc('action_add_charbon', { p_session: session }).then(logError('charbon')),

  setAiguillage: (session: string, value: 'gauche' | 'droite' | 'neutre') =>
    supabase
      .rpc('action_set_aiguillage', { p_session: session, p_value: value })
      .then(logError('aiguillage')),

  setModeVeille: (session: string, value: boolean) =>
    supabase
      .rpc('action_set_mode_veille', { p_session: session, p_value: value })
      .then(logError('veille')),
};

/** Create a session with an initialised train for a lobby. */
export const startSession = (lobbyId: string) =>
  supabase.rpc('start_session', { p_lobby: lobbyId });
