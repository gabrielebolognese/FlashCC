import { effectiveRole, type BrandKit, type FontRole, type Slide } from "../../doc/types.js";
import { fitText } from "./fit.js";

export type LayoutNode = {
  id: string;
  kind: "text" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  fontSize?: number;
  lineHeight?: number;
  weight?: number;
  tracking?: number;
  align?: "left" | "center" | "right";
  family?: FontRole;
  uppercase?: boolean;
  fill?: string;
  radius?: number;
  /** Set on editable text so the canvas can route edits back to the document. */
  blockId?: string;
  itemIndex?: number;
  overflow?: boolean;
};

export type Format = { w: number; h: number };

export const FORMATS: Record<string, Format> = {
  "portrait-4x5": { w: 1080, h: 1350 },
  "square-1x1": { w: 1080, h: 1080 },
  "story-9x16": { w: 1080, h: 1920 },
};

/** docs/role-layouts.md §1 — the shared grid every role sits on. */
function grid(format: Format, safeMargin: number) {
  const m = Math.round(format.w * safeMargin);
  const railH = 72;
  const gap = 48;
  return {
    m,
    railH,
    contentX: m,
    contentW: format.w - m * 2,
    topRailY: m,
    bodyY: m + railH + gap,
    bodyH: format.h - m - railH - gap - (m + railH + gap),
    bottomRailY: format.h - m - railH,
  };
}

const LADDER = {
  coverHeading: [96, 84, 72, 64, 56],
  ctaLine: [72, 64, 56],
  quote: [64, 56, 48, 42],
  heading: [48, 44, 40],
  paragraph: [40, 36, 32, 28],
  listItem: [36, 32, 28, 24],
} as const;

const LH = { display: 1.08, cta: 1.1, quote: 1.2, heading: 1.15, body: 1.4, list: 1.35 };

export function computeLayout(
  slide: Slide,
  brand: BrandKit,
  format: Format,
  slideNumber: number,
): LayoutNode[] {
  const g = grid(format, brand.safeMargin);
  const role = effectiveRole(slide);
  const nodes: LayoutNode[] = [];

  const display = brand.type.display;
  const body = brand.type.body;
  const { text: fg, muted, accent } = brand.palette;

  const headings = slide.blocks.filter((b) => b.type === "heading");
  const paragraphs = slide.blocks.filter((b) => b.type === "paragraph");
  const lists = slide.blocks.filter((b) => b.type === "list");
  const quotes = slide.blocks.filter((b) => b.type === "quote");
  const labels = slide.blocks.filter((b) => b.type === "label");

  // Prose slot: anything with no home in this role still renders (role-layouts.md §3).
  const prose = [...headings, ...paragraphs];

  if (role === "cover") {
    const label = labels[0];
    if (label) {
      nodes.push({
        id: `${slide.id}-label`,
        kind: "text",
        x: g.contentX,
        y: g.bodyY,
        w: g.contentW,
        h: 30,
        text: label.text,
        fontSize: 24,
        lineHeight: 24,
        weight: body.weight,
        tracking: 0.08,
        family: body.family,
        uppercase: true,
        color: accent,
        align: "left",
        blockId: label.id,
      });
    }

    const headBlock = prose[0];
    const headText = headBlock ? blockPlain(headBlock) : "";
    const fit = fitText(
      headText,
      LADDER.coverHeading,
      g.contentW,
      g.bodyH - 120,
      display.family,
      display.tracking,
      LH.display,
    );
    const headY = g.bodyY + g.bodyH - fit.height;

    nodes.push({
      id: `${slide.id}-rule`,
      kind: "rect",
      x: g.contentX,
      y: headY - 32 - 6,
      w: 120,
      h: 6,
      color: accent,
      fill: accent,
      radius: 3,
    });

    if (headBlock) {
      nodes.push({
        id: `${slide.id}-head`,
        kind: "text",
        x: g.contentX,
        y: headY,
        w: g.contentW,
        h: fit.height,
        text: headText,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * LH.display,
        weight: display.weight,
        tracking: display.tracking,
        family: display.family,
        uppercase: display.case === "upper",
        color: fg,
        align: "left",
        blockId: headBlock.id,
        overflow: fit.overflow,
      });
    }

    pushHandle(nodes, slide, brand, g, muted);
    nodes.push({
      id: `${slide.id}-swipe`,
      kind: "text",
      x: g.contentX,
      y: g.bottomRailY + 20,
      w: g.contentW,
      h: 32,
      text: "→",
      fontSize: 32,
      lineHeight: 32,
      weight: 400,
      tracking: 0,
      family: body.family,
      color: accent,
      align: "right",
    });
    return nodes;
  }

  if (role === "quote") {
    const inset = Math.round(format.w * 0.1);
    const qx = g.contentX + inset;
    const qw = g.contentW - inset * 2;
    const q = quotes[0];
    const qText = q && q.type === "quote" ? q.text : prose.map(blockPlain).join(" ");
    const attribution = q && q.type === "quote" ? q.attribution : undefined;

    const fit = fitText(qText, LADDER.quote, qw, g.bodyH - 200, display.family, display.tracking, LH.quote);
    const attribH = attribution ? 40 : 0;
    const total = 6 + 48 + fit.height + attribH;
    const top = g.bodyY + (g.bodyH - total) / 2;

    nodes.push({
      id: `${slide.id}-qrule`,
      kind: "rect",
      x: g.contentX + (g.contentW - 80) / 2,
      y: top,
      w: 80,
      h: 6,
      color: accent,
      fill: accent,
      radius: 3,
    });
    nodes.push({
      id: `${slide.id}-quote`,
      kind: "text",
      x: qx,
      y: top + 6 + 48,
      w: qw,
      h: fit.height,
      text: qText,
      fontSize: fit.fontSize,
      lineHeight: fit.fontSize * LH.quote,
      weight: display.weight,
      tracking: display.tracking,
      family: display.family,
      uppercase: display.case === "upper",
      color: fg,
      align: "center",
      ...(q ? { blockId: q.id } : {}),
      overflow: fit.overflow,
    });
    if (attribution) {
      nodes.push({
        id: `${slide.id}-attrib`,
        kind: "text",
        x: qx,
        y: top + 6 + 48 + fit.height + 40,
        w: qw,
        h: 36,
        text: `— ${attribution}`,
        fontSize: 28,
        lineHeight: 36,
        weight: body.weight,
        tracking: 0,
        family: body.family,
        color: muted,
        align: "center",
      });
    }
    pushHandle(nodes, slide, brand, g, muted);
    return nodes;
  }

  if (role === "cta") {
    const line = prose[0];
    const lineText = line ? blockPlain(line) : "";
    const fit = fitText(lineText, LADDER.ctaLine, g.contentW, 300, display.family, display.tracking, LH.cta);
    const plateH = brand.handle ? 84 : 0;
    const support = prose[1];
    const supportH = support ? 44 : 0;
    const total = fit.height + (plateH ? 56 + plateH : 0) + (supportH ? 32 + supportH : 0);
    const top = g.bodyY + (g.bodyH - total) / 2;

    if (line) {
      nodes.push({
        id: `${slide.id}-cta`,
        kind: "text",
        x: g.contentX,
        y: top,
        w: g.contentW,
        h: fit.height,
        text: lineText,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * LH.cta,
        weight: display.weight,
        tracking: display.tracking,
        family: display.family,
        uppercase: display.case === "upper",
        color: fg,
        align: "center",
        blockId: line.id,
        overflow: fit.overflow,
      });
    }

    if (brand.handle) {
      const plateW = Math.min(g.contentW, brand.handle.length * 20 + 96);
      const plateY = top + fit.height + 56;
      nodes.push({
        id: `${slide.id}-plate`,
        kind: "rect",
        x: g.contentX + (g.contentW - plateW) / 2,
        y: plateY,
        w: plateW,
        h: plateH,
        color: accent,
        fill: accent,
        radius: plateH / 2,
      });
      nodes.push({
        id: `${slide.id}-platetext`,
        kind: "text",
        x: g.contentX + (g.contentW - plateW) / 2,
        y: plateY + (plateH - 40) / 2,
        w: plateW,
        h: 40,
        text: brand.handle,
        fontSize: 32,
        lineHeight: 40,
        weight: 600,
        tracking: 0,
        family: body.family,
        color: brand.palette.background,
        align: "center",
      });
    }

    if (support) {
      nodes.push({
        id: `${slide.id}-support`,
        kind: "text",
        x: g.contentX,
        y: top + fit.height + (plateH ? 56 + plateH : 0) + 32,
        w: g.contentW,
        h: supportH,
        text: blockPlain(support),
        fontSize: 30,
        lineHeight: 40,
        weight: body.weight,
        tracking: 0,
        family: body.family,
        color: muted,
        align: "center",
        blockId: support.id,
      });
    }
    return nodes;
  }

  // ── body + list: heading then content, vertically centred as one group ──
  const measured: LayoutNode[] = [];
  let groupH = 0;

  const heading = headings[0];
  if (heading) {
    const fit = fitText(heading.text, LADDER.heading, g.contentW, 200, display.family, display.tracking, LH.heading);
    measured.push({
      id: `${slide.id}-h`,
      kind: "text",
      x: g.contentX,
      y: 0,
      w: g.contentW,
      h: fit.height,
      text: heading.text,
      fontSize: fit.fontSize,
      lineHeight: fit.fontSize * LH.heading,
      weight: display.weight,
      tracking: display.tracking,
      family: display.family,
      uppercase: display.case === "upper",
      color: fg,
      align: "left",
      blockId: heading.id,
      overflow: fit.overflow,
    });
    groupH += fit.height + 32;
  }

  if (role === "list") {
    const list = lists[0];
    const items = list && list.type === "list" ? list.items : [];
    const ordered = list?.type === "list" ? list.ordered : false;
    const budget = (g.bodyH - groupH) / Math.max(1, items.length) - 32;
    items.forEach((item, i) => {
      const fit = fitText(item, LADDER.listItem, g.contentW - 56, budget, body.family, body.tracking, LH.list);
      measured.push({
        id: `${slide.id}-marker-${i}`,
        kind: ordered ? "text" : "rect",
        x: g.contentX,
        y: groupH + (ordered ? 0 : fit.fontSize * 0.45),
        w: ordered ? 44 : 12,
        h: ordered ? fit.fontSize * LH.list : 12,
        ...(ordered ? { text: `${i + 1}` } : {}),
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * LH.list,
        weight: 600,
        tracking: 0,
        family: body.family,
        color: accent,
        fill: accent,
        radius: 6,
        align: "left",
      });
      measured.push({
        id: `${slide.id}-item-${i}`,
        kind: "text",
        x: g.contentX + 56,
        y: groupH,
        w: g.contentW - 56,
        h: fit.height,
        text: item,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * LH.list,
        weight: body.weight,
        tracking: body.tracking,
        family: body.family,
        color: fg,
        align: "left",
        ...(list ? { blockId: list.id } : {}),
        itemIndex: i,
        overflow: fit.overflow,
      });
      groupH += fit.height + 32;
    });
    if (items.length > 0) groupH -= 32;
  } else {
    const paras = paragraphs.length > 0 ? paragraphs : prose.slice(heading ? 1 : 0);
    const budget = (g.bodyH - groupH) / Math.max(1, paras.length) - 24;
    paras.forEach((p, i) => {
      const text = blockPlain(p);
      const fit = fitText(text, LADDER.paragraph, g.contentW, budget, body.family, body.tracking, LH.body);
      measured.push({
        id: `${slide.id}-p-${i}`,
        kind: "text",
        x: g.contentX,
        y: groupH,
        w: g.contentW,
        h: fit.height,
        text,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * LH.body,
        weight: body.weight,
        tracking: body.tracking,
        family: body.family,
        color: fg,
        align: "left",
        blockId: p.id,
        overflow: fit.overflow,
      });
      groupH += fit.height + 24;
    });
    if (paras.length > 0) groupH -= 24;
  }

  const top = g.bodyY + Math.max(0, (g.bodyH - groupH) / 2);
  for (const node of measured) nodes.push({ ...node, y: node.y + top });

  nodes.push({
    id: `${slide.id}-num`,
    kind: "text",
    x: g.contentX,
    y: g.topRailY + 20,
    w: g.contentW,
    h: 32,
    text: String(slideNumber),
    fontSize: 24,
    lineHeight: 32,
    weight: body.weight,
    tracking: 0,
    family: body.family,
    color: muted,
    align: "right",
  });

  pushHandle(nodes, slide, brand, g, muted);
  return nodes;
}

function pushHandle(
  nodes: LayoutNode[],
  slide: Slide,
  brand: BrandKit,
  g: ReturnType<typeof grid>,
  muted: string,
): void {
  if (!brand.handle || brand.handlePlacement === "none") return;
  const right = brand.handlePlacement.endsWith("right");
  const top = brand.handlePlacement.startsWith("top");
  nodes.push({
    id: `${slide.id}-handle`,
    kind: "text",
    x: g.contentX,
    y: (top ? g.topRailY : g.bottomRailY) + 20,
    w: g.contentW,
    h: 32,
    text: brand.handle,
    fontSize: 26,
    lineHeight: 32,
    weight: 500,
    tracking: 0,
    family: brand.type.body.family,
    color: muted,
    align: (right ? "right" : "left"),
  });
}

function blockPlain(block: { type: string; text?: string; items?: string[] }): string {
  if (block.items) return block.items.join(" · ");
  return block.text ?? "";
}
