/**
 * "Remove background" on an image layer (21.5).
 *
 * The first run in a browser downloads the runtime and the weights, so the
 * button says how much before it is pressed, and says what it is doing while
 * it works, rather than showing a spinner that looks broken. The cut-out
 * replaces the picture on the layer, keeping every other property, and also
 * lands in the media pool so the original and the cut-out are both to hand.
 */
import { Scissors } from "lucide-react";
import { useState } from "react";

import { cutoutLoaded, FIRST_RUN_MB, removeBackground } from "./cutout.js";
import { uid, type Layer } from "./model.js";
import type { Studio } from "./useStudio.js";

const SEEN = "flashcc.cutout.fetched";

const seenBefore = (): boolean => {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
};

export function CutoutButton({ studio, layer }: { studio: Studio; layer: Layer }) {
  const [state, setState] = useState<"idle" | "loading" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = !cutoutLoaded() && !seenBefore();

  const run = async () => {
    if (!layer.src) return;
    setError(null);
    setState(cutoutLoaded() ? "working" : "loading");
    try {
      const out = await removeBackground(layer.src);
      try {
        localStorage.setItem(SEEN, "1");
      } catch {
        /* Only decides the wording on the button. */
      }
      const media = {
        id: uid("m"),
        name: `${layer.name} (cut out)`,
        src: out.src,
        w: out.w,
        h: out.h,
        bytes: Math.round((out.src.length * 3) / 4),
        // Still their photograph: the credit travels with the cut-out.
        ...(layer.credit ? { credit: layer.credit } : {}),
      };
      studio.addMedia([media]);
      studio.fillWithMedia(layer.id, media);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The cut-out failed");
      setState("error");
    }
  };

  const busy = state === "loading" || state === "working";
  return (
    <>
      <button
        type="button"
        disabled={busy || !layer.src}
        onClick={() => void run()}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-60"
      >
        <Scissors size={13} strokeWidth={2} />
        {state === "loading"
          ? `Downloading the model (${FIRST_RUN_MB}MB, once)…`
          : state === "working"
            ? "Cutting out…"
            : "Remove background"}
      </button>
      {first && !busy ? (
        <p className="text-caption leading-4 text-muted">
          Runs on this device; the picture is not uploaded. The first time downloads about {FIRST_RUN_MB}MB.
        </p>
      ) : null}
      {error ? <p className="text-caption leading-4 text-danger">{error}</p> : null}
    </>
  );
}
