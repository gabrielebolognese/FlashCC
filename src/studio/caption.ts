/**
 * The caption, and the alt text: the words that go around the deck.
 *
 * ── This does not replace `captionOf` ────────────────────────────────────────
 *
 * `transcript.ts` already builds a caption deterministically, from slide 1,
 * slide 2 and the closer, and that is the right answer when the deck's own words
 * are already what you want to say. It is free, needs no key and no account, and
 * it rearranges copy somebody already approved.
 *
 * This writes something new. Both belong on the screen, the same way the
 * deterministic and the model-written paths sit side by side everywhere else in
 * this product, and the interface has to make the difference obvious rather than
 * quietly replacing the cheap one with the expensive one.
 */

import { authHeader } from "./billing.js";
import { hasVoice, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";

/** The three the caption prompt knows. `x` is not one of them. */
export type CaptionPlatform = "linkedin" | "instagram" | "tiktok";

export const isCaptionPlatform = (id: string): id is CaptionPlatform =>
  id === "linkedin" || id === "instagram" || id === "tiktok";

export type CaptionOption = {
  /** At most four words naming what this one did. Never a rank. */
  note: string;
  text: string;
  chars: number;
};

export type CaptionResult = {
  captions: CaptionOption[];
  hashtags: string[];
  limit: number;
  /**
   * Where the platform folds the post behind "see more". LinkedIn only.
   * Reported by the server so the number lives in one place, beside the prompt
   * rule that enforces it.
   */
  fold?: number | undefined;
};

export type CaptionAsk = {
  deck: readonly string[];
  platform: CaptionPlatform;
  framework?: string | undefined;
  cta?: string | undefined;
  count?: number | undefined;
  voice?: Voice | undefined;
};

export async function writeCaption(ask: CaptionAsk, signal?: AbortSignal): Promise<CaptionResult> {
  const res = await fetch("/api/caption", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      deck: [...ask.deck],
      platform: ask.platform,
      count: ask.count ?? 2,
      ...(ask.framework ? { framework: ask.framework } : {}),
      ...(ask.cta ? { cta: ask.cta } : {}),
      ...(hasVoice(ask.voice) ? { voice: ask.voice } : {}),
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as Partial<CaptionResult> | null;
  const captions = body?.captions;
  if (!Array.isArray(captions) || captions.length === 0) throw new Error("No captions came back");

  return {
    captions,
    hashtags: Array.isArray(body?.hashtags) ? body.hashtags : [],
    limit: typeof body?.limit === "number" ? body.limit : 2200,
    ...(typeof body?.fold === "number" ? { fold: body.fold } : {}),
  };
}

export type AltResult = { alt: string[]; limit: number };

export async function writeAlt(deck: readonly string[], signal?: AbortSignal): Promise<AltResult> {
  const res = await fetch("/api/alt", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({ deck: [...deck] }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as Partial<AltResult> | null;
  const alt = body?.alt;
  if (!Array.isArray(alt)) throw new Error("No alt text came back");

  return { alt, limit: typeof body?.limit === "number" ? body.limit : 125 };
}

/**
 * The alt text of a deck, as a file somebody can actually use.
 *
 * Alt text has no automatic destination and pretending otherwise would be the
 * dishonest part of this feature. It cannot be embedded in a JPEG in a way
 * LinkedIn or Instagram reads, and neither has an API to push it to. Somebody
 * types it into the upload form, one slide at a time.
 *
 * So for the platforms that export a zip it travels as a text file numbered to
 * match the images, and for LinkedIn, which exports a single PDF, it is
 * clipboard only. The interface says which.
 */
export const altFile = (alt: readonly string[]): string =>
  alt.map((t, i) => `${String(i + 1).padStart(2, "0")}. ${t || "(no description)"}`).join("\n");
