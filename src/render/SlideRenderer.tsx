import type { CSSProperties } from "react";

import type { FontRole } from "../doc/types.js";
import { ICON_PATHS, ICON_VIEWBOX } from "./icons.js";
import type { Format, LayoutNode } from "./layout/node.js";

export const FONT_STACK: Record<FontRole, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace',
};

type Props = {
  nodes: LayoutNode[];
  format: Format;
  /** Editing hooks — absent in the export and thumbnail paths. */
  editingId?: string | null;
  onEditStart?: (node: LayoutNode) => void;
  onEditCommit?: (node: LayoutNode, text: string) => void;
};

/**
 * The ONE renderer, and now a pure painter: it takes LayoutNode[] and knows nothing
 * about templates, brands, or roles. Always draws at the format's logical size in
 * absolute px and never reads the viewport — scale is applied outside it, which is
 * why the preview, the thumbnails and the export cannot drift.
 */
export function SlideRenderer({ nodes, format, editingId = null, onEditStart, onEditCommit }: Props) {
  const ordered = [...nodes].sort((a, b) => a.z - b.z);

  return (
    <div style={{ position: "relative", width: format.w, height: format.h, overflow: "hidden" }}>
      {ordered.map((node) => {
        if (node.kind === "text") {
          return (
            <TextNode
              key={node.id}
              node={node}
              editing={editingId === nodeKey(node)}
              {...(onEditStart ? { onEditStart } : {})}
              {...(onEditCommit ? { onEditCommit } : {})}
            />
          );
        }
        if (node.kind === "icon") return <IconNode key={node.id} node={node} />;
        if (node.kind === "image") return <ImageNode key={node.id} node={node} />;
        return <BoxNode key={node.id} node={node} />;
      })}
    </div>
  );
}

export const nodeKey = (node: LayoutNode): string =>
  node.itemIndex === undefined ? node.blockId ?? node.id : `${node.blockId}:${node.itemIndex}`;

const frame = (node: LayoutNode): CSSProperties => ({
  position: "absolute",
  left: node.x,
  top: node.y,
  width: node.w,
  height: node.h,
});

function BoxNode({ node }: { node: LayoutNode }) {
  const style: CSSProperties = { ...frame(node), borderRadius: node.radius ?? 0 };

  if (node.gradient) {
    style.background = `linear-gradient(${node.gradient.angle}deg, ${node.gradient.from}, ${node.gradient.to})`;
  } else {
    style.background = node.fill ?? node.color;
  }

  if (node.pattern) {
    const p = node.pattern;
    if (p.kind === "grid") {
      style.backgroundImage = `linear-gradient(${p.color} ${p.weight}px, transparent ${p.weight}px), linear-gradient(90deg, ${p.color} ${p.weight}px, transparent ${p.weight}px)`;
    } else {
      style.backgroundImage = `radial-gradient(${p.color} ${p.weight}px, transparent ${p.weight}px)`;
    }
    style.backgroundSize = `${p.cell}px ${p.cell}px`;
  }

  return <div style={style} />;
}

function IconNode({ node }: { node: LayoutNode }) {
  const path = node.glyph ? ICON_PATHS[node.glyph] : undefined;
  if (!path) return null;
  return (
    <svg
      style={frame(node)}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      stroke={node.color}
      strokeWidth={node.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

function ImageNode({ node }: { node: LayoutNode }) {
  if (node.src) {
    return (
      <img
        src={node.src}
        alt=""
        style={{ ...frame(node), objectFit: "cover", borderRadius: node.radius ?? 0 }}
      />
    );
  }
  // An unfilled image area is a first-class rendering, so the template editor needs
  // no second code path to show what a template reserves.
  return (
    <div
      style={{
        ...frame(node),
        borderRadius: node.radius ?? 0,
        border: `2px dashed ${node.color}`,
        display: "grid",
        placeItems: "center",
        opacity: 0.5,
      }}
    >
      <svg width="12%" viewBox="0 0 24 24" fill="none" stroke={node.color} strokeWidth={2}>
        <path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6" />
      </svg>
    </div>
  );
}

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
