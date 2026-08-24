/**
 * v1 → v2 migration. Pure, Node-testable.
 *
 * Without this, bumping the version silently bricks every saved carousel: persist's
 * load gate returns null for an unknown version, and Home treats null as "the card
 * does nothing". docs/template-system.md §8.
 */
import { MARGIN, type BackgroundSpec, type MarginStep, type Template } from "./template.js";
import { ANCHORED } from "./templates/starters.js";
import type { BrandKit, FlashCCDocument } from "./types.js";

type V1BrandKit = {
  palette?: { background?: string; text?: string; accent?: string; muted?: string };
  type?: BrandKit["type"];
  handle?: string;
  handlePlacement?: string;
  background?: { kind?: string; to?: string; angle?: number; opacity?: number };
  safeMargin?: number;
};

const nearestMargin = (v: number): MarginStep => {
  let best: MarginStep = "default";
  let bestD = Infinity;
  for (const key of Object.keys(MARGIN) as MarginStep[]) {
    const d = Math.abs(MARGIN[key] - v);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
};

/** A v1 kit could carry fields the v2 interpreter would read as undefined. */
export function migrateBrandKit(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== "object") return null;
  const k = raw as V1BrandKit;
  if (!k.palette?.background || !k.palette.text || !k.palette.accent || !k.palette.muted) return null;
  if (!k.type?.display || !k.type.body) return null;
  return {
    palette: {
      background: k.palette.background,
      text: k.palette.text,
      accent: k.palette.accent,
      muted: k.palette.muted,
    },
    type: k.type,
    handle: k.handle ?? "",
  };
}

/** Fold the three v1 brand-kit fields that were really structure into a template. */
function templateFromV1(kit: V1BrandKit): Template {
  const margin = nearestMargin(kit.safeMargin ?? 0.075);
  const bg = kit.background ?? { kind: "solid" };

  let background: BackgroundSpec = { fill: "bg", treatment: { kind: "flat" } };
  if (bg.kind === "gradient") {
    background = { fill: "bg", treatment: { kind: "gradient", to: "muted", angle: 135 } };
  } else if (bg.kind === "grid") {
    background = { fill: "bg", treatment: { kind: "grid", cell: 9, weight: 0, intensity: 2 } };
  }

  const handleRight = kit.handlePlacement?.endsWith("right") ?? false;
  const handleOff = kit.handlePlacement === "none";

  const roles = { ...ANCHORED.roles };
  if (handleOff || handleRight) {
    for (const key of Object.keys(roles) as (keyof typeof roles)[]) {
      const r = roles[key];
      roles[key] = {
        ...r,
        regions: {
          ...r.regions,
          bottomRail: {
            ...r.regions.bottomRail,
            members: handleOff
              ? r.regions.bottomRail.members.filter((m) => m !== "handle")
              : r.regions.bottomRail.members,
            align: handleRight ? "right" : r.regions.bottomRail.align,
          },
        },
      };
    }
  }

  return {
    ...ANCHORED,
    id: "tpl_migrated",
    name: "Anchored",
    origin: { kind: "user", from: ANCHORED.id },
    page: { ...ANCHORED.page, grid: { ...ANCHORED.page.grid, margin }, background },
    roles,
  };
}

export function migrateDocument(raw: unknown): FlashCCDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Omit<Partial<FlashCCDocument>, "version"> & { version?: number; brandKit?: unknown };

  if (!doc.id || !Array.isArray(doc.slides)) return null;

  if (doc.version === 2 && doc.template && doc.brandKit) {
    return doc as FlashCCDocument;
  }

  if (doc.version === 1) {
    const kit = migrateBrandKit(doc.brandKit);
    if (!kit) return null;
    return {
      version: 2,
      id: doc.id,
      name: doc.name ?? "Untitled",
      format: doc.format ?? "portrait-4x5",
      granularity: doc.granularity ?? "balanced",
      source: doc.source ?? "",
      brandKit: kit,
      template: templateFromV1(doc.brandKit as V1BrandKit),
      slides: doc.slides,
      createdAt: doc.createdAt ?? new Date().toISOString(),
      updatedAt: doc.updatedAt ?? new Date().toISOString(),
    };
  }

  return null;
}
