import type { CSSProperties } from "react";

import { ICON_PATHS, ICON_VIEWBOX } from "../render/icons.js";
import { gradientCss } from "./gradient.js";
import { filterCss, focalPosition, maskClip } from "./imagetools.js";
import { boldWeight, hasMarks, parseMarks } from "./marks.js";
import { blockStyle, lineStyle, markStyle } from "./texteffects.js";
import { isMeasured as isBundled } from "./typemetrics.js";
import { fontStack, type Layer } from "./model.js";

/** Paints one layer. Pure, no interaction, no selection chrome. */
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
      // Start and end rather than left and right, with `dir="auto"` below: a
      // Hebrew or Arabic line aligns to its own start (22.5), and every Latin
      // line still aligns exactly where it did.
      textAlign: layer.align === "right" ? "end" : layer.align === "center" ? "center" : "start",
      // A bundled face is measured at the weight it ships (22.2). Faux bold
      // would draw a weight nothing measured, so only italic may be synthesised.
      ...(isBundled(layer.fontFamily) ? { fontSynthesis: "style" } : {}),
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
      ...blockStyle(layer),
    };

    if (editing && onCommitText) {
      return (
        <div
          dir="auto"
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
    // The marks and the whole-line effects (22.3, 22.4). A plain layer keeps
    // the bare text node it always had, so nothing that rendered before
    // renders any differently now.
    const text = layer.text ?? "";
    const runs = hasMarks(text) ? parseMarks(text) : null;
    const line = lineStyle(layer, Boolean(runs?.some((r) => r.mark)));
    if (!runs && !line) {
      return (
        <div dir="auto" style={style}>
          {text}
        </div>
      );
    }
    const boldAt = boldWeight(layer.fontWeight ?? 600);
    const content = runs
      ? runs.map((r, i) =>
          r.mark ? (
            <span key={i} style={markStyle(r.mark, layer, boldAt)}>
              {r.text}
            </span>
          ) : (
            r.text
          ),
        )
      : text;
    // One block child: the container is a flex column, and loose spans in it
    // would each become a flex item stacked on its own line.
    return (
      <div dir="auto" style={style}>
        <div>{line ? <span style={line}>{content}</span> : content}</div>
      </div>
    );
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

  if (layer.kind === "path") {
    if (!layer.path) return null;
    const stroked = Boolean(layer.stroke) && layer.strokeWidth > 0;
    return (
      <svg
        style={{
          ...box,
          ...(layer.shadow
            ? { filter: `drop-shadow(0 ${layer.shadow.y}px ${layer.shadow.blur / 2}px ${layer.shadow.colour})` }
            : {}),
        }}
        viewBox={`0 0 ${layer.pathW ?? layer.w} ${layer.pathH ?? layer.h}`}
        preserveAspectRatio="none"
      >
        <path
          d={layer.path}
          fill={layer.fill === "none" ? "none" : layer.fill}
          fillRule="evenodd"
          stroke={stroked ? layer.stroke! : "none"}
          strokeWidth={layer.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect={layer.scaleStroke ? undefined : "non-scaling-stroke"}
        />
      </svg>
    );
  }

  const shadow = layer.shadow
    ? `0 ${layer.shadow.y}px ${layer.shadow.blur}px ${layer.shadow.colour}`
    : undefined;

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
    const position = layer.focal ? focalPosition(layer.focal) : undefined;
    if (!layer.mask && !layer.filter) {
      return (
        <img
          src={layer.src}
          alt=""
          style={{
            ...box,
            objectFit: layer.fit ?? "cover",
            objectPosition: position,
            borderRadius: layer.radius,
            boxShadow: shadow,
          }}
        />
      );
    }

    // A mask or a filter (21.4). The shadow moves to a drop-shadow on the
    // wrapper, because a clip-path clips a box-shadow away and a drop-shadow
    // follows the clipped shape. Duotone is painted with blend modes rather
    // than an SVG filter: no element ids, so a slide painted twice on one page
    // (canvas and filmstrip) cannot pick up the other copy's definition.
    const clip = layer.mask ? maskClip(layer.mask, layer.w, layer.h, layer.id) : undefined;
    const duo = layer.filter?.kind === "duotone" ? layer.filter : null;
    const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
    return (
      <div
        style={{
          ...box,
          filter: layer.shadow ? `drop-shadow(0 ${layer.shadow.y}px ${layer.shadow.blur / 2}px ${layer.shadow.colour})` : undefined,
        }}
      >
        <div
          style={{
            ...fill,
            overflow: "hidden",
            clipPath: clip,
            borderRadius: clip ? undefined : layer.radius,
            isolation: "isolate",
            background: duo ? duo.light : undefined,
          }}
        >
          <img
            src={layer.src}
            alt=""
            style={{
              ...fill,
              objectFit: layer.fit ?? "cover",
              objectPosition: position,
              filter: filterCss(layer.filter),
              mixBlendMode: duo ? "multiply" : undefined,
            }}
          />
          {duo ? <div style={{ ...fill, background: duo.dark, mixBlendMode: "lighten" }} /> : null}
        </div>
      </div>
    );
  }

  const stroked = Boolean(layer.stroke) && layer.strokeWidth > 0;
  const paint: CSSProperties = layer.gradient
    ? { backgroundImage: gradientCss(layer.gradient) }
    : { background: layer.fill === "none" ? "transparent" : layer.fill };

  if (layer.kind === "triangle") {
    // The one shape a border cannot follow, so it stays SVG, and SVG needs the ramp
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

  // rect, line and ellipse are all a box, ellipse is just a fully rounded one,
  // which keeps gradients and borders working on it without a paint server.
  return (
    <div
      style={{
        ...box,
        ...paint,
        borderRadius: layer.kind === "ellipse" ? "50%" : layer.radius,
        border: stroked ? `${layer.strokeWidth}px solid ${layer.stroke}` : undefined,
        boxShadow: shadow,
      }}
    />
  );
}
