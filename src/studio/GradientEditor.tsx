import { Plus, RotateCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  addStop,
  ANGLES,
  gradientCss,
  GRADIENT_PRESETS,
  MAX_STOPS,
  MIN_STOPS,
  presetGradient,
  removeStop,
  setStop,
  sortStops,
  type Gradient,
  type GradientKind,
} from "./gradient.js";

const KINDS: { id: GradientKind; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "conic", label: "Conic" },
];

/**
 * The whole gradient on one surface: a ramp you click to add a stop and drag to move
 * one, plus type, direction and origin. Presets sit on top so nobody has to build a
 * ramp from two empty colour wells to see what this does.
 */
export function GradientEditor({
  value,
  onChange,
}: {
  value: Gradient;
  onChange: (g: Gradient) => void;
}) {
  const [selected, setSelected] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  const stops = sortStops(value.stops);
  const current = stops[Math.min(selected, stops.length - 1)];

  const posFrom = (clientX: number): number => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  return (
    <div>
      {/* presets */}
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {GRADIENT_PRESETS.map((p, i) => (
          <button
            key={p.name}
            type="button"
            title={p.name}
            onClick={() => {
              onChange(presetGradient(i));
              setSelected(0);
            }}
            className="h-7 w-7 rounded-lg border border-hairline hover:border-accent-dim"
            style={{ backgroundImage: gradientCss(presetGradient(i)) }}
          />
        ))}
      </div>

      {/* the ramp: click to add, drag a handle to move */}
      <div
        ref={bar}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset["stop"]) return;
          const g = addStop({ ...value, stops }, posFrom(e.clientX));
          onChange(g);
          setSelected(sortStops(g.stops).findIndex((s) => Math.abs(s.at - posFrom(e.clientX)) < 0.02));
        }}
        onPointerMove={(e) => {
          const i = dragging.current;
          if (i === null) return;
          onChange(setStop({ ...value, stops }, i, { at: posFrom(e.clientX) }));
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = null;
        }}
        className="relative h-9 cursor-copy rounded-lg border border-hairline"
        style={{ backgroundImage: gradientCss(value) }}
        title="Click to add a stop"
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            data-stop="1"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragging.current = i;
              setSelected(i);
            }}
            aria-label={`Stop ${i + 1}`}
            className={[
              "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-overlay active:cursor-grabbing",
              i === selected ? "border-white" : "border-white/60",
            ].join(" ")}
            style={{ left: `${s.at * 100}%`, background: s.colour }}
          />
        ))}
      </div>

      {/* the selected stop */}
      {current ? (
        <div className="mt-2 flex items-center gap-2">
          <label className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-hairline">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(current.colour) ? current.colour : "#ffffff"}
              onChange={(e) => onChange(setStop({ ...value, stops }, selected, { colour: e.target.value }))}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <span className="font-mono text-caption uppercase text-tertiary">{current.colour}</span>
          <span className="text-caption text-muted">{Math.round(current.at * 100)}%</span>
          <div className="flex-1" />
          <button
            type="button"
            title="Add a stop in the middle"
            disabled={stops.length >= MAX_STOPS}
            onClick={() => onChange(addStop({ ...value, stops }, 0.5))}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary disabled:opacity-30"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Remove this stop"
            disabled={stops.length <= MIN_STOPS}
            onClick={() => {
              onChange(removeStop({ ...value, stops }, selected));
              setSelected(0);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {/* type */}
      <div className="mt-3 flex h-8 items-center gap-0.5 rounded-lg border border-hairline p-0.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => onChange({ ...value, kind: k.id })}
            className={[
              "h-7 flex-1 rounded-md text-caption",
              value.kind === k.id
                ? "bg-surface-4 text-primary"
                : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
            ].join(" ")}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* direction, or origin for the ones that have one */}
      {value.kind !== "radial" ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            title="Turn 45°"
            onClick={() => onChange({ ...value, angle: (value.angle + 45) % 360 })}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-tertiary hover:text-primary"
          >
            <RotateCw size={13} strokeWidth={2} />
          </button>
          <input
            type="range"
            min={0}
            max={359}
            value={value.angle}
            onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-[color:var(--accent)]"
          />
          <span className="w-9 shrink-0 text-right font-mono text-caption text-muted">
            {value.angle}°
          </span>
        </div>
      ) : null}

      {value.kind !== "linear" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Slider label="X" value={value.cx} onChange={(cx) => onChange({ ...value, cx })} />
          <Slider label="Y" value={value.cy} onChange={(cy) => onChange({ ...value, cy })} />
        </div>
      ) : null}

      {value.kind === "linear" ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {ANGLES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ ...value, angle: a })}
              className={[
                "h-6 rounded-md px-1.5 font-mono text-[10px]",
                value.angle === a ? "bg-surface-4 text-primary" : "text-muted hover:text-primary",
              ].join(" ")}
            >
              {a}°
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2">
      <span className="text-caption text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="min-w-0 flex-1 accent-[color:var(--accent)]"
      />
    </label>
  );
}
