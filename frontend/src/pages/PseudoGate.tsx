import { useState } from 'react';
import { ensurePlayer } from '../lib/lobby';

/** First-run gate: pick a pseudo, which creates/updates the player row. */
export function PseudoGate({ onReady }: { onReady: (pseudo: string) => void }) {
  const [pseudo, setPseudo] = useState(localStorage.getItem('ev_pseudo') ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const p = pseudo.trim();
    if (!p) return;
    setBusy(true);
    setErr(null);
    try {
      await ensurePlayer(p);
      localStorage.setItem('ev_pseudo', p);
      onReady(p);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Ton pseudo de mécano</h2>
      <input
        className="text-input"
        value={pseudo}
        maxLength={20}
        placeholder="ex. Casey Jones"
        onChange={(e) => setPseudo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {err && <p className="error">{err}</p>}
      <button onClick={submit} disabled={busy || !pseudo.trim()}>
        {busy ? '…' : 'Continuer'}
      </button>
    </div>
  );
}
