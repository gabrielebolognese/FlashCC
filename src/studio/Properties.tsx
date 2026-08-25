import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Italic,
  Trash2,
  Underline,
} from "lucide-react";
import type { ReactNode } from "react";

import { IconButton } from "../ui/IconButton.js";
import { allFonts, type Layer } from "./model.js";
import type { Studio } from "./useStudio.js";

/** Properties for the current selection. Nothing selected → the slide itself. */
export function Properties({ studio }: { studio: Studio }) {
  const { selected, selection, slide, doc } = studio;
  const one = selected.length === 1 ? selected[0] : null;
  const set = (patch: Partial<Layer>, coalesce?: string) =>
    studio.updateLayers(selection, patch, coalesce);

  if (selected.length === 0) {
    return (
      <aside className="w-[232px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
        <div className="mb-3 text-title text-primary">Slide</div>
        <Field label="Background">
          <Colour palette={doc.palette} value={slide?.background ?? "#000"} onChange={studio.setBackground} />
        </Field>
        <Field label="Canvas">
          <div className="flex gap-1">
            {[
              { label: "4:5", w: 1080, h: 1350 },
              { label: "1:1", w: 1080, h: 1080 },
              { label: "9:16", w: 1080, h: 1920 },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => studio.setFormat(f.w, f.h)}
                className={[
                  "h-7 flex-1 rounded-md border text-caption",
                  doc.width === f.w && doc.height === f.h
                    ? "border-accent text-accent"
                    : "border-hairline text-tertiary hover:text-primary",
                ].join(" ")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>
        <p className="mt-4 border-t border-hairline pt-3 text-caption leading-[16px] text-muted">
          Pick a tool on the left, then drag on the canvas to draw. Click anything to select it.
        </p>
      </aside>
    );
  }

  const isText = selected.every((l) => l.kind === "text");
  const isIcon = selected.some((l) => l.kind === "icon");

  return (
    <aside className="w-[232px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="truncate text-title text-primary">
          {selected.length > 1 ? `${selected.length} layers` : (one?.name ?? "Layer")}
        </span>
        <div className="flex-1" />
        <IconButton icon={Trash2} label="Delete" danger onClick={studio.removeSelected} />
      </div>

      {one ? (
        <Field label="Position &amp; size">
          <div className="grid grid-cols-2 gap-1.5">
            <Num label="X" value={one.x} onChange={(x) => set({ x }, "x")} />
            <Num label="Y" value={one.y} onChange={(y) => set({ y }, "y")} />
            <Num label="W" value={one.w} onChange={(w) => set({ w: Math.max(4, w) }, "w")} />
            <Num label="H" value={one.h} onChange={(h) => set({ h: Math.max(4, h) }, "h")} />
          </div>
        </Field>
      ) : null}

      <Field label="Arrange">
        <div className="flex gap-1">
          <Arrange icon={ArrowUpToLine} label="Bring to front" onClick={() => studio.reorder("front")} />
          <Arrange icon={ArrowUp} label="Forward" onClick={() => studio.reorder("forward")} />
          <Arrange icon={ArrowDown} label="Backward" onClick={() => studio.reorder("backward")} />
          <Arrange icon={ArrowDownToLine} label="Send to back" onClick={() => studio.reorder("back")} />
        </div>
      </Field>

      {isText ? (
        <>
          <Field label="Font">
            <select
              value={one?.fontFamily ?? "sans"}
              onChange={(e) => set({ fontFamily: e.target.value })}
              className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
            >
              {allFonts().map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num label="Size" value={one?.fontSize ?? 64} step={2} onChange={(v) => set({ fontSize: Math.max(6, v) }, "fs")} />
            <Num
              label="Line"
              value={Math.round((one?.lineHeight ?? 1.2) * 100)}
              step={5}
              onChange={(v) => set({ lineHeight: v / 100 }, "lh")}
            />
          </div>

          <Field label="Style">
            <div className="flex gap-1">
              <Toggle
                icon={Bold}
                active={(one?.fontWeight ?? 400) >= 600}
                onClick={() => set({ fontWeight: (one?.fontWeight ?? 400) >= 600 ? 400 : 700 })}
              />
              <Toggle icon={Italic} active={!!one?.italic} onClick={() => set({ italic: !one?.italic })} />
              <Toggle icon={Underline} active={!!one?.underline} onClick={() => set({ underline: !one?.underline })} />
              <div className="w-1" />
              <Toggle icon={AlignLeft} active={one?.align === "left"} onClick={() => set({ align: "left" })} />
              <Toggle icon={AlignCenter} active={one?.align === "center"} onClick={() => set({ align: "center" })} />
              <Toggle icon={AlignRight} active={one?.align === "right"} onClick={() => set({ align: "right" })} />
            </div>
          </Field>

          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num
              label="Spacing"
              value={Math.round((one?.letterSpacing ?? 0) * 100)}
              onChange={(v) => set({ letterSpacing: v / 100 }, "ls")}
            />
            <button
              type="button"
              onClick={() => set({ uppercase: !one?.uppercase })}
              className={[
                "h-7 rounded-md border text-caption",
                one?.uppercase ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              UPPER
            </button>
          </div>
        </>
      ) : null}

      <Field label={isText || isIcon ? "Colour" : "Fill"}>
        <Colour palette={doc.palette} value={one?.fill ?? "#ffffff"} onChange={(fill) => set(isIcon ? { fill, stroke: fill } : { fill })} />
      </Field>

      {!isText ? (
        <>
          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num label="Radius" value={one?.radius ?? 0} step={2} onChange={(radius) => set({ radius: Math.max(0, radius) }, "r")} />
            <Num
              label="Stroke"
              value={one?.strokeWidth ?? 0}
              onChange={(strokeWidth) =>
                set({ strokeWidth: Math.max(0, strokeWidth), stroke: one?.stroke ?? one?.fill ?? "#fff" }, "sw")
              }
            />
          </div>
          {one && one.strokeWidth > 0 ? (
            <Field label="Stroke colour">
              <Colour palette={doc.palette} value={one.stroke ?? "#ffffff"} onChange={(stroke) => set({ stroke })} />
            </Field>
          ) : null}
        </>
      ) : null}

      <Field label="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((one?.opacity ?? 1) * 100)}
          onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, "op")}
          className="w-full accent-[color:var(--accent)]"
        />
      </Field>

      <Field label="Rotation">
        <input
          type="range"
          min={-180}
          max={180}
          value={one?.rotation ?? 0}
          onChange={(e) => set({ rotation: Number(e.target.value) }, "rot")}
          className="w-full accent-[color:var(--accent)]"
        />
      </Field>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-caption text-tertiary" dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex h-7 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-1.5">
      <span className="text-caption text-muted">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-transparent text-right font-mono text-caption text-primary outline-none"
      />
    </label>
  );
}

function Toggle({ icon: Icon, active, onClick }: { icon: typeof Bold; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "grid h-7 w-7 place-items-center rounded-md border",
        active ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
      ].join(" ")}
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  );
}

function Arrange({ icon: Icon, label, onClick }: { icon: typeof ArrowUp; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 flex-1 place-items-center rounded-md border border-hairline text-tertiary hover:text-primary"
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  );
}

function Colour({
  palette,
  value,
  onChange,
}: {
  palette: string[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {palette.slice(0, 10).map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          className={[
            "h-6 w-6 rounded-md border",
            value.toLowerCase() === hex.toLowerCase() ? "border-accent" : "border-hairline",
          ].join(" ")}
          style={{ background: hex }}
        />
      ))}
      <label className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-edge">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    </div>
  );
}
