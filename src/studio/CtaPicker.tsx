/**
 * A call to action by goal (25.4), worded for the platform, onto the last
 * slide. The caption route reads the last slide as the post's CTA, so the
 * slide and the caption agree by construction.
 */
import { X } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../ui/IconButton.js";
import { ctaBlanks, ctaLines, CTAS, type CtaGoal } from "./ctas.js";
import { PLATFORMS, type PlatformId } from "./platforms.js";

export function CtaPicker({
  platform: initial,
  current,
  onUse,
  onClose,
}: {
  platform: PlatformId;
  /** What the last slide says now. */
  current: string;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState<CtaGoal>("follow");
  const [platform, setPlatform] = useState<PlatformId>(initial);
  const [fill, setFill] = useState<Record<string, string>>({});
  const lines = ctaLines(goal, platform, fill);
  const blanks = ctaBlanks(goal);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Call to action"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="flex-1 text-title text-primary">Call to action</span>
          <select
            aria-label="Platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformId)}
            className="h-7 rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r border-hairline p-2">
            <p className="px-2 pb-1 text-caption text-muted">What is this post for?</p>
            {CTAS.map((c) => (
              <button
                key={c.id}
                type="button"
                data-control
                onClick={() => setGoal(c.id)}
                className={[
                  "block w-full rounded-lg px-2.5 py-1.5 text-left",
                  goal === c.id ? "bg-accent-wash text-accent" : "text-secondary hover:bg-white/[0.04]",
                ].join(" ")}
              >
                <span className="block text-body">{c.label}</span>
                <span className="block text-caption text-muted">{c.note}</span>
              </button>
            ))}
          </div>

          <div className="overflow-y-auto p-4">
            {blanks.map((b) => (
              <label key={b} className="mb-2 block">
                <span className="text-caption text-tertiary">{b}</span>
                <input
                  value={fill[b] ?? ""}
                  onChange={(e) => setFill({ ...fill, [b]: e.target.value })}
                  placeholder={b === "keyword" ? "GUIDE" : ""}
                  className="mt-0.5 h-8 w-full rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
                />
              </label>
            ))}
            <p className="mb-2 mt-3 text-caption text-muted">Pick a wording. It replaces the last slide; the caption picks it up from there.</p>
            {lines.map((l) => (
              <button
                key={l}
                type="button"
                data-control
                disabled={/\[[^\]]+\]/.test(l)}
                onClick={() => onUse(l)}
                className="mb-1.5 block w-full rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-left text-body text-primary hover:border-accent-dim disabled:opacity-50"
              >
                {l}
              </button>
            ))}
            <p className="mt-3 text-caption text-muted">Now the last slide says: “{current || "nothing yet"}”</p>
          </div>
        </div>
      </div>
    </>
  );
}
