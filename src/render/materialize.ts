/**
 * Template → free elements.
 *
 * The template used to run on every render, which is what made its output
 * untouchable. Now it runs ONCE, at slide creation or when the user asks for it, and
 * hands back ordinary elements. After that the canvas owns them: drag, resize,
 * restyle, delete. The template's job is a good starting arrangement, not a cage.
 */
import { newId } from "../doc/ids.js";
import type { IconId, Template } from "../doc/template.js";
import type { BrandKit, Element, Slide } from "../doc/types.js";
import { computeLayout } from "./layout/computeLayout.js";
import type { Format, LayoutNode } from "./layout/node.js";

export function materialize(
  slide: Slide,
  template: Template,
  brand: BrandKit,
  format: Format,
  slideNumber: number,
): { elements: Element[]; background: string } {
  const nodes = computeLayout(template, slide, brand, format, slideNumber);
  const bg = nodes.find((n) => n.band === "background");

  const elements = nodes
    .filter((n) => n.band !== "background")
    .map((node, i) => nodeToElement(node, format, i));

  return { elements, background: bg?.fill ?? bg?.color ?? brand.palette.background };
}

function nodeToElement(node: LayoutNode, format: Format, z: number): Element {
  const base: Element = {
    id: newId("el"),
    kind: node.kind === "line" || node.kind === "rect" ? "shape" : (node.kind as Element["kind"]),
    x: node.x / format.w,
    y: node.y / format.h,
    w: node.w / format.w,
    h: Math.max(node.h, node.lineHeight ?? 0) / format.h,
    z,
    colour: node.color,
    fromTemplate: true,
  };

  if (node.kind === "text") {
    return {
      ...base,
      kind: "text",
      text: node.text ?? "",
      fontSize: node.fontSize ?? 40,
      lineHeight: node.lineHeight ?? (node.fontSize ?? 40) * 1.25,
      family: node.family ?? "sans",
      weight: node.weight ?? 400,
      align: node.align ?? "left",
      tracking: node.tracking ?? 0,
      uppercase: node.uppercase ?? false,
      ...(node.blockId ? { blockId: node.blockId } : {}),
      ...(node.itemIndex !== undefined ? { itemIndex: node.itemIndex } : {}),
    };
  }

  if (node.kind === "icon") {
    return { ...base, kind: "icon", glyph: node.glyph as string | undefined, strokeWidth: node.strokeWidth ?? 2 };
  }

  if (node.kind === "image") {
    return { ...base, kind: "image", radius: node.radius ?? 0 };
  }

  // rect / line / shape → a filled shape the user can move like anything else
  return {
    ...base,
    kind: "shape",
    shape: node.kind === "line" ? "line" : (node.shape ?? "rect"),
    filled: node.filled !== false,
    radius: node.radius ?? 0,
    strokeWidth: node.strokeWidth ?? 4,
  };
}

/** Elements → render nodes. The renderer stays a pure painter. */
export function elementsToNodes(elements: Element[], format: Format, background: string): LayoutNode[] {
  const nodes: LayoutNode[] = [
    {
      id: "bg",
      kind: "rect",
      x: 0,
      y: 0,
      w: format.w,
      h: format.h,
      z: 0,
      band: "background",
      color: background,
      fill: background,
    },
  ];

  for (const el of [...elements].sort((a, b) => a.z - b.z)) {
    const frame = {
      id: el.id,
      x: el.x * format.w,
      y: el.y * format.h,
      w: el.w * format.w,
      h: el.h * format.h,
      z: el.z + 1,
      band: "content" as const,
      color: el.colour,
      overlayId: el.id,
      ...(el.blockId ? { blockId: el.blockId } : {}),
      ...(el.itemIndex !== undefined ? { itemIndex: el.itemIndex } : {}),
      ...(el.opacity !== undefined ? { opacity: el.opacity } : {}),
    };

    if (el.kind === "text") {
      nodes.push({
        ...frame,
        kind: "text",
        text: el.text ?? "",
        fontSize: el.fontSize ?? 40,
        lineHeight: el.lineHeight ?? (el.fontSize ?? 40) * 1.25,
        family: el.family ?? "sans",
        weight: el.weight ?? 400,
        align: el.align ?? "left",
        tracking: el.tracking ?? 0,
        uppercase: el.uppercase ?? false,
      });
    } else if (el.kind === "icon") {
      nodes.push({ ...frame, kind: "icon", glyph: el.glyph as IconId | undefined, strokeWidth: el.strokeWidth ?? 2 });
    } else if (el.kind === "image") {
      nodes.push({ ...frame, kind: "image", radius: el.radius ?? 0 });
    } else {
      nodes.push({
        ...frame,
        kind: "shape",
        shape: el.shape ?? "rect",
        filled: el.filled !== false,
        radius: el.radius ?? 0,
        strokeWidth: el.strokeWidth ?? 4,
        ...(el.filled !== false ? { fill: el.colour } : {}),
      });
    }
  }

  return nodes;
}

/** Push edited block text back onto the elements that came from that block. */
export function syncTextToElements(slide: Slide): Element[] {
  const elements = slide.elements ?? [];
  return elements.map((el) => {
    if (el.kind !== "text" || !el.blockId) return el;
    const block = slide.blocks.find((b) => b.id === el.blockId);
    if (!block) return el;
    if (block.type === "list") {
      if (el.itemIndex === undefined) return el;
      const item = block.items[el.itemIndex];
      return item === undefined ? el : { ...el, text: item };
    }
    if (block.type === "quote" && el.text?.startsWith("—")) return el;
    return { ...el, text: block.text };
  });
}
