/** A 0..1 lever (accelerator / brake). Emits normalized values to the server. */
export function Lever({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="lever">
      <span className="lever-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="lever-value">{Math.round(value * 100)}%</span>
    </div>
  );
}
