import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { ensurePlayer } from './lib/lobby';
import { useLobbyGame } from './hooks/useLobbyGame';
import { PseudoGate } from './pages/PseudoGate';
import { LobbyScreen } from './pages/LobbyScreen';
import { LobbyHome } from './pages/LobbyHome';
import { GameOverScreen } from './pages/GameOverScreen';
import { DriverView } from './features/driver/DriverView';
import { PlanningView } from './features/planning/PlanningView';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [pseudo, setPseudo] = useState<string | null>(() => localStorage.getItem('ev_pseudo'));
  const [lobbyId, setLobbyId] = useState<string | null>(() => localStorage.getItem('ev_lobby'));

  // Anonymous auth (cooperative trust model), then re-assert the player row.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) await supabase.auth.signInAnonymously();
      // Anonymous identity is per-device and may be new; re-upsert the player.
      const savedPseudo = localStorage.getItem('ev_pseudo');
      if (savedPseudo) await ensurePlayer(savedPseudo).catch(() => {});
      setAuthReady(true);
    });
  }, []);

  function enterLobby(id: string) {
    localStorage.setItem('ev_lobby', id);
    setLobbyId(id);
  }
  function leaveLobby() {
    localStorage.removeItem('ev_lobby');
    setLobbyId(null);
  }

  return (
    <main className="app">
      <header>
        <h1>🚂 En voiture !</h1>
        {pseudo && <span className="whoami">👤 {pseudo}</span>}
      </header>
      {!authReady ? (
        <p className="muted">Connexion…</p>
      ) : !pseudo ? (
        <PseudoGate onReady={setPseudo} />
      ) : !lobbyId ? (
        <LobbyScreen onEntered={enterLobby} />
      ) : (
        <LobbyRouter lobbyId={lobbyId} onLeave={leaveLobby} />
      )}
    </main>
  );
}

/** Routes between waiting room / driving / game over based on session status. */
function LobbyRouter({ lobbyId, onLeave }: { lobbyId: string; onLeave: () => void }) {
  const { lobby, session, members, loading } = useLobbyGame(lobbyId);

  if (loading || !lobby) return <p className="muted">Chargement du lobby…</p>;

  if (!session || session.statut === 'terminee') {
    // No session yet → waiting room. A finished session → game over screen.
    return session ? (
      <GameOverScreen lobby={lobby} session={session} members={members} onLeave={onLeave} />
    ) : (
      <LobbyHome lobby={lobby} members={members} onLeave={onLeave} />
    );
  }

  // Active session → drive or plan.
  return <ActiveSession lobbyCode={lobby.code} memberCount={members.length} sessionId={session.id} />;
}

function ActiveSession({
  lobbyCode,
  memberCount,
  sessionId,
}: {
  lobbyCode: string;
  memberCount: number;
  sessionId: string;
}) {
  const [tab, setTab] = useState<'drive' | 'plan'>('drive');
  return (
    <>
      <div className="lobbybar">
        <span className="code-chip">{lobbyCode}</span>
        <span className="muted">👥 {memberCount}</span>
        <div className="tabs">
          <button className={tab === 'drive' ? 'tab on' : 'tab'} onClick={() => setTab('drive')}>
            🎮 Conduite
          </button>
          <button className={tab === 'plan' ? 'tab on' : 'tab'} onClick={() => setTab('plan')}>
            🗺️ Plan
          </button>
        </div>
      </div>
      {tab === 'drive' ? <DriverView sessionId={sessionId} /> : <PlanningView sessionId={sessionId} />}
    </>
  );
}
