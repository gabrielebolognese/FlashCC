/**
 * A PowerPoint file from an editable plan (31.6). Pure apart from JSZip.
 *
 * The smallest package PowerPoint, Keynote, Google Slides and LibreOffice all
 * open: one master, one blank layout, one theme, and a slide per FlashCC
 * slide at the deck's own size (a pixel is 9525 EMU, 96 to the inch). Text is
 * real text boxes, one paragraph per line as FlashCC wrapped it; shapes are
 * preset geometry; pictures are cropped the way `object-fit` and the focal
 * point crop them; anything the plan flattened is placed as a PNG at the
 * exact area the renderer drew it.
 */
import JSZip from "jszip";

import type { EditablePlan, FlatItem, Item, PictureItem, ShapeItem, TextItem } from "./editable.js";

/** A picture's bytes and its natural size, by `src`. PNG, JPEG or GIF only: anything else is converted first. */
export type PictureAsset = { data: Uint8Array; ext: "png" | "jpeg" | "gif"; w: number; h: number };

/** The renderer's PNGs for everything flattened, keyed by `flatKey`. */
export type FlatAssets = ReadonlyMap<string, Uint8Array>;

export const flatKey = (slide: number, layerId: string | null): string => `${slide}:${layerId ?? "background"}`;

export const EMU_PER_PX = 9525;
const emu = (px: number): number => Math.round(px * EMU_PER_PX);
/** Font sizes and spacing are in hundredths of a point; a CSS pixel is three quarters of one. */
const pt100 = (px: number): number => Math.round(px * 75);

export const xml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!)
    // XML 1.0 refuses most control characters outright.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const colour = (hex: string, alpha = 1): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100_000);
  return `<a:srgbClr val="${hex.replace("#", "").toUpperCase()}">${a < 100_000 ? `<a:alpha val="${a}"/>` : ""}</a:srgbClr>`;
};

const xfrm = (x: number, y: number, w: number, h: number, rotation = 0): string =>
  `<a:xfrm${rotation ? ` rot="${Math.round((((rotation % 360) + 360) % 360) * 60_000)}"` : ""}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(Math.max(1, w))}" cy="${emu(Math.max(1, h))}"/></a:xfrm>`;

/* ── one slide ────────────────────────────────────────────────────────────── */

type Rels = { add(target: string, type: string): string };

const PIC_TYPE = `${REL}/image`;

function picture(id: number, name: string, rid: string, at: { x: number; y: number; w: number; h: number }, rotation: number, opacity: number, crop?: { l: number; t: number; r: number; b: number }): string {
  const src = crop && (crop.l || crop.t || crop.r || crop.b) ? `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>` : "";
  const alpha = opacity < 1 ? `<a:alphaModFix amt="${Math.round(opacity * 100_000)}"/>` : "";
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rid}">${alpha}</a:blip>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(at.x, at.y, at.w, at.h, rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/**
 * Where a picture lands and which part of it shows: `object-fit: cover` with
 * the focal point as `object-position` is a crop (`srcRect`, in thousandths
 * of a percent); `contain` is a smaller box placed the same way.
 */
export function pictureFit(item: Pick<PictureItem, "fit" | "focal">, box: { x: number; y: number; w: number; h: number }, natural: { w: number; h: number }) {
  const nw = Math.max(1, natural.w);
  const nh = Math.max(1, natural.h);
  const scale = item.fit === "contain" ? Math.min(box.w / nw, box.h / nh) : Math.max(box.w / nw, box.h / nh);
  const rw = nw * scale;
  const rh = nh * scale;
  if (item.fit === "contain") {
    return { at: { x: box.x + (box.w - rw) * item.focal.x, y: box.y + (box.h - rh) * item.focal.y, w: rw, h: rh }, crop: { l: 0, t: 0, r: 0, b: 0 } };
  }
  const ox = rw - box.w;
  const oy = rh - box.h;
  const pc = (v: number, of: number) => Math.round((v / of) * 100_000);
  return {
    at: box,
    crop: { l: pc(ox * item.focal.x, rw), r: pc(ox * (1 - item.focal.x), rw), t: pc(oy * item.focal.y, rh), b: pc(oy * (1 - item.focal.y), rh) },
  };
}

function shape(id: number, s: ShapeItem): string {
  const l = s.layer;
  // CSS draws a border inside the box (border-box); DrawingML centres the line on the edge.
  const inset = s.stroke ? s.strokeWidth / 2 : 0;
  const x = l.x + inset;
  const y = l.y + inset;
  const w = l.w - inset * 2;
  const h = l.h - inset * 2;
  const geom =
    s.geometry === "ellipse"
      ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
      : s.geometry === "triangle"
        ? '<a:prstGeom prst="triangle"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>'
        : s.radius > 0
          ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50_000, Math.round((s.radius / Math.max(1, Math.min(l.w, l.h))) * 100_000))}"/></a:avLst></a:prstGeom>`
          : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const fill = s.fill ? `<a:solidFill>${colour(s.fill, s.opacity)}</a:solidFill>` : "<a:noFill/>";
  const line = s.stroke ? `<a:ln w="${emu(s.strokeWidth)}"><a:solidFill>${colour(s.stroke, l.opacity)}</a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(l.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(x, y, w, h, l.rotation)}${geom}${fill}${line}</p:spPr>` +
    `<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp>`
  );
}

/** A left or right that reads the way the editor's start and end do in a right-to-left line. */
const visualAlign = (t: TextItem): "l" | "ctr" | "r" => (t.align === "center" ? "ctr" : (t.align === "right") !== t.rtl ? "r" : "l");

/**
 * Room for the receiving tool's own metrics: a line FlashCC fitted exactly
 * can come out a hair wider in PowerPoint's copy of the face and wrap a word.
 * The box grows on the side the text does not align to, so nothing moves.
 */
const SLACK = 0.06;

function text(id: number, t: TextItem): string {
  const l = t.layer;
  const grow = l.w * SLACK;
  const algn = visualAlign(t);
  const x = algn === "l" ? l.x : algn === "r" ? l.x - grow : l.x - grow / 2;
  const anchor = t.valign === "middle" ? "ctr" : t.valign === "bottom" ? "b" : "t";
  const lnSpc = pt100(t.size * t.lineHeight);
  const rPr = (bold: boolean, italic: boolean, hex: string) =>
    `<a:rPr lang="en-US" sz="${pt100(t.size)}"${bold ? ' b="1"' : ' b="0"'}${italic ? ' i="1"' : ""}${t.underline ? ' u="sng"' : ""}${t.letterSpacing ? ` spc="${pt100(t.letterSpacing * t.size)}"` : ""}${t.uppercase ? ' cap="all"' : ""} dirty="0">` +
    `<a:solidFill>${colour(hex, t.opacity)}</a:solidFill><a:latin typeface="${xml(t.font)}"/><a:ea typeface="${xml(t.font)}"/><a:cs typeface="${xml(t.font)}"/></a:rPr>`;
  const paras = t.lines
    .map(
      (runs) =>
        `<a:p><a:pPr algn="${algn}"${t.rtl ? ' rtl="1"' : ""}><a:lnSpc><a:spcPts val="${lnSpc}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>` +
        runs.map((r) => `<a:r>${rPr(r.bold, r.italic, r.colour)}<a:t>${xml(r.text)}</a:t></a:r>`).join("") +
        `</a:p>`,
    )
    .join("");
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(l.name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(x, l.y, l.w + grow, l.h, l.rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
  );
}

function slideXml(
  plan: EditablePlan["slides"][number],
  board: { w: number; h: number },
  rels: Rels,
  media: (data: Uint8Array, ext: string) => string,
  pictures: ReadonlyMap<string, PictureAsset>,
  flats: FlatAssets,
): string {
  let id = 1;
  const parts: string[] = [];
  const flatPic = (item: FlatItem | null, key: string, name: string) => {
    const png = flats.get(key);
    if (!png) return;
    const clip = item?.clip ?? { x: 0, y: 0, w: board.w, h: board.h };
    parts.push(picture(++id, name, rels.add(media(png, "png"), PIC_TYPE), clip, 0, 1));
  };
  if (plan.background.kind === "flat") flatPic(null, flatKey(plan.index, null), "Background");
  for (const item of plan.items as Item[]) {
    switch (item.kind) {
      case "text":
        parts.push(text(++id, item));
        break;
      case "shape":
        parts.push(shape(++id, item));
        break;
      case "picture": {
        const asset = pictures.get(item.src);
        if (!asset) break;
        const l = item.layer;
        const { at, crop } = pictureFit(item, l, asset);
        parts.push(picture(++id, l.name, rels.add(media(asset.data, asset.ext), PIC_TYPE), at, l.rotation, item.opacity, crop));
        break;
      }
      case "flat":
        flatPic(item, flatKey(plan.index, item.layer.id), item.layer.name);
        break;
      case "path":
        // The plan flattens every path for PowerPoint; nothing reaches here.
        break;
    }
  }
  const bg = plan.background.kind === "solid" ? `<p:bg><p:bgPr><a:solidFill>${colour(plan.background.colour)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>` : "";
  return (
    `${HEAD}<p:sld ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${parts.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

/* ── the package ──────────────────────────────────────────────────────────── */

const relsXml = (rows: { id: string; type: string; target: string }[]): string =>
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join("")}</Relationships>`;

const EMPTY_TREE =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

const MASTER = `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const sys = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
const fill3 = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const THEME = (font: string) =>
  `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="FlashCC"><a:themeElements>` +
  `<a:clrScheme name="FlashCC">${sys("dk1", "000000")}${sys("lt1", "FFFFFF")}${sys("dk2", "1F1F1F")}${sys("lt2", "EEECE1")}${sys("accent1", "D9A521")}${sys("accent2", "4F81BD")}${sys("accent3", "9BBB59")}${sys("accent4", "8064A2")}${sys("accent5", "4BACC6")}${sys("accent6", "F79646")}${sys("hlink", "0563C1")}${sys("folHlink", "954F72")}</a:clrScheme>` +
  `<a:fontScheme name="FlashCC"><a:majorFont><a:latin typeface="${xml(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${xml(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
  `<a:fmtScheme name="FlashCC"><a:fillStyleLst>${fill3}${fill3}${fill3}</a:fillStyleLst>` +
  `<a:lnStyleLst><a:ln w="6350">${fill3}</a:ln><a:ln w="12700">${fill3}</a:ln><a:ln w="19050">${fill3}</a:ln></a:lnStyleLst>` +
  `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
  `<a:bgFillStyleLst>${fill3}${fill3}${fill3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

/**
 * The .pptx, as bytes. `name` is the deck's, for the file's title property.
 * Every picture is stored once however many slides use it.
 */
export async function writePptx(
  plan: EditablePlan,
  board: { w: number; h: number },
  name: string,
  pictures: ReadonlyMap<string, PictureAsset>,
  flats: FlatAssets,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const n = plan.slides.length;

  // First in the archive: some readers look for it there.
  const ct = "application/vnd.openxmlformats-officedocument.presentationml";
  zip.file(
    "[Content_Types].xml",
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      `<Override PartName="/ppt/presentation.xml" ContentType="${ct}.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${ct}.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${ct}.slideLayout+xml"/>` +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      plan.slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${ct}.slide+xml"/>`).join("") +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      "</Types>",
  );

  let mediaCount = 0;
  const stored = new Map<Uint8Array, string>();
  const media = (data: Uint8Array, ext: string): string => {
    const known = stored.get(data);
    if (known) return known;
    mediaCount += 1;
    const path = `../media/image${mediaCount}.${ext}`;
    zip.file(`ppt/media/image${mediaCount}.${ext}`, data);
    stored.set(data, path);
    return path;
  };

  plan.slides.forEach((s, i) => {
    const rows = [{ id: "rId1", type: `${REL}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" }];
    const rels: Rels = {
      add(target, type) {
        const id = `rId${rows.length + 1}`;
        rows.push({ id, type, target });
        return id;
      },
    };
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s, board, rels, media, pictures, flats));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(rows));
  });

  const slideIds = plan.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  zip.file(
    "ppt/presentation.xml",
    `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${emu(board.w)}" cy="${emu(board.h)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    relsXml([
      { id: "rId1", type: `${REL}/slideMaster`, target: "slideMasters/slideMaster1.xml" },
      ...plan.slides.map((_, i) => ({ id: `rId${i + 2}`, type: `${REL}/slide`, target: `slides/slide${i + 1}.xml` })),
      { id: `rId${n + 2}`, type: `${REL}/theme`, target: "theme/theme1.xml" },
    ]),
  );
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER);
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    relsXml([
      { id: "rId1", type: `${REL}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" },
      { id: "rId2", type: `${REL}/theme`, target: "../theme/theme1.xml" },
    ]),
  );
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", relsXml([{ id: "rId1", type: `${REL}/slideMaster`, target: "../slideMasters/slideMaster1.xml" }]));
  zip.file("ppt/theme/theme1.xml", THEME(plan.fonts[0] ?? "Arial"));

  zip.file(
    "docProps/core.xml",
    `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(name)}</dc:title><dc:creator>FlashCC</dc:creator></cp:coreProperties>`,
  );
  zip.file(
    "docProps/app.xml",
    `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FlashCC</Application><Slides>${n}</Slides></Properties>`,
  );
  zip.file(
    "_rels/.rels",
    relsXml([
      { id: "rId1", type: `${REL}/officeDocument`, target: "ppt/presentation.xml" },
      { id: "rId2", type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", target: "docProps/core.xml" },
      { id: "rId3", type: `${REL}/extended-properties`, target: "docProps/app.xml" },
    ]),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
