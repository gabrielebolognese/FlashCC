import type { CSSProperties } from "react";

import type { BrandKit, FontRole } from "../doc/types.js";
import type { Format, LayoutNode } from "./layout/computeLayout.js";

export const FONT_STACK: Record<FontRole, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace',
};

export function backgroundStyle(brand: BrandKit): CSSProperties {
  const bg = brand.background;
  if (bg.kind === "gradient") {
    return { background: `linear-gradient(${bg.angle}deg, ${brand.palette.background}, ${bg.to})` };
  }
  if (bg.kind === "grid") {
    const line = `rgba(127,127,127,${bg.opacity})`;
    return {
      background: brand.palette.background,
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: "60px 60px",
    };
  }
  return { background: brand.palette.background };
}

type Props = {
  nodes: LayoutNode[];
  brand: BrandKit;
  format: Format;
  /** Editing hooks — absent in the export path, so export renders pure markup. */
  editingId?: string | null;
  onEditStart?: (node: LayoutNode) => void;
  onEditCommit?: (node: LayoutNode, text: string) => void;
};

/**
 * The ONE renderer. Always draws at the format's logical size in absolute logical px.
 * It never reads the viewport. Scale is applied outside it by ScaledSlide, which is why
 * the preview and the export cannot drift.
 */
export function SlideRenderer({
  nodes,
  brand,
  format,
  editingId = null,
  onEditStart,
  onEditCommit,
}: Props) {
  return (
    <div
      style={{
        position: "relative",
        width: format.w,
        height: format.h,
        overflow: "hidden",
        ...backgroundStyle(brand),
      }}
    >
      {nodes.map((node) =>
        node.kind === "rect" ? (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: node.w,
              height: node.h,
              background: node.fill ?? node.color,
              borderRadius: node.radius ?? 0,
            }}
          />
        ) : (
          <TextNode
            key={node.id}
            node={node}
            editing={editingId === nodeKey(node)}
            {...(onEditStart ? { onEditStart } : {})}
            {...(onEditCommit ? { onEditCommit } : {})}
          />
        ),
      )}
    </div>
  );
}

export const nodeKey = (node: LayoutNode): string =>
  node.itemIndex === undefined ? node.blockId ?? node.id : `${node.blockId}:${node.itemIndex}`;

function TextNode({
  node,
  editing,
  onEditStart,
  onEditCommit,
}: {
  node: LayoutNode;
  editing: boolean;
  onEditStart?: (node: LayoutNode) => void;
  onEditCommit?: (node: LayoutNode, text: string) => void;
}) {
  const editable = node.blockId !== undefined && onEditStart !== undefined;

  const style: CSSProperties = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.w,
    fontFamily: FONT_STACK[node.family ?? "sans"],
    fontSize: node.fontSize,
    lineHeight: `${node.lineHeight ?? (node.fontSize ?? 16) * 1.3}px`,
    fontWeight: node.weight,
    letterSpacing: `${node.tracking ?? 0}em`,
    color: node.color,
    textAlign: node.align ?? "left",
    textTransform: node.uppercase ? "uppercase" : "none",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    outline: "none",
    cursor: editable ? "text" : "default",
  };

  if (editing && onEditCommit) {
    return (
      <div
        style={{ ...style, boxShadow: `0 0 0 2px ${node.color}` }}
        contentEditable
        suppressContentEditableWarning
        ref={(el) => {
          if (el && document.activeElement !== el) {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }}
        onBlur={(e) => onEditCommit(node, e.currentTarget.textContent ?? "")}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          e.stopPropagation();
        }}
      >
        {node.text}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={editable ? "fcc-editable" : undefined}
      onClick={editable && onEditStart ? () => onEditStart(node) : undefined}
    >
      {node.text}
      {node.overflow ? (
        <span
          style={{
            position: "absolute",
            right: -28,
            top: 0,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "#e5545a",
          }}
        />
      ) : null}
    </div>
  );
}
