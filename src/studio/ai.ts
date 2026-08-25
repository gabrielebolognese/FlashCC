import type { Structure } from "./structures.js";

export type DraftedSlide = { role: string; text: string };

/**
 * Ask the drafting server for slide copy. The key lives server-side, so this is a
 * plain fetch to our own origin — nothing secret ever reaches the bundle.
 */
export async function draftSlides(
  brief: string,
  structure: Structure,
  signal?: AbortSignal,
): Promise<DraftedSlide[]> {
  const res = await fetch("/api/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      brief,
      structure: {
        name: structure.name,
        shape: structure.shape,
        slots: structure.slots.map((s) => ({
          id: s.id,
          label: s.label,
          note: s.detail,
          placeholder: s.placeholder,
        })),
      },
    }),
  });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Drafting failed (${res.status})`;
    throw new Error(message);
  }

  const slides = (body as { slides?: DraftedSlide[] } | null)?.slides;
  if (!Array.isArray(slides) || slides.length === 0) throw new Error("No slides came back");
  return slides;
}

/**
 * Line the draft up with the framework's slots, in order.
 *
 * Two passes, and the order matters: matching by role first stops an early slot with
 * no match from swallowing a later slot's entry. A one-pass version consumed the CTA
 * on the fourth slot whenever the model answered out of order.
 */
export function alignToSlots(drafted: DraftedSlide[], structure: Structure): string[] {
  const pool = drafted.map((d) => ({ text: d.text, role: d.role, used: false }));
  const out = structure.slots.map(() => "");

  // Pass 1: exact role matches, in order, so repeated slots pair up one to one.
  structure.slots.forEach((slot, i) => {
    const hit = pool.find((p) => !p.used && p.role === slot.id);
    if (hit) {
      hit.used = true;
      out[i] = hit.text;
    }
  });

  // Pass 2: whatever is left fills the slots still empty, in order.
  let cursor = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i]) continue;
    while (cursor < pool.length && pool[cursor]?.used) cursor += 1;
    const spare = pool[cursor];
    if (!spare) break;
    spare.used = true;
    out[i] = spare.text;
  }

  return out;
}
