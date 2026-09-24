/**
 * Reading a source, and getting back the carousels that are in it.
 *
 * The counterpart to `longform.ts`, not a replacement for it. That path is
 * deterministic, free, needs no key and no account, and rearranges words
 * somebody already approved; it is right when the source is already written the
 * way they want it. This one is for raw material.
 *
 * It returns ANGLES rather than a deck, because a long transcript contains
 * several carousels and returning one throws the rest away without saying so.
 */

import { authHeader } from "./billing.js";
import { hasVoice, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";
import type { Structure } from "./structures.js";

export type SourceKind = "transcript" | "article" | "notes" | "post";

export type Angle = {
  title: string;
  brief: string;
  /** What in the source supports it. The reason to believe the angle. */
  why: string;
};

export type DistilResult = {
  /** The obvious one, for the escape hatch under the cards. */
  brief: string;
  angles: Angle[];
  /** Verified against the source on the server. Anything unmatched was dropped. */
  quotes: string[];
  used: number;
  total: number;
  clipped: boolean;
};

/** Below this there is nothing to work out, and a brief is the better tool. */
export const MIN_SOURCE_CHARS = 200;

export async function distilSource(
  source: string,
  options: { kind?: SourceKind | undefined; structure?: Structure | undefined; voice?: Voice | undefined } = {},
  signal?: AbortSignal,
): Promise<DistilResult> {
  const res = await fetch("/api/distil", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      source,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.structure
        ? {
            structure: {
              name: options.structure.name,
              shape: options.structure.shape,
              slots: options.structure.slots,
            },
          }
        : {}),
      ...(hasVoice(options.voice) ? { voice: options.voice } : {}),
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as Partial<DistilResult> | null;
  const angles = body?.angles;
  if (!Array.isArray(angles) || angles.length === 0) throw new Error("Nothing came back from that source");

  return {
    brief: typeof body?.brief === "string" ? body.brief : "",
    angles,
    quotes: Array.isArray(body?.quotes) ? body.quotes : [],
    used: typeof body?.used === "number" ? body.used : source.length,
    total: typeof body?.total === "number" ? body.total : source.length,
    clipped: body?.clipped === true,
  };
}

/**
 * The file types the paste box accepts.
 *
 * Text only, and all four are read the same way: `longform.ts` already knows
 * what a subtitle file is and unwraps it. **PDF is deliberately absent.**
 * Parsing one properly is a dependency and an afternoon, and every PDF anybody
 * has can be select-all-copied into the box today.
 */
export const SOURCE_TYPES = ".txt,.md,.markdown,.vtt,.srt,.text";

export const isReadableFile = (name: string): boolean =>
  /\.(txt|md|markdown|vtt|srt|text)$/i.test(name.trim());
