import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TrackPoint } from '@shared/types';

/**
 * Loads the shared track profile once. It is static route-reference data
 * (not session-scoped), so it is fetched a single time and reused by the
 * planning screen and the upcoming-steps screen.
 */
export function useTrackProfile() {
  const [points, setPoints] = useState<TrackPoint[]>([]);

  useEffect(() => {
    supabase
      .from('track_profile')
      .select('*')
      .order('position_km', { ascending: true })
      .then(({ data }) => setPoints((data as TrackPoint[]) ?? []));
  }, []);

  return points;
}

/** Points at or ahead of the current position, in chronological order. */
export function upcomingPoints(points: TrackPoint[], position: number): TrackPoint[] {
  return points.filter((p) => p.position_km >= position);
}
