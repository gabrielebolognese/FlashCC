/**
 * The start screen's two shelves from Batch 25: your saved templates (25.5),
 * and a starter kit per kind of creator (25.7). Both make an ordinary deck,
 * once, and open it.
 */
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { deckFromKit, KITS } from "./kits.js";
import { makeDoc, type Doc } from "./model.js";
import { packById } from "./packs.js";
import { deckFromTemplate, listTemplates, removeTemplate, type Template } from "./templates.js";
import { themeOf, listBrands } from "./brand.js";

export function TemplateShelf({ client, onMake }: { client: string | null; onMake: (doc: Doc) => void }) {
  const [templates, setTemplates] = useState<Template[]>(() => listTemplates(client));
  if (templates.length === 0) return null;
  return (
    <div className="mt-9">
      <span className="text-overline uppercase text-tertiary">Your templates</span>
      <div className="mt-3 flex flex-wrap gap-2">
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-1 rounded-2xl border border-hairline bg-surface-1 py-1 pl-3 pr-1">
            <button
              type="button"
              onClick={() => {
                // The template's own look: its brand or pack, when it had one.
                const theme = themeOf({ ...makeDoc(t.name), ...(t.styleId ? { styleId: t.styleId } : {}) }, listBrands());
                onMake(deckFromTemplate(t, { theme }));
              }}
              className="text-left"
            >
              <span className="block text-body-strong text-secondary hover:text-primary">{t.name}</span>
              <span className="block text-caption text-muted">
                {t.slides.length} slides{t.example ? " · example text" : ""}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete template ${t.name}`}
              onClick={() => {
                removeTemplate(t.id);
                setTemplates(listTemplates(client));
              }}
              className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-danger"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-caption text-muted">A template is used once: changing it later never reaches the decks made from it.</p>
    </div>
  );
}

export function KitShelf({ onMake }: { onMake: (doc: Doc) => void }) {
  return (
    <div className="mt-9">
      <span className="text-overline uppercase text-tertiary">Starter kits</span>
      <p className="mt-1 text-caption text-muted">A look, three frameworks that suit the work, and a call to action. Nothing is ranked.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KITS.map((k) => {
          const pack = packById(k.pack);
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => {
                const doc = deckFromKit(k);
                if (doc) onMake(doc);
              }}
              className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-1 p-3 text-left hover:border-accent-dim"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: pack?.colours.bg }}>
                <span className="block h-3 w-3 rounded-full" style={{ background: pack?.colours.accent }} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body-strong text-secondary">{k.label}</span>
                <span className="block truncate text-caption text-muted">{k.note}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
