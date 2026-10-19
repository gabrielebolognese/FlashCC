/**
 * What `/v1/decks` and `/v1/runs` lay out (Batch 31.3): words in, a document
 * out, through the same machinery the app uses, run once.
 *
 * This is the splitter the competitor APIs did not offer: send one string
 * per slide, or long-form text, and get back a laid-out deck in a framework
 * and a look. Long-form text goes through `readLongForm` and `toSlides`, the
 * deterministic reader the app's long-form import uses, so no key is needed
 * and the same text always makes the same deck. Only `/v1/runs` with
 * `draft: true` uses the model, for words, never layout (invariant 5).
 *
 * Runs in the engine page (`engine.ts`), in a browser, because layout measures
 * with the bundled faces' metrics, which load the way only Vite loads them.
 */
import { MAX_SLIDES } from "./compositions.js";
import type { Lane, Look } from "./lanes.js";
import { readLongForm, toSlides } from "./longform.js";
import type { Doc } from "./model.js";
import { packById, PACKS } from "./packs.js";
import { platformById, PLATFORMS, type PlatformId } from "./platforms.js";
import { reflowDoc } from "./reflow.js";
import { fitToSafeArea } from "./safearea.js";
import { DEFAULT_STYLE, STYLES } from "./styles.js";
import { slotsFor, structureById, STRUCTURES, type Structure } from "./structures.js";
import { deckForLane } from "./week.js";

export type DeckInput = {
  /** One string per slide. */
  slides?: string[] | undefined;
  /** Or long-form text: the first moment in it becomes the carousel. */
  text?: string | undefined;
  /** A framework id; absent lays the words out with no slot roles. */
  framework?: string | undefined;
  /** A style id, or `pack:<id>` for a style pack. */
  look?: string | undefined;
  /** A platform id: the artboard and the safe area the deck is fitted to. */
  platform?: string | undefined;
  name?: string | undefined;
};

export type DeckOutput = { document: Doc; slides: number; framework: string; look: string; platform: string; warnings: string[] };

export class InputError extends Error {}

const MAX_SLIDE_CHARS = 600;
export const MAX_TEXT_CHARS = 40_000;

/** What a caller may name: shown by `GET /v1/decks` so nobody guesses ids. */
export function catalogue() {
  return {
    frameworks: STRUCTURES.map((s) => ({ id: s.id, name: s.name, range: s.range ?? null })),
    looks: [...STYLES.map((s) => ({ id: s.id, name: s.name })), ...PACKS.map((p) => ({ id: `pack:${p.id}`, name: p.name }))],
    platforms: PLATFORMS.map((p) => ({ id: p.id, name: p.label, width: p.w, height: p.h })),
  };
}

function lookOf(id: string | undefined): Look {
  if (!id) return { kind: "style", id: DEFAULT_STYLE.id };
  if (id.startsWith("pack:")) {
    if (!packById(id.slice(5))) throw new InputError(`Unknown look: ${id}`);
    return { kind: "pack", id: id.slice(5) };
  }
  if (!STYLES.some((s) => s.id === id)) throw new InputError(`Unknown look: ${id}`);
  return { kind: "style", id };
}

/** The words, from slides as given or from long-form text. */
export function wordsOf(input: DeckInput): { texts: string[]; warnings: string[] } {
  if (Array.isArray(input.slides) && input.slides.length) {
    const texts = input.slides.map((t) => String(t ?? "").trim()).filter(Boolean);
    if (!texts.length) throw new InputError("Every slide is empty");
    if (texts.length > MAX_SLIDES) throw new InputError(`At most ${MAX_SLIDES} slides`);
    if (texts.some((t) => t.length > MAX_SLIDE_CHARS)) throw new InputError(`A slide is over ${MAX_SLIDE_CHARS} characters; send long text as "text" and it is split for you`);
    return { texts, warnings: [] };
  }
  const text = String(input.text ?? "").trim();
  if (!text) throw new InputError('Send "slides" (one string per slide) or "text" (long-form)');
  if (text.length > MAX_TEXT_CHARS) throw new InputError(`"text" is over ${MAX_TEXT_CHARS} characters`);
  const read = readLongForm(text);
  const first = read.candidates[0];
  if (!first) throw new InputError("There is nothing in that text to make slides from");
  return { texts: toSlides(first), warnings: [...read.warnings, ...(first.thin ? ["The text is short for a carousel; the deck is thin."] : [])] };
}

export function deckFromInput(input: DeckInput): DeckOutput {
  const { texts, warnings } = wordsOf(input);
  const structure: Structure | undefined = input.framework ? structureById(input.framework) : undefined;
  if (input.framework && !structure) throw new InputError(`Unknown framework: ${input.framework}`);
  const platformId = (input.platform ?? "instagram") as PlatformId;
  if (!PLATFORMS.some((p) => p.id === platformId)) throw new InputError(`Unknown platform: ${input.platform}`);
  const look = lookOf(input.look);

  const sized: Structure = structure
    ? { ...structure, slots: slotsFor(structure, texts.length) }
    : { ...(STRUCTURES[0] as Structure), slots: [] };
  const lane: Lane = {
    id: "api",
    name: "",
    weekday: 1,
    time: "09:00",
    platform: platformId as Lane["platform"],
    framework: sized.id,
    look,
    pillar: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const roles = structure ? sized.slots.map((s) => s.id) : [];
  let doc = deckForLane(lane, { texts, roles }, { structure: sized });
  if (!structure) {
    const { framework: _f, ...rest } = doc;
    doc = rest as Doc;
  }
  if (input.name?.trim()) doc = { ...doc, name: input.name.trim().slice(0, 120) };

  // Generation targets 1080 by 1350; any other platform is a canvas resize, then its safe area.
  const platform = platformById(platformId);
  if (doc.width !== platform.w || doc.height !== platform.h) doc = fitToSafeArea(reflowDoc(doc, platform.w, platform.h), platform);

  return {
    document: doc,
    slides: doc.slides.length,
    framework: structure?.id ?? "none",
    look: look.kind === "pack" ? `pack:${look.id}` : look.id,
    platform: platformId as Lane["platform"],
    warnings,
  };
}

/** For a run without drafting: the framework's own example copy with the idea on the cover. */
export function deckFromIdea(idea: string, input: Omit<DeckInput, "slides" | "text">): DeckOutput {
  const structure = structureById(input.framework ?? "educational") ?? STRUCTURES[0]!;
  const slots = slotsFor(structure, structure.range ? Math.round((structure.range[0] + structure.range[1]) / 2) : structure.slots.length);
  const texts = slots.map((s) => s.placeholder);
  texts[0] = idea.trim();
  return deckFromInput({ ...input, framework: structure.id, slides: texts });
}

/** The draft request a run sends for one idea: the framework's slots in the route's shape. */
export function draftStructure(idea: string, framework: string | undefined) {
  const structure = structureById(framework ?? "educational") ?? STRUCTURES[0]!;
  const count = structure.range ? Math.round((structure.range[0] + structure.range[1]) / 2) : structure.slots.length;
  const slots = slotsFor(structure, count);
  return {
    framework: structure.id,
    brief: idea.trim(),
    structure: {
      name: structure.name,
      shape: structure.shape,
      slots: slots.map((s) => ({
        id: s.id,
        label: s.label,
        note: s.detail,
        placeholder: s.placeholder,
        ...(s.block ? { block: { id: s.block.id, label: s.block.label, fields: s.block.fields } } : {}),
        ...(s.honest ? { honest: true } : {}),
      })),
    },
  };
}
