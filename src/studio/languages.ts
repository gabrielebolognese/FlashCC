/**
 * One deck, several languages (Batch 29): what both sides of a translation
 * agree on. Pure, and shared with the server like `marks.ts`, so it imports
 * nothing that reaches `model.ts`.
 *
 * ── What is never translated is never shown to the model as words ────────────
 *
 * Names, handles, links, code, numbers and a brand's fixed terms are MASKED
 * before the call: each becomes a token (`⟦3⟧`) the model is told to copy, and
 * `unmask` puts the original back afterwards. A prompt that says "do not
 * translate FlashCC" is a request; a token the model never sees as text is a
 * guarantee, and the difference shows up on the slide where it mattered.
 *
 * A glossary term with a fixed rendering in the target language is masked the
 * same way and restored AS the rendering, so it reads the same on every slide.
 *
 * ── The number check is arithmetic ───────────────────────────────────────────
 *
 * Every number in the source slide must be in the translated one. Digits are
 * compared after normalising the numeral system (Arabic-Indic, Persian,
 * full-width, Devanagari) and dropping separators, so "1,200", "1.200" and
 * "١٬٢٠٠" are the same number. A difference is flagged on that slide and never
 * corrected: a wrong figure in a post is the translation failure that hurts.
 */
import { HONEST_BLANK } from "./honesty.js";

/* ── the languages ────────────────────────────────────────────────────────── */

/** Which letters a translation into this language is written in. */
export type LanguageScript = "latin" | "cyrillic" | "greek" | "arabic" | "hebrew" | "japanese" | "chinese" | "korean";

export type Language = {
  /** BCP 47, the code the route takes and the folder name the export uses. */
  code: string;
  /** In English, for the interface. */
  name: string;
  /** In itself, beside the English name. */
  native: string;
  script: LanguageScript;
  rtl?: boolean | undefined;
  /**
   * The word a translated quote or testimonial is labelled with, in the
   * language itself. A table, not a translation: these are words a reader of
   * that language sees under somebody's name, and they are checked by hand.
   */
  translation: string;
};

/**
 * The targets: languages whose script the bundled faces draw (22.5). Hindi,
 * Bengali and Thai are absent because nothing bundled draws them yet; a deck
 * in a script the export cannot draw is a deck of empty boxes.
 */
export const LANGUAGES: readonly Language[] = [
  { code: "en", name: "English", native: "English", script: "latin", translation: "translation" },
  { code: "de", name: "German", native: "Deutsch", script: "latin", translation: "Übersetzung" },
  { code: "fr", name: "French", native: "Français", script: "latin", translation: "traduction" },
  { code: "es", name: "Spanish", native: "Español", script: "latin", translation: "traducción" },
  { code: "pt", name: "Portuguese", native: "Português", script: "latin", translation: "tradução" },
  { code: "it", name: "Italian", native: "Italiano", script: "latin", translation: "traduzione" },
  { code: "nl", name: "Dutch", native: "Nederlands", script: "latin", translation: "vertaling" },
  { code: "sv", name: "Swedish", native: "Svenska", script: "latin", translation: "översättning" },
  { code: "pl", name: "Polish", native: "Polski", script: "latin", translation: "tłumaczenie" },
  { code: "tr", name: "Turkish", native: "Türkçe", script: "latin", translation: "çeviri" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", script: "latin", translation: "terjemahan" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", script: "latin", translation: "bản dịch" },
  { code: "ru", name: "Russian", native: "Русский", script: "cyrillic", translation: "перевод" },
  { code: "uk", name: "Ukrainian", native: "Українська", script: "cyrillic", translation: "переклад" },
  { code: "el", name: "Greek", native: "Ελληνικά", script: "greek", translation: "μετάφραση" },
  { code: "ar", name: "Arabic", native: "العربية", script: "arabic", rtl: true, translation: "ترجمة" },
  { code: "he", name: "Hebrew", native: "עברית", script: "hebrew", rtl: true, translation: "תרגום" },
  { code: "ja", name: "Japanese", native: "日本語", script: "japanese", translation: "翻訳" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", script: "chinese", translation: "翻译" },
  { code: "ko", name: "Korean", native: "한국어", script: "korean", translation: "번역" },
];

export const languageByCode = (code: string | undefined): Language | undefined =>
  code ? LANGUAGES.find((l) => l.code === code) : undefined;

export const languageName = (code: string | undefined): string => languageByCode(code)?.name ?? (code ?? "");

/** "(Übersetzung)", or the full-width brackets the CJK languages use. */
export function translationLabel(code: string): string {
  const lang = languageByCode(code);
  const word = lang?.translation ?? "translation";
  return lang && (lang.script === "japanese" || lang.script === "chinese") ? `（${word}）` : `(${word})`;
}

/* ── limits ───────────────────────────────────────────────────────────────── */

/** Every unit's characters together, the roadmap's ceiling for one call. */
export const MAX_TRANSLATE_CHARS = 12_000;
/** Terms on one brand's glossary. A glossary is a list of names, not a dictionary. */
export const MAX_GLOSSARY = 100;
export const MAX_TERM_CHARS = 80;
/** Things the client asks to be kept as written (the deck's own name and handles). */
export const MAX_KEEP = 20;

/**
 * How much longer a translation may run before it is called wrong. German runs
 * about a third longer than English and Finnish more; twice the length plus a
 * floor for very short lines is where a translation has become an essay.
 */
export const STRETCH = 2;
export const STRETCH_FLOOR = 80;

/* ── the glossary ─────────────────────────────────────────────────────────── */

/**
 * One brand term. No renderings: never translated, in any language. A
 * rendering for a language: always that, in that language, and never
 * translated in the others.
 */
export type GlossaryEntry = { term: string; renderings?: Record<string, string> | undefined };

/** What one call needs from it: the term, and its rendering in the target if it has one. */
export type GlossaryTerm = { term: string; rendering?: string | undefined };

/** Trimmed, deduplicated (case aside), capped, empty renderings dropped. */
export function tidyGlossary(entries: readonly GlossaryEntry[]): GlossaryEntry[] {
  const seen = new Set<string>();
  const out: GlossaryEntry[] = [];
  for (const e of entries) {
    const term = (e.term ?? "").trim().slice(0, MAX_TERM_CHARS);
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    const renderings = Object.fromEntries(
      Object.entries(e.renderings ?? {})
        .map(([k, v]) => [k, (v ?? "").trim().slice(0, MAX_TERM_CHARS)] as const)
        .filter(([k, v]) => v && languageByCode(k)),
    );
    out.push(Object.keys(renderings).length ? { term, renderings } : { term });
    if (out.length >= MAX_GLOSSARY) break;
  }
  return out;
}

export const glossaryFor = (entries: readonly GlossaryEntry[], target: string): GlossaryTerm[] =>
  tidyGlossary(entries).map((e) => (e.renderings?.[target] ? { term: e.term, rendering: e.renderings[target] } : { term: e.term }));

/* ── masking ──────────────────────────────────────────────────────────────── */

export type TokenKind = "code" | "link" | "handle" | "term" | "name" | "number" | "blank";

export type Token = { kind: TokenKind; value: string };

export type Masked = { text: string; tokens: Token[] };

export type MaskOptions = {
  glossary?: readonly GlossaryTerm[] | undefined;
  /** Names to keep as written: the deck's author, the brand. */
  keep?: readonly string[] | undefined;
};

export const tokenText = (n: number): string => `⟦${n}⟧`;

/** A token as a model might hand it back: the brackets, maybe a space inside. */
const TOKEN_RE = /⟦\s*(\d+)\s*⟧/g;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Applies `re` only to the stretches of `text` outside tokens already placed. */
function outsideTokens(text: string, re: RegExp, replace: (match: RegExpExecArray) => string | null): string {
  const parts = text.split(/(⟦\d+⟧)/);
  return parts
    .map((part) => {
      if (/^⟦\d+⟧$/.test(part)) return part;
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      let out = "";
      let at = 0;
      let m: RegExpExecArray | null;
      while ((m = g.exec(part)) !== null) {
        if (m[0] === "") {
          g.lastIndex += 1;
          continue;
        }
        const r = replace(m);
        if (r === null) continue;
        out += part.slice(at, m.index) + r;
        at = m.index + m[0].length;
      }
      return out + part.slice(at);
    })
    .join("");
}

const LETTER_EDGE = /[\p{L}\p{N}_]/u;

/**
 * A term as a whole word where words have edges: "Flash" is not masked inside
 * "Flashlight". Scripts without spaces (CJK) have no edge to test, so a term
 * written in one is masked wherever it appears.
 */
function termRe(term: string): RegExp {
  const body = escapeRe(term);
  const start = LETTER_EDGE.test(term[0] ?? "") ? "(?<![\\p{L}\\p{N}_])" : "";
  const end = LETTER_EDGE.test(term[term.length - 1] ?? "") ? "(?![\\p{L}\\p{N}_])" : "";
  const cjk = /[぀-ヿ㐀-鿿가-힯]/.test(term);
  return new RegExp(cjk ? body : `${start}${body}${end}`, "giu");
}

/** A digit in any of the numeral systems `westernDigits` knows, and the run around it. */
const DIGIT_CLASS = "0-9\\u0660-\\u0669\\u06f0-\\u06f9\\uff10-\\uff19\\u0966-\\u096f";
const SEPARATORS = ".,'\\u066b\\u066c\\u2009\\u202f\\u00a0";
const NUMBER_RE = new RegExp(`[${DIGIT_CLASS}](?:[${SEPARATORS}]?[${DIGIT_CLASS}])*`, "g");

/**
 * The text with everything that must survive word for word replaced by
 * tokens. Order matters: a link's digits are part of the link, a handle's
 * letters are part of the handle, so the wide things go first and numbers
 * last.
 */
export function mask(text: string, options: MaskOptions = {}): Masked {
  const tokens: Token[] = [];
  const put = (kind: TokenKind, value: string): string => {
    tokens.push({ kind, value });
    return tokenText(tokens.length - 1);
  };

  let t = text;
  // The honesty rule's blank is a note to the author, in the product's words.
  t = outsideTokens(t, new RegExp(escapeRe(HONEST_BLANK), "g"), (m) => put("blank", m[0]));
  t = outsideTokens(t, /```[\s\S]*?```|`[^`\n]+`/g, (m) => put("code", m[0]));
  t = outsideTokens(t, /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi, (m) => {
    const link = m[0].replace(/[.,!?;:)\]]+$/, "");
    return put("link", link) + m[0].slice(link.length);
  });
  t = outsideTokens(t, /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => put("link", m[0]));
  t = outsideTokens(t, /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|app|co|org|net|dev|ai|me|so|xyz|tv)\b(?:\/[^\s<>"]*)?/gi, (m) => {
    const link = m[0].replace(/[.,!?;:)\]]+$/, "");
    return put("link", link) + m[0].slice(link.length);
  });
  t = outsideTokens(t, /(?<![\p{L}\p{N}_])[@#][\p{L}\p{N}_](?:[\p{L}\p{N}_.]*[\p{L}\p{N}_])?/gu, (m) => put("handle", m[0]));

  // Terms and names, longest first, so "FlashCC Pro" is one token and not
  // "FlashCC" followed by a word the model is free to translate.
  const terms = [
    ...(options.glossary ?? []).map((g) => ({ kind: "term" as const, term: g.term.trim(), rendering: g.rendering?.trim() || undefined })),
    ...(options.keep ?? []).map((k) => ({ kind: "name" as const, term: k.trim(), rendering: undefined })),
  ]
    .filter((x) => x.term)
    .sort((a, b) => b.term.length - a.term.length);
  for (const x of terms) {
    t = outsideTokens(t, termRe(x.term), (m) => put(x.kind, x.rendering ?? m[0]));
  }

  t = outsideTokens(t, NUMBER_RE, (m) => put("number", m[0]));
  return { text: t, tokens };
}

export type Unmasked = {
  text: string;
  /** Tokens the model dropped: a term, a link or a number this slide no longer has. */
  missing: number[];
  /** Token numbers that were never handed out, removed. */
  unknown: number[];
};

/** Puts every token back. A token used twice is restored twice; one never seen is reported. */
export function unmask(text: string, tokens: readonly Token[]): Unmasked {
  const seen = new Set<number>();
  const unknown: number[] = [];
  const out = text.replace(TOKEN_RE, (_all, n: string) => {
    const i = Number(n);
    const tok = tokens[i];
    if (!tok) {
      unknown.push(i);
      return "";
    }
    seen.add(i);
    return tok.value;
  });
  const missing = tokens.map((_, i) => i).filter((i) => !seen.has(i));
  return { text: out.replace(/[ \t]{2,}/g, " ").trim(), missing, unknown };
}

/* ── numbers ──────────────────────────────────────────────────────────────── */

/** Arabic-Indic, Persian, full-width and Devanagari digits as 0-9. */
const DIGIT_BASES = [0x0660, 0x06f0, 0xff10, 0x0966];

export function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹０-９०-९]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BASES.find((b) => code >= b && code <= b + 9) ?? code;
    return String(code - base);
  });
}

/** Every number in the text, as its digits alone: "1,200" and "١٬٢٠٠" are both "1200". */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER_RE)].map((m) => westernDigits(m[0]).replace(/[^0-9]/g, ""));
}

export type NumberDrift = { missing: string[]; added: string[] };

/** Numbers in the source the translation lacks, and numbers it has the source did not. */
export function numberDrift(source: string, translated: string): NumberDrift {
  const left = numbersIn(source);
  const right = numbersIn(translated);
  const pool = [...right];
  const missing: string[] = [];
  for (const n of left) {
    const i = pool.indexOf(n);
    if (i < 0) missing.push(n);
    else pool.splice(i, 1);
  }
  return { missing, added: pool };
}

/* ── the other checks, pure so both sides can run them ────────────────────── */

const SCRIPT_RE: Partial<Record<LanguageScript, RegExp>> = {
  cyrillic: /[Ѐ-ӿ]/u,
  greek: /[Ͱ-Ͽ]/u,
  arabic: /[؀-ۿݐ-ݿ]/u,
  hebrew: /[֐-׿]/u,
  japanese: /[぀-ヿ㐀-鿿]/u,
  chinese: /[㐀-鿿]/u,
  korean: /[가-힯ᄀ-ᇿ]/u,
};

/** The letters a reader reads: no tokens, no marks, no digits. */
const lettersOf = (text: string): string =>
  text
    .replace(TOKEN_RE, " ")
    .replace(/[*=]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * True when a unit came back in the language it went in. Two ways to know:
 * a target written in another script that came back with none of it, or a
 * Latin target that came back word for word the same. A unit with nothing to
 * translate (a name, a number, a link) is never "untranslated".
 */
export function untranslated(maskedSource: string, maskedOut: string, target: string): boolean {
  const src = lettersOf(maskedSource);
  if (src.replace(/\s/g, "").length < 4) return false;
  const out = lettersOf(maskedOut);
  const lang = languageByCode(target);
  const re = lang ? SCRIPT_RE[lang.script] : undefined;
  if (re) {
    const sourceInScript = re.test(src);
    return !sourceInScript && out.replace(/\s/g, "").length >= 4 && !re.test(out);
  }
  return src.split(" ").length >= 2 && src.toLowerCase() === out.toLowerCase();
}

const PLACEHOLDER_WORDS = /\b(lorem ipsum|todo|tbd|xxx|translation here|insert translation)\b/i;

/** A bracketed note or a stock placeholder the source did not have. */
export function placeholderIn(source: string, out: string): string | null {
  const brackets = [...out.matchAll(/\[[^\]\n]{1,80}\]/g)].map((m) => m[0]).filter((b) => !source.includes(b));
  if (brackets[0]) return brackets[0];
  const word = out.match(PLACEHOLDER_WORDS)?.[0];
  return word && !PLACEHOLDER_WORDS.test(source) ? word : null;
}

export const ceilingOf = (source: string): number => Math.max(Math.round(source.length * STRETCH), source.length + STRETCH_FLOOR);

export const overCeiling = (source: string, out: string): boolean => out.length > ceilingOf(source);

/**
 * The glossary as somebody types it, one term per line: a term alone is never
 * translated; `Swipe file | de: Ideensammlung | fr: fichier d'idées` gives it
 * a fixed rendering in those languages. Lines that make no sense are kept as
 * plain terms rather than dropped, so nothing typed disappears.
 */
export function parseGlossary(text: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const line of text.split("\n")) {
    const [term = "", ...rest] = line.split("|").map((p) => p.trim());
    if (!term) continue;
    const renderings: Record<string, string> = {};
    for (const part of rest) {
      const m = part.match(/^([a-z]{2,3})\s*:\s*(.+)$/i);
      if (m && languageByCode(m[1]!.toLowerCase())) renderings[m[1]!.toLowerCase()] = m[2]!.trim();
    }
    out.push(Object.keys(renderings).length ? { term, renderings } : { term });
  }
  return tidyGlossary(out);
}

export const glossaryText = (entries: readonly GlossaryEntry[]): string =>
  entries
    .map((e) => [e.term, ...Object.entries(e.renderings ?? {}).map(([k, v]) => `${k}: ${v}`)].join(" | "))
    .join("\n");
