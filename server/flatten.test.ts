/**
 * `/api/flatten` (31.6): a flattened piece is the renderer's own pixels, cut
 * to the area it paints, on a transparent ground so it sits over whatever is
 * beneath it in the .pptx. Rendered for real; skipped where no Chromium runs.
 */
import { afterAll, describe, expect, it } from "vitest";

import { boardClip, flattenPieces } from "./flatten.js";
import { closeBrowser, getBrowser } from "./render.js";

let canRender = true;
try {
  await getBrowser();
} catch {
  canRender = false;
}
afterAll(async () => {
  await closeBrowser();
});

/** Width, height and colour type straight from a PNG's header. */
const header = (b64: string) => {
  const b = Buffer.from(b64, "base64");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colourType: b[25] };
};

describe("flattening (31.6)", () => {
  it("keeps a clip on the board, in whole pixels", () => {
    expect(boardClip({ x: -10.5, y: 5.2, w: 40, h: 20 }, 100, 100)).toEqual({ x: 0, y: 5, w: 30, h: 21 });
    expect(boardClip({ x: 200, y: 0, w: 10, h: 10 }, 100, 100)).toBeNull();
    expect(boardClip(undefined, 100, 100)).toBeNull();
  });

  it("returns each piece as a transparent PNG the size of its clip", async (ctx) => {
    if (!canRender) return ctx.skip();
    const html = '<div style="position:absolute; inset:0; background-color: transparent"><div style="position:absolute;left:20px;top:30px;width:40px;height:10px;background:#ff0000"></div></div>';
    const [png, gone] = await flattenPieces({
      css: "",
      width: 200,
      height: 100,
      pieces: [
        { html, clip: { x: 10, y: 20, w: 60, h: 30 } },
        { html, clip: { x: 500, y: 0, w: 10, h: 10 } },
      ],
    });
    expect(gone).toBeNull();
    // RGBA: the ground around the shape stays see-through.
    expect(header(png!)).toEqual({ w: 60, h: 30, colourType: 6 });
  });
});

describe("flattening fetches nothing", () => {
  it("refuses a request the posted markup makes", async (ctx) => {
    if (!canRender) return ctx.skip();
    const { createServer } = await import("node:http");
    let hits = 0;
    const srv = createServer((_q, r) => {
      hits += 1;
      r.end("x");
    });
    await new Promise<void>((ok) => srv.listen(0, ok));
    const port = (srv.address() as { port: number }).port;
    try {
      await flattenPieces({ css: "", width: 100, height: 100, pieces: [{ html: `<img src="http://127.0.0.1:${port}/probe.png">`, clip: { x: 0, y: 0, w: 10, h: 10 } }] });
      expect(hits).toBe(0);
    } finally {
      srv.close();
    }
  });
});
