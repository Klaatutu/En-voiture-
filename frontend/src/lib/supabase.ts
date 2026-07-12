import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Fail loud in dev — the app cannot talk to the server without these.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copy frontend/.env.example to .env.local and fill them in.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  realtime: { params: { eventsPerSecond: 5 } },
});
