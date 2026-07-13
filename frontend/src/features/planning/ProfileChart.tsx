import { useRef } from 'react';
import type { PlannedAction, TrackPoint } from '@shared/types';
import { SIM } from '../../config/constants';

const VB_W = 1000;
const VB_H = 260;
const PAD_L = 8;
const PAD_R = 8;
const SPEED_TOP = 12;
const SPEED_BOT = 172;
const GRAD_TOP = 190;
const GRAD_BOT = 232;

/**
 * Read-only-ish profile of the known track: stepped target-speed line,
 * gradient strip, switches/stations, planned-action markers and the live
 * train position. Tapping the chart reports a km to the parent (to prefill
 * the "add action" form).
 */
export function ProfileChart({
  points,
  actions,
  position,
  onPickKm,
}: {
  points: TrackPoint[];
  actions: PlannedAction[];
  position: number;
  onPickKm?: (km: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length === 0) return null;

  const maxKm = Number(points[points.length - 1].position_km) + 5;
  const x = (km: number) => PAD_L + (km / maxKm) * (VB_W - PAD_L - PAD_R);
  const ySpeed = (v: number) =>
    SPEED_BOT - (Math.min(v, SIM.VITESSE_MAX_KMH) / SIM.VITESSE_MAX_KMH) * (SPEED_BOT - SPEED_TOP);

  // Stepped target-speed path.
  let speedPath = '';
  points.forEach((p, i) => {
    const x0 = x(Number(p.position_km));
    const x1 = i + 1 < points.length ? x(Number(points[i + 1].position_km)) : x(maxKm);
    const y = ySpeed(Number(p.vitesse_cible));
    speedPath += `${i === 0 ? 'M' : 'L'} ${x0} ${y} L ${x1} ${y} `;
  });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPickKm || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const km = Math.max(0, Math.min(maxKm, (ratio * VB_W - PAD_L) / (VB_W - PAD_L - PAD_R) * maxKm));
    onPickKm(Math.round(km * 10) / 10);
  };

  return (
    <svg
      ref={svgRef}
      className="profile"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      onClick={handleClick}
      role="img"
      aria-label="Profil du tracé"
    >
      {/* speed grid lines */}
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={PAD_L}
          x2={VB_W - PAD_R}
          y1={SPEED_BOT - f * (SPEED_BOT - SPEED_TOP)}
          y2={SPEED_BOT - f * (SPEED_BOT - SPEED_TOP)}
          className="grid"
        />
      ))}

      {/* gradient strip */}
      {points.map((p, i) => {
        const x0 = x(Number(p.position_km));
        const x1 = i + 1 < points.length ? x(Number(points[i + 1].position_km)) : x(maxKm);
        const pente = Number(p.pente);
        const h = Math.min(Math.abs(pente) * 2.5, (GRAD_BOT - GRAD_TOP) / 2);
        const mid = (GRAD_TOP + GRAD_BOT) / 2;
        return (
          <rect
            key={`g${i}`}
            x={x0}
            width={Math.max(1, x1 - x0)}
            y={pente >= 0 ? mid - h : mid}
            height={Math.max(1, h)}
            className={pente > 0 ? 'grad-up' : pente < 0 ? 'grad-down' : 'grad-flat'}
          />
        );
      })}

      {/* target speed line */}
      <path d={speedPath} className="speed-line" />

      {/* track points */}
      {points.map((p) => {
        const px = x(Number(p.position_km));
        const t = p.type_point;
        if (t !== 'aiguillage' && t !== 'gare') return null;
        return (
          <line
            key={`t${p.id}`}
            x1={px}
            x2={px}
            y1={SPEED_TOP}
            y2={GRAD_BOT}
            className={t === 'aiguillage' ? 'pt-switch' : 'pt-station'}
          />
        );
      })}

      {/* planned action markers */}
      {actions.map((a) => {
        const px = x(Number(a.position_km));
        const cls = `mark ${a.action_type} ${a.applied ? 'applied' : ''}`;
        const glyph = a.action_type === 'throttle' ? '▲' : a.action_type === 'brake' ? '▼' : '⬤';
        return (
          <text key={a.id} x={px} y={SPEED_TOP + 10} className={cls} textAnchor="middle">
            {glyph}
          </text>
        );
      })}

      {/* live train position */}
      <line x1={x(position)} x2={x(position)} y1={0} y2={VB_H} className="now" />
      <text x={x(position)} y={VB_H - 4} className="now-label" textAnchor="middle">
        🚂
      </text>
    </svg>
  );
}
