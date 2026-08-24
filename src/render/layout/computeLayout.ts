/**
 * The layout entry point. All five role branches are gone — layout is now one pass
 * over template data (docs/template-system.md §3). Still a pure function returning
 * LayoutNode[], which is what phase 2 converts without a browser.
 */
import type { Template } from "../../doc/template.js";
import type { BrandKit, Slide } from "../../doc/types.js";
import { interpret } from "./interpret.js";
import type { Format, LayoutNode } from "./node.js";

export { FORMATS } from "./node.js";
export type { Format, LayoutNode } from "./node.js";

export function computeLayout(
  template: Template,
  slide: Slide,
  brand: BrandKit,
  format: Format,
  slideNumber: number,
): LayoutNode[] {
  return interpret(template, slide, brand, format, slideNumber);
}
