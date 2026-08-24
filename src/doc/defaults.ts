import { newId } from "./ids.js";
import type { Template } from "./template.js";
import { ANCHORED } from "./templates/starters.js";
import type { BrandKit, FlashCCDocument } from "./types.js";

export const PALETTE_PRESETS: readonly { name: string; palette: BrandKit["palette"] }[] = [
  {
    name: "Ink",
    palette: { background: "#12161c", text: "#f4f6f8", accent: "#d9a521", muted: "#8b96a5" },
  },
  {
    name: "Paper",
    palette: { background: "#f7f4ed", text: "#1a1a18", accent: "#c2410c", muted: "#6b665c" },
  },
  {
    name: "Cobalt",
    palette: { background: "#12285a", text: "#ffffff", accent: "#7ec8ff", muted: "#9fb2d9" },
  },
  {
    name: "Bloom",
    palette: { background: "#fdf2f8", text: "#2b1220", accent: "#db2777", muted: "#7a556a" },
  },
  {
    name: "Forest",
    palette: { background: "#0f2419", text: "#eef7f0", accent: "#5fd08a", muted: "#8aa896" },
  },
  {
    name: "Slate",
    palette: { background: "#e8e8e6", text: "#1c1c1a", accent: "#2563eb", muted: "#615f5b" },
  },
];

export function defaultBrandKit(): BrandKit {
  const first = PALETTE_PRESETS[0];
  return {
    palette: first
      ? { ...first.palette }
      : { background: "#12161c", text: "#f4f6f8", accent: "#d9a521", muted: "#8b96a5" },
    type: {
      display: { family: "sans", weight: 700, tracking: -0.02, case: "none" },
      body: { family: "sans", weight: 400, tracking: 0, case: "none" },
    },
    handle: "",
  };
}

/**
 * Exercises the splitter and all five role layouts in one paste. Two lines instruct
 * at the point of action (R12) — the user's first act is the lesson, and typing
 * deletes the instruction. Never on the CTA: an unedited deck can be exported, and
 * shipped placeholder copy is a real failure class.
 */
export const SAMPLE_POST = `Click this line and type your own hook.

A carousel gets far more dwell time than a plain text post. Same words, different container.

Blank lines become new slides — try adding one.

Here is the whole playbook:

- Write the post first, never design first
- One idea per slide, no exceptions
- The cover is a promise, not a summary
- The last slide asks for exactly one thing

> The constraint is the product. Fewer choices, faster output.

You already wrote the words. Stop designing.`;

export function newDocument(
  name = "Untitled",
  source = "",
  template: Template = ANCHORED,
): FlashCCDocument {
  const now = new Date().toISOString();
  return {
    version: 2,
    id: newId("doc"),
    name,
    format: "portrait-4x5",
    granularity: "balanced",
    source,
    brandKit: defaultBrandKit(),
    template,
    slides: [],
    createdAt: now,
    updatedAt: now,
  };
}
