/**
 * Emphasis and the one effect a text layer may carry (22.3, 22.4).
 *
 * The marks are typed, not clicked: `*word*`, `**word**`, `==word==`, the same
 * in Compose, in the outline and on the canvas. This panel says so, shows the
 * colour they take, and holds the effect picker, where choosing one effect
 * clears any other, gradient text included.
 */
import { hasMarks } from "./marks.js";
import type { Layer, TextEffect } from "./model.js";
import { contrastingWith, effectOf, TEXT_EFFECTS, withEffect } from "./texteffects.js";
import { makeGradient } from "./gradient.js";
import type { Studio } from "./useStudio.js";

export function TextEffectField({
  studio,
  layer,
  swatch,
}: {
  studio: Studio;
  layer: Layer;
  /** The panel's own colour control, so this matches every other colour on it. */
  swatch: (value: string, onChange: (c: string) => void) => React.ReactNode;
}) {
  const effect = effectOf(layer);
  const marked = hasMarks(layer.text ?? "");
  const set = (patch: Partial<Layer>) => studio.updateLayers([layer.id], patch);

  return (
    <>
      <div className="mb-2.5">
        <div className="mb-1 text-caption text-tertiary">Effect</div>
        <select
          aria-label="Effect"
          value={effect ?? ""}
          onChange={(e) => {
            const next = (e.target.value || null) as TextEffect | "gradient" | null;
            set(
              withEffect(
                layer,
                next,
                // A ramp from the text's colour to one that visibly differs.
                next === "gradient" && !layer.gradient
                  ? makeGradient([layer.fill, contrastingWith(layer.fill, layer.markColour ?? studio.doc.palette[2])])
                  : undefined,
              ),
            );
          }}
          className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
        >
          <option value="">None</option>
          {TEXT_EFFECTS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption leading-4 text-muted">
          {TEXT_EFFECTS.find((t) => t.id === effect)?.hint ?? "One effect per text. Two on one line look amateur."}
        </p>
        {effect && effect !== "gradient" ? (
          <div className="mt-1.5">{swatch(layer.effectColour ?? layer.markColour ?? layer.fill, (c) => set({ effectColour: c }))}</div>
        ) : null}
      </div>

      <div className="mb-2.5">
        <div className="mb-1 text-caption text-tertiary">Emphasis</div>
        {marked ? swatch(layer.markColour ?? layer.fill, (c) => set({ markColour: c })) : null}
        <p className="mt-1 text-caption leading-4 text-muted">
          Type <span className="font-mono text-secondary">*word*</span> for the accent colour,{" "}
          <span className="font-mono text-secondary">**word**</span> for weight,{" "}
          <span className="font-mono text-secondary">==word==</span> for a highlighter.
        </p>
      </div>
    </>
  );
}
