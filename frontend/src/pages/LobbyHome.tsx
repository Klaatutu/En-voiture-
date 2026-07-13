import { useState } from 'react';
import type { Lobby, LobbyMember } from '@shared/types';
import { startSession } from '../lib/lobby';

/** In-lobby waiting room: shareable code, roster, and start button. */
export function LobbyHome({
  lobby,
  members,
  onLeave,
}: {
  lobby: Lobby;
  members: LobbyMember[];
  onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <LobbyRoster lobby={lobby} members={members} />
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
        {busy ? '…' : '🚦 Démarrer la partie'}
      </button>
      <button className="ghost" onClick={onLeave}>
        Quitter le lobby
      </button>
    </div>
  );
}

/** Reusable lobby header block (code + members). */
export function LobbyRoster({ lobby, members }: { lobby: Lobby; members: LobbyMember[] }) {
  return (
    <div className="card">
      <h2>{lobby.nom}</h2>
      <p className="muted">
        Code à partager&nbsp;: <span className="code-chip">{lobby.code}</span>
      </p>
      <h3>Équipage ({members.length})</h3>
      <ul className="roster">
        {members.map((m) => (
          <li key={m.player_id}>👤 {m.pseudo ?? '—'}</li>
        ))}
      </ul>
    </div>
  );
}
