/**
 * The legal pages, and the small amount of machinery that renders them.
 *
 * ── Why these are documents rather than components ───────────────────────────
 *
 * A privacy notice and a set of terms are long, they are amended by somebody who
 * is not looking at JSX, and every word of them is load-bearing in a way product
 * copy is not. Hand-building four hundred elements would make the next amendment
 * a refactor and would make a diff unreadable, which is how a legal document
 * silently loses a clause.
 *
 * So each document is one string in a restricted Markdown, parsed here into
 * blocks and painted by `LegalPage.tsx`. The parser is about eighty lines and has
 * no dependency, which is cheaper than a Markdown library and, more to the point,
 * cannot render anything the documents do not use.
 *
 * ── Why the details are constants ────────────────────────────────────────────
 *
 * The company name, the addresses and the domain appear dozens of times across
 * both documents. They are interpolated from `COMPANY` below so that changing one
 * is one edit rather than a search and replace across two legal documents, which
 * is exactly the operation that leaves three stale copies behind.
 */

/**
 * Who we are, in one place.
 *
 * ── Two of these need checking by a human, and this comment is the flag ──────
 *
 * `name` was `FlashFX S.r.l.` in the source document this was adapted from. The
 * instruction was to change the name to FlashCC, so it now reads FlashCC, but a
 * **legal entity name is not a product name**: Paddle verifies the company named
 * in the terms against company registration, and naming an entity that is not
 * registered fails that check harder than naming the parent company would. If the
 * registered company is still FlashFX S.r.l., this one line is the fix.
 *
 * `site` is the domain the documents point at. It was flashfx.app. It is now the
 * FlashCC domain, because these pages are served from the FlashCC site and Paddle
 * requires every domain running its checkout to serve the product the policy
 * describes. Change it here if the domain is not this.
 *
 * The email addresses are deliberately **unchanged** from the source documents,
 * including the fact that the two documents use different ones, because that was
 * the explicit instruction.
 */
export const COMPANY = {
  name: "FlashCC S.r.l.",
  /** The trading name, as the terms use it. */
  short: "FlashCC",
  site: "flashcc.app",
  street: "xxv aprile",
  town: "Pontecchio",
  province: "RO",
  postcode: "45030",
  country: "Italy",
  /** From the privacy notice. */
  privacyEmail: "support@flashcc.app",
  /** From the terms. Different on purpose: it is what the source document said. */
  termsEmail: "the.real.gabryy@gmail.com",
  phone: "3475119760",
  /** The Termly request form both documents link to. */
  dsar: "https://app.termly.io/dsar/3988d8e2-6a65-4a0e-b9ed-f9d69258766b",
} as const;

export const postalAddress = (): string =>
  `${COMPANY.street}, ${COMPANY.town}, ${COMPANY.province} ${COMPANY.postcode}, ${COMPANY.country}`;

/* ── the block model ──────────────────────────────────────────────────────── */

export type Inline =
  | { k: "text"; text: string }
  | { k: "bold"; text: string }
  | { k: "link"; text: string; href: string };

export type Block =
  | { k: "h2"; id: string; text: string }
  | { k: "h3"; text: string }
  | { k: "p"; spans: Inline[] }
  /** The italic "In Short:" summary Termly opens each section with. */
  | { k: "note"; spans: Inline[] }
  | { k: "ul"; items: Inline[][] }
  | { k: "table"; head: string[]; rows: string[][] };

/* ── inline parsing ───────────────────────────────────────────────────────── */

/**
 * `**bold**` and `[text](url)`, and nothing else.
 *
 * Deliberately not a Markdown implementation. Underscores, backticks and images
 * appear in legal prose as themselves (`_` in an email, a stray asterisk in a
 * footnote) and a parser that tried to be complete would silently eat them.
 */
export function inlines(source: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let at = 0;

  for (let m = pattern.exec(source); m !== null; m = pattern.exec(source)) {
    if (m.index > at) out.push({ k: "text", text: source.slice(at, m.index) });

    if (m[1] !== undefined) out.push({ k: "bold", text: m[1] });
    else if (m[2] !== undefined && m[3] !== undefined) {
      out.push({ k: "link", text: m[2], href: m[3] });
    }

    at = m.index + m[0].length;
  }

  if (at < source.length) out.push({ k: "text", text: source.slice(at) });
  return out;
}

/** Everything a block says, with the markup taken back out. Used by the tests. */
export const plain = (blocks: readonly Block[]): string =>
  blocks
    .map((b) => {
      if (b.k === "h2" || b.k === "h3") return b.text;
      if (b.k === "p" || b.k === "note") return b.spans.map((s) => s.text).join("");
      if (b.k === "ul") return b.items.map((i) => i.map((s) => s.text).join("")).join("\n");
      return [b.head.join(" "), ...b.rows.map((r) => r.join(" "))].join("\n");
    })
    .join("\n");

/* ── block parsing ────────────────────────────────────────────────────────── */

const cells = (line: string): string[] =>
  line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/**
 * The document, line by line.
 *
 * `## {anchor} Heading` carries the id the table of contents links to. Ids are
 * explicit rather than slugged from the text, because a heading reworded in an
 * amendment would otherwise break every link to it, quietly.
 */
export function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];

  let para: string[] = [];
  let items: Inline[][] = [];
  let table: { head: string[]; rows: string[][] } | null = null;

  const flush = () => {
    if (para.length > 0) {
      const text = para.join(" ").trim();
      const note = text.startsWith("> ");
      out.push(note ? { k: "note", spans: inlines(text.slice(2)) } : { k: "p", spans: inlines(text) });
      para = [];
    }
    if (items.length > 0) {
      out.push({ k: "ul", items });
      items = [];
    }
    if (table) {
      out.push({ k: "table", ...table });
      table = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "") {
      flush();
      continue;
    }

    const h2 = /^##\s+\{([\w-]+)\}\s+(.+)$/.exec(line);
    if (h2 && h2[1] && h2[2]) {
      flush();
      out.push({ k: "h2", id: h2[1], text: h2[2] });
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3 && h3[1]) {
      flush();
      out.push({ k: "h3", text: h3[1] });
      continue;
    }

    if (line.startsWith("|")) {
      const row = cells(line);
      /*
       * The `|---|---|` rule under a header row carries no content.
       *
       * Detected per cell rather than with one pattern over the whole line,
       * which is what this did first and got wrong: a character class cannot
       * match the pipes in the middle, so every rule row was being read as data
       * and the US state table rendered a row of dashes. A cell that is entirely
       * dashes, colons and space is a rule; a cell that is empty is a real blank
       * cell, and the table in the privacy notice has one.
       */
      if (row.length > 0 && row.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!table) table = { head: row, rows: [] };
      else table.rows.push(row);
      continue;
    }

    if (line.startsWith("- ")) {
      if (para.length > 0) {
        // A list directly under a lead-in line: the paragraph closes first.
        const text = para.join(" ").trim();
        const note = text.startsWith("> ");
        out.push(
          note ? { k: "note", spans: inlines(text.slice(2)) } : { k: "p", spans: inlines(text) },
        );
        para = [];
      }
      items.push(inlines(line.slice(2)));
      continue;
    }

    if (items.length > 0 || table) flush();
    para.push(line);
  }

  flush();
  return out;
}

/* ── the documents themselves ─────────────────────────────────────────────── */

export type LegalDoc = {
  /** The path it is served at. */
  path: string;
  title: string;
  updated: string;
  /** In the order the table of contents lists them. */
  contents: { id: string; label: string }[];
  body: string;
};

/** Every anchor a document's table of contents points at exists as a heading. */
export function danglingAnchors(doc: LegalDoc): string[] {
  const ids = new Set(parse(doc.body).flatMap((b) => (b.k === "h2" ? [b.id] : [])));
  return doc.contents.filter((c) => !ids.has(c.id)).map((c) => c.id);
}
