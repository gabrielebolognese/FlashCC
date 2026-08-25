import { X } from "lucide-react";
import { useState } from "react";

const KEY = "flashcc:seen-editor";

/**
 * One line, shown once ever, dismissed permanently. Not a tour and not coach marks:
 * it names the three regions in the order you use them and then never returns.
 */
export function FirstRunBar() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return true;
    }
  });

  if (seen) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode — it just shows again */
    }
    setSeen(true);
  };

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-surface-2 px-3 text-caption text-tertiary">
      <Step n="1" text="Everything on the slide is draggable — click it and move it" />
      <Sep />
      <Step n="2" text="Double-click text to retype it, or edit it in the list" />
      <Sep />
      <Step n="3" text="Add text, shapes and icons from the toolbar above" />
      <div className="flex-1" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-white/[0.06] hover:text-primary"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-surface-4 text-[9.5px] text-primary">
        {n}
      </span>
      {text}
    </span>
  );
}

const Sep = () => <span className="text-muted">·</span>;
