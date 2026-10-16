/**
 * Starter kits (25.7): for each kind of creator, a style pack, three
 * frameworks that suit the work, a default hook kind and a default call to
 * action. A preset of presets, and it runs once: what it makes is an ordinary
 * deck, and nothing remembers the kit afterwards. Batch 33's onboarding is
 * where it is offered first; the projects screen offers it now.
 */
import { buildSlides } from "./compositions.js";
import { ctaLines, type CtaGoal } from "./ctas.js";
import type { HookKind } from "./hooks.js";
import { makeDoc, type Doc, type Identity } from "./model.js";
import { applyPack, packById, packTheme, type CreatorKind } from "./packs.js";
import type { Platform, PlatformId } from "./platforms.js";
import { structureById } from "./structures.js";

export type StarterKit = {
  id: CreatorKind;
  label: string;
  note: string;
  pack: string;
  /** Three, the first the default. */
  frameworks: [string, string, string];
  hookKind: HookKind;
  cta: CtaGoal;
};

export const KITS: StarterKit[] = [
  { id: "education", label: "Education", note: "Teach one idea a post", pack: "classroom", frameworks: ["educational", "myth", "checklist"], hookKind: "curiosity", cta: "save" },
  { id: "saas", label: "SaaS and product", note: "Show what it does and why it matters", pack: "launch", frameworks: ["problem", "comparison", "before-after"], hookKind: "contrarian", cta: "link" },
  { id: "agency", label: "Agency", note: "Prove the work", pack: "studio", frameworks: ["showcase", "before-after", "lessons"], hookKind: "result", cta: "book-call" },
  { id: "finance", label: "Finance", note: "Make numbers make sense", pack: "ledger", frameworks: ["data", "myth", "faq"], hookKind: "curiosity", cta: "follow" },
  { id: "fitness", label: "Fitness", note: "Programs, form, myths", pack: "pulse", frameworks: ["named-model", "myth", "before-after"], hookKind: "contrarian", cta: "save" },
  { id: "food", label: "Food", note: "Recipes, method, what went wrong", pack: "kitchen", frameworks: ["checklist", "educational", "story"], hookKind: "list", cta: "comment-keyword" },
  { id: "coaching", label: "Coaching", note: "Frameworks and lessons", pack: "calm", frameworks: ["named-model", "lessons", "question"], hookKind: "story", cta: "dm-keyword" },
  { id: "personal", label: "Personal brand", note: "Opinions and stories", pack: "signature", frameworks: ["hot-take", "story", "lessons"], hookKind: "contrarian", cta: "follow" },
];

export const kitById = (id: string): StarterKit | undefined => KITS.find((k) => k.id === id);

/**
 * A first deck from a kit: the framework's own example copy, the kit's call to
 * action on the last slide in the platform's words, laid out and dressed in
 * the kit's pack. Runs once.
 */
export function deckFromKit(
  kit: StarterKit,
  opts: { framework?: string | undefined; platform?: Platform | null | undefined; identity?: Identity | undefined } = {},
): Doc | null {
  const structure = structureById(opts.framework ?? kit.frameworks[0]);
  const pack = packById(kit.pack);
  if (!structure || !pack) return null;
  const theme = packTheme(pack);
  const texts = structure.slots.map((s) => s.placeholder);
  // A wording with nothing left to fill when there is one; otherwise the
  // blanks stay visible and the pre-flight names them.
  const lines = ctaLines(kit.cta, (opts.platform?.id ?? "linkedin") as PlatformId);
  const cta = lines.find((l) => !/\[[^\]]+\]/.test(l)) ?? lines[0];
  if (cta) texts[texts.length - 1] = cta;
  const base: Doc = {
    ...makeDoc(structure.name),
    framework: structure.id,
    slides: buildSlides(texts, theme, structure.slots.map((s) => s.id)),
  };
  return applyPack(base, pack, opts.identity, opts.platform, theme);
}
