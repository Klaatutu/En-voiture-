import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GameSession, Lobby, LobbyMember } from '@shared/types';

/**
 * Given a lobby id, tracks the lobby, its live member roster, and the most
 * recent game session (whatever its status). Realtime keeps all three fresh:
 * new sessions (relaunch), session end (incident), and members joining.
 */
export function useLobbyGame(lobbyId: string | null) {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLobby = useCallback(async () => {
    if (!lobbyId) return;
    const { data } = await supabase
      .from('lobbies')
      .select('id, nom, code, statut')
      .eq('id', lobbyId)
      .maybeSingle();
    setLobby((data as Lobby) ?? null);
  }, [lobbyId]);

  const fetchSession = useCallback(async () => {
    if (!lobbyId) return;
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('demarree_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSession((data as GameSession) ?? null);
  }, [lobbyId]);

  const fetchMembers = useCallback(async () => {
    if (!lobbyId) return;
    const { data } = await supabase
      .from('lobby_members')
      .select('lobby_id, player_id, joined_at, players(pseudo)')
      .eq('lobby_id', lobbyId)
      .order('joined_at', { ascending: true });
    setMembers(
      ((data as any[]) ?? []).map((m) => ({
        lobby_id: m.lobby_id,
        player_id: m.player_id,
        joined_at: m.joined_at,
        pseudo: m.players?.pseudo,
      })),
    );
  }, [lobbyId]);

  useEffect(() => {
    if (!lobbyId) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchLobby(), fetchSession(), fetchMembers()]).then(() => {
      if (active) setLoading(false);
    });

    const channel = supabase
      .channel(`lobby:${lobbyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `lobby_id=eq.${lobbyId}` },
        () => fetchSession(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_members', filter: `lobby_id=eq.${lobbyId}` },
        () => fetchMembers(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [lobbyId, fetchLobby, fetchSession, fetchMembers]);

  return { lobby, session, members, loading, refresh: fetchSession };
}
