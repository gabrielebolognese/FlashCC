/**
 * Capture an idea (27.1): one shortcut and one line, from any screen.
 *
 * Q opens it, a line and Enter saves it, and it is gone. The client is the one
 * already selected in the rail; a pillar is one click on a pillar that already
 * exists, or nothing. No tags are typed, so the bank filters by the two things
 * it knows without anybody having had to remember a vocabulary.
 *
 * Mounted in `App`, outside the screen switch, like the pricing prompt: the
 * shortcut has to work on whatever screen somebody is on when the idea comes.
 */
import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";

import { actionForKey } from "./actions.js";
import { ALL_CLIENTS, UNASSIGNED, clientById, listClients, loadSelectedClient } from "./clients.js";
import { captureIdea, onCapture, pillarsOf, type IdeaSource } from "./ideas.js";
import { listLanes } from "./lanes.js";
import { listPosts } from "./pipeline.js";

export function IdeaCapture() {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState("");
  const [pillar, setPillar] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  /** The rest of a selection sent from the extension, kept as the idea's notes. */
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<IdeaSource>("capture");

  useEffect(
    () =>
      onCapture((prefill) => {
        if (prefill) {
          setLine(prefill.line);
          setNotes(prefill.notes);
          setSource(prefill.source);
        }
        setOpen(true);
      }),
    [],
  );

  // The shortcut off the editor. The studio's own handler runs first (a child's
  // effect is registered before its parent's) and marks the event handled, so
  // the editor never opens it twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable === true;
      if (actionForKey(e, typing) !== "capture-idea") return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(null), 2500);
    return () => window.clearTimeout(t);
  }, [saved]);

  const selected = loadSelectedClient();
  const clientId = selected === ALL_CLIENTS || selected === UNASSIGNED ? undefined : selected;
  const client = clientById(listClients(), clientId);
  const pillars = open ? pillarsOf(listPosts(), listLanes()).slice(0, 8) : [];

  const close = () => {
    setOpen(false);
    setLine("");
    setPillar("");
    setNotes("");
    setSource("capture");
  };

  const save = () => {
    const idea = captureIdea(line, { pillar, clientId, source, ...(notes ? { notes } : {}) });
    if (!idea) return;
    setSaved(idea.title);
    close();
  };

  return (
    <>
      {open ? (
        <>
          <div className="fixed inset-0 z-overlay bg-black/60" onClick={close} />
          <div
            role="dialog"
            aria-label="Capture an idea"
            className="fixed left-1/2 top-[22%] z-modal w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-3xl border border-hairline bg-surface-2 p-4 shadow-modal"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") close();
            }}
          >
            <div className="flex items-center gap-2">
              <Lightbulb size={14} strokeWidth={2} className="shrink-0 text-tertiary" />
              <input
                autoFocus
                aria-label="Idea"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                  }
                }}
                placeholder="One line. Enter saves it."
                className="h-8 min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
              />
            </div>
            {notes ? (
              <p className="mt-2 line-clamp-3 text-caption leading-4 text-muted" data-testid="capture-notes">
                From your selection, kept as notes: {notes}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {pillars.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-control
                  aria-pressed={pillar === p}
                  onClick={() => setPillar((x) => (x === p ? "" : p))}
                  className={[
                    "flex h-7 items-center rounded-md border px-2 text-caption",
                    pillar === p ? "border-accent text-primary" : "border-hairline text-tertiary hover:border-accent-dim hover:text-primary",
                  ].join(" ")}
                >
                  {p}
                </button>
              ))}
              <span className="flex-1" />
              <span className="text-caption text-muted">{client ? `For ${client.name}` : "Into the idea bank"}</span>
            </div>
          </div>
        </>
      ) : null}
      {saved ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-modal -translate-x-1/2 rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-caption text-secondary shadow-modal">
          Saved to the idea bank: {saved}
        </div>
      ) : null}
    </>
  );
}
