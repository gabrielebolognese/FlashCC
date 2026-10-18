/**
 * Languages (Batch 29): this deck's language set, translating into another,
 * re-translating one, and exporting the set together.
 *
 * Every translation is its own carousel (29.5). The dialog says what the
 * layout did ("8 slides became 9 in German, slide 4 was split") and which
 * slides have a number that differs from the original, because those are
 * the two things that surprise somebody at posting time.
 *
 * Pro, like every model call (29.6): the server refuses a free account and
 * the refusal opens the pricing panel. Nothing is counted on this screen.
 */
import { Download, Languages, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listBrands, themeOf, voiceOf } from "./brand.js";
import { altFile, isCaptionPlatform, writeAlt, writeCaption } from "./caption.js";
import { Chip } from "./Dash.js";
import { renderFile, saveBlob } from "./exporter.js";
import { glossaryFor, languageByCode, LANGUAGES, MAX_TRANSLATE_CHARS } from "./languages.js";
import { uid, type Doc } from "./model.js";
import { languageZip, zipBlob } from "./packing.js";
import { PLATFORMS, type Platform } from "./platforms.js";
import { listDocs, loadDoc, saveDoc } from "./storage.js";
import { deckTexts } from "./transcript.js";
import {
  applyTranslation,
  brandFor,
  editedSince,
  keepFor,
  languageFolder,
  languageSet,
  originalOf,
  reportLine,
  requestTranslation,
  retranslate,
  unitsOf,
  voiceFor,
  type TranslationReport,
} from "./translate.js";

type Done = { kind: "made" | "again"; doc: Doc; line: string; report?: TranslationReport | undefined };

const slug = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "carousel";

export function TranslateDialog({
  doc,
  onReplace,
  onOpen,
  onClose,
}: {
  /** The deck open in the editor: an original or one of its translations. */
  doc: Doc;
  /** The open deck changed (re-translated, or given alt text), as one undo step. */
  onReplace: (doc: Doc) => void;
  onOpen?: ((doc: Doc) => void) | undefined;
  onClose: () => void;
}) {
  const [version, setVersion] = useState(0);
  // Every saved deck, with the open one as it is now rather than as last saved.
  const docs = useMemo(() => {
    const saved = listDocs()
      .map((s) => loadDoc(s.id))
      .filter((d): d is Doc => d !== null && d.id !== doc.id);
    return [doc, ...saved];
    // `version` re-reads storage after this dialog writes to it.
  }, [doc, version]);
  const set = useMemo(() => languageSet(doc, docs), [doc, docs]);
  const original = set[0]!;
  const taken = new Set(set.map((d) => d.language).filter(Boolean));
  const offered = LANGUAGES.filter((l) => !taken.has(l.code) && l.code !== original.language);

  const [server, setServer] = useState<boolean | null>(null);
  const [target, setTarget] = useState(offered[0]?.code ?? "de");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0]!);
  const [words, setWords] = useState(true);

  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : {}))
      .then((b: { draft?: boolean }) => live && setServer(Boolean(b.draft)))
      .catch(() => live && setServer(false));
    return () => {
      live = false;
    };
  }, []);

  const brands = listBrands();
  const brand = brandFor(original, brands);
  const chars = useMemo(() => {
    const u = unitsOf(original);
    return [...u.deck, ...u.fields.map((f) => f.text)].reduce((n, t) => n + t.length, 0);
  }, [original]);

  /** A fresh translation of the original into `code`, laid out. */
  async function fresh(code: string, id: string) {
    const t = await requestTranslation(
      {
        doc: original,
        target: code,
        voice: voiceFor(brand?.voice ?? voiceOf(original, brands), code),
        glossary: glossaryFor(brand?.glossary ?? [], code),
        keep: keepFor(original, brand?.name),
      },
      AbortSignal.timeout(180_000),
    );
    return applyTranslation(original, t, { target: code, theme: themeOf(original, brands), id });
  }

  async function translateInto(code: string) {
    setBusy(`Translating into ${languageByCode(code)?.name ?? code}`);
    setError(null);
    setDone(null);
    try {
      const made = await fresh(code, uid("d"));
      saveDoc(made.doc);
      setVersion((v) => v + 1);
      setDone({ kind: "made", doc: made.doc, line: reportLine(made.report, code), report: made.report });
      const next = offered.find((l) => l.code !== code);
      if (next) setTarget(next.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The translation did not work");
    }
    setBusy(null);
  }

  async function translateAgain(variant: Doc) {
    const code = variant.language!;
    setBusy(`Re-translating ${languageByCode(code)?.name ?? code}`);
    setError(null);
    setDone(null);
    try {
      const made = await fresh(code, variant.id);
      const merged = retranslate(variant, made.doc);
      if (variant.id === doc.id) onReplace(merged.doc);
      else saveDoc(merged.doc);
      setVersion((v) => v + 1);
      setDone({
        kind: "again",
        doc: merged.doc,
        line: `Re-translated ${merged.replaced} slide${merged.replaced === 1 ? "" : "s"} from the original${
          merged.kept ? `, kept ${merged.kept} you edited since` : ""
        }. ${reportLine(made.report, code)}`,
        report: made.report,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The translation did not work");
    }
    setBusy(null);
  }

  /**
   * The whole set, one zip, a folder per language. Captions and alt text are
   * written from each language's own slides when asked, never translated from
   * the original's: they have to say what those slides say.
   */
  async function exportSet() {
    setError(null);
    const files: Parameters<typeof languageZip>[0][number][] = [];
    const failed: string[] = [];
    for (const d of set) {
      const name = d.language ? (languageByCode(d.language)?.name ?? d.language) : "Original";
      setBusy(`Rendering ${name}`);
      const file = await renderFile(d, platform);
      if (!file.ok) {
        failed.push(`${name}: ${file.error}`);
        continue;
      }
      let caption: string | undefined;
      let alt: string | undefined;
      if (words && server === true) {
        setBusy(`Writing the ${name} caption and alt text`);
        try {
          const deck = deckTexts(d);
          const captionPlatform = isCaptionPlatform(platform.id) ? platform.id : "linkedin";
          const written = await writeCaption({ deck, platform: captionPlatform, count: 1, ...(d.language ? { language: d.language } : {}) });
          caption = written.captions[0]?.text;
          const described = await writeAlt(deck, undefined, d.language);
          alt = altFile(described.alt);
          // The alt text lives on the slides (it belongs to them), so it is kept.
          const withAlt = { ...d, slides: d.slides.map((s, i) => (described.alt[i] ? { ...s, alt: described.alt[i] } : s)) };
          if (d.id === doc.id) onReplace(withAlt);
          else saveDoc(withAlt);
        } catch (e) {
          failed.push(`${name} caption: ${e instanceof Error ? e.message : "not written"}`);
        }
      }
      files.push({ folder: languageFolder(d), filename: file.filename, blob: file.blob, pdf: platform.output === "pdf", caption, alt });
    }
    if (files.length) {
      saveBlob(await zipBlob(await languageZip(files)), `${slug(original.name)}-${files.length}-languages.zip`);
    }
    setVersion((v) => v + 1);
    setBusy(null);
    if (failed.length) setError(`Not included: ${failed.join(" ")}`);
  }

  const canTranslate = server === true && !busy && chars > 0 && chars <= MAX_TRANSLATE_CHARS;

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        aria-label="Languages"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <Languages size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 truncate text-title text-primary">Languages</span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary">
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <section>
            <span className="text-overline uppercase text-tertiary">This carousel&rsquo;s languages</span>
            <ul className="mt-2 flex flex-col gap-1.5" data-testid="language-set">
              {set.map((d) => {
                const lang = languageByCode(d.language);
                const edited = d.language ? d.slides.filter((s) => s.translation && editedSince(s)).length : 0;
                return (
                  <li key={d.id} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-primary">
                        {lang ? `${lang.name} · ${lang.native}` : "Original"}
                        {d.id === doc.id ? <span className="text-muted"> (open)</span> : null}
                      </span>
                      <span className="block text-caption text-muted">
                        {d.slides.length} slides{edited ? `, ${edited} edited since translating` : ""}
                      </span>
                    </span>
                    {d.language ? (
                      <button
                        type="button"
                        disabled={!canTranslate}
                        onClick={() => void translateAgain(d)}
                        title="Translate the original again. Slides you edited since are kept."
                        className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                      >
                        <RefreshCw size={13} strokeWidth={2} />
                        Re-translate
                      </button>
                    ) : null}
                    {d.id !== doc.id && onOpen ? (
                      <button
                        type="button"
                        onClick={() => onOpen(d)}
                        className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                      >
                        Open
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-caption leading-4 text-muted">
              Each language is its own carousel. Editing the original changes none of them; Re-translate is how to bring one up to date.
            </p>
          </section>

          <section>
            <span className="text-overline uppercase text-tertiary">Translate into</span>
            <div className="mt-2 flex items-center gap-2">
              <select
                aria-label="Language"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-8 flex-1 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
              >
                {offered.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} · {l.native}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!canTranslate || offered.length === 0}
                onClick={() => void translateInto(target)}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold disabled:opacity-50"
              >
                Translate
              </button>
            </div>
            <p className="mt-2 text-caption leading-4 text-muted" data-testid="translate-notes">
              {server === false
                ? "Translation needs the server's AI key. There is no dictionary fallback: a weak one would be worse than none."
                : chars > MAX_TRANSLATE_CHARS
                  ? `This deck is ${chars.toLocaleString("en")} characters; one translation takes up to ${MAX_TRANSLATE_CHARS.toLocaleString("en")}.`
                  : `Names, handles, links, code and numbers are kept as written${
                      brand?.glossary?.length ? `, and ${brand.name}'s glossary (${brand.glossary.length} term${brand.glossary.length === 1 ? "" : "s"})` : ""
                    }. A slide that runs long gets another slide, never smaller type. Pro.`}
            </p>
          </section>

          {busy ? <p className="text-caption text-secondary" data-testid="translate-busy">{busy}…</p> : null}
          {error ? <p className="text-caption text-danger">{error}</p> : null}

          {done ? (
            <section className="rounded-2xl border border-hairline bg-surface-1 p-3" data-testid="translate-done">
              <p className="text-body text-primary" data-testid="translate-report">
                {done.line}
              </p>
              {done.report?.long.length ? (
                <p className="mt-1 text-caption text-muted">
                  Still long, with nowhere sensible to split: slide {done.report.long.join(", ")}.
                </p>
              ) : null}
              {done.report?.blocks.length ? (
                <p className="mt-1 text-caption text-muted">A block&rsquo;s words do not fit it on slide {done.report.blocks.join(", ")}. Edit it as a block.</p>
              ) : null}
              {done.report?.flags.length ? (
                <ul className="mt-2 flex flex-col gap-1" data-testid="translate-flags">
                  {done.report.flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-caption">
                      <Chip tone="danger">Slide {f.slide}</Chip>
                      <span className="text-secondary">{f.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {done.doc.id !== doc.id && onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(done.doc)}
                  className="mt-2 flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                >
                  Open the {languageByCode(done.doc.language)?.name ?? ""} carousel
                </button>
              ) : null}
            </section>
          ) : null}

          <section>
            <span className="text-overline uppercase text-tertiary">Export the set</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="Export for"
                value={platform.id}
                onChange={(e) => setPlatform(PLATFORMS.find((p) => p.id === e.target.value) ?? PLATFORMS[0]!)}
                className="h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-caption text-secondary">
                <input type="checkbox" checked={words && server === true} disabled={server !== true} onChange={(e) => setWords(e.target.checked)} />
                A caption and alt text in each language
              </label>
              <div className="flex-1" />
              <button
                type="button"
                disabled={Boolean(busy) || set.length < 2}
                onClick={() => void exportSet()}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40"
              >
                <Download size={13} strokeWidth={2} />
                Export {set.length} languages
              </button>
            </div>
            <p className="mt-2 text-caption leading-4 text-muted">One zip, a folder per language, each with its own files, caption and alt text.</p>
          </section>
        </div>
      </div>
    </>
  );
}
