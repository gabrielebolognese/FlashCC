/**
 * One SVG per slide from an editable plan (31.6), for a designer who finishes
 * in Figma, Illustrator or Affinity. Pure.
 *
 * Text stays text (a `<text>` per layer, a `<tspan>` per line as FlashCC
 * wrapped it), shapes and paths stay vectors, pictures are embedded and
 * cropped where `object-fit` crops them, and what the plan flattened is the
 * renderer's PNG at the area it drew. Lines sit on the middle of their line
 * box (`dominant-baseline: central`), which is where CSS centres them; the
 * glyphs are the receiving tool's copy of the face (D69).
 */
import type { EditablePlan, Item, PathItem, ShapeItem, TextItem } from "./editable.js";
import { flatKey, pictureFit, xml, type FlatAssets, type PictureAsset } from "./pptx.js";

const n = (v: number): string => String(Math.round(v * 100) / 100);

const base64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const rotate = (l: { x: number; y: number; w: number; h: number; rotation: number }): string =>
  l.rotation ? ` transform="rotate(${n(l.rotation)} ${n(l.x + l.w / 2)} ${n(l.y + l.h / 2)})"` : "";

const opacity = (o: number): string => (o < 1 ? ` opacity="${n(o)}"` : "");

function shape(s: ShapeItem): string {
  const l = s.layer;
  const inset = s.stroke ? s.strokeWidth / 2 : 0;
  const paint = `fill="${s.fill ?? "none"}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${n(s.strokeWidth)}"` : ""}`;
  const x = l.x + inset;
  const y = l.y + inset;
  const w = Math.max(0, l.w - inset * 2);
  const h = Math.max(0, l.h - inset * 2);
  const label = ` id="${xml(l.id)}" data-name="${xml(l.name)}"`;
  if (s.geometry === "ellipse") return `<ellipse${label} cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${paint}${opacity(s.opacity)}${rotate(l)}/>`;
  if (s.geometry === "triangle") return `<polygon${label} points="${n(l.x + l.w / 2)},${n(l.y)} ${n(l.x + l.w)},${n(l.y + l.h)} ${n(l.x)},${n(l.y + l.h)}" ${paint}${opacity(s.opacity)}${rotate(l)}/>`;
  const r = s.radius > 0 ? ` rx="${n(Math.min(s.radius, Math.min(l.w, l.h) / 2))}"` : "";
  return `<rect${label} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r} ${paint}${opacity(s.opacity)}${rotate(l)}/>`;
}

function path(p: PathItem): string {
  const l = p.layer;
  // Rotated outside the viewport: inside it, a stretched viewBox would skew the turn.
  return (
    `<g id="${xml(l.id)}" data-name="${xml(l.name)}"${opacity(p.opacity)}${rotate(l)}>` +
    `<svg x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" viewBox="0 0 ${n(p.viewW)} ${n(p.viewH)}" preserveAspectRatio="none" overflow="visible">` +
    `<path d="${xml(p.d)}" fill="${p.fill ?? "none"}" fill-rule="evenodd"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${l.scaleStroke ? "" : ' vector-effect="non-scaling-stroke"'}` : ""}/></svg></g>`
  );
}

function text(t: TextItem): string {
  const l = t.layer;
  const lineH = t.size * t.lineHeight;
  const block = lineH * t.lines.length;
  const top = t.valign === "middle" ? l.y + (l.h - block) / 2 : t.valign === "bottom" ? l.y + l.h - block : l.y;
  // CSS's start and end: a right-to-left line starts on the right.
  const side = t.align === "center" ? "center" : (t.align === "right") !== t.rtl ? "right" : "left";
  const x = side === "center" ? l.x + l.w / 2 : side === "right" ? l.x + l.w : l.x;
  const anchor = side === "center" ? "middle" : (side === "right") !== t.rtl ? "end" : "start";
  const words = (s: string) => xml(t.uppercase ? s.toLocaleUpperCase() : s);
  const lines = t.lines
    .map((runs, i) => {
      const spans = runs
        .map((r) => {
          const attrs = [r.colour !== t.colour ? `fill="${r.colour}"` : "", r.bold !== t.weight >= 600 ? `font-weight="${r.bold ? 700 : 400}"` : "", r.italic ? 'font-style="italic"' : ""].filter(Boolean).join(" ");
          return attrs ? `<tspan ${attrs}>${words(r.text)}</tspan>` : words(r.text);
        })
        .join("");
      return `<tspan x="${n(x)}" y="${n(top + lineH * (i + 0.5))}">${spans}</tspan>`;
    })
    .join("");
  return (
    `<text id="${xml(l.id)}" data-name="${xml(l.name)}" font-family="${xml(t.font)}" font-size="${n(t.size)}" font-weight="${t.weight}" fill="${t.colour}"` +
    `${t.letterSpacing ? ` letter-spacing="${n(t.letterSpacing * t.size)}"` : ""}${t.underline ? ' text-decoration="underline"' : ""}${t.rtl ? ' direction="rtl"' : ""}` +
    ` text-anchor="${anchor}" dominant-baseline="central" xml:space="preserve"${opacity(t.opacity)}${rotate(l)}>${lines}</text>`
  );
}

const mime = (ext: string): string => `image/${ext}`;

/** Each slide as an SVG document, in order. */
export function writeSvgs(
  plan: EditablePlan,
  board: { w: number; h: number },
  pictures: ReadonlyMap<string, PictureAsset>,
  flats: FlatAssets,
): string[] {
  return plan.slides.map((s) => {
    const parts: string[] = [];
    const png = (key: string, at: { x: number; y: number; w: number; h: number }, name: string) => {
      const bytes = flats.get(key);
      if (bytes) parts.push(`<image data-name="${xml(name)}" x="${n(at.x)}" y="${n(at.y)}" width="${n(at.w)}" height="${n(at.h)}" preserveAspectRatio="none" href="data:image/png;base64,${base64(bytes)}"/>`);
    };
    if (s.background.kind === "solid") parts.push(`<rect data-name="Background" width="${board.w}" height="${board.h}" fill="${s.background.colour}"/>`);
    else png(flatKey(s.index, null), { x: 0, y: 0, w: board.w, h: board.h }, "Background");
    for (const item of s.items as Item[]) {
      if (item.kind === "text") parts.push(text(item));
      else if (item.kind === "shape") parts.push(shape(item));
      else if (item.kind === "path") parts.push(path(item));
      else if (item.kind === "flat") png(flatKey(s.index, item.layer.id), item.clip, item.layer.name);
      else {
        const asset = pictures.get(item.src);
        if (!asset) continue;
        const l = item.layer;
        const { at, crop } = pictureFit(item, l, asset);
        // The crop as a nested viewport: the whole picture, positioned so the shown part fills the box.
        const fw = at.w / (1 - (crop.l + crop.r) / 100_000);
        const fh = at.h / (1 - (crop.t + crop.b) / 100_000);
        parts.push(
          `<g data-name="${xml(l.name)}"${opacity(item.opacity)}${rotate(l)}><svg x="${n(at.x)}" y="${n(at.y)}" width="${n(at.w)}" height="${n(at.h)}" overflow="hidden">` +
            `<image x="${n((-fw * crop.l) / 100_000)}" y="${n((-fh * crop.t) / 100_000)}" width="${n(fw)}" height="${n(fh)}" preserveAspectRatio="none" href="data:${mime(asset.ext)};base64,${base64(asset.data)}"/></svg></g>`,
        );
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${board.w}" height="${board.h}" viewBox="0 0 ${board.w} ${board.h}">${parts.join("")}</svg>\n`;
  });
}
