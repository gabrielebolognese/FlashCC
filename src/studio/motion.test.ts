import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeLayer, type Slide } from "./model.js";
import {
  COUNT_JS,
  countAt,
  entrancesFor,
  formulaSeconds,
  FPS,
  letterbox,
  movingFrames,
  planVideo,
  slideFrames,
  TRANSITION_FRAMES,
  wordsOn,
  wrapEntrance,
} from "./motion.js";
import { styleById } from "./styles.js";

const text = (t: string, extra = {}) => ({ ...makeLayer("text", { x: 0, y: 0, w: 800, h: 200 }, "#fff"), text: t, fontSize: 48, ...extra });
const slide = (...texts: string[]): Slide => ({ id: "s", name: "s", background: "#000", layers: texts.map((t) => text(t)) });

describe("how long a slide holds (26.1)", () => {
  it("is a floor of 2 seconds plus 3.5 words a second, capped at 6", () => {
    expect(formulaSeconds(0, 3, 9)).toBe(2);
    expect(formulaSeconds(7, 3, 9)).toBe(4);
    expect(formulaSeconds(100, 3, 9)).toBe(6);
  });

  it("gives the cover half a second more and the call to action a second more, past the cap", () => {
    expect(formulaSeconds(100, 0, 9)).toBe(6.5);
    expect(formulaSeconds(100, 8, 9)).toBe(7);
    expect(formulaSeconds(0, 0, 1)).toBe(2.5);
  });

  it("counts the words a reader reads: marks stripped, furniture and hidden layers left out", () => {
    const s = slide("Cut on *movement*, not the beat.", "two words");
    s.layers.push(text("3 / 9", { furniture: "counter" }), text("hidden words here", { visible: false }));
    expect(wordsOn(s)).toBe(8);
  });

  it("a slide's own hold wins, the formula otherwise, in whole frames", () => {
    expect(slideFrames(slide("one two three four five six seven"), 2, 9)).toBe(4 * FPS);
    expect(slideFrames({ ...slide("x"), hold: 3.3 }, 2, 9)).toBe(99);
  });
});

describe("the plan", () => {
  it("26.1 done-when: each slide's span is its duration to the frame, and the runtime is their sum", () => {
    const deck = buildSlides(
      Array.from({ length: 9 }, (_, i) => `Slide ${i + 1} says ${"a few more words ".repeat(i % 4)}`),
      styleById("ink").theme,
    );
    const frames = deck.map((s, i) => slideFrames(s, i, deck.length));
    const plan = planVideo(frames, "push");
    plan.slides.forEach((p, i) => {
      expect(p.frames).toBe(Math.round(formulaSeconds(wordsOn(deck[i]!), i, 9) * FPS));
      expect(p.start).toBe(frames.slice(0, i).reduce((a, b) => a + b, 0));
    });
    expect(plan.frames).toBe(frames.reduce((a, b) => a + b, 0));
    expect(plan.slides.at(-1)!.out).toBe(0);
    expect(plan.slides[0]!.out).toBe(TRANSITION_FRAMES);
  });

  it("a cut has no transition frames; a transition never takes more than half a slide", () => {
    expect(planVideo([60, 60], "cut").slides.map((s) => s.out)).toEqual([0, 0]);
    expect(planVideo([10, 60], "fade").slides[0]!.out).toBe(5);
  });
});

describe("the shape of the video (26.2)", () => {
  it("letterboxes a 4:5 slide into 9:16 centred, as large as fits", () => {
    expect(letterbox({ w: 1080, h: 1350 }, { w: 1080, h: 1920 })).toEqual({ x: 0, y: 285, w: 1080, h: 1350 });
    expect(letterbox({ w: 1080, h: 1350 }, { w: 1920, h: 1080 })).toEqual({ x: 528, y: 0, w: 864, h: 1080 });
  });
});

describe("entrances (26.3)", () => {
  it("by role: the headline rises, the body fades, a number counts", () => {
    const s = slide("Body copy under it.", "73%");
    s.layers.unshift(text("The headline", { fontSize: 80 }));
    const e = entrancesFor(s, "entrances");
    const kinds = s.layers.map((l) => e.get(l.id)?.kind);
    expect(kinds).toEqual(["rise", "fade", "count"]);
  });

  it("a list block's items arrive in order", () => {
    const s: Slide = {
      id: "s",
      name: "s",
      background: "#000",
      layers: [1, 2, 3].map((n) => text(`Item ${n}`, { block: { block: "checklist", instance: "b", part: `Item ${n}` } })),
    };
    const delays = s.layers.map((l) => entrancesFor(s, "entrances").get(l.id));
    expect(delays.map((d) => d?.kind)).toEqual(["item", "item", "item"]);
    expect(delays[0]!.delay).toBeLessThan(delays[1]!.delay);
    expect(delays[1]!.delay).toBeLessThan(delays[2]!.delay);
  });

  it("draws a highlighted word on after its line arrives", () => {
    const s = slide("A ==marked== word.");
    const e = entrancesFor(s, "entrances");
    const mark = e.get(`${s.layers[0]!.id}#mark`)!;
    expect(mark.kind).toBe("highlight");
    expect(mark.delay).toBeGreaterThan(0);
  });

  it("none moves nothing, and a still slide needs one screenshot", () => {
    expect(entrancesFor(slide("x", "y"), "none").size).toBe(0);
    expect(movingFrames(entrancesFor(slide("x"), "none"))).toBe(0);
    expect(movingFrames(entrancesFor(slide("x", "y"), "fade"))).toBe(Math.ceil(0.6 * FPS) + 1);
  });

  it("never moves shapes, pictures or furniture", () => {
    const s = slide("Words");
    s.layers.push({ ...makeLayer("rect", { x: 0, y: 0, w: 10, h: 10 }, "#f00") }, text("3 / 9", { furniture: "counter" }));
    const e = entrancesFor(s, "entrances");
    expect(e.has(s.layers[1]!.id)).toBe(false);
    expect(e.has(s.layers[2]!.id)).toBe(false);
  });
});

describe("counting up", () => {
  const cases = ["73%", "3x", "61K", "$1,200", "04", "2.5x", "-12", "1,000,000 views"];
  it("keeps the digits' shape at every point", () => {
    expect(countAt("73%", 1)).toBe("73%");
    expect(countAt("73%", 0)).toBe("0%");
    expect(countAt("$1,200", 1)).toBe("$1,200");
    expect(countAt("$1,200", 0.5)).toBe("$1,050");
    expect(countAt("04", 0)).toBe("00");
    expect(countAt("2.5x", 1)).toBe("2.5x");
    expect(countAt("Not a number", 0.5)).toBe("Not a number");
  });

  it("the page's copy agrees with countAt everywhere", () => {
    const page = new Function(`return (${COUNT_JS});`)() as (t: string, p: number) => string;
    for (const c of cases) for (const p of [0, 0.1, 0.33, 0.5, 0.9, 1]) expect(page(c, p), `${c} @ ${p}`).toBe(countAt(c, p));
  });
});

describe("the entrance wrapper", () => {
  const markup = '<div style="position:absolute;left:90px">73%</div>';
  it("leaves a layer with no entrance exactly as LayerView drew it", () => {
    expect(wrapEntrance(markup, { text: "73%" }, undefined, undefined)).toBe(markup);
  });
  it("carries the timing inline and, for a count, the text it counts to", () => {
    const out = wrapEntrance(markup, { text: "*73%*" }, { kind: "count", delay: 0.1, duration: 0.8 }, undefined);
    expect(out).toContain('data-fcc-anim="count"');
    expect(out).toContain('data-fcc-count="73%"');
    expect(out).toContain('data-fcc-duration="0.8"');
    expect(out).toContain("animation-delay:0.1s");
    expect(out.endsWith(`${markup}</div>`)).toBe(true);
  });
  it("escapes what it puts in an attribute", () => {
    expect(wrapEntrance(markup, { text: '"9"' }, { kind: "count", delay: 0, duration: 1 }, undefined)).toContain('data-fcc-count="&quot;9&quot;"');
  });
  it("draws a highlight on through custom properties", () => {
    const out = wrapEntrance(markup, { text: "a ==b==" }, undefined, { kind: "highlight", delay: 0.5, duration: 0.5 });
    expect(out).toContain("data-fcc-mark");
    expect(out).toContain("--fcc-mark-at:0.5s");
    expect(out).not.toContain("data-fcc-anim");
  });
});
