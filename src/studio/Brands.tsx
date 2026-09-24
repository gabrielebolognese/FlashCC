/**
 * The brand list and its editor.
 *
 * A brand is a named Theme, so this screen is a colour form and nothing more
 * ambitious. The restraint is deliberate: the moment a brand becomes a thing
 * documents *refer to* rather than a thing applied *once*, the whole "nothing is
 * derived" invariant goes, and every carousel starts changing under the user
 * when they touch a swatch.
 *
 * The limit is shown here and enforced in Postgres. Both, on purpose, the
 * database is what actually holds, and a paywall that only refuses after a round
 * trip, with an error, is a worse experience than one that explains itself first.
 */
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { listAssets, LOGO_ROLE_LABEL, LOGO_ROLES, type Asset, type LogoRole } from "./assets.js";
import {
  gatherDecks,
  learnVoice,
  MIN_LEARN_DECKS,
  toneFrom,
  type Learned,
} from "./learn.js";
import {
  brandLimit,
  canAddBrand,
  listBrands,
  makeBrand,
  removeBrand,
  upsertBrand,
  type Brand,
  hasVoice,
  MAX_VOICE_SAMPLES,
  tidyVoice,
  type Voice,
} from "./brand.js";
import { importImages, urlFor } from "./library.js";
import { ACCEPT } from "./media.js";
import type { Plan } from "./cloud.js";
import { Empty } from "./Dash.js";
import { allFonts } from "./model.js";
import type { Theme } from "./presets.js";
import { SlidePreview } from "./SlidePreview.js";
import { buildSlides } from "./compositions.js";
import { DEFAULT_STYLE, STYLES } from "./styles.js";

const field =
  "h-8 w-full rounded-xl border border-hairline bg-surface-1 px-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

const ROLES = [
  { key: "bg", label: "Background", hint: "The ground every slide sits on" },
  { key: "fg", label: "Text", hint: "Headings and the words that carry" },
  { key: "accent", label: "Accent", hint: "Rules, numerals, the call to action" },
  { key: "muted", label: "Secondary", hint: "Body copy and anything quieter" },
] as const;

/** One preview slide, so a brand is judged on what it looks like, not on swatches. */
const previewSlide = (theme: Theme) =>
  buildSlides(["Your carousel title", "And the line underneath it."], theme)[0];

function Swatches({ theme }: { theme: Theme }) {
  return (
    <div className="flex gap-1">
      {ROLES.map((r) => (
        <span
          key={r.key}
          title={r.label}
          className="h-4 w-4 rounded-md border border-hairline"
          style={{ background: theme[r.key] }}
        />
      ))}
    </div>
  );
}

/* ── logos ────────────────────────────────────────────────────────────────── */

/**
 * Three slots, because a logo that only works on white is half a logo.
 *
 * Each one is an ordinary library upload with `brandId` and `role` set, so a
 * mark is a file in the library that a brand happens to point at, never a copy
 * living inside the brand. Five brands in an agency account can share one file,
 * which is the whole reason 5.2 waited for 5.1.
 */
function LogoSlot({
  brand,
  role,
  asset,
  onPick,
  onClear,
}: {
  brand: Brand;
  role: LogoRole;
  asset: Asset | undefined;
  onPick: (assetId: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = asset ? urlFor(asset) : undefined;

  // "On light" is previewed on light. Showing a white wordmark on the app's own
  // dark chrome is how a broken logo gets shipped.
  const ground = role === "light" ? "#f5f5f4" : role === "dark" ? "#111418" : brand.theme.bg;

  return (
    <div className="flex-1">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          void importImages([file], { brandId: brand.id, role, folder: "Logos" })
            .then((result) => {
              const first = result.assets[0];
              if (first) onPick(first.id);
            })
            .finally(() => setBusy(false));
        }}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        title={`Upload the ${LOGO_ROLE_LABEL[role].toLowerCase()} version`}
        style={{ background: ground }}
        className="relative grid h-[72px] w-full place-items-center overflow-hidden rounded-xl border border-hairline hover:border-accent-dim"
      >
        {busy ? (
          <span className="text-caption text-muted">Uploading…</span>
        ) : url ? (
          <img src={url} alt={LOGO_ROLE_LABEL[role]} className="max-h-[52px] max-w-[85%] object-contain" />
        ) : (
          <ImagePlus size={16} strokeWidth={2} className="text-muted" />
        )}
      </button>

      <div className="mt-1 flex items-center gap-1">
        <span className="flex-1 truncate text-caption text-tertiary">{LOGO_ROLE_LABEL[role]}</span>
        {asset ? (
          <button
            type="button"
            aria-label={`Remove the ${LOGO_ROLE_LABEL[role]} logo`}
            onClick={onClear}
            className="text-muted hover:text-danger"
          >
            <X size={11} strokeWidth={2.4} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Logos({ brand, onChange }: { brand: Brand; onChange: (b: Brand) => void }) {
  // Re-read on every render rather than held in state: an upload from a sibling
  // slot has to show here, and the list is a handful of records.
  const assets = listAssets();

  const set = (role: LogoRole, assetId: string | undefined) =>
    onChange({
      ...brand,
      logos: { ...brand.logos, [role]: assetId },
      updatedAt: new Date().toISOString(),
    });

  return (
    <div>
      <span className="text-overline uppercase text-tertiary">Logo</span>
      <div className="mt-2 flex gap-2">
        {LOGO_ROLES.map((role) => (
          <LogoSlot
            key={role}
            brand={brand}
            role={role}
            asset={assets.find((a) => a.id === brand.logos?.[role])}
            onPick={(id) => set(role, id)}
            onClear={() => set(role, undefined)}
          />
        ))}
      </div>
      <p className="mt-2 text-caption leading-4 text-muted">
        A mark is used everywhere when there is one. Otherwise the light or dark version is picked
        from the slide it lands on, which is the only thing an automatic placement has to get
        right.
      </p>
    </div>
  );
}

/* ── voice ────────────────────────────────────────────────────────────────── */

/**
 * How this brand sounds, which is the half a brand was missing.
 *
 * Deliberately three plain fields and no wizard. The single most useful thing
 * somebody can do here is paste two posts they already wrote, and any amount of
 * guided onboarding around that is friction in front of a paste.
 *
 * Nothing is required. A brand with an empty voice produces exactly the prompt
 * it produced before this existed, so this can be ignored forever without the
 * product feeling half-configured.
 */
/**
 * Reading somebody's own carousels to work out how they write.
 *
 * **Nothing is applied until "Use this" is pressed, and unchecking a trait
 * changes what gets written.** A voice somebody disagrees with is worse than no
 * voice, which is already the rule `contextVoice` follows when it refuses to
 * guess between brands, and that rule applies just as much to a voice we
 * generated as to one we inferred.
 *
 * The evidence under each trait is the reason the panel exists. Every line was
 * checked against the decks on the server, so unticking one is a judgement made
 * against something real rather than against an adjective.
 */
function LearnVoice({
  brand,
  existing,
  onUse,
}: {
  brand: Brand;
  existing: Voice;
  onUse: (tone: string, avoid: string[]) => void;
}) {
  const [phase, setPhase] = useState<
    { at: "idle" } | { at: "loading" } | { at: "ready"; learned: Learned } | { at: "failed"; error: string }
  >({ at: "idle" });
  const [kept, setKept] = useState<boolean[]>([]);
  const [tone, setTone] = useState("");
  const [avoid, setAvoid] = useState<string[]>([]);

  // Read once, when the panel is first shown, rather than on every render: this
  // touches localStorage for every saved document.
  const source = useMemo(() => gatherDecks(brand.id), [brand.id]);

  const enough = source.count >= MIN_LEARN_DECKS;

  const run = () => {
    setPhase({ at: "loading" });
    learnVoice(source.decks, hasVoice(existing) ? existing : undefined)
      .then((learned) => {
        setPhase({ at: "ready", learned });
        setKept(learned.observed.map(() => true));
        setTone(learned.tone);
        setAvoid(learned.avoid);
      })
      .catch((e: unknown) =>
        setPhase({ at: "failed", error: e instanceof Error ? e.message : "Could not read your carousels" }),
      );
  };

  return (
    <div className="mt-3 rounded-xl border border-hairline bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-caption text-tertiary">
          {enough
            ? `From your ${source.count} saved carousel${source.count === 1 ? "" : "s"}`
            : `${source.count} saved carousel${source.count === 1 ? "" : "s"}, needs ${MIN_LEARN_DECKS}`}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          disabled={!enough || phase.at === "loading"}
          onClick={run}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:pointer-events-none disabled:opacity-40"
        >
          {phase.at === "loading" ? (
            <RefreshCw size={12} strokeWidth={2} className="fcc-spin" />
          ) : (
            <Sparkles size={12} strokeWidth={2} />
          )}
          Learn from my carousels
        </button>
      </div>

      {/*
        Both limits stated up front, because both are true and both would
        otherwise be discovered as disappointments.
      */}
      <p className="mt-1.5 text-caption leading-4 text-muted">
        It reads carousels, which are short and structured. Your newsletter voice is a different
        voice.
        {source.scope === "all" && enough
          ? " These are your most recent carousels, not only the ones made with this brand."
          : ""}
      </p>

      {source.drafted && enough ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-caption leading-4 text-muted">
          <AlertTriangle size={12} strokeWidth={2.2} className="mt-0.5 shrink-0 text-muted" />
          <span>
            Most of these have no edits of your own on the canvas, so they may be mostly what the
            AI wrote. Learning your voice from its output is a loop. If you wrote them in the
            compose screen and never touched a layer, ignore this.
          </span>
        </p>
      ) : null}

      {phase.at === "failed" ? (
        <p className="mt-2 text-caption leading-4 text-danger">{phase.error}</p>
      ) : null}

      {phase.at === "ready" ? (
        <div className="mt-3 border-t border-hairline pt-3">
          {hasVoice(existing) ? (
            <div className="mb-2.5 rounded-lg border border-hairline bg-surface-1 p-2">
              <span className="text-caption text-tertiary">What you have now</span>
              <p className="mt-0.5 text-caption leading-4 text-muted">
                {existing.tone || "(no description)"}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="text-caption text-tertiary">Proposed</span>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>

          <div className="mt-2.5 flex flex-col gap-1.5">
            {phase.learned.observed.map((o, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-hairline bg-surface-1 p-2"
              >
                <input
                  type="checkbox"
                  checked={kept[i] ?? true}
                  onChange={(e) =>
                    setKept((k) => k.map((v, j) => (j === i ? e.target.checked : v)))
                  }
                  className="mt-0.5 h-3 w-3 shrink-0 accent-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-primary">{o.trait}</span>
                  {/* Checked against the decks on the server. Anything the model
                      tidied was dropped along with the trait it supported. */}
                  <span className="mt-0.5 block text-caption leading-4 text-muted">
                    &ldquo;{o.evidence}&rdquo;
                  </span>
                </span>
              </label>
            ))}
          </div>

          {avoid.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {avoid.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setAvoid((list) => list.filter((x) => x !== w))}
                  title="Remove"
                  className="flex h-6 items-center gap-1 rounded-md border border-hairline px-1.5 text-caption text-tertiary hover:border-danger-dim hover:text-danger"
                >
                  {w}
                  <X size={10} strokeWidth={2.4} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onUse(toneFrom(phase.learned, kept, tone), avoid);
                setPhase({ at: "idle" });
              }}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-7 items-center rounded-lg px-3 text-caption font-semibold"
            >
              {hasVoice(existing) ? "Replace what I have" : "Use this"}
            </button>
            <button
              type="button"
              onClick={() => setPhase({ at: "idle" })}
              className="text-caption text-tertiary hover:text-primary"
            >
              Discard
            </button>
            <div className="flex-1" />
            <span className="text-caption text-muted">
              {kept.filter(Boolean).length} of {phase.learned.observed.length} kept
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VoiceEditor({ brand, onChange }: { brand: Brand; onChange: (b: Brand) => void }) {
  const voice: Voice = brand.voice ?? {};

  const set = (patch: Partial<Voice>) =>
    onChange({
      ...brand,
      // Tidied on the way in rather than on the way out: the ceilings then hold
      // at rest as well as in the prompt, so a pasted newsletter never becomes a
      // stored newsletter.
      voice: tidyVoice({ ...voice, ...patch }),
      updatedAt: new Date().toISOString(),
    });

  const samples = voice.samples ?? [];

  const setSample = (i: number, text: string) => {
    const next = [...samples];
    next[i] = text;
    set({ samples: next });
  };

  return (
    <div>
      <span className="text-overline uppercase text-tertiary">Voice</span>
      <p className="mt-1 text-caption leading-4 text-muted">
        What the AI matches when it drafts for this brand. Optional, and the posts do far more
        than the description.
      </p>

      <label className="mt-2.5 block">
        <span className="text-caption text-tertiary">How would you describe it?</span>
        <input
          value={voice.tone ?? ""}
          onChange={(e) => set({ tone: e.target.value })}
          placeholder="Blunt, no throat-clearing. Short sentences."
          className={`${field} mt-1`}
        />
      </label>

      <LearnVoice
        brand={brand}
        existing={voice}
        // Applied only here, only on a press, and only with what survived the
        // checkboxes. `samples` is deliberately untouched: choosing which of
        // your posts represents you is not a machine's call.
        onUse={(tone, avoid) => set({ tone, ...(avoid.length > 0 ? { avoid } : {}) })}
      />

      <div className="mt-3">
        <span className="text-caption text-tertiary">
          Two or three posts you have actually written
        </span>
        <div className="mt-1 flex flex-col gap-2">
          {Array.from({ length: MAX_VOICE_SAMPLES }, (_, i) => (
            <textarea
              key={i}
              value={samples[i] ?? ""}
              onChange={(e) => setSample(i, e.target.value)}
              rows={2}
              placeholder={i === 0 ? "Paste one here. Any post, not necessarily a carousel." : "Another, if you have one."}
              className={`${field} h-auto resize-y py-2 leading-4`}
            />
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-caption text-tertiary">Words you never use</span>
        <input
          value={(voice.avoid ?? []).join(", ")}
          // Split on the way in rather than stored as a string, so the prompt
          // never has to parse anything and a trailing comma is not a word.
          onChange={(e) => set({ avoid: e.target.value.split(",") })}
          placeholder="leverage, synergy, game-changer"
          className={`${field} mt-1`}
        />
      </label>
    </div>
  );
}

/* ── editor ───────────────────────────────────────────────────────────────── */

function Editor({
  brand,
  onChange,
  onDone,
  onDelete,
}: {
  brand: Brand;
  onChange: (b: Brand) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fonts = useMemo(() => allFonts(), []);

  const set = (patch: Partial<Brand>) =>
    onChange({ ...brand, ...patch, updatedAt: new Date().toISOString() });
  const setTheme = (patch: Partial<Theme>) => set({ theme: { ...brand.theme, ...patch } });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <label className="block">
          <span className="text-overline uppercase text-tertiary">Name</span>
          <input
            value={brand.name}
            onChange={(e) => set({ name: e.target.value })}
            className={`${field} mt-1.5`}
            placeholder="Acme, or a client's name"
          />
        </label>

        <div>
          <span className="text-overline uppercase text-tertiary">Colours</span>
          <div className="mt-2 space-y-2">
            {ROLES.map((r) => (
              <div key={r.key} className="flex items-center gap-2.5">
                <input
                  type="color"
                  aria-label={r.label}
                  value={brand.theme[r.key]}
                  onChange={(e) => setTheme({ [r.key]: e.target.value } as Partial<Theme>)}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-hairline bg-transparent"
                />
                <input
                  value={brand.theme[r.key]}
                  onChange={(e) => setTheme({ [r.key]: e.target.value } as Partial<Theme>)}
                  spellCheck={false}
                  className={`${field} w-[92px] shrink-0 font-mono`}
                />
                <div className="min-w-0">
                  <div className="text-body text-secondary">{r.label}</div>
                  <div className="truncate text-caption text-muted">{r.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Logos brand={brand} onChange={onChange} />

        <VoiceEditor brand={brand} onChange={onChange} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-overline uppercase text-tertiary">Headings</span>
            <select
              value={brand.theme.displayFont ?? "sans"}
              onChange={(e) => setTheme({ displayFont: e.target.value })}
              className={`${field} mt-1.5`}
            >
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-overline uppercase text-tertiary">Body</span>
            <select
              value={brand.theme.bodyFont ?? "sans"}
              onChange={(e) => setTheme({ bodyFont: e.target.value })}
              className={`${field} mt-1.5`}
            >
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {confirmDelete ? (
            <>
              <span className="text-caption text-secondary">Delete this brand?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex h-8 items-center rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-8 items-center rounded-xl border border-danger-dim bg-danger-wash px-3 text-body-strong text-danger"
              >
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-body text-tertiary hover:bg-white/[0.04] hover:text-danger"
            >
              <Trash2 size={13} strokeWidth={2} />
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDone}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-body-strong hover:brightness-110"
          >
            <Check size={14} strokeWidth={2.4} />
            Done
          </button>
        </div>
      </div>

      <div>
        <span className="text-overline uppercase text-tertiary">Preview</span>
        <div className="mt-2 overflow-hidden rounded-2xl border border-hairline">
          <SlidePreview slide={previewSlide(brand.theme)} />
        </div>
        <p className="mt-2 text-caption leading-4 text-muted">
          Applied once, when you use it. Editing a brand later never rewrites a carousel you have
          already made.
        </p>
      </div>
    </div>
  );
}

/* ── the screen ───────────────────────────────────────────────────────────── */

export function Brands({ plan }: { plan: Plan | undefined }) {
  const [brands, setBrands] = useState<Brand[]>(() => listBrands());
  const [editing, setEditing] = useState<Brand | null>(null);

  const limit = brandLimit(plan);
  const room = canAddBrand(brands.length, plan);

  const commit = (b: Brand) => {
    setEditing(b);
    setBrands(upsertBrand(b));
  };

  const create = () => {
    // Seeded from the default style rather than from nothing: an empty colour
    // form is a worse starting point than one that already looks like something.
    const base = STYLES[0] ?? DEFAULT_STYLE;
    const brand = makeBrand(`Brand ${brands.length + 1}`, base.theme);
    setBrands(upsertBrand(brand));
    setEditing(brand);
  };

  if (editing) {
    return (
      <>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="mb-4 text-caption text-tertiary hover:text-primary"
        >
          ← All brands
        </button>
        <Editor
          brand={editing}
          onChange={commit}
          onDone={() => setEditing(null)}
          onDelete={() => {
            setBrands(removeBrand(editing.id));
            setEditing(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-caption text-tertiary">
          {brands.length} of {limit === Infinity ? "unlimited" : limit}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={create}
          disabled={!room}
          title={room ? undefined : `Your plan includes ${limit}`}
          style={room ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" } : undefined}
          className={[
            "flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-body-strong",
            room
              ? "hover:brightness-110"
              : "pointer-events-none border border-hairline text-muted opacity-60",
          ].join(" ")}
        >
          <Plus size={14} strokeWidth={2.4} />
          New brand
        </button>
      </div>

      {!room ? (
        <p className="mb-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-body text-tertiary">
          Your plan includes {limit} brand{limit === 1 ? "" : "s"}. Pro includes three, Agency as
          many as you like.
        </p>
      ) : null}

      {brands.length === 0 ? (
        <Empty
          icon={Palette}
          title="No brands yet"
          body="A brand is your colours and typefaces, saved with a name. Make one and every new carousel starts there instead of from scratch."
          action={
            <button
              type="button"
              onClick={create}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
            >
              Make one
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setEditing(b)}
              className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 text-left hover:border-accent-dim"
            >
              <div className="h-[132px]" style={{ background: b.theme.bg }}>
                <SlidePreview slide={previewSlide(b.theme)} />
              </div>
              <div className="p-3">
                <div className="truncate text-body-strong text-primary">{b.name}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Swatches theme={b.theme} />
                  <div className="flex-1" />
                  <span className="flex items-center gap-1 text-caption text-muted">
                    <Type size={11} strokeWidth={2} />
                    {b.theme.displayFont ?? "sans"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}


