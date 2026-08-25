/**
 * First-run preferences.
 *
 * Answers here are turned into a real style and two real generation settings — they
 * are not stored and ignored. Skipping is a first-class path: the defaults are the
 * same ones the app would have used anyway.
 */
import type { Theme } from "./presets.js";
import { STYLES, type Style } from "./styles.js";

export type DecorLevel = "none" | "normal" | "bold";
export type ImageUse = "always" | "sometimes" | "never";

export type Prefs = {
  /** Which of the two plain grounds the palette is built on. */
  ground: "dark" | "light";
  accent: string;
  displayFont: string;
  bodyFont: string;
  images: ImageUse;
  decor: DecorLevel;
};

export const DEFAULT_PREFS: Prefs = {
  ground: "dark",
  accent: "#d9a521",
  displayFont: "sans",
  bodyFont: "sans",
  images: "sometimes",
  decor: "normal",
};

const SEEN = "flashcc:v3:onboarded";
const PREFS = "flashcc:v3:prefs";

/**
 * Dev only: replay onboarding on every load so changes to it are visible without
 * clearing localStorage each time. Flip to false to test the real returning-user
 * path; production ignores this entirely.
 */
const REPLAY_IN_DEV = true;

export function hasOnboarded(): boolean {
  if (import.meta.env.DEV && REPLAY_IN_DEV) return false;
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    // Private mode: never nag, treat it as done.
    return true;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    /* nothing to do */
  }
}

export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS);
    if (!raw) return null;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return null;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch {
    /* nothing to do */
  }
}

const GROUND: Record<Prefs["ground"], { bg: string; fg: string; muted: string }> = {
  dark: { bg: "#101215", fg: "#f2f4f7", muted: "#8b93a1" },
  light: { bg: "#ffffff", fg: "#141619", muted: "#61666e" },
};

/** The answers, as a style that sits first in the gallery. */
export function styleFromPrefs(prefs: Prefs): Style {
  const g = GROUND[prefs.ground];
  const theme: Theme = {
    bg: g.bg,
    fg: g.fg,
    muted: g.muted,
    accent: prefs.accent,
    displayFont: prefs.displayFont,
    bodyFont: prefs.bodyFont,
  };
  return { id: "yours", name: "Yours", note: "From your answers", theme };
}

/** Gallery with the user's own style first, when they have one. */
export function stylesFor(prefs: Prefs | null): Style[] {
  if (!prefs) return STYLES;
  return [styleFromPrefs(prefs), ...STYLES];
}

export const decorScale = (level: DecorLevel): number =>
  level === "none" ? 0 : level === "bold" ? 1.8 : 1;

export const wantsImages = (use: ImageUse): boolean => use !== "never";

/** Accents offered in the questionnaire — readable on both grounds. */
export const ACCENTS = [
  "#d9a521", "#ef4444", "#f97316", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];
