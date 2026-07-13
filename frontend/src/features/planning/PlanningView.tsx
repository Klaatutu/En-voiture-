import { useState } from 'react';
import type { PlannedActionType } from '@shared/types';
import { useTrackProfile } from '../../hooks/useTrackProfile';
import { useTrainState } from '../../hooks/useTrainState';
import { usePlannedActions } from '../../hooks/usePlannedActions';
import { addPlannedAction, deletePlannedAction } from '../../lib/planning';

/**
 * The planning screen (Virtual-Regatta-style core): see the known profile,
 * place actions along the route, and let the server autopilot execute them.
 * Actions can be edited while the train is still short of them.
 */
export function PlanningView({ sessionId }: { sessionId: string }) {
  const track = useTrackProfile();
  const { state } = useTrainState(sessionId);
  const actions = usePlannedActions(sessionId);

  const [km, setKm] = useState(0);
  const [type, setType] = useState<PlannedActionType>('throttle');
  const [value, setValue] = useState(0.8);
  const [busy, setBusy] = useState(false);

  const position = state ? Number(state.distance_parcourue) : 0;

  async function add() {
    setBusy(true);
    try {
      await addPlannedAction(sessionId, km, type, value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="planning">
      <ProfileChartBlock
        track={track}
        actions={actions}
        position={position}
        onPickKm={setKm}
      />

      <div className="card">
        <h3>Ajouter une consigne</h3>
        <p className="hint">
          Astuce : place l'action <strong>un peu en amont</strong> du point visé
          (elle prend effet au km indiqué, la vitesse suit ensuite).
        </p>

        <div className="plan-form">
          <label>
            Position (km)
            <input
              type="number"
              min={0}
              step={0.5}
              value={km}
              onChange={(e) => setKm(Number(e.target.value))}
            />
          </label>

          <label>
            Action
            <select value={type} onChange={(e) => setType(e.target.value as PlannedActionType)}>
              <option value="throttle">Accélérateur</option>
              <option value="brake">Frein</option>
              <option value="charbon">Ajouter charbon</option>
            </select>
          </label>

          {type !== 'charbon' && (
            <label>
              Intensité : {Math.round(value * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            </label>
          )}

          <button onClick={add} disabled={busy}>
            {busy ? '…' : `+ Consigne à km ${km}`}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Plan ({actions.length})</h3>
        {actions.length === 0 && <p className="muted">Aucune consigne. Touche le profil pour choisir un km.</p>}
        <ul className="plan-list">
          {actions.map((a) => (
            <li key={a.id} className={a.applied ? 'applied' : ''}>
              <span className="pk">km {Number(a.position_km).toFixed(1)}</span>
              <span className="what">
                {a.action_type === 'throttle' && `Accélérateur ${Math.round(a.value * 100)}%`}
                {a.action_type === 'brake' && `Frein ${Math.round(a.value * 100)}%`}
                {a.action_type === 'charbon' && `Charbon +`}
              </span>
              {a.applied ? (
                <span className="done">✓ fait</span>
              ) : (
                <button className="del" onClick={() => deletePlannedAction(a.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Small wrapper so ProfileChart lives in its own visual card.
import { ProfileChart } from './ProfileChart';
import type { PlannedAction, TrackPoint } from '@shared/types';
function ProfileChartBlock({
  track,
  actions,
  position,
  onPickKm,
}: {
  track: TrackPoint[];
  actions: PlannedAction[];
  position: number;
  onPickKm: (km: number) => void;
}) {
  return (
    <div className="card profile-card">
      <div className="profile-legend">
        <span className="lg speed">— vitesse cible</span>
        <span className="lg sw">| aiguillage</span>
        <span className="lg st">| gare</span>
        <span className="lg thr">▲ accél.</span>
        <span className="lg brk">▼ frein</span>
      </div>
      <ProfileChart points={track} actions={actions} position={position} onPickKm={onPickKm} />
    </div>
  );
}
