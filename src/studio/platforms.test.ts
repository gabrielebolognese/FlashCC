import { describe, expect, it } from "vitest";

import {
  CANDIDATES,
  gridCrop,
  platformAudit,
  platformById,
  platformForSize,
  PLATFORMS,
  shapeOf,
} from "./platforms.js";

describe("the platform table", () => {
  it("ships only rows somebody verified", () => {
    for (const p of PLATFORMS) {
      expect(p.verified, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sources.length, p.id).toBeGreaterThan(0);
    }
    // Facebook is in the table and not in the product, by the table's own rule.
    expect(CANDIDATES.some((p) => p.id === "facebook")).toBe(true);
    expect(PLATFORMS.some((p) => p.id === "facebook")).toBe(false);
  });

  it("keeps the default size and the first shape in step", () => {
    for (const p of CANDIDATES) {
      expect(p.shapes[0], p.id).toMatchObject({ w: p.w, h: p.h });
      expect(new Set(p.shapes.map((s) => `${s.w}x${s.h}`)).size, p.id).toBe(p.shapes.length);
    }
  });

  it("finds the platform an artboard belongs to, defaults first", () => {
    expect(platformForSize(1080, 1350)?.id).toBe("linkedin");
    expect(platformForSize(1080, 1440)?.id).toBe("instagram");
    expect(platformForSize(1080, 1920)?.id).toBe("tiktok");
    expect(platformForSize(1000, 1500)?.id).toBe("pinterest");
    expect(platformForSize(777, 777)).toBeUndefined();
  });

  it("marks Instagram 3:4 as app-only and nothing else", () => {
    const ig = platformById("instagram");
    expect(shapeOf(ig, 1080, 1440)?.api).toBe(false);
    expect(shapeOf(ig, 1080, 1350)?.api).toBeUndefined();
    const appOnly = CANDIDATES.flatMap((p) => p.shapes.filter((s) => s.api === false));
    expect(appOnly).toHaveLength(1);
  });

  it("splits four-image destinations into posts and nothing else", () => {
    expect(PLATFORMS.filter((p) => p.perPost !== undefined).map((p) => p.id).sort()).toEqual([
      "bluesky",
      "x",
    ]);
  });
});

describe("gridCrop", () => {
  it("cuts the sides of anything wider than the tile", () => {
    expect(gridCrop(3 / 4, 1080, 1350)).toEqual({ x: 33.75, y: 0, w: 1012.5, h: 1350 });
  });

  it("cuts the top and bottom of anything taller", () => {
    expect(gridCrop(3 / 4, 1080, 1920)).toEqual({ x: 0, y: 240, w: 1080, h: 1440 });
  });

  it("cuts nothing at the tile's own ratio", () => {
    expect(gridCrop(3 / 4, 1080, 1440)).toEqual({ x: 0, y: 0, w: 1080, h: 1440 });
  });
});

describe("platformAudit", () => {
  const today = new Date("2026-10-16T12:00:00Z");

  it("names rows older than the limit, and the ones never checked", () => {
    const rows = [
      { ...platformById("linkedin"), verified: "2026-01-01" },
      { ...platformById("instagram"), verified: "2026-10-01" },
      { ...platformById("tiktok"), verified: null },
    ];
    const audit = platformAudit(rows, today);
    expect(audit.stale).toEqual([{ id: "linkedin", days: 288 }]);
    expect(audit.unverified).toEqual(["tiktok"]);
  });

  it("is quiet the day the table ships", () => {
    expect(platformAudit(PLATFORMS, today)).toEqual({ stale: [], unverified: [] });
  });
});
