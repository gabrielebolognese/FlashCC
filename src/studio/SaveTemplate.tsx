/**
 * Save as template (25.5): this deck's structure, kept for the next one. The
 * words stay behind unless "keep as example text" is ticked; pictures always
 * do. It belongs to the client on screen.
 */
import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import type { Doc } from "./model.js";
import { saveTemplate, templateFrom } from "./templates.js";

export function SaveTemplate({ doc, clientId, onSaved, onClose }: { doc: Doc; clientId?: string | undefined; onSaved: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(doc.name);
  const [example, setExample] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Save as template"
        className="fixed left-1/2 top-1/2 z-modal w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 items-center gap-2 border-b border-hairline px-5">
          <span className="flex-1 text-title text-primary">Save as template</span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>
        <div className="flex flex-col gap-3 p-5">
          <label className="block">
            <span className="text-caption text-tertiary">Name</span>
            <input
              autoFocus
              aria-label="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
            />
          </label>
          <p className="text-caption leading-5 text-muted">
            Keeps the {doc.slides.length} slides&rsquo; layouts, backgrounds, blocks, furniture, designs across slides and the look. Not
            the pictures. Decks made from it are not linked to it: changing the template later never reaches them.
          </p>
          <label className="flex items-center gap-2 text-caption text-secondary">
            <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} />
            Keep the words as example text
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline p-3">
          <Button
            hero
            control
            onClick={() => {
              saveTemplate(templateFrom(doc, name, { keepExample: example, clientId }));
              onSaved(name);
            }}
          >
            Save template
          </Button>
        </div>
      </div>
    </>
  );
}
