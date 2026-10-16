import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { destinationFor } from "./destinations.js";
import { makeDoc } from "./model.js";
import { bundleZip, threadZip } from "./packing.js";
import { platformById } from "./platforms.js";

/** What the server sends for an image export: 01.jpg to NN.jpg, maybe alt.txt. */
async function serverZip(count: number, alt = false): Promise<Blob> {
  const zip = new JSZip();
  for (let i = 1; i <= count; i += 1) zip.file(`${String(i).padStart(2, "0")}.jpg`, `slide ${i}`);
  if (alt) zip.file("alt.txt", "01.jpg  hello\n");
  return zip.generateAsync({ type: "blob" });
}

const files = (zip: JSZip): string[] =>
  Object.keys(zip.files)
    .filter((n) => !zip.files[n]!.dir)
    .sort();

describe("threadZip", () => {
  it("makes a folder per post, 4, 4 and 2, with each post's line beside it", async () => {
    const zip = await threadZip(await serverZip(10, true), 4, ["1/3 one", "2/3 two", "3/3 three"]);
    const names = files(zip);
    expect(names).toContain("post-1-of-3/post-1-slide-4.jpg");
    expect(names).toContain("post-3-of-3/post-3-slide-2.jpg");
    expect(names).not.toContain("post-3-of-3/post-3-slide-3.jpg");
    expect(names).toContain("alt.txt");
    expect(await zip.file("post-2-of-3/caption.txt")!.async("string")).toBe("2/3 two\n");
    // The bytes move with the name: slide 5 is post 2's first image.
    expect(await zip.file("post-2-of-3/post-2-slide-1.jpg")!.async("string")).toBe("slide 5");
  });
});

describe("bundleZip", () => {
  it("puts each destination in its own folder, and never a zip inside a zip", async () => {
    const doc = makeDoc("T");
    const pdf = new Blob(["%PDF"], { type: "application/pdf" });
    const zip = await bundleZip([
      { destination: destinationFor(platformById("linkedin"), doc), filename: "t.pdf", blob: pdf },
      { destination: destinationFor(platformById("tiktok"), doc), filename: "t.zip", blob: await serverZip(3) },
      {
        destination: destinationFor(platformById("x"), doc),
        filename: "t.zip",
        blob: await serverZip(5),
        lines: ["1/2 a", "2/2 b"],
      },
    ]);

    const names = files(zip);
    expect(names).toContain("linkedin/t.pdf");
    expect(names).toContain("tiktok/03.jpg");
    expect(names).toContain("x/post-2-of-2/post-2-slide-2.jpg");
    expect(names).toContain("x/post-1-of-2/caption.txt");
    expect(names.some((n) => n.endsWith(".zip"))).toBe(false);
  });
});
