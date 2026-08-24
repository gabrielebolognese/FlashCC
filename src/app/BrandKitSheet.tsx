import { X } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";

import { PALETTE_PRESETS } from "../doc/defaults.js";
import type { Template } from "../doc/template.js";
import type { BrandKit, FontRole } from "../doc/types.js";
import { listTemplates } from "../state/persist.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  brand: BrandKit;
  template: Template;
  onChange: (brand: BrandKit, coalesce?: string) => void;
  onTemplateChange: (template: Template) => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
};

const FAMILIES: readonly { value: FontRole; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

/**
 * Side sheet over the preview, not a centred modal, so the slide stays visible and
 * updates live. Template lives here rather than in a ninth top-bar control because it
 * is document-level and set-once — structurally identical to the palette.
 *
 * The kit owns COLOUR and TYPEFACE only; margin, background and handle placement moved
 * to the template. One thing, one place.
 */
export function BrandKitSheet({
  brand,
  template,
  onChange,
  onTemplateChange,
  onSaveAsTemplate,
  onClose,
}: Props) {
  const templates = useMemo(() => listTemplates(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="absolute inset-0 z-overlay" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 z-modal flex h-full w-[300px] flex-col border-l border-hairline shadow-modal"
        style={{ background: "linear-gradient(180deg, var(--surface-2), var(--surface-1))" }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <span className="text-title text-primary">Brand</span>
          <div className="flex-1" />
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Section label="Template">
            <div className="flex flex-wrap gap-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTemplateChange(t)}
                  className={[
                    "h-7 rounded-md border px-2 text-caption",
                    t.id === template.id
                      ? "border-accent text-accent"
                      : "border-hairline text-secondary hover:text-primary",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onSaveAsTemplate}
              className="mt-2 h-7 rounded-md px-2 text-caption text-tertiary hover:bg-white/[0.04] hover:text-primary"
            >
              Save this look as a template
            </button>
          </Section>

          <Section label="Palette">
            <div className="flex flex-wrap gap-1.5">
              {PALETTE_PRESETS.map((preset) => {
                const active = preset.palette.background === brand.palette.background;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onChange({ ...brand, palette: { ...preset.palette } })}
                    className={[
                      "h-7 w-7 rounded-md border",
                      active ? "border-accent" : "border-hairline",
                    ].join(" ")}
                    style={{ background: preset.palette.background }}
                  >
                    <span
                      className="mx-auto block h-2 w-2 rounded-full"
                      style={{ background: preset.palette.accent }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <ColorField
                label="Background"
                value={brand.palette.background}
                onChange={(background) =>
                  onChange({ ...brand, palette: { ...brand.palette, background } }, "bg")
                }
              />
              <ColorField
                label="Text"
                value={brand.palette.text}
                onChange={(text) => onChange({ ...brand, palette: { ...brand.palette, text } }, "fg")}
              />
              <ColorField
                label="Accent"
                value={brand.palette.accent}
                onChange={(accent) =>
                  onChange({ ...brand, palette: { ...brand.palette, accent } }, "ac")
                }
              />
              <ColorField
                label="Muted"
                value={brand.palette.muted}
                onChange={(muted) => onChange({ ...brand, palette: { ...brand.palette, muted } }, "mu")}
              />
            </div>
          </Section>

          <Section label="Type">
            <Row label="Display">
              <Segmented
                value={brand.type.display.family}
                options={FAMILIES}
                onChange={(family) =>
                  onChange({
                    ...brand,
                    type: { ...brand.type, display: { ...brand.type.display, family } },
                  })
                }
              />
            </Row>
            <Row label="Body">
              <Segmented
                value={brand.type.body.family}
                options={FAMILIES}
                onChange={(family) =>
                  onChange({ ...brand, type: { ...brand.type, body: { ...brand.type.body, family } } })
                }
              />
            </Row>
          </Section>

          <Section label="Handle">
            <input
              value={brand.handle}
              placeholder="@yourname"
              onChange={(e) => onChange({ ...brand, handle: e.target.value }, "handle")}
              className="h-7 w-full rounded-sm border border-edge bg-surface-1 px-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
            />
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-overline uppercase text-tertiary">{label}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-caption text-tertiary">{label}</span>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-sm border border-hairline bg-surface-1 px-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-4 w-4 cursor-pointer rounded-sm border-0 bg-transparent p-0"
      />
      <span className="truncate text-caption text-tertiary">{label}</span>
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "h-6 flex-1 rounded-sm px-2 text-caption",
            option.value === value
              ? "bg-surface-4 text-primary"
              : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
