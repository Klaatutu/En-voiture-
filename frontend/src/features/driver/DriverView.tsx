import { useTrainState } from '../../hooks/useTrainState';
import { useTrackProfile, upcomingPoints } from '../../hooks/useTrackProfile';
import { trainActions } from '../../lib/actions';
import { SIM } from '../../config/constants';
import { Lever } from './Lever';
import { Gauge } from './Gauge';

/**
 * Phase 1 conductor view: profile-animated train, speed & coal gauges,
 * throttle + brake levers, coal action, accumulated delay, and the list of
 * upcoming track points. All controls call server RPCs; nothing is simulated
 * locally. (Conductor-only locking arrives in Phase 3 — Phase 1 is open.)
 */
export function DriverView({ sessionId }: { sessionId: string }) {
  const { state, loading } = useTrainState(sessionId);
  const track = useTrackProfile();

  if (loading) return <p className="muted">Chargement de l’état du train…</p>;
  if (!state) return <p className="muted">Aucun train pour cette session.</p>;

  const speedPct = Math.min(1, state.vitesse / SIM.VITESSE_MAX_KMH);
  const next = upcomingPoints(track, state.distance_parcourue).slice(0, 6);
  const retardCritical = state.retard_accumule_km >= SIM.RETARD_CRITIQUE_KM;

  return (
    <div className="driver">
      {/* Animated train: bob speed reflects real velocity. */}
      <div className="scene">
        <div
          className="train"
          style={{ animationDuration: `${Math.max(0.15, 1.2 - speedPct)}s` }}
        >
          🚂🚃🚃
        </div>
        <div className="rail" />
        <div className="distance">
          km {state.distance_parcourue.toFixed(2)}
        </div>
      </div>

      <div className="gauges">
        <Gauge label="Vitesse" value={state.vitesse} max={SIM.VITESSE_MAX_KMH} unit="km/h" />
        <Gauge label="Charbon" value={state.niveau_charbon} max={SIM.CHARBON_MAX} unit="u"
               warn={state.niveau_charbon < SIM.CHARBON_MAX * 0.2} />
        <div className={`retard ${retardCritical ? 'crit' : ''}`}>
          Retard&nbsp;: {state.retard_accumule_km.toFixed(2)} km
          {retardCritical && <span className="tag">critique</span>}
        </div>
      </div>

      <div className="controls">
        <Lever
          label="Accélérateur"
          value={state.throttle}
          onChange={(v) => trainActions.setThrottle(sessionId, v)}
        />
        <Lever
          label="Frein"
          value={state.brake}
          onChange={(v) => trainActions.setBrake(sessionId, v)}
        />
        <button className="coal" onClick={() => trainActions.addCharbon(sessionId)}>
          ➕ Charbon (+{SIM.CHARBON_ADD_PER_ACTION})
        </button>
      </div>

      <div className="veille">
        <label>
          <input
            type="checkbox"
            checked={state.mode_veille}
            onChange={(e) => trainActions.setModeVeille(sessionId, e.target.checked)}
          />
          Mode veille (ralentissement anticipé décidé par le lobby)
        </label>
      </div>

      <div className="steps">
        <h3>Prochaines étapes</h3>
        <ul>
          {next.map((p) => (
            <li key={p.id}>
              <span className="km">km {Number(p.position_km).toFixed(0)}</span>
              <span className={`type ${p.type_point}`}>{p.type_point}</span>
              <span className="lbl">{p.libelle}</span>
              <span className="cible">cible {Number(p.vitesse_cible).toFixed(0)} km/h</span>
              <span className="pente">{Number(p.pente) > 0 ? '↗' : Number(p.pente) < 0 ? '↘' : '→'} {Number(p.pente)}‰</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
