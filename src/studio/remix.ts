/**
 * Make another like this (28.1): the shape of a post that worked, with new
 * words in it.
 *
 * "What worked" is almost always a shape, not a sentence: the framework, the
 * slide count, the composition at each position, the blocks, the furniture and
 * the style. Copying that and writing new words is what experienced creators
 * do by hand when something lands.
 *
 * **The structural copy is deterministic and needs no key**, the same split as
 * `longform.ts` beside `/api/distil`. It is Batch 25's template machinery run
 * once without being saved: `templateFrom` takes the structure and drops the
 * words, `deckFromTemplate` lays new words into it. Only the words may come
 * from the model, and only when the person asks it to draft.
 *
 * **None of the original's words survive**, including inside blocks. A block
 * keeps its kind and its place; each of its fields becomes its own label in
 * brackets ("[Number]"), never the library's sample figure, because a big
 * number nobody chose is the invented result the honesty rule forbids. The
 * pre-flight flags any bracket left unfilled.
 */
import { blockById } from "./blocks.js";
import { makeDoc, type Doc, type Identity } from "./model.js";
import { copyLayers, slideCopy } from "./regenerate.js";
import { postFromDoc, type Post } from "./pipeline.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";
import { slotsFor, structureById, type Structure } from "./structures.js";
import { deckFromTemplate, placeholderTexts, templateFrom, type Template } from "./templates.js";

/** The deck's structure, with every word left behind. */
export function remixTemplate(doc: Doc): Template {
  const t = templateFrom(doc, doc.name, { keepExample: false });
  return {
    ...t,
    slides: t.slides.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => {
        const block = blockById(b.block);
        const fields = Object.fromEntries(
          (block?.fields ?? []).map((f) => [f.key, /optional/i.test(f.placeholder ?? "") ? "" : `[${f.label}]`]),
        );
        return { ...b, fields };
      }),
    })),
  };
}

/**
 * What a draft for the remix asks the model for: the original's framework at
 * the original's length, so the words come back one per slide in its order.
 */
export function remixStructure(doc: Doc): Structure | undefined {
  const structure = structureById(doc.framework);
  if (!structure) return undefined;
  return { ...structure, slots: slotsFor(structure, doc.slides.length) };
}

/**
 * The new carousel. `texts` are the new words, one per slide (a draft, or
 * nothing for the template's own placeholders). Records where it came from in
 * `remixOf`, and nothing else of the original: not its name, not its hook
 * kind, not the throwaway template's id.
 */
export function remixDeck(
  doc: Doc,
  opts: { theme: Theme; texts?: string[] | undefined; name?: string | undefined; identity?: Identity | undefined; platform?: Platform | null | undefined },
): Doc {
  const t = remixTemplate(doc);
  const texts = opts.texts?.length ? opts.texts : placeholderTexts(t);
  const made = deckFromTemplate(t, { theme: opts.theme, texts, identity: opts.identity ?? doc.furniture?.identity, platform: opts.platform });
  const { template: _throwaway, ...rest } = made;
  // A slide that carried no words of its own (a block on its own, a picture)
  // stays without words: the template path fills every slide, and a
  // placeholder laid out under a block is a shape the original never had.
  const slides = made.slides.map((s, i) => {
    const was = doc.slides[i];
    if (!was || slideCopy(was).trim()) return s;
    const generated = new Set(copyLayers(s).map((l) => l.id));
    return { ...s, composition: was.composition, layers: s.layers.filter((l) => !generated.has(l.id)) };
  });
  return {
    ...rest,
    ...makeDoc(opts.name?.trim() || "Untitled remix", doc.width, doc.height),
    slides,
    palette: doc.palette,
    ...(made.furniture ? { furniture: made.furniture } : {}),
    ...(doc.framework ? { framework: doc.framework } : {}),
    ...(doc.styleId ? { styleId: doc.styleId } : {}),
    ...(doc.clientId ? { clientId: doc.clientId } : {}),
    remixOf: doc.id,
  };
}

/**
 * The post for a remix. From an idea in the bank, the idea itself moves along
 * (Batch 27's rule: an idea becoming a carousel is one record). From a new
 * brief, a fresh post. Either way it goes to the source's platform, in
 * drafting, with the source's pillar and objective, since "like this" is a
 * statement about what it is for as well as how it is built.
 */
export function remixPost(source: Post, doc: Doc, idea?: Post | undefined): Post {
  const base = postFromDoc(doc, source.platform);
  const shared = {
    stage: "drafting" as const,
    pillar: idea?.pillar.trim() || source.pillar,
    objective: source.objective,
    updatedAt: new Date().toISOString(),
  };
  if (!idea) return { ...base, ...shared };
  return {
    ...idea,
    ...shared,
    docId: doc.id,
    title: doc.name,
    platform: source.platform,
    framework: base.framework,
    slideCount: base.slideCount,
    hook: base.hook,
    styleId: base.styleId,
    shape: base.shape,
    ...(doc.clientId ?? idea.clientId ? { clientId: doc.clientId ?? idea.clientId } : {}),
  };
}
