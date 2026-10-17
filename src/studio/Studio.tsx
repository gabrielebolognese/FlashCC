import { ChevronLeft, ClipboardPaste, Dices, Download, Film, Heading, History, Megaphone, Redo2, Send, Shuffle, Sparkles, Undo2, X } from "lucide-react";
import type { Studio as StudioState } from "./useStudio.js";
import { brokenSpans, unspan } from "./spans.js";
import { StripCanvas } from "./StripCanvas.js";
import { OutlineView } from "./OutlineView.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ACTIONS,
  actionForKey,
  FAMILIES,
  lastDestination,
  rememberAction,
  type ActionId,
  type FamilyId,
} from "./actions.js";
import { BLOCKS } from "./blocks.js";
import { CommandPalette, type PaletteEntry } from "./CommandPalette.js";
import { ReplaceDialog } from "./ReplaceDialog.js";
import { FORMATS } from "./model.js";
import { hasSafeZone, PLATFORMS, platformForSize, type PlatformId } from "./platforms.js";
import { Shortcuts } from "./Shortcuts.js";
import { HookFormulas } from "./HookFormulas.js";
import { CtaPicker } from "./CtaPicker.js";
import { PackPicker } from "./PackPicker.js";
import { SaveTemplate } from "./SaveTemplate.js";
import { applyPack, packIdOf, PACKS, type StylePack } from "./packs.js";
import { deckFromTemplate, listTemplates, reapplyTemplate, type Template } from "./templates.js";
import { platformById } from "./platforms.js";
import { listDocs, loadDoc } from "./storage.js";
import { shuffleRhythm, stepLayout, typeSlide } from "./regenerate.js";
import type { Brand } from "./brand.js";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { Canvas } from "./Canvas.js";
import { Filmstrip } from "./Filmstrip.js";
import { LayersPanel } from "./LayersPanel.js";
import { MediaPool } from "./MediaPool.js";
import { slidePaint } from "./paint.js";
import { LayerView } from "./LayerView.js";
import type { Doc, Layer } from "./model.js";
import { Properties } from "./Properties.js";
import { buildSlides } from "./compositions.js";
import { applyBrand, identityOf, listBrands, stampLogo, themeOf, voiceOf } from "./brand.js";
import { logoResolver } from "./library.js";
import { BrandMenu } from "./BrandMenu.js";
import { BlockPicker } from "./BlockPicker.js";
import { ExportDialog } from "./ExportDialog.js";
import { VideoExport } from "./VideoExport.js";
import { furnishWith } from "./furniture.js";
import { HookPicker } from "./HookPicker.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { sessionPlan } from "./session.js";
import { ShareDialog } from "./ShareDialog.js";
import { snapshot } from "./versions.js";
import { regenerate, relaySlides, restateSlide } from "./regenerate.js";
import { RewritePicker } from "./RewritePicker.js";
import { rebuildsOnRewrite, slideTextWith, slotAt } from "./rewrite.js";
import { deckTexts } from "./transcript.js";
import { STRUCTURES } from "./structures.js";
import { THEMES } from "./presets.js";
import { Toolbar } from "./Toolbar.js";
import { useStudio } from "./useStudio.js";

export function Studio({
  initial,
  onHome,
  onOpen,
}: {
  initial: Doc;
  onHome: () => void;
  /** Opens another document, saved, in the editor: the panorama deck (23.3) is a new deck. */
  onOpen?: ((doc: Doc) => void) | undefined;
}) {
  const studio = useStudio(initial);
  const { doc, slide } = studio;
  const [naming, setNaming] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  /** The export dialog, and what it opens on: a destination, and whether to start at once (⌘E). */
  const [exporting, setExporting] = useState<{ initial?: string | null | undefined; auto?: boolean | undefined } | null>(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [finding, setFinding] = useState(false);
  const [filming, setFilming] = useState(false);
  /** The filmstrip's "+" showing its line (24.5). */
  const [typingSlide, setTypingSlide] = useState(false);
  const [relaid, setRelaid] = useState<number | null>(null);
  /** Hook variants, optionally in the shape of a formula (25.3). */
  const [hooking, setHooking] = useState<false | { pattern?: string | undefined }>(false);
  const [formulas, setFormulas] = useState(false);
  const [packs, setPacks] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [note]);
  const [ctaOpen, setCtaOpen] = useState(false);
  /**
   * Which slide is being rewritten, or null. A number rather than a boolean,
   * because unlike the hook picker this can be opened on any slide.
   */
  const [rewriting, setRewriting] = useState<number | null>(null);
  /** A single text layer being rewritten from the Properties panel. */
  const [rewritingLayer, setRewritingLayer] = useState<Layer | null>(null);
  const [sharing, setSharing] = useState(false);
  const [history, setHistory] = useState(false);
  const [pasted, setPasted] = useState("");

  /* ── actions: one registry for the buttons, the palette and the keys (24.2, 24.3) ── */

  const theme = () => themeOf(doc, listBrands());

  function relayDeck() {
    const result = regenerate(doc, theme());
    studio.replaceDoc(result.doc);
    setRelaid(result.kept);
  }

  function relayPicked(ids: string[]) {
    // Only the picked slides change; the deck is rebuilt to get their
    // compositions right and the rest is left exactly as it was.
    const result = relaySlides(doc, ids, theme());
    if (result.replaced > 0) studio.replaceDoc(result.doc);
    setRelaid(result.replaced > 0 ? result.kept : -1);
  }

  function applyPackNow(p: StylePack) {
    snapshot(doc, "brand", sessionPlan(), `Before ${p.name}`);
    const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(doc.width, doc.height);
    studio.replaceDoc(applyPack(doc, p, identityOf(doc, listBrands()), platform, theme()), undefined, p.name);
  }

  function reapplyTemplateNow(t: Template) {
    const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(doc.width, doc.height);
    studio.replaceDoc(reapplyTemplate(doc, t, { theme: theme(), identity: identityOf(doc, listBrands()), platform }), undefined, "Template");
  }

  function applyBrandNow(brand: Brand) {
    const result = applyBrand(doc, brand, undefined);
    // The logo goes on in the same commit, so applying a brand is one
    // undo rather than two, and so "it used my brand assets
    // automatically" is true without a second button to find.
    // Snapshot BEFORE the brand lands, not after: the version worth
    // keeping is the one that is about to stop existing.
    snapshot(doc, "brand", sessionPlan(), `Before ${brand.name}`);
    const stamped = stampLogo(result.doc, brand, logoResolver());
    // And the brand's furniture, from its identity, in the same commit.
    const furnished = furnishWith(stamped.doc, brand, logoResolver());
    studio.replaceDoc(furnished);
    return { ...result, doc: furnished };
  }

  const one = studio.selected.length === 1 ? studio.selected[0] : undefined;
  const picked = studio.slideSelection.length > 1 ? studio.slideSelection : [];
  const needs = {
    one: one ? null : "Select one layer first.",
    some: studio.selected.length > 0 ? null : "Select a layer first.",
    two: studio.selected.length > 1 ? null : "Select two or more layers.",
    picked: picked.length > 0 ? null : "Pick several slides in the filmstrip first (Shift-click).",
  };
  const stampedBlock = studio.selected.find((l) => l.block && slide?.blocks?.some((b) => b.instance === l.block!.instance));

  /**
   * What each action does, and why it cannot right now. Typed against the
   * registry: an action listed in actions.ts with no entry here does not compile.
   */
  const runners: Record<ActionId, { run: () => void; unavailable?: string | null }> = {
    palette: { run: () => setPalette(true) },
    shortcuts: { run: () => setShortcuts(true) },
    outline: {
      run: () => {
        studio.setStripView(false);
        studio.setOutline(!studio.outline);
      },
    },
    "strip-view": {
      run: () => {
        studio.setOutline(false);
        studio.setStripView(!studio.stripView);
      },
    },
    "unspan-broken": {
      run: () => studio.replaceDoc(brokenSpans(doc).reduce((d, b) => unspan(d, b.spanId), doc)),
      unavailable: brokenSpans(doc).length > 0 ? null : "Every seam in this deck is intact.",
    },
    "safe-areas": {
      run: () =>
        studio.setSafePlatform(studio.safePlatform ? null : ((platformForSize(doc.width, doc.height)?.id as PlatformId | undefined) ?? "instagram")),
    },
    "find-replace": { run: () => setFinding(true) },
    undo: { run: studio.undo },
    redo: { run: studio.redo },
    rename: { run: () => setNaming(true) },
    "relay-deck": { run: relayDeck },
    "shuffle-rhythm": { run: () => studio.replaceDoc(shuffleRhythm(doc, theme()).doc, undefined, "Shuffle rhythm") },
    "style-packs": { run: () => setPacks(true) },
    "save-template": { run: () => setSavingTemplate(true) },
    "reapply-template": {
      run: () => {
        const t = listTemplates().find((x) => x.id === doc.template);
        if (t) reapplyTemplateNow(t);
      },
      unavailable: listTemplates().some((x) => x.id === doc.template) ? null : "This deck was not made from a saved template.",
    },
    hooks: { run: () => setHooking({}) },
    "hook-formulas": { run: () => setFormulas(true) },
    cta: { run: () => setCtaOpen(true) },
    "paste-post": { run: () => setPasteOpen(true) },
    history: { run: () => setHistory(true) },
    review: { run: () => setSharing(true) },
    export: { run: () => setExporting({}) },
    "export-last": { run: () => setExporting({ initial: lastDestination(), auto: true }) },
    "export-video": { run: () => setFilming(true) },
    "new-slide": { run: () => studio.addSlide(studio.index + 1) },
    "type-slide": { run: () => setTypingSlide(true) },
    "duplicate-slide": { run: () => studio.duplicateSlide(studio.index) },
    "delete-slide": {
      run: () => studio.deleteSlide(studio.index),
      unavailable: doc.slides.length > 1 ? null : "A deck keeps at least one slide.",
    },
    "move-slide-earlier": {
      run: () => studio.moveSlide(studio.index, studio.index - 1),
      unavailable: studio.index > 0 ? null : "This is already the first slide.",
    },
    "move-slide-later": {
      run: () => studio.moveSlide(studio.index, studio.index + 1),
      unavailable: studio.index < doc.slides.length - 1 ? null : "This is already the last slide.",
    },
    "next-layout": {
      run: () => studio.replaceDoc(stepLayout(doc, studio.index, 1, theme()).doc, undefined, "Layout"),
      unavailable: slide && (textsOfSlide(slide) || slide.blocks?.length === 1) ? null : "This slide has no words or block to lay out.",
    },
    "previous-layout": {
      run: () => studio.replaceDoc(stepLayout(doc, studio.index, -1, theme()).doc, undefined, "Layout"),
      unavailable: slide && (textsOfSlide(slide) || slide.blocks?.length === 1) ? null : "This slide has no words or block to lay out.",
    },
    "rewrite-slide": { run: () => setRewriting(studio.index) },
    tidy: { run: () => void studio.tidy() },
    "relay-picked": { run: () => relayPicked(picked), unavailable: needs.picked },
    "duplicate-picked": { run: () => studio.duplicateSlides(picked), unavailable: needs.picked },
    "delete-picked": {
      run: () => studio.deleteSlides(picked),
      unavailable: needs.picked ?? (picked.length < doc.slides.length ? null : "A deck keeps at least one slide."),
    },
    "clear-picked": { run: () => studio.setSlideSelection([]), unavailable: needs.picked },
    "rewrite-text": {
      run: () => one && setRewritingLayer(one),
      unavailable: one?.kind === "text" && (one.text ?? "").trim() ? null : "Select one text layer first.",
    },
    match: {
      run: () => one && studio.matchOnSlides(one.id),
      unavailable: needs.one ?? (doc.slides.length > 1 ? null : "There is only one slide."),
    },
    group: { run: studio.groupSelected, unavailable: needs.two },
    ungroup: {
      run: studio.ungroupSelected,
      unavailable: studio.selected.some((l) => l.groupId) ? null : "Select a group first.",
    },
    "delete-layer": { run: studio.removeSelected, unavailable: needs.some },
    "bring-front": { run: () => studio.reorder("front"), unavailable: needs.some },
    forward: { run: () => studio.reorder("forward"), unavailable: needs.some },
    backward: { run: () => studio.reorder("backward"), unavailable: needs.some },
    "send-back": { run: () => studio.reorder("back"), unavailable: needs.some },
    "align-left": { run: () => studio.alignSelected("left"), unavailable: needs.some },
    "align-hcenter": { run: () => studio.alignSelected("hcenter"), unavailable: needs.some },
    "align-right": { run: () => studio.alignSelected("right"), unavailable: needs.some },
    "align-top": { run: () => studio.alignSelected("top"), unavailable: needs.some },
    "align-vcenter": { run: () => studio.alignSelected("vcenter"), unavailable: needs.some },
    "align-bottom": { run: () => studio.alignSelected("bottom"), unavailable: needs.some },
    "distribute-h": { run: () => studio.distributeSelected("x"), unavailable: needs.two },
    "distribute-v": { run: () => studio.distributeSelected("y"), unavailable: needs.two },
    "equal-gap": { run: () => void studio.equalGapSelected("y"), unavailable: needs.two },
    "match-width": { run: () => studio.matchWidthSelected(), unavailable: needs.two },
    "edit-block": {
      run: () => stampedBlock && studio.setPicker({ mode: "edit", instance: stampedBlock.block!.instance }),
      unavailable: stampedBlock ? null : "Select a block first.",
    },
    "tool-select": { run: () => studio.setTool("select") },
    "tool-text": { run: () => studio.setTool("text") },
    "tool-rect": { run: () => studio.setTool("rect") },
    "tool-ellipse": { run: () => studio.setTool("ellipse") },
    "tool-triangle": { run: () => studio.setTool("triangle") },
    "tool-line": { run: () => studio.setTool("line") },
    "tool-icon": { run: () => studio.setTool("icon") },
    "insert-block": { run: () => studio.setPicker({ mode: "insert" }) },
    projects: { run: onHome },
  };

  /** One entry per argument of each family, built when the palette opens. */
  function familyEntries(): PaletteEntry[] {
    const entry = (family: FamilyId, arg: string, label: string, run: () => void, also = ""): PaletteEntry => ({
      id: `${family}:${arg}`,
      label: `${FAMILIES[family]} ${label}`,
      group: family === "open" ? "Projects" : family === "export" ? "Export" : family === "insert-block" ? "Insert" : "Deck",
      also,
      run,
    });
    return [
      ...BLOCKS.map((b) => entry("insert-block", b.id, b.label, () => studio.setPicker({ mode: "insert", block: b.id }), b.hint)),
      ...listBrands().map((b) => entry("brand", b.id, b.name, () => void applyBrandNow(b), "style restyle")),
      ...FORMATS.map((f) => entry("format", f.id, `${f.label} (${f.w}×${f.h})`, () => studio.setFormat(f.w, f.h), "canvas size resize")),
      ...PLATFORMS.map((p) => entry("export", p.id, p.label, () => setExporting({ initial: p.id }), "download")),
      ...PLATFORMS.filter(hasSafeZone).map((p) =>
        entry("safe", p.id, p.label, () => studio.setSafePlatform(p.id as PlatformId), "overlay interface"),
      ),
      ...PACKS.map((p) => entry("pack", p.id, p.name, () => applyPackNow(p), `${p.creator} ${p.note} style look`)),
      ...listTemplates(doc.clientId ?? null).map((t) =>
        entry("template", t.id, t.name, () => {
          const made = deckFromTemplate(t, { theme: theme(), identity: identityOf(doc, listBrands()) });
          if (onOpen) onOpen(doc.clientId ? { ...made, clientId: doc.clientId } : made);
        }, "structure saved"),
      ),
      ...listDocs()
        .filter((d) => d.id !== doc.id && !d.archived)
        .map((d) =>
          entry("open", d.id, d.name, () => {
            const full = loadDoc(d.id);
            if (full && onOpen) onOpen(full);
          }, "jump switch"),
        ),
    ];
  }

  function paletteItems(): PaletteEntry[] {
    const statics = (Object.keys(ACTIONS) as ActionId[])
      .filter((id) => id !== "palette")
      .map((id) => {
        const def = ACTIONS[id];
        return {
          id,
          label: def.label,
          group: def.group,
          keys: "keys" in def ? def.keys : undefined,
          also: "also" in def ? def.also : undefined,
          unavailable: runners[id].unavailable ?? null,
          run: runners[id].run,
        };
      });
    return [...statics, ...familyEntries()];
  }

  // The keyboard map, window-wide. Subscribed once and read through a ref:
  // a listener re-subscribed during the key event that changed state is
  // skipped for that event (the BlockPicker bug, Batch 19).
  const runnersRef = useRef(runners);
  runnersRef.current = runners;
  const modal =
    palette || shortcuts || finding || pasteOpen || exporting !== null || sharing || history || hooking !== false || formulas || ctaOpen || packs || savingTemplate ||
    rewriting !== null || rewritingLayer !== null || studio.picker !== null || naming;
  const modalRef = useRef(modal);
  modalRef.current = modal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || modalRef.current) return;
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable === true;
      const id = actionForKey(e, typing);
      if (!id) return;
      const r = runnersRef.current[id];
      e.preventDefault();
      if (r.unavailable) return;
      rememberAction(id);
      r.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const printRoot = document.getElementById("print-root");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface-1 px-3">
        <IconButton icon={ChevronLeft} label="Projects" action="projects" onClick={onHome} />

        {naming ? (
          <input
            autoFocus
            value={doc.name}
            onChange={(e) => studio.setName(e.target.value)}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              e.stopPropagation();
            }}
            className="h-7 rounded-sm border border-edge bg-surface-1 px-2 text-body text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            data-action="rename"
            onClick={() => setNaming(true)}
            className="h-7 rounded-sm border border-transparent px-2 text-body text-secondary hover:border-hairline hover:text-primary"
          >
            {doc.name}
          </button>
        )}

        <div className="mx-1 h-4 w-px bg-hairline" />
        <IconButton icon={Undo2} label={studio.undoLabel ? `Undo ${studio.undoLabel}` : "Undo"} action="undo" onClick={studio.undo} />
        <IconButton icon={Redo2} label="Redo" action="redo" onClick={studio.redo} />

        <div className="flex-1" />

        <span className="text-caption text-muted">
          {doc.slides.length} slide{doc.slides.length === 1 ? "" : "s"} · {doc.width}×{doc.height}
        </span>
        <button
          type="button"
          data-action="relay-deck"
          title="Lay the same words out again. Anything you changed by hand is kept."
          onClick={relayDeck}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Shuffle size={14} strokeWidth={2} />
          Re-lay
        </button>
        <button
          type="button"
          data-action="shuffle-rhythm"
          title="Shuffle rhythm: the same words, the deck's layouts picked again from another starting point"
          aria-label="Shuffle rhythm"
          onClick={() => studio.replaceDoc(shuffleRhythm(doc, theme()).doc, undefined, "Shuffle rhythm")}
          className="grid h-7 w-7 place-items-center rounded-md border border-hairline bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Dices size={14} strokeWidth={2} />
        </button>
        {note ? <span className="max-w-[320px] truncate text-caption text-tertiary">{note}</span> : null}
        {relaid === null ? null : (
          <span className="text-caption text-tertiary">
            {relaid < 0
              ? "not re-laid: the copy would split into more slides, so Re-lay the whole deck"
              : relaid > 0
                ? `kept ${relaid} of your edits`
                : "re-laid"}
          </span>
        )}

        {/*
          Hooks get their own control rather than living inside Re-lay: people
          iterate on the first slide far more often than they re-lay the deck,
          and burying the thing that is done twenty times behind the thing that
          is done twice is how a tool acquires a reputation for being fiddly.
        */}
        <button
          type="button"
          data-action="hooks"
          title="Several ways to open the same carousel. Nothing else in the deck moves."
          onClick={() => setHooking({})}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Sparkles size={14} strokeWidth={2} />
          Hooks
        </button>
        <button
          type="button"
          data-action="hook-formulas"
          title="Fill-in-the-blank openings, by kind. No AI, nothing ranked."
          onClick={() => setFormulas(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Heading size={14} strokeWidth={2} />
          Formulas
        </button>
        <button
          type="button"
          data-action="cta"
          title="A call to action by goal, worded for the platform, on the last slide"
          onClick={() => setCtaOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Megaphone size={14} strokeWidth={2} />
          CTA
        </button>

        <BrandMenu brands={listBrands()} onApply={applyBrandNow} />
        <button
          type="button"
          data-action="paste-post"
          onClick={() => setPasteOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <ClipboardPaste size={14} strokeWidth={2} />
          Paste post
        </button>
        <button
          type="button"
          data-action="history"
          title="What this looked like when you exported it, sent it, or rebranded it."
          onClick={() => setHistory(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <History size={14} strokeWidth={2} />
          History
        </button>
        <button
          type="button"
          data-action="review"
          title="Send a link your client can open without an account."
          onClick={() => setSharing(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Send size={14} strokeWidth={2} />
          Review
        </button>
        <button
          type="button"
          data-action="export-video"
          title="The deck as a slideshow video for Reels, TikTok, Shorts, LinkedIn or X."
          onClick={() => setFilming(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Film size={14} strokeWidth={2} />
          Video
        </button>
        <Button hero icon={Download} action="export" onClick={() => setExporting({})}>
          Export
        </Button>
      </header>

      <Toolbar studio={studio} onFind={() => setFinding(true)} onPacks={() => setPacks(true)} onSaveTemplate={() => setSavingTemplate(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[212px] shrink-0 flex-col border-r border-hairline bg-surface-1">
          <LayersPanel studio={studio} />
          <MediaPool studio={studio} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {!studio.stripView && !studio.outline ? <SeamWarnings studio={studio} /> : null}
          {studio.outline ? (
            <OutlineView studio={studio} />
          ) : studio.stripView ? (
            <StripCanvas studio={studio} onOpenDoc={onOpen} />
          ) : (
            <Canvas studio={studio} />
          )}
        </div>
        <Properties studio={studio} onRewrite={(l) => setRewritingLayer(l)} />
      </div>

      <Filmstrip
        studio={studio}
        onRewrite={(i) => setRewriting(i)}
        onRelay={relayPicked}
        onLayout={(i, dir) => {
          studio.replaceDoc(stepLayout(doc, i, dir, theme()).doc, undefined, "Layout");
          studio.setSlideIndex(i);
        }}
        onTypeSlide={(line) => {
          const r = typeSlide(doc, doc.slides.length, line, themeOf(doc, listBrands()));
          studio.replaceDoc(r.doc, undefined, "New slide");
          studio.setSlideIndex(doc.slides.length);
          studio.setSelection([]);
        }}
        typing={typingSlide}
        setTyping={setTypingSlide}
      />

      {pasteOpen ? (
        <div className="absolute inset-0 z-modal grid place-items-center" style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-[560px] rounded-2xl border border-hairline bg-surface-2 shadow-modal">
            <header className="flex h-11 items-center gap-2 border-b border-hairline px-3">
              <span className="text-title text-primary">Paste a post</span>
              <div className="flex-1" />
              <IconButton icon={X} label="Close" control onClick={() => setPasteOpen(false)} />
            </header>
            <div className="p-4">
              <p className="mb-2 text-caption text-tertiary">
                Each blank line becomes a slide. Everything it creates is a normal layer you can move.
              </p>
              <textarea
                autoFocus
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste here…"
                className="h-52 w-full resize-none rounded-md border border-edge bg-surface-1 p-3 font-mono text-[12px] leading-[20px] text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline bg-surface-1 p-3">
              <button
                type="button"
                data-control
                onClick={() => setPasteOpen(false)}
                className="h-7 rounded-md px-2.5 text-body text-tertiary hover:text-primary"
              >
                Cancel
              </button>
              <Button
                hero
                control
                onClick={() => {
                  if (pasted.trim()) {
                    const slides = buildSlides(
                      pasted.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
                      THEMES.ink!,
                    );
                    studio.replaceDoc({ ...doc, slides: [...doc.slides, ...slides] });
                  }
                  setPasted("");
                  setPasteOpen(false);
                }}
              >
                Add slides
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {studio.picker ? (
        <BlockPicker key={studio.picker.mode === "edit" ? studio.picker.instance : "insert"} studio={studio} />
      ) : null}

      {exporting ? (
        <ExportDialog
          doc={doc}
          onAlt={studio.setSlideAlt}
          onClose={() => setExporting(null)}
          initial={exporting.initial}
          autoStart={exporting.auto}
        />
      ) : null}

      {filming ? (
        <VideoExport
          doc={doc}
          onMotion={(motion) => studio.replaceDoc({ ...doc, motion }, "motion", "Video settings")}
          onHold={(i, seconds) =>
            studio.replaceDoc(
              { ...doc, slides: doc.slides.map((s, k) => (k === i ? { ...s, hold: seconds } : s)) },
              `hold-${i}`,
              "Slide timing",
            )
          }
          onClose={() => setFilming(false)}
        />
      ) : null}

      {palette ? <CommandPalette items={paletteItems()} onClose={() => setPalette(false)} /> : null}
      {shortcuts ? <Shortcuts onClose={() => setShortcuts(false)} /> : null}
      {finding ? (
        <ReplaceDialog
          docs={[doc]}
          scope="deck"
          undoNote="One Undo takes it back."
          onReplace={([c]) => {
            if (!c) return;
            snapshot(c.before, "replace", sessionPlan(), "Before find and replace");
            studio.replaceDoc(c.after, undefined, "Replace");
          }}
          onOpenSlide={(_, i) => {
            studio.setSlideIndex(i);
            setFinding(false);
          }}
          onClose={() => setFinding(false)}
        />
      ) : null}

      {sharing ? <ShareDialog doc={doc} onClose={() => setSharing(false)} /> : null}

      {history ? (
        <HistoryPanel
          doc={doc}
          onRestore={(next) => studio.replaceDoc(next)}
          onClose={() => setHistory(false)}
        />
      ) : null}

      {packs ? (
        <PackPicker
          current={packIdOf(doc.styleId) ?? undefined}
          onPick={(p) => {
            applyPackNow(p);
            setPacks(false);
          }}
          onClose={() => setPacks(false)}
        />
      ) : null}

      {savingTemplate ? (
        <SaveTemplate
          doc={doc}
          clientId={doc.clientId}
          onSaved={(name) => {
            setSavingTemplate(false);
            setNote(`Saved "${name}" as a template. It is on the projects screen and in the palette.`);
          }}
          onClose={() => setSavingTemplate(false)}
        />
      ) : null}

      {formulas ? (
        <HookFormulas
          current={deckTexts(doc)[0] ?? ""}
          canAsk
          onUse={(text) => {
            studio.replaceDoc(restateSlide(doc, 0, text, themeOf(doc, listBrands())).doc, undefined, "Hook");
            setFormulas(false);
          }}
          onAsk={(pattern) => {
            setFormulas(false);
            setHooking({ pattern });
          }}
          onClose={() => setFormulas(false)}
        />
      ) : null}

      {ctaOpen ? (
        <CtaPicker
          platform={(studio.safePlatform ?? platformForSize(doc.width, doc.height)?.id ?? "linkedin") as PlatformId}
          current={deckTexts(doc).at(-1) ?? ""}
          onUse={(text) => {
            const last = doc.slides.length - 1;
            studio.replaceDoc(restateSlide(doc, last, text, themeOf(doc, listBrands())).doc, undefined, "Call to action");
            studio.setSlideIndex(last);
            setCtaOpen(false);
          }}
          onClose={() => setCtaOpen(false)}
        />
      ) : null}

      {hooking ? (
        <HookPicker
          doc={doc}
          pattern={hooking.pattern}
          framework={STRUCTURES.find((f) => f.id === doc.framework)?.name}
          onPick={(text) => {
            // Back through the generator, not typed onto the layer: the box and
            // the font size were chosen for the old words.
            const result = restateSlide(doc, 0, text, themeOf(doc, listBrands()));
            studio.replaceDoc(result.doc);
            setHooking(false);
          }}
          onClose={() => setHooking(false)}
        />
      ) : null}

      {rewriting !== null ? (
        <RewritePicker
          title={`Rewrite slide ${rewriting + 1}`}
          text={deckTexts(doc)[rewriting] ?? ""}
          deck={deckTexts(doc)}
          slot={slotAt(rewriting, doc.slides.length, STRUCTURES.find((f) => f.id === doc.framework)?.slots)}
          voice={voiceOf(doc, listBrands())}
          /*
           * Run against a COPY to answer "what would this do" without doing it.
           * restateSlide is pure and returns a new document, so asking is free
           * and the answer is exact rather than an estimate from a character
           * count that does not know the font.
           */
          slidesAfter={(candidate) =>
            restateSlide(doc, rewriting, candidate, themeOf(doc, listBrands())).doc.slides.length
          }
          onPick={(text) => {
            // Back through the generator, never typed onto the layer: the box
            // and the font size were measured for the old words.
            const result = restateSlide(doc, rewriting, text, themeOf(doc, listBrands()));
            studio.replaceDoc(result.doc);
            setRewriting(null);
          }}
          onClose={() => setRewriting(null)}
        />
      ) : null}

      {rewritingLayer ? (
        <RewritePicker
          title="Other wordings"
          text={rewritingLayer.text ?? ""}
          deck={deckTexts(doc)}
          slot={slotAt(studio.index, doc.slides.length, STRUCTURES.find((f) => f.id === doc.framework)?.slots)}
          voice={voiceOf(doc, listBrands())}
          slidesAfter={
            rebuildsOnRewrite(rewritingLayer) && slide
              ? (candidate) =>
                  restateSlide(
                    doc,
                    studio.index,
                    slideTextWith(slide, rewritingLayer.id, candidate),
                    themeOf(doc, listBrands()),
                  ).doc.slides.length
              : undefined
          }
          onPick={(text) => {
            /*
             * Two paths, and which one runs is decided by who owns the box.
             *
             * A GENERATED layer has a box measured for the old words, so the
             * slide is rebuilt from its whole text with this one line swapped.
             * Swapping the slide's entire text for one line would delete the
             * other layer on a heading-plus-body composition, which is why
             * `slideTextWith` exists.
             *
             * A HAND-EDITED layer is written to directly. `restateSlide` keeps
             * hand-edited layers verbatim and rebuilds the rest, so running it
             * here would print the new words as a generated layer and keep the
             * old hand-placed one: the same line twice. And somebody who dragged
             * a box somewhere has already said where it goes.
             */
            if (slide && rebuildsOnRewrite(rewritingLayer)) {
              const whole = slideTextWith(slide, rewritingLayer.id, text);
              const result = restateSlide(doc, studio.index, whole, themeOf(doc, listBrands()));
              studio.replaceDoc(result.doc);
            } else {
              studio.updateLayers([rewritingLayer.id], { text });
            }
            setRewritingLayer(null);
          }}
          onClose={() => setRewritingLayer(null)}
        />
      ) : null}

      {/* Ctrl+P still works, and still prints the same LayerView the canvas uses. */}
      {printRoot
        ? createPortal(
            <>
              <style>{`@page { size: ${doc.width}px ${doc.height}px; margin: 0; }`}</style>
              {doc.slides.map((s) => (
                <div
                  key={s.id}
                  style={{
                    position: "relative",
                    width: doc.width,
                    height: doc.height,
                    ...slidePaint(s),
                    breakAfter: "page",
                    overflow: "hidden",
                  }}
                >
                  {s.layers.map((l) => (
                    <LayerView key={l.id} layer={l} />
                  ))}
                </div>
              ))}
            </>,
            printRoot,
          )
        : null}
    </div>
  );
}

/**
 * A span whose seam a reorder, an insert or a lone move has broken (23.5).
 * Never repaired silently: said here, with the one fix that cannot make it
 * worse, Unspan, which frees the pieces where they are.
 */
function SeamWarnings({ studio }: { studio: StudioState }) {
  const broken = brokenSpans(studio.doc);
  if (broken.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-danger-wash px-3 py-1.5 text-caption text-secondary">
      <span className="flex-1">
        {broken.length === 1 ? "A design that ran across slides" : `${broken.length} designs that ran across slides`} no
        longer meet at the edge.
      </span>
      <button
        type="button"
        data-action="strip-view"
        onClick={() => studio.setStripView(true)}
        className="h-7 rounded-md border border-hairline px-2 text-primary"
      >
        Show in strip
      </button>
      <button
        type="button"
        data-action="unspan-broken"
        onClick={() => studio.replaceDoc(broken.reduce((d, b) => unspan(d, b.spanId), studio.doc))}
        className="h-7 rounded-md border border-hairline px-2 text-primary"
      >
        Unspan
      </button>
    </div>
  );
}

/** Whether a slide has words of its own to lay out. */
function textsOfSlide(s: { layers: Layer[] }): boolean {
  return s.layers.some((l) => l.kind === "text" && (l.text ?? "").trim() !== "" && !l.block && !l.furniture);
}
