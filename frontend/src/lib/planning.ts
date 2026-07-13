import { supabase } from './supabase';
import type { PlannedActionType } from '@shared/types';

/** Add a planned action at a position. Returns its id. */
export async function addPlannedAction(
  session: string,
  position: number,
  type: PlannedActionType,
  value: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_planned_action', {
    p_session: session,
    p_position: position,
    p_type: type,
    p_value: value,
  });
  if (error) throw error;
  return data as string;
}

/** Delete a not-yet-applied planned action. */
export async function deletePlannedAction(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_planned_action', { p_id: id });
  if (error) throw error;
}
