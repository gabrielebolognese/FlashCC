import { FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { newDocument, SAMPLE_POST } from "../doc/defaults.js";
import { splitToSlides } from "../doc/split.js";
import type { FlashCCDocument, ProjectSummary } from "../doc/types.js";
import { deleteProject, lastBrandKit, listProjects, loadDocument, saveDocument } from "../state/persist.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  onOpen: (doc: FlashCCDocument) => void;
};

export function Home({ onOpen }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects());

  function create(source: string, name: string) {
    const doc = newDocument(name, source);
    const brand = lastBrandKit();
    if (brand) doc.brandKit = brand;
    doc.slides = splitToSlides(source, doc.granularity);
    saveDocument(doc);
    onOpen(doc);
  }

  function remove(id: string) {
    deleteProject(id);
    setProjects(listProjects());
  }

  return (
    <div className="h-full overflow-y-auto bg-base">
      <header className="flex h-11 items-center gap-2 border-b border-hairline bg-surface-1 px-3">
        <span
          className="grid h-5 w-5 place-items-center rounded-sm text-[11px] font-semibold"
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
        >
          F
        </span>
        <span className="text-body-strong text-primary">FlashCC</span>
        <div className="flex-1" />
        <span className="text-caption text-muted">
          {projects.length === 0
            ? "no projects"
            : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <main className="mx-auto max-w-[920px] px-6 py-10">
        <h1 className="text-display text-primary">Your carousels</h1>
        <p className="mt-1 text-body text-tertiary">
          Paste a post you already wrote. FlashCC does layout, brand, and export.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => create("", "Untitled")}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-7 items-center gap-1.5 rounded-md px-3 text-body-strong hover:brightness-110"
          >
            <Plus size={14} strokeWidth={2.5} />
            New carousel
          </button>
          <button
            type="button"
            onClick={() => create(SAMPLE_POST, "Sample post")}
            className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-body-strong text-secondary hover:bg-surface-3 hover:text-primary"
          >
            <Sparkles size={14} strokeWidth={2} />
            Start from a sample
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="mt-16 text-body text-tertiary">
            Nothing here yet. Start a carousel and it saves itself.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {projects.map((project) => (
              <div key={project.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    const doc = loadDocument(project.id);
                    if (doc) onOpen(doc);
                  }}
                  className="w-full overflow-hidden rounded-lg border border-hairline bg-surface-1 text-left hover:border-surface-5"
                >
                  <div
                    className="flex h-[150px] items-end p-4"
                    style={{ background: project.background }}
                  >
                    <span
                      className="line-clamp-3 text-[13px] font-semibold leading-tight"
                      style={{ color: project.accent }}
                    >
                      {project.preview || "Empty carousel"}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <div className="truncate text-body-strong text-primary">{project.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-caption text-tertiary">
                      <FileText size={11} strokeWidth={2} />
                      {project.slideCount} slide{project.slideCount === 1 ? "" : "s"}
                      <span>·</span>
                      {relativeTime(project.updatedAt)}
                    </div>
                  </div>
                </button>
                <div className="absolute right-1 top-1 hidden group-hover:block">
                  <IconButton icon={Trash2} label="Delete project" danger onClick={() => remove(project.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
