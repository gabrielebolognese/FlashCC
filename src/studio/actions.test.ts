import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ACTIONS, actionForKey, FAMILIES, isKnownAction, KEY_TABLE, rankItems, withRecent, type KeyLike } from "./actions.js";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("the keyboard map (24.3)", () => {
  it("maps every key the roadmap's table names", () => {
    expect(actionForKey(key("n"), false)).toBe("new-slide");
    expect(actionForKey(key("d"), false)).toBe("duplicate-slide");
    expect(actionForKey(key("ArrowUp", { metaKey: true, shiftKey: true }), false)).toBe("move-slide-earlier");
    expect(actionForKey(key("ArrowDown", { ctrlKey: true, shiftKey: true }), false)).toBe("move-slide-later");
    expect(actionForKey(key("/"), false)).toBe("insert-block");
    expect(actionForKey(key("l"), false)).toBe("next-layout");
    expect(actionForKey(key("L", { shiftKey: true }), false)).toBe("previous-layout");
    expect(actionForKey(key("r"), false)).toBe("rewrite-text");
    expect(actionForKey(key("t"), false)).toBe("tidy");
    expect(actionForKey(key("m"), false)).toBe("match");
    expect(actionForKey(key("o"), false)).toBe("outline");
    expect(actionForKey(key("g"), false)).toBe("group");
    expect(actionForKey(key("G", { shiftKey: true }), false)).toBe("ungroup");
    expect(actionForKey(key("e", { metaKey: true }), false)).toBe("export-last");
    expect(actionForKey(key("?", { shiftKey: true }), false)).toBe("shortcuts");
    expect(actionForKey(key("k", { metaKey: true }), false)).toBe("palette");
  });

  it("never fires a single-letter key while a text field has focus", () => {
    for (const k of ["n", "d", "l", "r", "t", "m", "o", "g", "v", "i", "/", "?", "L", "G", "T"]) {
      expect(actionForKey(key(k, { shiftKey: k !== k.toLowerCase() || k === "?" }), true)).toBeNull();
    }
  });

  it("leaves a text field its own editing keys, but ⌘K and ⌘E work anywhere", () => {
    expect(actionForKey(key("z", { metaKey: true }), true)).toBeNull();
    expect(actionForKey(key("ArrowUp", { metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(actionForKey(key("k", { metaKey: true }), true)).toBe("palette");
    expect(actionForKey(key("e", { ctrlKey: true }), true)).toBe("export-last");
  });

  it("does not take the browser's or the canvas's own combinations", () => {
    // ⌘D duplicates a layer on the canvas; D alone is the slide.
    expect(actionForKey(key("d", { metaKey: true }), false)).toBeNull();
    expect(actionForKey(key("n", { altKey: true }), false)).toBeNull();
    expect(actionForKey(key("ArrowLeft"), false)).toBeNull();
  });

  it("the drawing tools moved to Shift, because their letters are the map's", () => {
    expect(actionForKey(key("T", { shiftKey: true }), false)).toBe("tool-text");
    expect(actionForKey(key("R", { shiftKey: true }), false)).toBe("tool-rect");
    expect(actionForKey(key("O", { shiftKey: true }), false)).toBe("tool-ellipse");
    expect(actionForKey(key("v"), false)).toBe("tool-select");
  });

  it("prints one row per key on ?", () => {
    const keys = KEY_TABLE.map((r) => r.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(KEY_TABLE.length).toBeGreaterThanOrEqual(13);
  });
});

describe("the palette's ranking", () => {
  const items = [
    { id: "tidy", label: "Tidy slide", group: "Slide" },
    { id: "export", label: "Export", group: "Export", also: "download pdf" },
    { id: "export:linkedin", label: "Export for LinkedIn", group: "Export" },
    { id: "insert-block:stat", label: "Insert Big number", group: "Insert" },
  ];

  it("finds by any word of the label, the group or the extra words", () => {
    expect(rankItems(items, "pdf").map((i) => i.id)).toEqual(["export"]);
    expect(rankItems(items, "export link").map((i) => i.id)).toEqual(["export:linkedin"]);
    expect(rankItems(items, "big num").map((i) => i.id)).toEqual(["insert-block:stat"]);
  });

  it("ranks a label that starts with the word first", () => {
    expect(rankItems(items, "export")[0]!.id).toBe("export");
  });

  it("puts recent actions first when nothing is typed, most recent first", () => {
    const recent = withRecent(withRecent([], "tidy"), "export:linkedin");
    expect(rankItems(items, "", recent).map((i) => i.id).slice(0, 2)).toEqual(["export:linkedin", "tidy"]);
  });
});

/* ── 24.2 done-when: every button's action is in the palette ────────────── */

const SCANNED = ["Studio.tsx", "Toolbar.tsx", "Filmstrip.tsx", "Properties.tsx"];
const BUTTONS = ["button", "Button", "IconButton", "Arrange", "SetButton", "MiniButton"];

/** Every opening tag of a button-like element, attributes and all, braces respected. */
function buttonTags(src: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(${BUTTONS.join("|")})(?=[\\s>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe("the action registry (24.2)", () => {
  for (const file of SCANNED) {
    const src = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    const tags = buttonTags(src);

    it(`${file}: every button names its action, or says it is a value control`, () => {
      expect(tags.length).toBeGreaterThan(0);
      const bare = tags.filter((t) => !/\b(data-action|action)=/.test(t) && !/\b(data-control|control)\b/.test(t));
      // A failure here is a button the palette cannot reach: give it a
      // data-action from actions.ts, or data-control if it sets a value.
      expect(bare).toEqual([]);
    });

    it(`${file}: every action a button names is one the palette lists`, () => {
      const named = tags.flatMap((t) => {
        const literal = t.match(/\b(?:data-action|action)="([^"]+)"/);
        if (literal) return [literal[1]!];
        const template = t.match(/\b(?:data-action|action)=\{`([a-z-]+):\$\{/);
        if (template) return [`${template[1]}:x`];
        return [];
      });
      expect(named.filter((id) => !isKnownAction(id))).toEqual([]);
    });
  }

  it("lists every registered action in the palette, with a label and a group", () => {
    for (const [id, def] of Object.entries(ACTIONS)) {
      expect(def.label, id).toBeTruthy();
      expect(def.group, id).toBeTruthy();
    }
    expect(Object.keys(FAMILIES)).toEqual(expect.arrayContaining(["insert-block", "brand", "format", "export", "open"]));
  });

  it("knows a family action by its prefix, and nothing else", () => {
    expect(isKnownAction("export:linkedin")).toBe(true);
    expect(isKnownAction("tidy")).toBe(true);
    expect(isKnownAction("tidyy")).toBe(false);
    expect(isKnownAction("nope:x")).toBe(false);
  });
});
