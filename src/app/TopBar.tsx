import { Palette, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  slideCount: number;
  onHome: () => void;
  onBrandKit: () => void;
  onExport: () => void;
};

/**
 * 44px. Left: wordmark + project name. Centre: deliberately empty (§3).
 * Right: slide count as plain text, brand kit, then the one hero control.
 */
export function TopBar({
  projectName,
  onProjectNameChange,
  slideCount,
  onHome,
  onBrandKit,
  onExport,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-3">
      <button type="button" onClick={onHome} className="flex items-center gap-2" aria-label="Projects">
        <span
          className="grid h-5 w-5 place-items-center rounded-sm text-[11px] font-semibold"
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
        >
          F
        </span>
        <span className="text-body-strong text-primary">FlashCC</span>
      </button>

      {editing ? (
        <input
          autoFocus
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
          className="h-7 rounded-sm border border-edge bg-surface-1 px-2 text-body text-primary outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="h-7 rounded-sm border border-transparent px-2 text-body text-secondary hover:border-hairline hover:text-primary"
        >
          {projectName}
        </button>
      )}

      <div className="flex-1" />

      <span className="text-caption text-muted">
        {slideCount === 0 ? "no slides" : `${slideCount} slide${slideCount === 1 ? "" : "s"}`}
      </span>
      <IconButton icon={Palette} label="Brand kit" onClick={onBrandKit} />
      <Button hero icon={Upload} onClick={onExport}>
        Export
      </Button>
    </header>
  );
}
