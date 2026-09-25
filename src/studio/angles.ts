/**
 * Asking what a carousel could be about, with the web read first.
 *
 * Researched **per idea, not per carousel.** Three ideas is three calls whatever
 * the run length, because the angles for one idea are decided together: asking
 * fourteen times would cost fourteen searches and still produce overlapping
 * angles, since each call would have no idea what the others chose.
 */

import { authHeader } from "./billing.js";
import { hasVoice, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";

export type Source = { title: string; url: string };

export type Angle = {
  title: string;
  /** One line on what makes this one different. */
  angle: string;
  brief: string;
};

export type AnglesResult = {
  angles: Angle[];
  sources: Source[];
  /** Billed per search, separately from tokens. Reported apart for that reason. */
  searches: number;
  usage: { input: number; output: number; cached: number };
};

export async function researchAngles(
  idea: string,
  count: number,
  voice?: Voice,
  signal?: AbortSignal,
): Promise<AnglesResult> {
  const res = await fetch("/api/angles", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      idea,
      count,
      ...(hasVoice(voice) ? { voice } : {}),
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as Partial<AnglesResult> | null;
  const angles = body?.angles;
  if (!Array.isArray(angles) || angles.length === 0) {
    throw new Error("Nothing came back about that idea");
  }

  return {
    angles,
    sources: Array.isArray(body?.sources) ? body.sources : [],
    searches: typeof body?.searches === "number" ? body.searches : 0,
    usage: body?.usage ?? { input: 0, output: 0, cached: 0 },
  };
}
