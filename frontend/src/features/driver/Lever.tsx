import { useEffect, useRef, useState } from 'react';

/**
 * A 0..1 lever (accelerator / brake).
 *
 * The authoritative value lives on the server (train_state), but a purely
 * controlled input would snap the thumb back to the last server value on every
 * re-render, making it impossible to drag on touch devices. So we keep an
 * optimistic local value that follows the finger instantly, push the action to
 * the server on change, and only re-sync from the server while NOT dragging.
 */
export function Lever({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);

  // Adopt server value only when the user isn't actively moving the lever.
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  const stopDragging = () => {
    dragging.current = false;
  };

  return (
    <div className="lever">
      <span className="lever-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={local}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v); // instant visual feedback
          onChange(v); // fire-and-forget server RPC
        }}
      />
      <span className="lever-value">{Math.round(local * 100)}%</span>
    </div>
  );
}
