/**
 * Ideas from a CSV (31.5): a sheet the person exported from Notion, Airtable
 * or anywhere else. The mapping is shown, and editable, before a single idea
 * is written (the 28.4 rule); pillars and clients only ever match ones that
 * exist, and anything else is named, never invented.
 */
import { FileUp, X } from "lucide-react";
import { useMemo, useState } from "react";

import { importIdeas, MAX_FILE_BYTES, type IdeaField, type IdeaMapping } from "./fileimport.js";
import { makeIdea } from "./ideas.js";
import type { Post } from "./pipeline.js";

const FIELDS: { id: IdeaField; label: string }[] = [
  { id: "title", label: "Idea" },
  { id: "notes", label: "Notes" },
  { id: "pillar", label: "Pillar" },
  { id: "client", label: "Client" },
];

export function ImportIdeas({
  pillars,
  clients,
  onImport,
  onClose,
}: {
  pillars: readonly string[];
  clients: readonly { id: string; name: string }[];
  onImport: (ideas: Post[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<IdeaMapping | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => (source ? importIdeas(source, { pillars, clients }, mapping) : null), [source, pillars, clients, mapping]);

  const write = () => {
    if (!result) return;
    const made = result.ideas
      .map((i) => makeIdea(i.title, { notes: i.notes, pillar: i.pillar, clientId: i.clientId, source: "import" }))
      .filter((p): p is Post => p !== null);
    onImport(made);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Import ideas"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[84vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <FileUp size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 text-title text-primary">Import ideas</span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary">
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-5">
          <p className="text-caption leading-4 text-muted">
            A CSV you exported from Notion, Airtable or a spreadsheet, one idea a row. Nothing is written until you have seen how each column was read.
          </p>
          <label className="mt-3 flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent">
            Choose a CSV
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              aria-label="Ideas CSV"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_FILE_BYTES) return setError("That file is over 2 MB; that is not a list of ideas.");
                setError(null);
                setMapping(undefined);
                void file.text().then(setSource);
              }}
            />
          </label>
          {error ? <p className="mt-2 text-caption text-danger">{error}</p> : null}

          {result ? (
            <>
              <div className="mt-4 grid grid-cols-4 gap-2" data-testid="idea-mapping">
                {FIELDS.map((f) => (
                  <label key={f.id} className="flex flex-col gap-1 text-caption text-tertiary">
                    {f.label}
                    <select
                      aria-label={`${f.label} column`}
                      value={result.mapping[f.id] ?? -1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const next: IdeaMapping = { ...result.mapping };
                        if (v < 0) delete next[f.id];
                        else next[f.id] = v;
                        setMapping(next);
                      }}
                      className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-primary"
                    >
                      <option value={-1}>Not imported</option>
                      {result.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-body text-secondary" data-testid="idea-import-summary">
                {result.ideas.length} idea{result.ideas.length === 1 ? "" : "s"}
                {result.skipped ? `, ${result.skipped} empty row${result.skipped === 1 ? "" : "s"} skipped` : ""}.
              </p>
              {result.unknownPillars.length ? (
                <p className="mt-1 text-caption text-muted">
                  Pillars you do not have yet, left off: {result.unknownPillars.join(", ")}. Add them to a lane or an idea first and import again.
                </p>
              ) : null}
              {result.unknownClients.length ? <p className="mt-1 text-caption text-muted">Clients that do not exist, left off: {result.unknownClients.join(", ")}.</p> : null}
              <ul className="mt-3 flex flex-col gap-1">
                {result.ideas.slice(0, 5).map((i, k) => (
                  <li key={k} className="truncate rounded-xl border border-hairline bg-surface-1 px-3 py-1.5 text-body text-primary">
                    {i.title}
                    {i.pillar ? <span className="ml-2 text-caption text-muted">{i.pillar}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-hairline p-3">
          <button
            type="button"
            disabled={!result?.ideas.length}
            onClick={write}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold disabled:opacity-50"
          >
            Add {result?.ideas.length ?? 0} ideas to the bank
          </button>
        </div>
      </div>
    </>
  );
}
