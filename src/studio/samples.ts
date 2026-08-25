/**
 * One worked example per framework, in the user's own style.
 *
 * The copy is each slot's placeholder — which is already finished example writing
 * rather than lorem — so the examples double as a demonstration of what belongs in
 * each slide, which is the thing the framework screen can only describe.
 */
import { buildSlides, type BuildOptions } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import type { Theme } from "./presets.js";
import { STRUCTURES } from "./structures.js";

export const EXAMPLES_GROUP = "Examples";

export function buildFrameworkSamples(theme: Theme, options: BuildOptions = {}): Doc[] {
  const palette = [
    theme.bg, theme.fg, theme.accent, theme.muted,
    "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777",
  ];

  return STRUCTURES.map((structure) => ({
    ...makeDoc(structure.name),
    palette,
    group: EXAMPLES_GROUP,
    slides: buildSlides(
      structure.slots.map((s) => s.placeholder),
      theme,
      structure.slots.map((s) => s.id),
      options,
    ),
  }));
}
