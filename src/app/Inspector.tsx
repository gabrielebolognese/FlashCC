import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Block, BlockStyle, BrandKit, FontRole, Overlay } from "../doc/types.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  brand: BrandKit;
  overlay: Overlay | null;
  block: Block | null;
  onOverlay: (patch: Partial<Overlay>, coalesce?: string) => void;
  onBlockStyle: (patch: BlockStyle, coalesce?: string) => void;
  onDeleteOverlay: () => void;
};

const FAMILIES: { value: FontRole; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

const WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Whatever is selected. A template-driven block gets overrides on top of the
 * template's decision; a hand-placed overlay gets full control. Empty until a click.
 */
export function Inspector({ brand, overlay, block, onOverlay, onBlockStyle, onDeleteOverlay }: Props) {
  if (!overlay && !block) {
    return (
      <aside className="w-[236px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
        <p className="text-caption leading-[16px] text-muted">
          Click text on the slide, or an element you added, to change how it looks.
        </p>
      </aside>
    );
  }

  const swatches = [
    brand.palette.text,
    brand.palette.muted,
    brand.palette.accent,
    brand.palette.background,
  ];

  if (overlay) {
    const isText = overlay.kind === "text";
    const isShape = overlay.kind === "shape";
    return (
      <aside className="w-[236px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-title capitalize text-primary">{overlay.kind}</span>
          <div className="flex-1" />
          <IconButton icon={Trash2} label="Delete element" danger onClick={onDeleteOverlay} />
        </div>

        {isText ? (
          <>
            <Row label="Font">
              <Segmented
                value={overlay.family ?? "sans"}
                options={FAMILIES}
                onChange={(family) => onOverlay({ family })}
              />
            </Row>
            <Row label="Size">
              <Stepper
                value={overlay.fontSize ?? 48}
                min={12}
                max={220}
                step={4}
                suffix="px"
                onChange={(fontSize) => onOverlay({ fontSize }, `size:${overlay.id}`)}
              />
            </Row>
            <Row label="Weight">
              <Segmented
                value={String(overlay.weight ?? 600)}
                options={WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))}
                onChange={(w) => onOverlay({ weight: Number(w) })}
              />
            </Row>
            <Row label="Align">
              <AlignPicker value={overlay.align ?? "left"} onChange={(align) => onOverlay({ align })} />
            </Row>
            <Row label="Letter spacing">
              <Stepper
                value={Math.round((overlay.tracking ?? 0) * 100)}
                min={-8}
                max={30}
                step={1}
                suffix=""
                onChange={(v) => onOverlay({ tracking: v / 100 }, `track:${overlay.id}`)}
              />
            </Row>
            <Row label="Caps">
              <Segmented
                value={overlay.uppercase ? "upper" : "none"}
                options={[
                  { value: "none", label: "Normal" },
                  { value: "upper", label: "UPPER" },
                ]}
                onChange={(v) => onOverlay({ uppercase: v === "upper" })}
              />
            </Row>
          </>
        ) : null}

        {isShape ? (
          <>
            <Row label="Fill">
              <Segmented
                value={overlay.filled === false ? "outline" : "solid"}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "outline", label: "Outline" },
                ]}
                onChange={(v) => onOverlay({ filled: v === "solid" })}
              />
            </Row>
            <Row label="Corner">
              <Stepper
                value={overlay.radius ?? 0}
                min={0}
                max={200}
                step={4}
                suffix="px"
                onChange={(radius) => onOverlay({ radius }, `radius:${overlay.id}`)}
              />
            </Row>
          </>
        ) : null}

        {overlay.kind === "icon" || overlay.filled === false ? (
          <Row label="Thickness">
            <Stepper
              value={overlay.strokeWidth ?? 2}
              min={1}
              max={12}
              step={1}
              suffix=""
              onChange={(strokeWidth) => onOverlay({ strokeWidth }, `stroke:${overlay.id}`)}
            />
          </Row>
        ) : null}

        <Row label="Colour">
          <Swatches
            swatches={swatches}
            value={overlay.colour}
            onChange={(colour) => onOverlay({ colour })}
          />
        </Row>

        <Row label="Opacity">
          <Stepper
            value={Math.round((overlay.opacity ?? 1) * 100)}
            min={10}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => onOverlay({ opacity: v / 100 }, `op:${overlay.id}`)}
          />
        </Row>

        <p className="mt-4 border-t border-hairline pt-3 text-caption leading-[16px] text-muted">
          Drag on the slide to move it. Drag the corner to resize.
        </p>
      </aside>
    );
  }

  // A template-driven block: overrides on top of what the template decided.
  const style = block?.style ?? {};
  return (
    <aside className="w-[236px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
      <div className="mb-1 text-title capitalize text-primary">{block?.type}</div>
      <p className="mb-3 text-caption text-muted">The template sets this. Override it here.</p>

      <Row label="Font">
        <Segmented
          value={style.family ?? "auto"}
          options={[{ value: "auto", label: "Auto" }, ...FAMILIES.map((f) => ({ value: f.value as string, label: f.label }))]}
          onChange={(v) => onBlockStyle({ family: v === "auto" ? undefined : (v as FontRole) })}
        />
      </Row>

      <Row label="Size">
        <Stepper
          value={style.fontSize ?? 0}
          min={0}
          max={220}
          step={4}
          suffix={style.fontSize ? "px" : ""}
          zeroLabel="Auto"
          onChange={(v) => onBlockStyle({ fontSize: v === 0 ? undefined : v }, `bsize:${block?.id}`)}
        />
      </Row>

      <Row label="Weight">
        <Segmented
          value={style.weight ? String(style.weight) : "auto"}
          options={[{ value: "auto", label: "Auto" }, ...WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))]}
          onChange={(v) =>
            onBlockStyle({ weight: v === "auto" ? undefined : (Number(v) as 400 | 500 | 600 | 700) })
          }
        />
      </Row>

      <Row label="Align">
        <AlignPicker
          value={style.align ?? "left"}
          onChange={(align) => onBlockStyle({ align })}
        />
      </Row>

      <Row label="Caps">
        <Segmented
          value={style.case ?? "auto"}
          options={[
            { value: "auto", label: "Auto" },
            { value: "none", label: "Normal" },
            { value: "upper", label: "UPPER" },
          ]}
          onChange={(v) => onBlockStyle({ case: v === "auto" ? undefined : (v as "none" | "upper") })}
        />
      </Row>

      <Row label="Colour">
        <Swatches
          swatches={swatches}
          value={style.colour ?? ""}
          onChange={(colour) => onBlockStyle({ colour })}
          allowAuto
          onAuto={() => onBlockStyle({ colour: undefined })}
        />
      </Row>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-caption text-tertiary">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | string;
  options: readonly { value: T | string; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value as T)}
          className={[
            "h-6 flex-1 rounded-sm px-1 text-caption",
            o.value === value ? "bg-surface-4 text-primary" : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  suffix,
  zeroLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  zeroLabel?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex h-7 items-center rounded-md border border-hairline bg-surface-1">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="h-full w-7 text-tertiary hover:text-primary"
      >
        −
      </button>
      <span className="flex-1 text-center font-mono text-caption text-primary">
        {value === 0 && zeroLabel ? zeroLabel : `${value}${suffix}`}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className="h-full w-7 text-tertiary hover:text-primary"
      >
        +
      </button>
    </div>
  );
}

function AlignPicker({
  value,
  onChange,
}: {
  value: "left" | "center" | "right";
  onChange: (v: "left" | "center" | "right") => void;
}) {
  const options = [
    { value: "left" as const, Icon: AlignLeft },
    { value: "center" as const, Icon: AlignCenter },
    { value: "right" as const, Icon: AlignRight },
  ];
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5">
      {options.map(({ value: v, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={[
            "grid h-6 flex-1 place-items-center rounded-sm",
            v === value ? "bg-surface-4 text-primary" : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
          ].join(" ")}
        >
          <Icon size={13} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}

function Swatches({
  swatches,
  value,
  onChange,
  allowAuto = false,
  onAuto,
}: {
  swatches: string[];
  value: string;
  onChange: (v: string) => void;
  allowAuto?: boolean;
  onAuto?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {allowAuto ? (
        <button
          type="button"
          onClick={onAuto}
          className={[
            "h-7 rounded-md border px-1.5 text-caption",
            value === "" ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
          ].join(" ")}
        >
          Auto
        </button>
      ) : null}
      {swatches.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          className={[
            "h-7 w-7 rounded-md border",
            value.toLowerCase() === hex.toLowerCase() ? "border-accent" : "border-hairline",
          ].join(" ")}
          style={{ background: hex }}
        />
      ))}
      <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-hairline">
        <input
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    </div>
  );
}
