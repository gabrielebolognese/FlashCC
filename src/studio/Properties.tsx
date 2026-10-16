import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Group,
  LayoutGrid,
  Rows3,
  StretchHorizontal,
  Ungroup,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Italic,
  Trash2,
  Underline,
  Wand2,
} from "lucide-react";
import { TextEffectField } from "./TextEffectField.js";
import { FontOptions } from "./TypeControls.js";
import { useState, type ReactNode } from "react";

import { IconButton } from "../ui/IconButton.js";
import { GradientEditor } from "./GradientEditor.js";
import { averageColour, makeGradient, type Gradient } from "./gradient.js";
import { brandIdentity, brandIdOf, furnitureLogo, listBrands } from "./brand.js";
import { clearFurniture, FURNITURE_SETS, stampFurniture } from "./furniture.js";
import { logoResolver } from "./library.js";
import { FORMATS, allFonts, type Layer, type MediaItem, type SlideImage } from "./model.js";
import { DEFAULT_SCRIM } from "./paint.js";
import { TextureField } from "./TextureField.js";
import { PictureTools, TextScrimField } from "./PictureTools.js";
import { focalFromClick } from "./imagetools.js";
import { unitsOf } from "./tidy.js";
import type { ActionId } from "./actions.js";
import type { Studio } from "./useStudio.js";

/** Properties for the current selection. Nothing selected → the slide itself. */
export function Properties({
  studio,
  onRewrite,
}: {
  studio: Studio;
  /** Opens the rewrite picker for one text layer. Absent hides the control. */
  onRewrite?: ((layer: Layer) => void) | undefined;
}) {
  const { selected, selection, slide, doc } = studio;
  const one = selected.length === 1 ? selected[0] : null;
  const set = (patch: Partial<Layer>, coalesce?: string) =>
    studio.updateLayers(selection, patch, coalesce);

  if (selected.length === 0) {
    return (
      <aside className="w-[232px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
        <div className="mb-3 text-title text-primary">Slide</div>
        <Field label="Background">
          <PaintPicker
            palette={doc.palette}
            colour={slide?.background ?? "#000000"}
            gradient={slide?.gradient}
            image={slide?.image}
            media={doc.media}
            onColour={studio.setBackground}
            onGradient={studio.setBackgroundGradient}
            onImage={studio.setBackgroundImage}
          />
        </Field>
        <TextureField studio={studio} />
        <Field label="Canvas">
          <div className="flex gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                data-action={`format:${f.id}`}
                onClick={() => studio.setFormat(f.w, f.h)}
                className={[
                  "h-7 flex-1 rounded-md border text-caption",
                  doc.width === f.w && doc.height === f.h
                    ? "border-accent text-accent"
                    : "border-hairline text-tertiary hover:text-primary",
                ].join(" ")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>
        <TidyField key={slide?.id} studio={studio} />
        <FurnitureField studio={studio} />
        <p className="mt-4 border-t border-hairline pt-3 text-caption leading-[16px] text-muted">
          Pick a tool on the left, then drag on the canvas to draw. Click anything to select it.
        </p>
      </aside>
    );
  }

  const isText = selected.every((l) => l.kind === "text");
  const isIcon = selected.some((l) => l.kind === "icon" || l.icon);

  return (
    <aside className="w-[232px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="truncate text-title text-primary">
          {selected.length > 1 ? `${selected.length} layers` : (one?.name ?? "Layer")}
        </span>
        <div className="flex-1" />
        <IconButton icon={Trash2} label="Delete" danger action="delete-layer" onClick={studio.removeSelected} />
      </div>

      {one ? (
        <Field label="Position &amp; size">
          <div className="grid grid-cols-2 gap-1.5">
            <Num label="X" value={one.x} onChange={(x) => set({ x }, "x")} />
            <Num label="Y" value={one.y} onChange={(y) => set({ y }, "y")} />
            <Num label="W" value={one.w} onChange={(w) => set({ w: Math.max(4, w) }, "w")} />
            <Num label="H" value={one.h} onChange={(h) => set({ h: Math.max(4, h) }, "h")} />
          </div>
        </Field>
      ) : null}

      <Field label="Arrange">
        <div className="flex gap-1">
          <Arrange icon={ArrowUpToLine} label="Bring to front" action="bring-front" onClick={() => studio.reorder("front")} />
          <Arrange icon={ArrowUp} label="Forward" action="forward" onClick={() => studio.reorder("forward")} />
          <Arrange icon={ArrowDown} label="Backward" action="backward" onClick={() => studio.reorder("backward")} />
          <Arrange icon={ArrowDownToLine} label="Send to back" action="send-back" onClick={() => studio.reorder("back")} />
        </div>
      </Field>

      {(() => {
        // Any stamped layer of a block still on the slide offers its form back.
        const stamped = selected.find((l) => l.block && slide?.blocks?.some((b) => b.instance === l.block!.instance));
        return stamped ? (
          <Field label="Block">
            <button
              type="button"
              data-action="edit-block"
              onClick={() => studio.setPicker({ mode: "edit", instance: stamped.block!.instance })}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              <LayoutGrid size={13} strokeWidth={2} />
              Edit as block
            </button>
            {stamped.verbatim ? (
              <p className="mt-1.5 text-caption leading-4 text-muted">
                Verbatim quote. Changing the words removes the mark.
              </p>
            ) : null}
          </Field>
        ) : null;
      })()}

      <LayoutTools studio={studio} />

      {one && doc.slides.length > 1 ? <MatchField key={one.id} studio={studio} layer={one} /> : null}

      {/*
        The roadmap said this goes "under the text field". There is no text field
        in this panel: a layer's words are edited in place on the canvas, through
        `editingId`. So it sits at the top of the text block instead, which is
        where somebody looking at a text layer starts reading.
      */}
      {isText && one && onRewrite ? (
        <Field label="Rewrite">
          <button
            type="button"
            data-action="rewrite-text"
            onClick={() => onRewrite(one)}
            disabled={!(one.text ?? "").trim()}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <Wand2 size={13} strokeWidth={2} />
            Ask for other wordings
          </button>
        </Field>
      ) : null}

      {one?.kind === "image" && one.src ? <PictureTools key={`pic-${one.id}`} studio={studio} layer={one} /> : null}
      {isText && one ? <TextScrimField studio={studio} layer={one} /> : null}

      {isText ? (
        <>
          <Field label="Font">
            <select
              value={one?.fontFamily ?? "sans"}
              onChange={(e) => set({ fontFamily: e.target.value })}
              className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
            >
              <FontOptions brandId={brandIdOf(doc.styleId ?? "") ?? undefined} />
            </select>
          </Field>

          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num label="Size" value={one?.fontSize ?? 64} step={2} onChange={(v) => set({ fontSize: Math.max(6, v) }, "fs")} />
            <Num
              label="Line"
              value={Math.round((one?.lineHeight ?? 1.2) * 100)}
              step={5}
              onChange={(v) => set({ lineHeight: v / 100 }, "lh")}
            />
          </div>

          <Field label="Style">
            <div className="flex gap-1">
              <Toggle
                icon={Bold}
                active={(one?.fontWeight ?? 400) >= 600}
                onClick={() => set({ fontWeight: (one?.fontWeight ?? 400) >= 600 ? 400 : 700 })}
              />
              <Toggle icon={Italic} active={!!one?.italic} onClick={() => set({ italic: !one?.italic })} />
              <Toggle icon={Underline} active={!!one?.underline} onClick={() => set({ underline: !one?.underline })} />
              <div className="w-1" />
              <Toggle icon={AlignLeft} active={one?.align === "left"} onClick={() => set({ align: "left" })} />
              <Toggle icon={AlignCenter} active={one?.align === "center"} onClick={() => set({ align: "center" })} />
              <Toggle icon={AlignRight} active={one?.align === "right"} onClick={() => set({ align: "right" })} />
            </div>
          </Field>

          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num
              label="Spacing"
              value={Math.round((one?.letterSpacing ?? 0) * 100)}
              onChange={(v) => set({ letterSpacing: v / 100 }, "ls")}
            />
            <button
              type="button"
              data-control
              onClick={() => set({ uppercase: !one?.uppercase })}
              className={[
                "h-7 rounded-md border text-caption",
                one?.uppercase ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              UPPER
            </button>
          </div>

          {one ? (
            <TextEffectField
              studio={studio}
              layer={one}
              swatch={(value, onChange) => <Colour palette={doc.palette} value={value} onChange={onChange} />}
            />
          ) : null}
        </>
      ) : null}

      <Field label={isText || isIcon ? "Colour" : "Fill"}>
        {isIcon ? (
          // An icon is a stroked path; a ramp has nothing to fill.
          <Colour
            palette={doc.palette}
            value={one?.icon && one.fill === "none" ? (one.stroke ?? "#ffffff") : (one?.fill ?? "#ffffff")}
            // A bundled outline icon is ALL stroke and a filled one all fill:
            // recolouring one must not turn the other on.
            onChange={(c) =>
              studio.updateEach(
                (l) =>
                  l.icon
                    ? l.fill === "none"
                      ? { ...l, stroke: c }
                      : { ...l, fill: c }
                    : { ...l, fill: c, stroke: c },
                selection,
              )
            }
          />
        ) : (
          <PaintPicker
            palette={doc.palette}
            colour={one?.fill ?? "#ffffff"}
            gradient={one?.gradient}
            onColour={(fill) => set({ fill, gradient: undefined })}
            // Gradient text is an effect too (22.4): it replaces any other.
            onGradient={(gradient) => set(isText ? { gradient, textEffect: undefined } : { gradient })}
          />
        )}
      </Field>

      {!isText ? (
        <>
          <div className="mb-2.5 grid grid-cols-2 gap-1.5">
            <Num label="Radius" value={one?.radius ?? 0} step={2} onChange={(radius) => set({ radius: Math.max(0, radius) }, "r")} />
            <Num
              label="Stroke"
              value={one?.strokeWidth ?? 0}
              onChange={(strokeWidth) =>
                set({ strokeWidth: Math.max(0, strokeWidth), stroke: one?.stroke ?? one?.fill ?? "#fff" }, "sw")
              }
            />
          </div>
          {one && one.strokeWidth > 0 ? (
            <Field label="Stroke colour">
              <Colour palette={doc.palette} value={one.stroke ?? "#ffffff"} onChange={(stroke) => set({ stroke })} />
            </Field>
          ) : null}
        </>
      ) : null}

      <Field label="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((one?.opacity ?? 1) * 100)}
          onChange={(e) => set({ opacity: Number(e.target.value) / 100 }, "op")}
          className="w-full accent-[color:var(--accent)]"
        />
      </Field>

      <Field label="Rotation">
        <input
          type="range"
          min={-180}
          max={180}
          value={one?.rotation ?? 0}
          onChange={(e) => set({ rotation: Number(e.target.value) }, "rot")}
          className="w-full accent-[color:var(--accent)]"
        />
      </Field>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-caption text-tertiary" dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex h-7 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-1.5">
      <span className="text-caption text-muted">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-transparent text-right font-mono text-caption text-primary outline-none"
      />
    </label>
  );
}

function Toggle({ icon: Icon, active, onClick }: { icon: typeof Bold; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-control
      onClick={onClick}
      className={[
        "grid h-7 w-7 place-items-center rounded-md border",
        active ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
      ].join(" ")}
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  );
}

function Arrange({
  icon: Icon,
  label,
  action,
  onClick,
}: {
  icon: typeof ArrowUp;
  label: string;
  /** The registry action (24.2); typed, so a button cannot name one that does not exist. */
  action: ActionId;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-action={action}
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 flex-1 place-items-center rounded-md border border-hairline text-tertiary hover:text-primary"
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  );
}

function Colour({
  palette,
  value,
  onChange,
}: {
  palette: string[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {palette.slice(0, 10).map((hex) => (
        <button
          key={hex}
          type="button"
          data-control
          onClick={() => onChange(hex)}
          className={[
            "h-6 w-6 rounded-md border",
            value.toLowerCase() === hex.toLowerCase() ? "border-accent" : "border-hairline",
          ].join(" ")}
          style={{ background: hex }}
        />
      ))}
      <label className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-edge">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    </div>
  );
}

/**
 * Solid or gradient, on one control. Switching to a gradient seeds it from the solid
 * colour already in use, so the first thing you see is a ramp of the thing you had
 * rather than an unrelated default.
 */
/**
 * Solid, gradient or picture, for the slide behind everything.
 *
 * The picture tab is always offered, even with nothing uploaded, because a tab
 * that appears only once you have media is a feature nobody discovers. Empty, it
 * says where images come from instead of hiding.
 */
function PaintPicker({
  palette,
  colour,
  gradient,
  image,
  media,
  onColour,
  onGradient,
  onImage,
}: {
  palette: string[];
  colour: string;
  gradient: Gradient | undefined;
  /**
   * Only the slide takes a picture. A layer's fill is solid or gradient: an
   * image layer already carries its own `src`, and offering a second, different
   * way to put a picture in one would be two features that look like one.
   * Omitting `onImage` is what hides the tab.
   */
  image?: SlideImage | undefined;
  media?: readonly MediaItem[] | undefined;
  onColour: (hex: string) => void;
  onGradient: (g: Gradient | undefined) => void;
  onImage?: ((i: SlideImage | undefined) => void) | undefined;
}) {
  const pictures = media ?? [];
  const mode: "solid" | "gradient" | "image" = image ? "image" : gradient ? "gradient" : "solid";

  const tab = (id: typeof mode, label: string, onPick: () => void) => (
    <button
      type="button"
      data-control
      onClick={onPick}
      className={[
        "h-6 flex-1 rounded-sm text-caption",
        mode === id ? "bg-surface-4 text-primary" : "text-tertiary hover:bg-white/[0.04]",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex h-7 items-center gap-0.5 rounded-md border border-hairline p-0.5">
        {tab("solid", "Solid", () => {
          onGradient(undefined);
          onImage?.(undefined);
        })}
        {tab("gradient", "Gradient", () => {
          onImage?.(undefined);
          onGradient(gradient ?? makeGradient([colour, shift(colour)]));
        })}
        {onImage
          ? tab("image", "Image", () => {
              // With nothing uploaded there is no picture to select, so this
              // stays on Solid and the hint below says where images come from.
              const first = pictures[0];
              if (!first) return;
              onImage(
                image ?? {
                  src: first.src,
                  ...(first.assetId ? { assetId: first.assetId } : {}),
                  ...(first.credit ? { credit: first.credit } : {}),
                  fit: "cover",
                  scrim: DEFAULT_SCRIM,
                },
              );
            })
          : null}
      </div>

      {mode === "image" && image && onImage ? (
        <BackgroundImage image={image} media={pictures} onChange={onImage} />
      ) : mode === "gradient" ? (
        <GradientEditor value={gradient!} onChange={onGradient} />
      ) : (
        <>
          <Colour palette={palette} value={colour} onChange={onColour} />
          {onImage && pictures.length === 0 ? (
            <p className="mt-2 text-caption leading-[15px] text-muted">
              Drop a picture into Media on the left to use one as the background.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The picture itself, how it fills the frame, and how far it is dimmed. */
function BackgroundImage({
  image,
  media,
  onChange,
}: {
  image: SlideImage;
  media: readonly MediaItem[];
  onChange: (i: SlideImage | undefined) => void;
}) {
  const scrim = image.scrim ?? DEFAULT_SCRIM;
  const focal = image.focal ?? { x: 0.5, y: 0.5 };

  return (
    <div>
      {/* The focal point (21.4): clicked on the whole picture, kept in frame by every crop. */}
      <div className="relative mb-1.5 cursor-crosshair overflow-hidden rounded-md border border-hairline">
        <img
          src={image.src}
          alt=""
          draggable={false}
          title="Click the subject to keep it in frame"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onChange({ ...image, focal: focalFromClick({ x: e.clientX, y: e.clientY }, r) });
          }}
          className="block h-auto w-full"
        />
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/40"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-1">
        {media.map((m) => (
          <button
            key={m.id}
            type="button"
            data-control
            title={m.name}
            onClick={() =>
              // Both replaced, never kept: the previous picture's asset id or
              // credit left on a different picture would resolve or credit
              // the wrong one.
              onChange({ ...image, src: m.src, assetId: m.assetId, credit: m.credit })
            }
            className={[
              "h-10 overflow-hidden rounded-md border-2",
              m.src === image.src ? "border-accent" : "border-hairline hover:border-surface-5",
            ].join(" ")}
          >
            <img src={m.src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <div className="mt-2 flex h-7 items-center gap-0.5 rounded-md border border-hairline p-0.5">
        {(["cover", "contain"] as const).map((f) => (
          <button
            key={f}
            type="button"
            data-control
            onClick={() => onChange({ ...image, fit: f })}
            className={[
              "h-6 flex-1 rounded-sm text-caption capitalize",
              (image.fit ?? "cover") === f
                ? "bg-surface-4 text-primary"
                : "text-tertiary hover:bg-white/[0.04]",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* The control that decides whether the words can be read at all. */}
      <label className="mt-2 block">
        <span className="flex items-center justify-between text-caption text-tertiary">
          Dim <span className="font-mono text-muted">{Math.round(scrim * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(scrim * 100)}
          onChange={(e) => onChange({ ...image, scrim: Number(e.target.value) / 100 })}
          className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-surface-4 accent-accent"
        />
      </label>

      <button
        type="button"
        data-control
        onClick={() => onChange(undefined)}
        className="mt-2 h-7 w-full rounded-md border border-hairline text-caption text-tertiary hover:border-accent-dim hover:text-accent"
      >
        Remove picture
      </button>
    </div>
  );
}

/** A second stop that is visibly different from the first, whichever end it is at. */
function shift(hex: string): string {
  const n = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  if (Number.isNaN(n)) return "#000000";
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const light = (r! * 299 + g! * 587 + b! * 114) / 1000 > 128;
  const to = (v: number) => Math.round(light ? v * 0.45 : v + (255 - v) * 0.55);
  return `#${((to(r!) << 16) | (to(g!) << 8) | to(b!)).toString(16).padStart(6, "0")}`;
}

/**
 * Align, distribute, equal gap, match width, group (18.2, 18.6).
 *
 * Each control appears only when it means something for this selection: one
 * thing aligns to the artboard, two can share a gap, three can be distributed.
 * A greyed-out button that cannot do anything is still a button to read past.
 */
function LayoutTools({ studio }: { studio: Studio }) {
  const { selected, selection, slide } = studio;
  const units = unitsOf(slide?.layers ?? [], selection).length;
  const grouped = selected.some((l) => l.groupId);
  const [note, setNote] = useState("");

  return (
    <>
      <Field label={units === 1 ? "Align to the slide" : "Align"}>
        <div className="flex gap-1">
          <Arrange icon={AlignStartVertical} label="Align left" action="align-left" onClick={() => studio.alignSelected("left")} />
          <Arrange icon={AlignCenterVertical} label="Align centres" action="align-hcenter" onClick={() => studio.alignSelected("hcenter")} />
          <Arrange icon={AlignEndVertical} label="Align right" action="align-right" onClick={() => studio.alignSelected("right")} />
          <Arrange icon={AlignStartHorizontal} label="Align top" action="align-top" onClick={() => studio.alignSelected("top")} />
          <Arrange icon={AlignCenterHorizontal} label="Align middles" action="align-vcenter" onClick={() => studio.alignSelected("vcenter")} />
          <Arrange icon={AlignEndHorizontal} label="Align bottom" action="align-bottom" onClick={() => studio.alignSelected("bottom")} />
        </div>
      </Field>

      {units >= 2 ? (
        <Field label="Space">
          <div className="flex gap-1">
            {units >= 3 ? (
              <>
                <Arrange
                  icon={AlignHorizontalSpaceAround}
                  label="Distribute horizontally"
                  action="distribute-h"
                  onClick={() => studio.distributeSelected("x")}
                />
                <Arrange
                  icon={AlignVerticalSpaceAround}
                  label="Distribute vertically"
                  action="distribute-v"
                  onClick={() => studio.distributeSelected("y")}
                />
              </>
            ) : null}
            <Arrange
              icon={Rows3}
              label="Equal gap, top to bottom, from the spacing scale"
              action="equal-gap"
              onClick={() => setNote(`Gaps set to ${studio.equalGapSelected("y")}px.`)}
            />
            <Arrange
              icon={StretchHorizontal}
              label="Match width to the widest"
              action="match-width"
              onClick={() => studio.matchWidthSelected()}
            />
          </div>
          {note ? <p className="mt-1.5 text-caption leading-4 text-muted">{note}</p> : null}
        </Field>
      ) : null}

      {selection.length >= 2 || grouped ? (
        <Field label="Group">
          <div className="flex gap-1">
            {selection.length >= 2 && !(grouped && units === 1) ? (
              <Arrange icon={Group} label="Group (G)" action="group" onClick={studio.groupSelected} />
            ) : null}
            {grouped ? (
              <Arrange icon={Ungroup} label="Ungroup (Shift+G)" action="ungroup" onClick={studio.ungroupSelected} />
            ) : null}
          </div>
        </Field>
      ) : null}
    </>
  );
}

/**
 * Tidy slide (18.2), with nothing selected. Says what it did, including what
 * it refused to guess about, because a tool that silently skips two layers
 * reads as a tool that is broken.
 */
function TidyField({ studio }: { studio: Studio }) {
  const [note, setNote] = useState("");
  const names = (ids: string[]) =>
    (studio.slide?.layers ?? []).filter((l) => ids.includes(l.id)).map((l) => `"${l.name}"`);

  return (
    <Field label="Tidy">
      <button
        type="button"
        data-action="tidy"
        onClick={() => {
          const r = studio.tidy();
          const parts = [
            r.moves.size > 0 ? `Gaps set to ${r.gap}px.` : "Already tidy.",
            r.pinned.length > 0
              ? `${names(r.pinned).join(" and ")} overlap, so they stayed where they were.`
              : "",
          ];
          setNote(parts.filter(Boolean).join(" "));
        }}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent"
      >
        <Rows3 size={13} strokeWidth={2} />
        Tidy slide
      </button>
      <p className="mt-1.5 text-caption leading-4 text-muted">
        {note || "Equal gaps top to bottom, from this slide's own spacing. Order and sizes stay."}
      </p>
    </Field>
  );
}

/**
 * Match on every slide (18.3): this layer's position, size and type size, onto
 * the layer with the same name on the others. Or only onto the slides picked in
 * the filmstrip, when several are.
 */
function MatchField({ studio, layer }: { studio: Studio; layer: Layer }) {
  const [result, setResult] = useState<{ matched: number[]; skipped: number[]; overflow: number[] } | null>(
    null,
  );
  const scoped = studio.slideSelection.length > 1;

  return (
    <Field label="Match">
      <button
        type="button"
        data-action="match"
        onClick={() => setResult(studio.matchOnSlides(layer.id))}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent"
      >
        {scoped ? `Match on ${studio.slideSelection.length} picked slides` : "Match on every slide"}
      </button>
      {result ? (
        <div className="mt-1.5 text-caption leading-4 text-muted">
          {result.matched.length === 0
            ? `No other slide has a "${layer.name}".`
            : `Matched on ${result.matched.length} slide${result.matched.length === 1 ? "" : "s"}.`}
          {result.overflow.length > 0 ? (
            <div className="mt-1 text-danger">
              {result.overflow.length} now overflow:{" "}
              {result.overflow.map((n) => (
                <button
                  key={n}
                  type="button"
                  data-control
                  onClick={() => studio.setSlideIndex(n - 1)}
                  className="mr-1 underline"
                >
                  slide {n}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-caption leading-4 text-muted">
          Copies the numbers once. Nothing follows later edits.
        </p>
      )}
    </Field>
  );
}

/**
 * The deck's furniture (Batch 20): which set, stamped from the brand's
 * identity, or off. A choice for the whole deck, made from any slide.
 */
function FurnitureField({ studio }: { studio: Studio }) {
  const { doc } = studio;
  const current = doc.furniture?.set ?? "none";
  const brands = listBrands();
  const brandId = doc.styleId ? brandIdOf(doc.styleId) : null;
  const brand = brands.find((b) => b.id === brandId);
  const identity = doc.furniture?.identity ?? (brand ? brandIdentity(brand) : undefined);

  const apply = (setId: string) => {
    if (setId === "none") {
      studio.replaceDoc(clearFurniture(doc));
      return;
    }
    const logo = brand ? furnitureLogo(brand, doc.slides[0]?.background ?? "#000000", logoResolver()) : undefined;
    studio.replaceDoc(stampFurniture(doc, setId, identity ?? { name: "", handles: {} }, { ...(logo ? { logo } : {}) }));
  };

  return (
    <Field label="Furniture">
      <select
        value={current}
        onChange={(e) => apply(e.target.value)}
        className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
      >
        {FURNITURE_SETS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-caption leading-4 text-muted">
        {current === "none"
          ? "Your name, a counter, a swipe cue: placed on every slide and kept up to date as you reorder."
          : identity?.name
            ? `Signed ${identity.name}. Typing into a piece makes it yours; it is not updated again.`
            : "Add your name and handles to the brand to sign these."}
      </p>
    </Field>
  );
}
