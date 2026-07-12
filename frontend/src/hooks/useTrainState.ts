import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TrainState } from '@shared/types';

/**
 * Subscribes to a session's authoritative train_state via Supabase Realtime.
 * The server is the single source of truth; this hook only reflects it.
 *
 * Meets the Phase 1 criterion: state changes are visible to every client of
 * the session in well under 2s (Realtime Postgres changes).
 */
export function useTrainState(sessionId: string | null) {
  const [state, setState] = useState<TrainState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    // Initial fetch, then live updates.
    supabase
      .from('train_state')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setState((data as TrainState) ?? null);
          setLoading(false);
        }
      });

    const channel = supabase
      .channel(`train_state:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'train_state',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') setState(null);
          else setState(payload.new as TrainState);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { state, loading };
}
