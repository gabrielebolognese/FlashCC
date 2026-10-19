/**
 * For another tool (31.6): a PowerPoint with real text boxes, or an SVG per
 * slide. What will become a picture, and why, is listed by slide BEFORE the
 * file is written, with the faces to install, so nothing looks broken on open
 * without having been said first.
 */
import { FileType2, Presentation } from "lucide-react";
import { useMemo, useState } from "react";

import { editablePlan, type Target } from "./editable.js";
import { saveBlob } from "./exporter.js";
import type { Doc } from "./model.js";

const TARGETS: { id: Target; label: string; note: string; icon: typeof Presentation }[] = [
  { id: "pptx", label: "PowerPoint", note: "Text boxes you can edit, for a deck someone finishes in Office, Keynote or Slides.", icon: Presentation },
  { id: "svg", label: "SVG per slide", note: "Vectors and live text, for a designer who finishes in Figma or Illustrator.", icon: FileType2 },
];

export function EditableFiles({ doc }: { doc: Doc }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [phase, setPhase] = useState<{ at: "idle" } | { at: "working" } | { at: "done"; filename: string } | { at: "failed"; error: string }>({ at: "idle" });
  const plan = useMemo(() => (target ? editablePlan(doc, target) : null), [doc, target]);

  const write = async () => {
    if (!target) return;
    setPhase({ at: "working" });
    try {
      // The writers load when a file is asked for, not with the editor.
      const { editableFile } = await import("./editablerender.js");
      const r = await editableFile(doc, target);
      if (!r.ok) return setPhase({ at: "failed", error: r.error });
      saveBlob(r.blob, r.filename);
      setPhase({ at: "done", filename: r.filename });
    } catch {
      setPhase({ at: "failed", error: "The file could not be written." });
    }
  };

  return (
    <div className="mt-5 border-t border-hairline pt-5" data-testid="editable-files">
      <span className="text-overline uppercase text-tertiary">For another tool</span>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={target === t.id}
            onClick={() => {
              setTarget(target === t.id ? null : t.id);
              setPhase({ at: "idle" });
            }}
            className={["rounded-2xl border p-2.5 text-left", target === t.id ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1 hover:border-surface-5"].join(" ")}
          >
            <div className="flex items-center gap-1.5 text-body-strong text-primary">
              <t.icon size={14} strokeWidth={2} />
              {t.label}
            </div>
            <div className="mt-1 text-caption leading-4 text-muted">{t.note}</div>
          </button>
        ))}
      </div>

      {plan ? (
        <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
          {plan.flattened.length === 0 ? (
            <p className="text-body text-secondary" data-testid="flatten-list">Everything stays editable: nothing on these slides has to become a picture.</p>
          ) : (
            <>
              <p className="text-body text-secondary">
                {plan.flattened.length} thing{plan.flattened.length === 1 ? "" : "s"} {target === "pptx" ? "PowerPoint" : "SVG"} cannot hold exactly {plan.flattened.length === 1 ? "goes" : "go"} in as a picture, drawn exactly as here, at the same place. The rest stays editable.
              </p>
              <ul className="mt-2 flex max-h-[180px] flex-col gap-0.5 overflow-y-auto" data-testid="flatten-list">
                {plan.flattened.map((f, i) => (
                  <li key={i} className="flex gap-2 text-caption">
                    <span className="w-14 shrink-0 text-muted">Slide {f.slide}</span>
                    <span className="min-w-0 flex-1 truncate text-primary">{f.name}</span>
                    <span className="shrink-0 text-tertiary">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.fonts.length ? (
            <p className="mt-2 text-caption leading-4 text-muted" data-testid="editable-fonts">
              Set in {plan.fonts.join(", ")}. Install {plan.fonts.length === 1 ? "it" : "them"} where the file is opened. In a stand-in face the lines still break where FlashCC broke them, and may no longer fit.
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={phase.at === "working"}
              onClick={() => void write()}
              className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-50"
            >
              {phase.at === "working" ? "Writing…" : target === "pptx" ? "Write the .pptx" : "Write the SVGs"}
            </button>
            {phase.at === "done" ? <span className="text-caption text-success">Saved {phase.filename}</span> : null}
            {phase.at === "failed" ? <span className="text-caption text-danger">{phase.error}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
