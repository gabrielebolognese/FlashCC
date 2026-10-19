/**
 * Writing an editable file (31.6): the browser half.
 *
 * The plan (`editable.ts`) says what stays text and what becomes a picture.
 * This inlines the deck, asks `/api/flatten` to draw each flattened piece with
 * the export's renderer, reads every kept picture's bytes and natural size
 * (so a cover crop lands where `object-fit` put it), and hands all of it to
 * the PowerPoint or SVG writer.
 */
import JSZip from "jszip";

import { backgroundAlone, editablePlan, layerAlone, type EditablePlan, type Target } from "./editable.js";
import { renderPayload } from "./exporter.js";
import { inlineDoc } from "./inline.js";
import type { Doc, Slide } from "./model.js";
import { PLATFORMS } from "./platforms.js";
import { flatKey, writePptx, type PictureAsset } from "./pptx.js";
import { writeSvgs } from "./svgdeck.js";

const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

const KEPT: Record<string, PictureAsset["ext"]> = { "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/gif": "gif" };

/** A picture's bytes and natural size; a format PowerPoint may not open (SVG, WebP) is drawn to a PNG first. */
async function readPicture(src: string): Promise<PictureAsset | null> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const m = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  const ext = m ? KEPT[m[1]!.toLowerCase()] : undefined;
  if (m && ext && m[2]) return { data: bytesOf(m[3]!), ext, w, h };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  return blob ? { data: new Uint8Array(await blob.arrayBuffer()), ext: "png", w, h } : null;
}

/** Each flattened piece as a slide of its own: the layer alone on nothing, or the background alone. */
function pieces(doc: Doc, plan: EditablePlan): { key: string; slide: Slide; clip: { x: number; y: number; w: number; h: number } }[] {
  return plan.slides.flatMap((p) => {
    const slide = doc.slides[p.index]!;
    return [
      ...(p.background.kind === "flat" ? [{ key: flatKey(p.index, null), slide: backgroundAlone(slide), clip: { x: 0, y: 0, w: doc.width, h: doc.height } }] : []),
      ...p.items.flatMap((i) => (i.kind === "flat" ? [{ key: flatKey(p.index, i.layer.id), slide: layerAlone(slide, i.layer), clip: i.clip }] : [])),
    ];
  });
}

const slug = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "carousel";

export type EditableResult = { ok: true; blob: Blob; filename: string; plan: EditablePlan } | { ok: false; error: string };

export async function editableFile(doc: Doc, target: Target): Promise<EditableResult> {
  const carried = await inlineDoc(doc);
  const plan = editablePlan(carried, target);
  const board = { w: carried.width, h: carried.height };

  const flats = new Map<string, Uint8Array>();
  const wanted = pieces(carried, plan);
  if (wanted.length) {
    // The platform only picks a file format, which this never makes.
    const payload = await renderPayload({ ...carried, slides: wanted.map((w) => w.slide) }, PLATFORMS[0]!);
    let res: Response;
    try {
      res = await fetch("/api/flatten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ css: payload.css, width: board.w, height: board.h, pieces: payload.slides.map((s, k) => ({ html: s.html, clip: wanted[k]!.clip })) }),
      });
    } catch {
      return { ok: false, error: "Could not reach the export server. Is it running?" };
    }
    if (!res.ok) return { ok: false, error: res.status === 429 ? "Several files in the last minute. Try again shortly." : "The renderer could not draw the flattened parts." };
    const body = (await res.json()) as { images?: (string | null)[] };
    wanted.forEach((w, k) => {
      const png = body.images?.[k];
      if (png) flats.set(w.key, bytesOf(png));
    });
  }

  const pictures = new Map<string, PictureAsset>();
  for (const p of plan.slides) {
    for (const i of p.items) {
      if (i.kind !== "picture" || pictures.has(i.src)) continue;
      const asset = await readPicture(i.src);
      if (asset) pictures.set(i.src, asset);
    }
  }

  const name = slug(doc.name);
  if (target === "pptx") {
    const bytes = await writePptx(plan, board, doc.name, pictures, flats);
    return { ok: true, plan, filename: `${name}.pptx`, blob: new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }) };
  }
  const zip = new JSZip();
  writeSvgs(plan, board, pictures, flats).forEach((svg, i) => zip.file(`${String(i + 1).padStart(2, "0")}.svg`, svg));
  return { ok: true, plan, filename: `${name}-svg.zip`, blob: await zip.generateAsync({ type: "blob" }) };
}
