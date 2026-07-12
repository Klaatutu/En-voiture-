import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { startSession } from './lib/actions';
import { DriverView } from './features/driver/DriverView';

/**
 * Phase 1 harness. Auth is anonymous (cooperative trust model); lobby/session
 * management gets its real UI in Phase 2. For now this lets you spin up a
 * session and drive, to exercise the server simulation end-to-end.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(
    () => localStorage.getItem('ev_session') || null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Anonymous auth so RLS 'authenticated' policies pass.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) await supabase.auth.signInAnonymously();
      setReady(true);
    });
  }, []);

  async function newSession() {
    setBusy(true);
    // Minimal bootstrap: create a throwaway lobby, then a session.
    const { data: lobby } = await supabase
      .from('lobbies')
      .insert({ nom: 'Lobby de test' })
      .select('id')
      .single();
    if (lobby) {
      const { data: sid } = await startSession(lobby.id);
      if (sid) {
        setSessionId(sid as string);
        localStorage.setItem('ev_session', sid as string);
      }
    }
    setBusy(false);
  }

  if (!ready) return <main className="app"><p className="muted">Connexion…</p></main>;

  return (
    <main className="app">
      <header>
        <h1>🚂 En voiture !</h1>
        <div className="header-actions">
          <button onClick={newSession} disabled={busy}>
            {busy ? '…' : 'Nouvelle partie'}
          </button>
          {sessionId && (
            <button
              className="ghost"
              onClick={() => {
                localStorage.removeItem('ev_session');
                setSessionId(null);
              }}
            >
              Quitter
            </button>
          )}
        </div>
      </header>

      {sessionId ? (
        <DriverView sessionId={sessionId} />
      ) : (
        <p className="muted">
          Démarrez une partie pour prendre les commandes du train.
        </p>
      )}
    </main>
  );
}
