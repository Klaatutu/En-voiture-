import { useState } from 'react';
import { createLobby, joinLobby } from '../lib/lobby';

/** Create a new lobby (get a shareable code) or join one by code. */
export function LobbyScreen({ onEntered }: { onEntered: (lobbyId: string) => void }) {
  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const lobby = await createLobby(nom);
      onEntered(lobby.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      const id = await joinLobby(code);
      onEntered(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Créer un convoi</h2>
        <input
          className="text-input"
          value={nom}
          maxLength={30}
          placeholder="Nom du convoi (optionnel)"
          onChange={(e) => setNom(e.target.value)}
        />
        <button onClick={create} disabled={busy}>
          {busy ? '…' : 'Créer et obtenir un code'}
        </button>
      </div>

      <div className="card">
        <h2>Rejoindre par code</h2>
        <input
          className="text-input mono"
          value={code}
          maxLength={6}
          placeholder="ABC123"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button onClick={join} disabled={busy || code.trim().length < 4}>
          {busy ? '…' : 'Rejoindre'}
        </button>
      </div>

      {err && <p className="error">{err}</p>}
    </div>
  );
}
