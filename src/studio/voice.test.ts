import { describe, expect, it } from "vitest";

import {
  contextVoice,
  hasVoice,
  makeBrand,
  MAX_SAMPLE_CHARS,
  MAX_VOICE_SAMPLES,
  tidyVoice,
  voiceOf,
  type Brand,
  type Voice,
} from "./brand.js";
import { makeDoc, type Doc } from "./model.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;

const brandWith = (name: string, voice?: Voice, clientId?: string): Brand => ({
  ...makeBrand(name, THEME),
  ...(voice ? { voice } : {}),
  ...(clientId ? { clientId } : {}),
});

describe("is there a voice at all", () => {
  /**
   * An empty voice must produce no voice block. Telling a model that voice
   * matters and then handing it nothing is worse than not raising it.
   */
  it("is false for every shape of empty", () => {
    expect(hasVoice(undefined)).toBe(false);
    expect(hasVoice({})).toBe(false);
    expect(hasVoice({ tone: "   " })).toBe(false);
    expect(hasVoice({ samples: ["", "  "] })).toBe(false);
    expect(hasVoice({ avoid: [" "] })).toBe(false);
  });

  it("is true as soon as any one field has something in it", () => {
    expect(hasVoice({ tone: "Blunt" })).toBe(true);
    expect(hasVoice({ samples: ["A post"] })).toBe(true);
    expect(hasVoice({ avoid: ["synergy"] })).toBe(true);
  });
});

describe("tidying before it is stored", () => {
  it("trims and drops blanks", () => {
    expect(tidyVoice({ tone: "  Blunt  ", samples: ["  a  ", "", "  "], avoid: [" x ", ""] })).toEqual({
      tone: "Blunt",
      samples: ["a"],
      avoid: ["x"],
    });
  });

  it("keeps no more than three samples", () => {
    const out = tidyVoice({ samples: ["a", "b", "c", "d", "e"] });
    expect(out.samples).toHaveLength(MAX_VOICE_SAMPLES);
  });

  /** So a pasted newsletter never becomes a stored newsletter. */
  it("caps a sample at rest, not only in the prompt", () => {
    const out = tidyVoice({ samples: ["word ".repeat(5000)] });
    expect(out.samples?.[0]?.length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS);
  });

  it("leaves absent fields absent rather than empty", () => {
    expect(tidyVoice({ tone: "Blunt" })).toEqual({ tone: "Blunt" });
  });

  it("produces nothing at all from nothing", () => {
    expect(tidyVoice({})).toEqual({});
    expect(hasVoice(tidyVoice({ tone: "  " }))).toBe(false);
  });
});

describe("whose voice a finished carousel uses", () => {
  const acme = brandWith("Acme", { tone: "Blunt" });
  const other = brandWith("Other", { tone: "Warm" });

  const deck = (styleId?: string): Doc => ({
    ...makeDoc("D"),
    ...(styleId ? { styleId } : {}),
  });

  /** Unambiguous: the deck names its brand, so there is nothing to infer. */
  it("uses the brand the deck was made with", () => {
    expect(voiceOf(deck(`brand:${acme.id}`), [acme, other])?.tone).toBe("Blunt");
  });

  it("is undefined for a deck made from a stock style", () => {
    expect(voiceOf(deck("ink"), [acme, other])).toBeUndefined();
  });

  it("is undefined for a deck with no style at all", () => {
    expect(voiceOf(deck(), [acme])).toBeUndefined();
  });

  it("is undefined when the brand has been deleted since", () => {
    expect(voiceOf(deck("brand:gone"), [acme])).toBeUndefined();
  });
});

describe("whose voice a carousel that does not exist yet uses", () => {
  const solo = brandWith("Solo", { tone: "Blunt" });
  const acme = brandWith("Acme", { tone: "Acme voice" }, "cl_acme");
  const beta = brandWith("Beta", { tone: "Beta voice" }, "cl_beta");
  const silent = brandWith("Silent");

  it("uses the selected client's brand", () => {
    expect(contextVoice([acme, beta], "cl_beta")?.tone).toBe("Beta voice");
  });

  /** A solo operator gets their own voice without configuring anything. */
  it("uses the only brand that has a voice when no client is selected", () => {
    expect(contextVoice([solo, silent], undefined)?.tone).toBe("Blunt");
  });

  /**
   * A wrong voice is worse than none. No voice reads as generic, which is what
   * people expect from a machine; the wrong one reads as the product not
   * understanding who they are.
   */
  it("refuses to guess between several", () => {
    expect(contextVoice([acme, beta], undefined)).toBeUndefined();
  });

  it("falls through to the single-brand rule when the client has no brand", () => {
    expect(contextVoice([solo, silent], "cl_nobody")?.tone).toBe("Blunt");
  });

  it("ignores a client brand that has no voice", () => {
    const quiet = brandWith("Quiet", undefined, "cl_quiet");
    expect(contextVoice([quiet, solo], "cl_quiet")?.tone).toBe("Blunt");
  });

  it("is undefined when nothing has a voice at all", () => {
    expect(contextVoice([silent], undefined)).toBeUndefined();
    expect(contextVoice([], undefined)).toBeUndefined();
  });
});
