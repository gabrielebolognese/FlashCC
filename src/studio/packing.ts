/**
 * Turning rendered files into the zip somebody actually posts from.
 *
 * Two jobs, both after the render and both in the browser, because the server
 * already does one thing well, one deck in, one file out, and both of these
 * are about arranging files rather than making them:
 *
 * - A four-image destination (X, Bluesky) gets a folder per post, with a
 *   `caption.txt` in each holding that post's line.
 * - Several destinations at once get one zip with a folder each.
 *
 * JSZip is already how the server builds the image zip, so the browser reads
 * the same format it was sent.
 */
import JSZip from "jszip";

import { postFileMap, type Destination, destinationFolder } from "./destinations.js";

const isImage = (name: string): boolean => /\.(jpe?g|png)$/i.test(name);

/**
 * One numbered image zip, regrouped into posts.
 *
 * `alt.txt` stays at the top: it is numbered by slide, and splitting it would
 * be a second numbering for the same images.
 */
export async function threadZip(
  blob: Blob,
  perPost: number,
  lines: readonly string[],
): Promise<JSZip> {
  const source = await JSZip.loadAsync(blob);
  const names = Object.keys(source.files).filter(isImage).sort();
  const ext = names[0]?.split(".").pop() ?? "jpg";
  const map = postFileMap(names.length, perPost, ext);

  const out = new JSZip();
  for (const name of Object.keys(source.files)) {
    const entry = source.files[name];
    if (!entry || entry.dir) continue;
    const bytes = await entry.async("uint8array");
    out.file(map.get(name) ?? name, bytes);
  }

  const posts = new Set([...map.values()].map((p) => p.split("/")[0]!));
  [...posts].forEach((folder, i) => {
    const line = lines[i]?.trim();
    if (line) out.file(`${folder}/caption.txt`, `${line}\n`);
  });

  return out;
}

export async function zipBlob(zip: JSZip): Promise<Blob> {
  // Store, not deflate, for the same reason the server stores: the images are
  // already compressed.
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

/**
 * Several rendered destinations, one zip, a folder each.
 *
 * A PDF goes in as itself. An image zip is unpacked into its folder rather
 * than nested, because a zip inside a zip is the thing nobody can open on a
 * phone.
 */
export async function bundleZip(
  files: readonly { destination: Destination; filename: string; blob: Blob; lines?: readonly string[] | undefined }[],
): Promise<JSZip> {
  const out = new JSZip();

  for (const f of files) {
    const folder = destinationFolder(f.destination);
    if (f.destination.platform.output === "pdf") {
      out.file(`${folder}/${f.filename}`, await f.blob.arrayBuffer());
      continue;
    }

    const perPost = f.destination.platform.perPost;
    const inner = perPost ? await threadZip(f.blob, perPost, f.lines ?? []) : await JSZip.loadAsync(f.blob);
    for (const name of Object.keys(inner.files)) {
      const entry = inner.files[name];
      if (!entry || entry.dir) continue;
      out.file(`${folder}/${name}`, await entry.async("uint8array"));
    }
  }

  return out;
}

/**
 * A language set (Batch 29), one zip, a folder per language: `de/`, `ja/`,
 * `original/`. Each folder holds that deck's files as its destination would
 * (a PDF as itself, numbered images unpacked), and its own caption and alt
 * text, written from that language's slides.
 */
export async function languageZip(
  files: readonly { folder: string; filename: string; blob: Blob; pdf: boolean; caption?: string | undefined; alt?: string | undefined }[],
): Promise<JSZip> {
  const out = new JSZip();
  for (const f of files) {
    if (f.pdf) {
      out.file(`${f.folder}/${f.filename}`, await f.blob.arrayBuffer());
    } else {
      const inner = await JSZip.loadAsync(f.blob);
      for (const name of Object.keys(inner.files)) {
        const entry = inner.files[name];
        if (!entry || entry.dir) continue;
        out.file(`${f.folder}/${name}`, await entry.async("uint8array"));
      }
    }
    if (f.caption?.trim()) out.file(`${f.folder}/caption.txt`, `${f.caption.trim()}\n`);
    if (f.alt?.trim()) out.file(`${f.folder}/alt.txt`, `${f.alt.trim()}\n`);
  }
  return out;
}
