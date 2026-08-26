/**
 * Gradients, for slide backgrounds and for text.
 *
 * Stored as data — type, angle, origin and an ordered list of stops — never as a CSS
 * string, so the same value can be painted as CSS, read back into the editor, and
 * carried in a style preset.
 */

export type GradientKind = "linear" | "radial" | "conic";

export type Stop = {
  colour: string;
  /** 0 to 1 along the ramp. */
  at: number;
};

export type Gradient = {
  kind: GradientKind;
  /** Degrees. Linear: direction. Conic: where the sweep starts. Unused by radial. */
  angle: number;
  /** Origin, 0 to 1 of the box. Radial and conic only. */
  cx: number;
  cy: number;
  stops: Stop[];
};

export const MIN_STOPS = 2;
export const MAX_STOPS = 8;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Stops are kept sorted; CSS reads them in order and out-of-order stops clamp. */
export const sortStops = (stops: Stop[]): Stop[] =>
  [...stops].sort((a, b) => a.at - b.at).map((s) => ({ ...s, at: clamp01(s.at) }));

export function makeGradient(
  colours: string[],
  kind: GradientKind = "linear",
  angle = 160,
): Gradient {
  const list = colours.length >= MIN_STOPS ? colours : [colours[0] ?? "#000000", "#ffffff"];
  return {
    kind,
    angle,
    cx: 0.5,
    cy: 0.5,
    stops: list.map((colour, i) => ({ colour, at: i / (list.length - 1) })),
  };
}

/** The CSS `background-image` value. */
export function gradientCss(g: Gradient): string {
  const stops = sortStops(g.stops)
    .map((s) => `${s.colour} ${Math.round(s.at * 1000) / 10}%`)
    .join(", ");
  const at = `${Math.round(g.cx * 100)}% ${Math.round(g.cy * 100)}%`;

  if (g.kind === "radial") return `radial-gradient(circle at ${at}, ${stops})`;
  if (g.kind === "conic") return `conic-gradient(from ${g.angle}deg at ${at}, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

/** Add a stop at a position, taking its colour from the ramp underneath it. */
export function addStop(g: Gradient, at: number): Gradient {
  if (g.stops.length >= MAX_STOPS) return g;
  return { ...g, stops: sortStops([...g.stops, { colour: sampleAt(g, at), at: clamp01(at) }]) };
}

export function removeStop(g: Gradient, index: number): Gradient {
  if (g.stops.length <= MIN_STOPS) return g;
  return { ...g, stops: g.stops.filter((_, i) => i !== index) };
}

export function setStop(g: Gradient, index: number, patch: Partial<Stop>): Gradient {
  return {
    ...g,
    stops: g.stops.map((s, i) => (i === index ? { ...s, ...patch, at: clamp01(patch.at ?? s.at) } : s)),
  };
}

/** The colour the ramp shows at a position — used when inserting a stop. */
export function sampleAt(g: Gradient, at: number): string {
  const stops = sortStops(g.stops);
  const t = clamp01(at);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return "#000000";
  if (t <= first.at) return first.colour;
  if (t >= last.at) return last.colour;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.at && t <= b.at) {
      const span = b.at - a.at;
      return span === 0 ? a.colour : mixHex(a.colour, b.colour, (t - a.at) / span);
    }
  }
  return last.colour;
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const n = Number.parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(a) as [number, number, number];
  const [r2, g2, b2] = parse(b) as [number, number, number];
  const to = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((to(r1, r2) << 16) | (to(g1, g2) << 8) | to(b1, b2)).toString(16).padStart(6, "0")}`;
}

/** The average of the ramp — a readable stand-in wherever one flat colour is needed. */
export function averageColour(g: Gradient): string {
  const stops = sortStops(g.stops);
  if (stops.length === 0) return "#000000";
  let acc = stops[0]!.colour;
  for (let i = 1; i < stops.length; i += 1) acc = mixHex(acc, stops[i]!.colour, 1 / (i + 1));
  return acc;
}

/** Ready-made ramps, so nobody has to build one from two colour wells to start. */
export const GRADIENT_PRESETS: { name: string; colours: string[]; kind?: GradientKind; angle?: number }[] = [
  { name: "Dusk", colours: ["#1e1b4b", "#7c3aed", "#db2777"] },
  { name: "Ember", colours: ["#450a0a", "#dc2626", "#f59e0b"] },
  { name: "Deep sea", colours: ["#082f49", "#0e7490", "#22d3ee"] },
  { name: "Moss", colours: ["#0b2818", "#15803d", "#a3e635"] },
  { name: "Sunrise", colours: ["#fef3c7", "#fb923c", "#e11d48"], angle: 200 },
  { name: "Paper", colours: ["#fdfcfb", "#e8e2d9"], angle: 180 },
  { name: "Ink", colours: ["#0b0d10", "#1e293b"], angle: 200 },
  { name: "Halo", colours: ["#312e81", "#0b1020"], kind: "radial" },
  { name: "Spectrum", colours: ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"], kind: "conic" },
  { name: "Steel", colours: ["#e2e8f0", "#94a3b8", "#475569"], angle: 135 },
];

export const presetGradient = (i: number): Gradient => {
  const p = GRADIENT_PRESETS[i] ?? GRADIENT_PRESETS[0]!;
  return makeGradient(p.colours, p.kind ?? "linear", p.angle ?? 160);
};

export const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
