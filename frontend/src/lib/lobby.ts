import { supabase } from './supabase';

/**
 * Lobby / session lifecycle RPCs. All are server-authoritative and awaited
 * (unlike fire-and-forget train actions), so errors propagate to callers.
 */

/** Upsert the player row for the current auth user; returns player id. */
export async function ensurePlayer(pseudo: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_player', { p_pseudo: pseudo });
  if (error) throw error;
  return data as string;
}

/** Create a lobby; returns its id + shareable join code. */
export async function createLobby(nom: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('create_lobby', { p_nom: nom }).single();
  if (error) throw error;
  return data as { id: string; code: string };
}

/** Join a lobby by code; returns the lobby id. */
export async function joinLobby(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_lobby', { p_code: code });
  if (error) throw error;
  return data as string;
}

/** Start (or resume) the active session for a lobby; returns session id. */
export async function startSession(lobbyId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_session', { p_lobby: lobbyId });
  if (error) throw error;
  return data as string;
}
