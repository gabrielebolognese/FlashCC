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
import { Check, ImagePlus, Palette, Plus, Trash2, Type, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { listAssets, LOGO_ROLE_LABEL, LOGO_ROLES, type Asset, type LogoRole } from "./assets.js";
import {
  brandLimit,
  canAddBrand,
  listBrands,
  makeBrand,
  removeBrand,
  upsertBrand,
  type Brand,
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


