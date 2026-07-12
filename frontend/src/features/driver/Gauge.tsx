/** Simple horizontal gauge with a fill bar. */
export function Gauge({
  label,
  value,
  max,
  unit,
  warn = false,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  warn?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className={`gauge ${warn ? 'warn' : ''}`}>
      <div className="gauge-head">
        <span>{label}</span>
        <span>
          {value.toFixed(0)} {unit}
        </span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
