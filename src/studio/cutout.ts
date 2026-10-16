/**
 * Background removal, on the device (21.5).
 *
 * U^2-Net's small variant (Apache-2.0 weights, MIT ONNX export, see
 * public/models/README.md) run by onnxruntime-web (MIT) in WebAssembly. The
 * picture is decoded, scored and re-encoded in this tab; it is never uploaded,
 * which is the whole reason this is on the device: a customer's product photo
 * should not travel to a third party for a cut-out, and the compute being
 * theirs is what keeps it free.
 *
 * The runtime and the weights load on the first removal only, never with the
 * app, and the session is kept for the rest of the visit, so a second removal
 * skips straight to inference.
 *
 * The maths either side of the model is pure and tested: `preprocess` is the
 * normalisation the model was trained with (scale to the image's own maximum,
 * then ImageNet mean and deviation, planar RGB), `maskFromPrediction` is
 * rembg's min-max normalisation with a gentle curve that drops the faint haze
 * U^2-Net leaves around a subject, and `applyMask` writes the mask into the
 * alpha channel.
 */

export const MODEL_URL = "/models/u2netp.onnx";
export const SIDE = 320;
/** What the first removal fetches, to say so on the button. Runtime plus weights. */
export const FIRST_RUN_MB = 19;
/** The longest side a cut-out is produced at. Twice a 1080 artboard. */
export const MAX_SIDE = 2160;

const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** RGBA pixels at SIDE by SIDE, as the model's planar float input. */
export function preprocess(rgba: Uint8ClampedArray | Uint8Array, side = SIDE): Float32Array {
  const n = side * side;
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    max = Math.max(max, rgba[o]!, rgba[o + 1]!, rgba[o + 2]!);
  }
  const scale = 1 / Math.max(max, 1e-6);
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    for (let c = 0; c < 3; c += 1) out[c * n + i] = (rgba[o + c]! * scale - MEAN[c]!) / STD[c]!;
  }
  return out;
}

/** The model's saliency map as 0 to 255 alpha, normalised and cleaned. */
/**
 * `low` and `high` were chosen by eye on a portrait, an animal and a product:
 * u2netp scores thin limbs at middling confidence, and a curve that tops out
 * at 0.6 keeps a raised arm opaque without letting background haze back in.
 */
export function maskFromPrediction(pred: Float32Array | readonly number[], low = 0.05, high = 0.6): Uint8ClampedArray {
  let mi = Infinity;
  let ma = -Infinity;
  for (const v of pred) {
    if (v < mi) mi = v;
    if (v > ma) ma = v;
  }
  const span = ma - mi || 1;
  const out = new Uint8ClampedArray(pred.length);
  for (let i = 0; i < pred.length; i += 1) {
    const t = (pred[i]! - mi) / span;
    // Below `low` is haze, above `high` is subject; in between is the edge and
    // is stretched rather than thresholded, so hair stays soft.
    out[i] = Math.round(Math.min(1, Math.max(0, (t - low) / (high - low))) * 255);
  }
  return out;
}

/** RGBA with its alpha replaced by a mask of the same size (the mask's red channel). */
export function applyMask(rgba: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  for (let i = 3, m = 0; i < out.length; i += 4, m += 4) out[i] = Math.round((rgba[i]! * mask[m]!) / 255);
  return out;
}

/** The size a picture is cut out at: its own, capped at MAX_SIDE on the long edge. */
export function outputSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/* ── running it (browser only) ───────────────────────────────────────────── */

type Ort = typeof import("onnxruntime-web/wasm");
type Session = import("onnxruntime-web/wasm").InferenceSession;

let session: Promise<{ ort: Ort; session: Session }> | null = null;

/** Loads the runtime and the model once per visit. A failure is not cached, so a retry retries. */
function load(): Promise<{ ort: Ort; session: Session }> {
  if (!session) {
    session = (async () => {
      const [ort, wasm] = await Promise.all([
        import("onnxruntime-web/wasm"),
        import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url"),
      ]);
      ort.env.wasm.wasmPaths = { wasm: wasm.default };
      // Threads need cross-origin isolation, which this app does not ask for.
      // One thread is honest about that and avoids a warning on every run.
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const s = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      return { ort, session: s };
    })().catch((e: unknown) => {
      session = null;
      throw e;
    });
  }
  return session;
}

export const cutoutLoaded = (): boolean => session !== null;

async function bitmapOf(src: string): Promise<ImageBitmap> {
  // Fetched rather than drawn from an <img>: a hotlinked stock photo would
  // taint a canvas, while a CORS fetch hands over bytes this tab may read.
  const res = await fetch(src, { mode: "cors" });
  if (!res.ok) throw new Error(`Could not read the picture (${res.status})`);
  return createImageBitmap(await res.blob());
}

function pixels(bitmap: ImageBitmap, w: number, h: number): { canvas: OffscreenCanvas; data: ImageData } {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw off screen");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, data: ctx.getImageData(0, 0, w, h) };
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not encode the cut-out"));
    r.readAsDataURL(blob);
  });

/** A transparent PNG of the subject, as a data URL, plus its size. */
export async function removeBackground(src: string): Promise<{ src: string; w: number; h: number }> {
  const [{ ort, session: s }, bitmap] = await Promise.all([load(), bitmapOf(src)]);

  const small = pixels(bitmap, SIDE, SIDE);
  const input = new ort.Tensor("float32", preprocess(small.data.data), [1, 3, SIDE, SIDE]);
  const result = await s.run({ [s.inputNames[0]!]: input });
  const first = result[s.outputNames[0]!];
  if (!first) throw new Error("The model returned nothing");
  const pred = first.data as Float32Array;
  const alpha = maskFromPrediction(pred.subarray(0, SIDE * SIDE));

  // The mask at 320, as an image, scaled up by the canvas (smoothly) to the output size.
  const maskSmall = new OffscreenCanvas(SIDE, SIDE);
  const mctx = maskSmall.getContext("2d")!;
  const m = mctx.createImageData(SIDE, SIDE);
  for (let i = 0; i < alpha.length; i += 1) {
    const o = i * 4;
    m.data[o] = m.data[o + 1] = m.data[o + 2] = alpha[i]!;
    m.data[o + 3] = 255;
  }
  mctx.putImageData(m, 0, 0);

  const size = outputSize(bitmap.width, bitmap.height);
  const full = pixels(bitmap, size.w, size.h);
  const maskFull = new OffscreenCanvas(size.w, size.h);
  const fctx = maskFull.getContext("2d")!;
  fctx.imageSmoothingQuality = "high";
  fctx.drawImage(maskSmall, 0, 0, size.w, size.h);
  const maskData = fctx.getImageData(0, 0, size.w, size.h).data;

  const out = full.canvas.getContext("2d")!;
  out.putImageData(new ImageData(applyMask(full.data.data, maskData), size.w, size.h), 0, 0);
  bitmap.close();
  const blob = await full.canvas.convertToBlob({ type: "image/png" });
  return { src: await blobToDataUrl(blob), ...size };
}
