import { FileText, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { defaultBrandKit, newDocument, SAMPLE_POST } from "../doc/defaults.js";
import { splitToSlides } from "../doc/split.js";
import type { Template } from "../doc/template.js";
import type { FlashCCDocument, ProjectSummary } from "../doc/types.js";
import { FORMATS } from "../render/layout/node.js";
import {
  deleteProject,
  lastBrandKit,
  listProjects,
  listTemplates,
  loadDocument,
  saveDocument,
} from "../state/persist.js";
import { IconButton } from "../ui/IconButton.js";
import { TemplateCard } from "./TemplateCard.js";

type Props = {
  onOpen: (doc: FlashCCDocument) => void;
  onEditTemplate: (template: Template | null) => void;
};

/** Derived from what exists, so the teaching content retires itself once it has taught. */
type HomeState = "first-run" | "returning";

const CARD_H = 168;

export function Home({ onOpen, onEditTemplate }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects());
  const templates = useMemo(() => listTemplates(), []);
  const brand = useMemo(() => lastBrandKit() ?? defaultBrandKit(), []);
  const format = FORMATS["portrait-4x5"] ?? { w: 1080, h: 1350 };

  const state: HomeState = projects.length === 0 ? "first-run" : "returning";

  // Seeing your own sentence laid out six ways explains a template faster than copy.
  const previewText = projects[0]?.preview
    ? `${projects[0].preview}\n\nSecond slide.`
    : SAMPLE_POST;

  function create(template: Template) {
    const doc = newDocument(`${template.name} carousel`, SAMPLE_POST, template);
    doc.brandKit = brand;
    doc.slides = splitToSlides(SAMPLE_POST, doc.granularity);
    saveDocument(doc);
    onOpen(doc);
  }

  function createBlank() {
    const first = templates[0];
    const doc = newDocument("Untitled", "", first);
    doc.brandKit = brand;
    saveDocument(doc);
    onOpen(doc);
  }

  function remove(id: string) {
    deleteProject(id);
    setProjects(listProjects());
  }

  const gallery = (
    <section>
      <div className="mb-2 text-overline uppercase text-tertiary">Templates</div>
      <div className="flex flex-wrap gap-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => create(template)}
            className="group text-left"
          >
            <TemplateCard
              template={template}
              brand={brand}
              format={format}
              previewText={previewText}
              height={CARD_H}
            />
            <div className="mt-1.5 text-body-strong text-secondary group-hover:text-primary">
              {template.name}
            </div>
          </button>
        ))}

        <button
          type="button"
          onClick={() => onEditTemplate(null)}
          className="group grid shrink-0 place-items-center rounded-lg border border-dashed border-hairline text-tertiary hover:border-edge hover:text-primary"
          style={{ width: (format.w / format.h) * CARD_H, height: CARD_H }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Plus size={16} strokeWidth={2} />
            <span className="text-caption">New template</span>
          </div>
        </button>
      </div>
    </section>
  );

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

      <main className="mx-auto max-w-[1040px] px-6 py-8">
        {state === "first-run" ? (
          <>
            <h1 className="text-display text-primary">Pick a look. Then paste your post.</h1>
            <p className="mt-1 mb-6 text-body text-tertiary">
              Every card below is a real slide. Click one to start editing it.
            </p>
            {gallery}
            <button
              type="button"
              onClick={createBlank}
              className="mt-6 h-7 rounded-md px-2 text-body text-tertiary hover:bg-white/[0.04] hover:text-primary"
            >
              Blank carousel
            </button>
          </>
        ) : (
          <>
            <section className="mb-8">
              <div className="mb-2 text-overline uppercase text-tertiary">Your carousels</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
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
                          {project.templateName ?? "Anchored"}
                        </div>
                      </div>
                    </button>
                    <div className="absolute right-1 top-1 hidden group-hover:block">
                      <IconButton
                        icon={Trash2}
                        label="Delete project"
                        danger
                        onClick={() => remove(project.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {gallery}
          </>
        )}
      </main>
    </div>
  );
}
