import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PlannedAction } from '@shared/types';

/** Live list of a session's planned actions (ordered by position). */
export function usePlannedActions(sessionId: string | null) {
  const [actions, setActions] = useState<PlannedAction[]>([]);

  const fetchActions = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from('planned_actions')
      .select('*')
      .eq('session_id', sessionId)
      .order('position_km', { ascending: true });
    setActions((data as PlannedAction[]) ?? []);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetchActions();
    const channel = supabase
      .channel(`planned:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planned_actions',
          filter: `session_id=eq.${sessionId}`,
        },
        () => fetchActions(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchActions]);

  return actions;
}
