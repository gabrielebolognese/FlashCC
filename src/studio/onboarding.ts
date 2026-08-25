/**
 * First-run preferences.
 *
 * Answers here are turned into a real style and two real generation settings — they
 * are not stored and ignored. Skipping is a first-class path: the defaults are the
 * same ones the app would have used anyway.
 */
import { textFor } from "./colour.js";
import type { Theme } from "./presets.js";
import { STYLES, type Style } from "./styles.js";

export type DecorLevel = "none" | "normal" | "bold";
export type ImageUse = "always" | "sometimes" | "never";

export type Prefs = {
  /** Key into GROUNDS, or CUSTOM_GROUND to use customBg. */
  ground: string;
  /** Used only when ground is CUSTOM_GROUND. Text is derived from it. */
  customBg?: string | undefined;
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

export type Ground = { id: string; name: string; bg: string; fg: string; muted: string };

/** The two plain grounds. Most decks are one of these. */
export const MAIN_GROUNDS: Ground[] = [
  { id: "dark", name: "Dark", bg: "#101215", fg: "#f2f4f7", muted: "#8b93a1" },
  { id: "light", name: "Light", bg: "#ffffff", fg: "#141619", muted: "#61666e" },
];

/** Everything else, offered smaller because it is a preference, not a default. */
export const MORE_GROUNDS: Ground[] = [
  { id: "midnight", name: "Midnight", bg: "#0b1020", fg: "#e8ecf5", muted: "#8891a8" },
  { id: "slate", name: "Slate", bg: "#1c2128", fg: "#e6eaf0", muted: "#8b95a3" },
  { id: "forest", name: "Forest", bg: "#0f2419", fg: "#eef7f0", muted: "#8aa896" },
  { id: "cobalt", name: "Cobalt", bg: "#12285a", fg: "#ffffff", muted: "#9fb2d9" },
  { id: "plum", name: "Plum", bg: "#1b1024", fg: "#f3e9fb", muted: "#9d8bb0" },
  { id: "paper", name: "Paper", bg: "#f7f4ed", fg: "#1a1a18", muted: "#645f55" },
  { id: "sand", name: "Sand", bg: "#efe7da", fg: "#2a2118", muted: "#6b6053" },
  { id: "rose", name: "Rose", bg: "#fdf2f8", fg: "#2b1220", muted: "#77536a" },
];

export const GROUNDS: Ground[] = [...MAIN_GROUNDS, ...MORE_GROUNDS];

export const groundById = (id: string): Ground =>
  GROUNDS.find((g) => g.id === id) ?? MAIN_GROUNDS[0]!;

export const CUSTOM_GROUND = "custom";

/**
 * The ground actually in force. A custom background derives its own text and muted
 * colours, so the user picks one colour and cannot end up with unreadable slides.
 */
export function groundFor(prefs: Prefs): Ground {
  if (prefs.ground === CUSTOM_GROUND && prefs.customBg) {
    const bg = prefs.customBg;
    const { fg, muted } = textFor(bg);
    return { id: CUSTOM_GROUND, name: "Custom", bg, fg, muted };
  }
  return groundById(prefs.ground);
}

/** The answers, as a style that sits first in the gallery. */
export function styleFromPrefs(prefs: Prefs): Style {
  const g = groundFor(prefs);
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
