/**
 * The extension's promises (31.4), checked: it asks for no host permission,
 * makes no network request, and hands over exactly the selected words in a
 * fragment the app reads back the same.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readHandoff } from "../src/studio/fileimport.js";
import { handoffUrl } from "./background.js";

const read = (f: string) => readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), "utf8");

describe("Send to FlashCC", () => {
  it("asks for the context menu and its own setting, nothing else", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["contextMenus", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it("makes no network request and reads no page", () => {
    for (const f of ["background.js", "options.js"]) {
      const code = read(f);
      expect(code, f).not.toMatch(/\bfetch\(|XMLHttpRequest|executeScript|sendBeacon|WebSocket/);
    }
  });

  it("hands over the selection in a fragment the app reads back word for word", () => {
    const text = "My own post, line one.\nAnd a second line with & and # in it.";
    const url = handoffUrl("https://flashcc.example/", "idea", text);
    expect(url.startsWith("https://flashcc.example/app#")).toBe(true);
    expect(readHandoff(new URL(url).hash)).toEqual({ kind: "idea", text });
    expect(readHandoff(new URL(handoffUrl("", "distil", "A paragraph")).hash)).toEqual({ kind: "distil", text: "A paragraph" });
  });
});
