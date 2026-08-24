/**
 * The one rhythm (interaction-principles.md R8).
 * Every interactive control is 28px tall. There is no compact and no comfortable.
 */
export const CONTROL_H = 28;
export const TOPBAR_H = 44;
export const FILMSTRIP_H = 96;

/** R5: 14px glyph inside a 28px hit box — visual weight low, target comfortable. */
export const ICON = 14;
export const ICON_LG = 16;

/** Slide logical space (role-layouts.md §1). Scale is applied outside the renderer. */
export const FORMATS = {
  "portrait-4x5": { w: 1080, h: 1350 },
  "square-1x1": { w: 1080, h: 1080 },
  "story-9x16": { w: 1080, h: 1920 },
} as const;

export type FormatId = keyof typeof FORMATS;
export const DEFAULT_FORMAT: FormatId = "portrait-4x5";
