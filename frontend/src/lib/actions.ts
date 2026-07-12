import { supabase } from './supabase';

/**
 * Thin wrappers over the server-authoritative action RPCs. The client only
 * *requests* changes; sim_tick() applies the physics. No simulation here.
 */
export const trainActions = {
  setThrottle: (session: string, value: number) =>
    supabase.rpc('action_set_throttle', { p_session: session, p_value: value }),

  setBrake: (session: string, value: number) =>
    supabase.rpc('action_set_brake', { p_session: session, p_value: value }),

  addCharbon: (session: string) =>
    supabase.rpc('action_add_charbon', { p_session: session }),

  setAiguillage: (session: string, value: 'gauche' | 'droite' | 'neutre') =>
    supabase.rpc('action_set_aiguillage', { p_session: session, p_value: value }),

  setModeVeille: (session: string, value: boolean) =>
    supabase.rpc('action_set_mode_veille', { p_session: session, p_value: value }),
};

/** Create a session with an initialised train for a lobby. */
export const startSession = (lobbyId: string) =>
  supabase.rpc('start_session', { p_lobby: lobbyId });
