import type { CSSProperties } from "react";

import { ICON_PATHS, ICON_VIEWBOX } from "../render/icons.js";
import { gradientCss } from "./gradient.js";
import { fontStack, type Layer } from "./model.js";

/** Paints one layer. Pure — no interaction, no selection chrome. */
export function LayerView({
  layer,
  editing,
  onCommitText,
}: {
  layer: Layer;
  editing?: boolean;
  onCommitText?: (text: string) => void;
}) {
  if (!layer.visible) return null;

  const box: CSSProperties = {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    width: layer.w,
    height: layer.h,
    opacity: layer.opacity,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    transformOrigin: "center",
    pointerEvents: "none",
  };

  if (layer.kind === "text") {
    const style: CSSProperties = {
      ...box,
      display: "flex",
      flexDirection: "column",
      justifyContent:
        layer.valign === "middle" ? "center" : layer.valign === "bottom" ? "flex-end" : "flex-start",
      fontFamily: fontStack(layer.fontFamily),
      fontSize: layer.fontSize ?? 64,
      fontWeight: layer.fontWeight ?? 600,
      lineHeight: layer.lineHeight ?? 1.2,
      letterSpacing: `${layer.letterSpacing ?? 0}em`,
      color: layer.fill,
      textAlign: layer.align ?? "left",
      fontStyle: layer.italic ? "italic" : "normal",
      textDecoration: layer.underline ? "underline" : "none",
      textTransform: layer.uppercase ? "uppercase" : "none",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflow: "visible",
      // A gradient on text is the ramp painted behind it and clipped to the glyphs.
      ...(layer.gradient
        ? {
            backgroundImage: gradientCss(layer.gradient),
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }
        : {}),
    };

    if (editing && onCommitText) {
      return (
        <div
          style={{ ...style, pointerEvents: "auto", outline: "2px solid #d9a521", cursor: "text" }}
          contentEditable
          suppressContentEditableWarning
          ref={(el) => {
            if (el && document.activeElement !== el) {
              el.focus();
              const r = document.createRange();
              r.selectNodeContents(el);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(r);
            }
          }}
          onBlur={(e) => onCommitText(e.currentTarget.innerText)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        >
          {layer.text}
        </div>
      );
    }
    return <div style={style}>{layer.text}</div>;
  }

  if (layer.kind === "icon") {
    const path = layer.glyph ? ICON_PATHS[layer.glyph as keyof typeof ICON_PATHS] : undefined;
    if (!path) return null;
    return (
      <svg
        style={box}
        viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
        preserveAspectRatio="none"
        fill="none"
        stroke={layer.stroke ?? layer.fill}
        strokeWidth={layer.strokeWidth || 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    );
  }

  if (layer.kind === "image") {
    if (!layer.src) {
      // Empty slot: dotted outline and an upload mark, until something lands on it.
      return (
        <div
          style={{
            ...box,
            borderRadius: layer.radius,
            border: `3px dotted ${layer.fill}`,
            display: "grid",
            placeItems: "center",
            opacity: (layer.opacity ?? 1) * 0.75,
          }}
        >
          <svg
            width={Math.max(48, Math.min(layer.w, layer.h) * 0.22)}
            viewBox="0 0 24 24"
            fill="none"
            stroke={layer.fill}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M3 15v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3" />
          </svg>
        </div>
      );
    }
    return (
      <img
        src={layer.src}
        alt=""
        style={{ ...box, objectFit: layer.fit ?? "cover", borderRadius: layer.radius }}
      />
    );
  }

  const stroked = Boolean(layer.stroke) && layer.strokeWidth > 0;
  const paint: CSSProperties = layer.gradient
    ? { backgroundImage: gradientCss(layer.gradient) }
    : { background: layer.fill === "none" ? "transparent" : layer.fill };

  if (layer.kind === "triangle") {
    // The one shape a border cannot follow, so it stays SVG — and SVG needs the ramp
    // as a paint server rather than as CSS.
    const id = `g-${layer.id}`;
    const g = layer.gradient;
    return (
      <svg style={box} viewBox="0 0 100 100" preserveAspectRatio="none">
        {g ? (
          <defs>
            {g.kind === "radial" ? (
              <radialGradient id={id} cx={`${g.cx * 100}%`} cy={`${g.cy * 100}%`} r="70%">
                {g.stops.map((st, i) => (
                  <stop key={i} offset={`${st.at * 100}%`} stopColor={st.colour} />
                ))}
              </radialGradient>
            ) : (
              // SVG has no conic ramp; a conic falls back to linear here.
              <linearGradient id={id} gradientTransform={`rotate(${g.angle - 90} 0.5 0.5)`}>
                {g.stops.map((st, i) => (
                  <stop key={i} offset={`${st.at * 100}%`} stopColor={st.colour} />
                ))}
              </linearGradient>
            )}
          </defs>
        ) : null}
        <polygon
          points="50,0 100,100 0,100"
          fill={g ? `url(#${id})` : layer.fill === "none" ? "none" : layer.fill}
          stroke={stroked ? layer.stroke! : "none"}
          strokeWidth={layer.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  // rect, line and ellipse are all a box — ellipse is just a fully rounded one,
  // which keeps gradients and borders working on it without a paint server.
  return (
    <div
      style={{
        ...box,
        ...paint,
        borderRadius: layer.kind === "ellipse" ? "50%" : layer.radius,
        border: stroked ? `${layer.strokeWidth}px solid ${layer.stroke}` : undefined,
      }}
    />
  );
}
