/**
 * The engine page (Batch 31.3): the app's layout and painter, with no screen.
 *
 * The API server opens `engine.html` in its headless browser and calls these.
 * Layout measures with the bundled faces' metrics and painting is `LayerView`,
 * both of which only run under Vite, so the API does its work here rather than
 * keeping a second copy of either on the server. Invariant 3 holds for the API
 * too: one painter.
 */
import { catalogue, deckFromIdea, deckFromInput, draftStructure, InputError, type DeckInput } from "./studio/apideck.js";
import { alignToSlots } from "./studio/ai.js";
import { renderPayload } from "./studio/exporter.js";
import type { Doc } from "./studio/model.js";
import { platformById, type PlatformId } from "./studio/platforms.js";
import { slotsFor, structureById } from "./studio/structures.js";

type Result<T> = { ok: true; value: T } | { ok: false; error: string; input: boolean };

const wrap = async <T>(run: () => T | Promise<T>): Promise<Result<T>> => {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), input: e instanceof InputError };
  }
};

const engine = {
  ready: true,
  catalogue: () => wrap(() => catalogue()),
  deck: (input: DeckInput) => wrap(() => deckFromInput(input)),
  idea: (idea: string, input: Omit<DeckInput, "slides" | "text">) => wrap(() => deckFromIdea(idea, input)),
  draftStructure: (idea: string, framework: string | undefined) => wrap(() => draftStructure(idea, framework)),
  /** Drafted words lined up with the framework's slots, then laid out like any deck. */
  drafted: (slides: { role: string; text: string; fields?: string[] }[], framework: string, input: Omit<DeckInput, "slides" | "text" | "framework">) =>
    wrap(() => {
      const structure = structureById(framework);
      if (!structure) throw new InputError(`Unknown framework: ${framework}`);
      const count = structure.range ? Math.round((structure.range[0] + structure.range[1]) / 2) : structure.slots.length;
      const sized = { ...structure, slots: slotsFor(structure, count) };
      return deckFromInput({ ...input, framework, slides: alignToSlots(slides.map((s) => ({ ...s, fields: s.fields ?? [] })), sized) });
    }),
  /** The export payload, serialised by `LayerView`, for the server's renderer. */
  payload: (doc: Doc, platform: string) => wrap(() => renderPayload(doc, platformById(platform as PlatformId))),
};

declare global {
  interface Window {
    __fccEngine: typeof engine;
  }
}

window.__fccEngine = engine;
