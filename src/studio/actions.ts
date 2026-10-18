/**
 * Every action in the editor, by id: what the command palette (24.2) lists,
 * what the keyboard map (24.3) fires, and what every button names in its
 * `data-action` attribute.
 *
 * One registry, so the three cannot drift: `actions.test.ts` walks the
 * editor's source and fails on a button whose action is not here, which is
 * how "every action reachable from a button is reachable from the palette" is
 * enforced rather than hoped for. The studio's runner table is typed
 * `Record<ActionId, ...>`, so an action listed here with nothing to run does
 * not compile.
 *
 * A FAMILY is one action with an argument (`insert-block:stat`,
 * `export:linkedin`, `open:<doc id>`): the palette lists one entry per
 * argument, built when it opens.
 *
 * Pure: the key matching and the ranking are tested.
 */

export type ActionGroup = "Slide" | "Layer" | "Tools" | "Deck" | "View" | "Insert" | "Export" | "Projects";

export type ActionDef = {
  label: string;
  group: ActionGroup;
  /** As printed on `?` and beside the palette entry. */
  keys?: string | undefined;
  /** Other words it should be found by. */
  also?: string | undefined;
};

export const ACTIONS = {
  // View
  palette: { label: "Command palette", group: "View", keys: "⌘K" },
  shortcuts: { label: "Keyboard shortcuts", group: "View", keys: "?" },
  outline: { label: "Outline mode", group: "View", keys: "O", also: "text write notes" },
  "strip-view": { label: "Strip view", group: "View", also: "panorama seam side by side" },
  "unspan-broken": { label: "Unspan the designs whose seams broke", group: "Deck", also: "panorama strip" },
  "safe-areas": { label: "Safe areas", group: "View", also: "platform interface overlay" },
  "find-replace": { label: "Find and replace in this deck", group: "Deck", also: "search rename" },
  // Deck
  undo: { label: "Undo", group: "Deck", keys: "⌘Z" },
  redo: { label: "Redo", group: "Deck", keys: "⇧⌘Z" },
  rename: { label: "Rename this carousel", group: "Deck" },
  "relay-deck": { label: "Re-lay the deck", group: "Deck", also: "regenerate layout" },
  "shuffle-rhythm": { label: "Shuffle rhythm", group: "Deck", also: "layouts cycle regular same vary" },
  "style-packs": { label: "Style packs", group: "Deck", also: "look theme colours fonts preset" },
  "save-template": { label: "Save as template", group: "Deck", also: "structure reuse" },
  "reapply-template": { label: "Re-apply this deck's template", group: "Deck", also: "template update" },
  hooks: { label: "Hook variants", group: "Deck", also: "first slide opening" },
  "hook-formulas": { label: "Hook formulas", group: "Deck", also: "opening template fill blank first slide" },
  cta: { label: "Call to action", group: "Deck", also: "cta last slide follow save share comment keyword dm link" },
  "paste-post": { label: "Paste a post as slides", group: "Deck" },
  history: { label: "Version history", group: "Deck", also: "restore snapshot" },
  review: { label: "Send for review", group: "Deck", also: "share link client approval" },
  export: { label: "Export", group: "Export", also: "download pdf images" },
  "export-last": { label: "Export with the last destination", group: "Export", keys: "⌘E" },
  "export-video": { label: "Export as video", group: "Export", also: "mp4 reels tiktok shorts slideshow motion animate" },
  // Slide
  "new-slide": { label: "New slide after this one", group: "Slide", keys: "N" },
  "type-slide": { label: "Type a slide into existence", group: "Slide", also: "add headline" },
  "duplicate-slide": { label: "Duplicate slide", group: "Slide", keys: "D" },
  "delete-slide": { label: "Delete slide", group: "Slide" },
  "move-slide-earlier": { label: "Move slide earlier", group: "Slide", keys: "⇧⌘↑" },
  "move-slide-later": { label: "Move slide later", group: "Slide", keys: "⇧⌘↓" },
  "next-layout": { label: "Next layout for this slide", group: "Slide", keys: "L", also: "composition cycle" },
  "previous-layout": { label: "Previous layout for this slide", group: "Slide", keys: "⇧L" },
  "rewrite-slide": { label: "Rewrite this slide", group: "Slide", also: "wording ai" },
  tidy: { label: "Tidy slide", group: "Slide", keys: "T", also: "equal gaps spacing" },
  "relay-picked": { label: "Re-lay the picked slides", group: "Slide" },
  "duplicate-picked": { label: "Duplicate the picked slides", group: "Slide" },
  "delete-picked": { label: "Delete the picked slides", group: "Slide" },
  "clear-picked": { label: "Clear the picked slides", group: "Slide" },
  // Layer
  "rewrite-text": { label: "Rewrite the selected text", group: "Layer", keys: "R", also: "other wordings" },
  match: { label: "Match on every slide", group: "Layer", keys: "M", also: "copy position size" },
  group: { label: "Group", group: "Layer", keys: "G" },
  ungroup: { label: "Ungroup", group: "Layer", keys: "⇧G" },
  "delete-layer": { label: "Delete the selection", group: "Layer", keys: "⌫" },
  "bring-front": { label: "Bring to front", group: "Layer" },
  forward: { label: "Bring forward", group: "Layer", keys: "⌘]" },
  backward: { label: "Send backward", group: "Layer", keys: "⌘[" },
  "send-back": { label: "Send to back", group: "Layer" },
  "align-left": { label: "Align left", group: "Layer" },
  "align-hcenter": { label: "Align centres", group: "Layer" },
  "align-right": { label: "Align right", group: "Layer" },
  "align-top": { label: "Align top", group: "Layer" },
  "align-vcenter": { label: "Align middles", group: "Layer" },
  "align-bottom": { label: "Align bottom", group: "Layer" },
  "distribute-h": { label: "Distribute horizontally", group: "Layer" },
  "distribute-v": { label: "Distribute vertically", group: "Layer" },
  "equal-gap": { label: "Equal gap, top to bottom", group: "Layer" },
  "match-width": { label: "Match width to the widest", group: "Layer" },
  "edit-block": { label: "Edit the selected block", group: "Layer" },
  // Tools
  "tool-select": { label: "Move tool", group: "Tools", keys: "V" },
  "tool-text": { label: "Text tool", group: "Tools", keys: "⇧T" },
  "tool-rect": { label: "Rectangle tool", group: "Tools", keys: "⇧R" },
  "tool-ellipse": { label: "Ellipse tool", group: "Tools", keys: "⇧O" },
  "tool-triangle": { label: "Triangle tool", group: "Tools" },
  "tool-line": { label: "Line tool", group: "Tools" },
  "tool-icon": { label: "Insert an icon", group: "Tools", keys: "I" },
  // Insert
  "insert-block": { label: "Insert a block", group: "Insert", keys: "/" },
  projects: { label: "Back to projects", group: "Projects" },
  "capture-idea": { label: "Capture an idea", group: "Projects", keys: "Q", also: "idea bank note thought later" },
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;

/** Actions with an argument; the palette lists one entry per argument. */
export const FAMILIES = {
  "insert-block": "Insert",
  brand: "Apply brand",
  format: "Change format to",
  export: "Export for",
  safe: "Show safe areas for",
  open: "Open project",
  pack: "Apply style pack",
  template: "New deck from template",
} as const;

export type FamilyId = keyof typeof FAMILIES;

/** Is this `data-action` value one the registry knows? `family:argument` counts. */
export function isKnownAction(id: string): boolean {
  if (id in ACTIONS) return true;
  const at = id.indexOf(":");
  return at > 0 && id.slice(0, at) in FAMILIES;
}

/* ── the keyboard map (24.3) ──────────────────────────────────────────────── */

export type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

/**
 * The action a key press means, or null.
 *
 * **Single-letter keys never fire while a text field has focus.** That is the
 * bug every editor with letter shortcuts ships once, so `typing` is a
 * parameter of the match itself rather than a check each caller remembers.
 * Combinations that are part of editing text (the arrows, ⌘Z) also stand down
 * while typing, so the field keeps its own; ⌘K and ⌘E do not, because no text
 * field means anything by them.
 */
export function actionForKey(e: KeyLike, typing: boolean): ActionId | null {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod && !e.altKey) {
    if (k === "k") return "palette";
    if (k === "e") return "export-last";
    if (typing) return null;
    if (k === "z") return e.shiftKey ? "redo" : "undo";
    if (e.shiftKey && k === "ArrowUp") return "move-slide-earlier";
    if (e.shiftKey && k === "ArrowDown") return "move-slide-later";
    return null;
  }
  if (typing || e.altKey || mod) return null;

  if (e.key === "?") return "shortcuts";
  if (e.key === "/") return "insert-block";
  if (e.shiftKey) {
    const shifted: Record<string, ActionId> = {
      l: "previous-layout",
      g: "ungroup",
      t: "tool-text",
      r: "tool-rect",
      o: "tool-ellipse",
    };
    return shifted[k] ?? null;
  }
  const plain: Record<string, ActionId> = {
    n: "new-slide",
    d: "duplicate-slide",
    l: "next-layout",
    r: "rewrite-text",
    t: "tidy",
    m: "match",
    o: "outline",
    g: "group",
    v: "tool-select",
    i: "tool-icon",
    // Q for the idea bank (27.1). The one letter that also works off the
    // editor: App listens for it on every other screen.
    q: "capture-idea",
  };
  return plain[k] ?? null;
}

/** The map as `?` prints it: one table, learnable, no custom bindings. */
export const KEY_TABLE: { keys: string; label: string }[] = [
  { keys: "N", label: "New slide after this one" },
  { keys: "D", label: "Duplicate slide" },
  { keys: "⇧⌘↑ / ⇧⌘↓", label: "Move slide earlier / later" },
  { keys: "/", label: "Insert a block" },
  { keys: "L / ⇧L", label: "Next / previous layout for this slide" },
  { keys: "R", label: "Rewrite the selected text" },
  { keys: "T", label: "Tidy" },
  { keys: "M", label: "Match on every slide" },
  { keys: "O", label: "Outline mode" },
  { keys: "G / ⇧G", label: "Group / ungroup" },
  { keys: "← ↑ → ↓ / ⇧ + arrows", label: "Nudge 1px / 10px" },
  { keys: "⌘E", label: "Export with the last-used destination" },
  { keys: "⌘K", label: "Command palette" },
  { keys: "⌘Z / ⇧⌘Z", label: "Undo / redo" },
  { keys: "V · I", label: "Move tool · icon" },
  { keys: "⇧T · ⇧R · ⇧O", label: "Text · rectangle · ellipse tools" },
  { keys: "Q", label: "Capture an idea, from any screen" },
  { keys: "?", label: "This table" },
];

/* ── the palette's ranking ───────────────────────────────────────────────── */

export type PaletteItem = {
  id: string;
  label: string;
  group: string;
  keys?: string | undefined;
  also?: string | undefined;
  /** Why it cannot run right now, or null when it can. */
  unavailable?: string | null | undefined;
};

/**
 * Filtered and ordered: every word of the query has to appear in the label,
 * the group or the extra words; whole-word and label-start matches rank
 * higher; and with an empty query the recent actions come first, most recent
 * first, then the rest in registry order.
 */
export function rankItems<T extends PaletteItem>(items: readonly T[], query: string, recent: readonly string[] = []): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const recency = (id: string) => {
    const at = recent.indexOf(id);
    return at < 0 ? Infinity : at;
  };
  if (words.length === 0) {
    return [...items].sort((a, b) => recency(a.id) - recency(b.id));
  }
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const hay = `${label} ${item.group.toLowerCase()} ${(item.also ?? "").toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (label.startsWith(w)) score += 4;
      else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) score += 2;
      else if (label.includes(w)) score += 1;
    }
    if (recency(item.id) !== Infinity) score += 1;
    scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || recency(a.item.id) - recency(b.item.id)).map((s) => s.item);
}

/* ── remembered per viewer ────────────────────────────────────────────────── */

const RECENT_KEY = "flashcc.recentActions";
const LAST_DEST_KEY = "flashcc.lastDestination";
const RECENT_MAX = 8;

/** Most recent first. Storage can be missing or refuse; the palette works without it. */
export function recentActions(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const withRecent = (list: readonly string[], id: string): string[] =>
  [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);

export function rememberAction(id: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(recentActions(), id)));
  } catch {
    /* a private window: nothing to remember */
  }
}

export function lastDestination(): string | null {
  try {
    return localStorage.getItem(LAST_DEST_KEY);
  } catch {
    return null;
  }
}

export function rememberDestination(platformId: string): void {
  try {
    localStorage.setItem(LAST_DEST_KEY, platformId);
  } catch {
    /* nothing to remember */
  }
}
