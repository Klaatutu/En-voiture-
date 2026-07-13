import { useState } from 'react';
import type { GameSession, Lobby, LobbyMember } from '@shared/types';
import { CAUSE_FIN, type CauseFin } from '@shared/constants';
import { startSession } from '../lib/lobby';
import { LobbyRoster } from './LobbyHome';

/** End-of-game: frozen score, incident cause, and relaunch in the same lobby. */
export function GameOverScreen({
  lobby,
  session,
  members,
  onLeave,
}: {
  lobby: Lobby;
  session: GameSession;
  members: LobbyMember[];
  onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const cause = (session.cause_fin as CauseFin) ?? null;

  return (
    <div className="stack">
      <div className="card gameover">
        <h2>🏁 Partie terminée</h2>
        <div className="score">{Number(session.distance_totale_km).toFixed(2)} km</div>
        <p className="muted">Distance parcourue — c'est ton score.</p>
        {cause && <p className="cause">💥 {CAUSE_FIN[cause] ?? cause}</p>}
      </div>

      <button
        onClick={async () => {
          setBusy(true);
          try {
            await startSession(lobby.id);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        {busy ? '…' : '🔄 Nouvelle partie'}
      </button>

      <LobbyRoster lobby={lobby} members={members} />
      <button className="ghost" onClick={onLeave}>
        Quitter le lobby
      </button>
    </div>
  );
}
