/**
 * Version history: a snapshot at the moments that matter, and a way back.
 *
 * ── Why this exists, given nobody asks for it by name ────────────────────────
 *
 * The earlier research passes found no complaints about "version history" and I
 * treated that as a reason to deprioritise it. That was reading the wrong layer.
 * The pain is there, it is just never called versioning, it is called file
 * chaos: *"my desktop used to be a graveyard of Canva exports, CapCut drafts,
 * random PNGs and 'final_final' files."* On the incumbent specifically: *"I
 * wanted to keep proper versioning but it seems I have to make copies of the
 * file to keep older versions."*
 *
 * And from an agency, which is the version that matters most: *"I'd also like
 * some safeties to ensure that approved images aren't confused with modified
 * ones."* That pairs directly with 7.4, and it is the strongest argument for
 * building this at all.
 *
 * Nobody names it as a buying reason, so it is built and not led with.
 *
 * ── Not an undo history ──────────────────────────────────────────────────────
 *
 * `useStudio` already has undo, and it covers keystrokes. This covers MOMENTS:
 * you sent it for approval, you exported it, you rebranded it. Three or four
 * meaningful points in a carousel's life, each one restorable whole or one slide
 * at a time, which is what "approved images aren't confused with modified ones"
 * actually needs. A general history of every drag would bury those three under a
 * thousand.
 *
 * ── Local, deliberately ──────────────────────────────────────────────────────
 *
 * Versions do not sync. The stated pain is losing YOUR OWN earlier state on the
 * machine you are working on, and syncing a snapshot of every export across
 * devices would multiply the largest records in the product for a need nobody
 * described. Retention is by plan, enforced here, and free gets none, which is
 * Planable's proven ladder.
 */

import { dehydrateDoc } from "./assets.js";
import type { Plan } from "./cloud.js";
import type { Doc, Slide } from "./model.js";
import { docVersion } from "./review.js";

/** What caused a snapshot. Never "you typed something". */
export type Reason = "approve" | "export" | "brand" | "manual";

export const REASON_LABEL: Record<Reason, string> = {
  approve: "Sent for approval",
  export: "Exported",
  brand: "Brand applied",
  manual: "Saved by hand",
};

export type Version = {
  id: string;
  docId: string;
  /** `docVersion` of the document as it was. Shared with 7.4's approval stamp. */
  version: string;
  reason: Reason;
  /** Free text, when somebody wanted to say why. */
  label: string;
  slideCount: number;
  capturedAt: string;
  /** The whole document, dehydrated. Small since Batch 5 moved images out. */
  doc: Doc;
};

/* ── retention ────────────────────────────────────────────────────────────── */

/**
 * Planable's ladder, which is the one this market has already proven.
 *
 * Free gets none rather than a token one or two: a history that only goes back
 * to your last two saves is worse than none, because it looks like a safety net
 * and is not one.
 */
export const RETENTION_DAYS: Record<Plan, number> = { free: 0, pro: 30, agency: Infinity };

/** A ceiling regardless of plan, because localStorage is a few megabytes total. */
export const MAX_PER_DOC = 25;

export const retentionDays = (plan: Plan | undefined): number => RETENTION_DAYS[plan ?? "free"];

export const retentionLabel = (plan: Plan | undefined): string => {
  const days = retentionDays(plan);
  if (days === 0) return "not kept";
  return days === Infinity ? "kept for as long as you like" : `kept for ${days} days`;
};

const DAY_MS = 86_400_000;

/**
 * What survives, given a plan and a moment.
 *
 * Pure, and applied on WRITE as well as on read. A retention limit enforced only
 * when something is displayed is not a limit, it is a filter, the records go on
 * accumulating behind it until the quota runs out.
 */
export function prune(
  versions: readonly Version[],
  plan: Plan | undefined,
  now: Date = new Date(),
): Version[] {
  const days = retentionDays(plan);
  if (days === 0) return [];

  const newestFirst = [...versions].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const cutoff = days === Infinity ? 0 : now.getTime() - days * DAY_MS;

  return newestFirst
    .filter((v) => days === Infinity || new Date(v.capturedAt).getTime() >= cutoff)
    .slice(0, MAX_PER_DOC);
}

/* ── capturing ────────────────────────────────────────────────────────────── */

export function makeVersion(doc: Doc, reason: Reason, label = ""): Version {
  return {
    id: `ver_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    docId: doc.id,
    version: docVersion(doc),
    reason,
    label,
    slideCount: doc.slides.length,
    capturedAt: new Date().toISOString(),
    // Dehydrated for the same reason `putDoc` dehydrates: the pictures are in
    // the library, and twenty-five snapshots each carrying a copy is how a quota
    // dies. A restored version resolves its assets like any other document.
    doc: dehydrateDoc(doc),
  };
}

/**
 * Adds one, unless nothing has changed.
 *
 * Exporting the same deck three times is one version, not three. Without this,
 * the list fills with identical entries and the three moments worth finding are
 * buried under them, which is the failure this whole file exists to avoid.
 */
export function capture(
  versions: readonly Version[],
  doc: Doc,
  reason: Reason,
  plan: Plan | undefined,
  label = "",
): Version[] {
  if (retentionDays(plan) === 0) return [...versions];

  const newest = [...versions].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  if (newest && newest.version === docVersion(doc) && newest.reason === reason) {
    return [...versions];
  }

  return prune([makeVersion(doc, reason, label), ...versions], plan);
}

/* ── comparing ────────────────────────────────────────────────────────────── */

export type SlideState = "same" | "changed" | "added" | "removed";

export type SlideDiff = {
  index: number;
  state: SlideState;
  /** The slide as it was, when there was one. */
  before?: Slide | undefined;
  after?: Slide | undefined;
};

/**
 * A fingerprint of one slide, using the same rules as `docVersion`.
 *
 * Shared logic rather than a second opinion: if a slide counts as changed here
 * but the document version did not move, the filmstrip and the approval warning
 * would disagree about whether anything happened.
 */
function slideKey(slide: Slide): string {
  const parts = [`bg:${slide.background}`];
  for (const l of slide.layers) {
    if (!l.visible) continue;
    parts.push(
      [
        l.kind,
        Math.round(l.x),
        Math.round(l.y),
        Math.round(l.w),
        Math.round(l.h),
        l.fill,
        l.fontSize ?? "",
        (l.text ?? "").trim(),
        l.src ? "img" : "",
      ].join("|"),
    );
  }
  return parts.join("\n");
}

/**
 * Slide by slide, by POSITION.
 *
 * Not by slide id, which looks more correct and is not: re-laying a deck mints
 * new ids for every generated layer while the slides keep their order and their
 * content, so an id-based diff would report a whole deck as replaced every time
 * somebody pressed Re-lay. Position is what a reader compares.
 */
export function diffSlides(before: Doc, after: Doc): SlideDiff[] {
  const n = Math.max(before.slides.length, after.slides.length);
  const out: SlideDiff[] = [];

  for (let i = 0; i < n; i += 1) {
    const a = before.slides[i];
    const b = after.slides[i];

    if (a && !b) out.push({ index: i, state: "removed", before: a });
    else if (!a && b) out.push({ index: i, state: "added", after: b });
    else if (a && b) {
      out.push({
        index: i,
        state: slideKey(a) === slideKey(b) ? "same" : "changed",
        before: a,
        after: b,
      });
    }
  }

  return out;
}

export const changedCount = (diff: readonly SlideDiff[]): number =>
  diff.filter((d) => d.state !== "same").length;

/* ── going back ───────────────────────────────────────────────────────────── */

/** The whole document as it was, keeping the live id, name and client. */
export const restoreAll = (doc: Doc, version: Version): Doc => ({
  ...version.doc,
  id: doc.id,
  name: doc.name,
  ...(doc.clientId ? { clientId: doc.clientId } : {}),
  ...(doc.series ? { series: doc.series } : {}),
  createdAt: doc.createdAt,
  updatedAt: new Date().toISOString(),
});

/**
 * One slide back, leaving everything else alone.
 *
 * The useful case by a distance: a client asked for slide four to go back to
 * what it was, and restoring the whole deck would undo the three other things
 * that were fixed in the meantime. A slide past the end of the current deck is
 * APPENDED rather than refused, the version had it, somebody asked for it, and
 * putting it at the end is the answer they can see and move.
 */
export function restoreSlide(doc: Doc, version: Version, index: number): Doc {
  const slide = version.doc.slides[index];
  if (!slide) return doc;

  const slides = [...doc.slides];
  if (index < slides.length) slides[index] = slide;
  else slides.push(slide);

  return { ...doc, slides, updatedAt: new Date().toISOString() };
}

/* ── the store ────────────────────────────────────────────────────────────── */

/**
 * Per document, unlike brands and clients.
 *
 * A snapshot is a whole carousel, and the history screen only ever wants one
 * document's worth. One key for the lot would mean reading and rewriting every
 * version of every project to add a single entry.
 */
const PREFIX = "flashcc:v1:versions:";
const KEY = (docId: string) => `${PREFIX}${docId}`;

export function listVersions(docId: string): Version[] {
  try {
    const raw = localStorage.getItem(KEY(docId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Version[]).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  } catch {
    return [];
  }
}

export function saveVersions(docId: string, versions: Version[]): boolean {
  try {
    if (versions.length === 0) localStorage.removeItem(KEY(docId));
    else localStorage.setItem(KEY(docId), JSON.stringify(versions));
    return true;
  } catch {
    // A full quota must never fail whatever the user was actually doing, an
    // export that refuses to run because a snapshot would not fit is a worse
    // product than one with a shorter history.
    return false;
  }
}

/**
 * Snapshot, respecting the plan. Called from the three moments in 8.3.
 *
 * Returns the list so a caller can show it, and swallows a storage failure for
 * the reason above.
 */
export function snapshot(doc: Doc, reason: Reason, plan: Plan | undefined, label = ""): Version[] {
  const next = capture(listVersions(doc.id), doc, reason, plan, label);
  saveVersions(doc.id, next);
  return next;
}

export function removeVersion(docId: string, id: string): Version[] {
  const next = listVersions(docId).filter((v) => v.id !== id);
  saveVersions(docId, next);
  return next;
}

/**
 * Which stored keys are version history.
 *
 * Pure, and separated from the sweep below only so it can be tested, the sweep
 * itself is three lines of localStorage and nothing worth asserting about.
 */
export const versionKeysIn = (keys: readonly string[]): string[] =>
  keys.filter((k) => k.startsWith(PREFIX));

/**
 * Everything, for sign-out.
 *
 * `forgetLocal` clears docs, posts, brands, clients, assets and tombstones, and
 * used not to clear these, so signing out on a shared machine left whole
 * documents in localStorage for whoever signed in next. The keys are per
 * document, so there is no index to walk: the store has to be swept by prefix.
 */
export function forgetAllVersions(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    // Collected first, then removed: removing while enumerating shifts the
    // indices underneath the loop and silently skips every other key.
    for (const k of versionKeysIn(keys)) localStorage.removeItem(k);
  } catch {
    /* Nothing to do, and nothing that should stop a sign-out. */
  }
}

/** Deleting a project takes its history with it. Nothing else references them. */
export function forgetVersions(docId: string): void {
  try {
    localStorage.removeItem(KEY(docId));
  } catch {
    /* Nothing to do; the entry is orphaned and harmless. */
  }
}
