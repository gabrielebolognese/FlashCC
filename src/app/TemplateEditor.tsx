import { Check, ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { defaultBrandKit } from "../doc/defaults.js";
import { newId } from "../doc/ids.js";
import { LENGTHS, specimen, type SpecimenLength } from "../doc/specimens.js";
import type {
  ColourRole,
  MarginStep,
  RegionName,
  SlotName,
  StackAnchor,
  Template,
  TextSlot,
} from "../doc/template.js";
import { STARTERS } from "../doc/templates/starters.js";
import type { BrandKit, SlideRole } from "../doc/types.js";
import { computeLayout } from "../render/layout/computeLayout.js";
import { FORMATS, type LayoutNode } from "../render/layout/node.js";
import { SlideRenderer } from "../render/SlideRenderer.js";
import { lastBrandKit, saveTemplate } from "../state/persist.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  /** null = start a new template from the first starter. */
  initial: Template | null;
  onDone: () => void;
};

type Tab = "page" | SlideRole;
const TABS: Tab[] = ["page", "cover", "body", "list", "quote", "cta"];
const REGIONS: RegionName[] = ["topRail", "body", "bottomRail"];
const REGION_LABEL: Record<RegionName, string> = {
  topRail: "Top rail",
  body: "Body",
  bottomRail: "Bottom rail",
};

/**
 * Five resting controls, six contextual rows. Not one numeric field and not one
 * colour picker — every control writes an enum (docs/template-system.md §5).
 */
export function TemplateEditor({ initial, onDone }: Props) {
  const [template, setTemplate] = useState<Template>(() =>
    initial ?? {
      ...(STARTERS[0] as Template),
      id: newId("tpl"),
      name: "My template",
      origin: { kind: "user", from: STARTERS[0]?.id ?? null },
    },
  );
  const [tab, setTab] = useState<Tab>("cover");
  const [length, setLength] = useState<SpecimenLength>("typical");
  const [selected, setSelected] = useState<SlotName | null>(null);
  const [naming, setNaming] = useState(false);

  const brand: BrandKit = useMemo(() => lastBrandKit() ?? defaultBrandKit(), []);
  const format = FORMATS["portrait-4x5"] ?? { w: 1080, h: 1350 };
  const role: SlideRole = tab === "page" ? "cover" : tab;

  const nodes = useMemo(
    () => computeLayout(template, specimen(role, length), brand, format, 3),
    [template, role, length, brand, format],
  );

  // The fit readout covers all three lengths at once, even though one is shown.
  const fitReport = useMemo(
    () =>
      LENGTHS.map((l) => {
        const n = computeLayout(template, specimen(role, l), brand, format, 3);
        return { length: l, over: n.some((x) => x.overflow) };
      }),
    [template, role, brand, format],
  );

  const scale = 0.34;

  /* ── mutation helpers — every one writes an enum ─────────────────────── */

  function patchRegion(region: RegionName, patch: Partial<{ anchor: StackAnchor; sparseAnchor: StackAnchor; align: "left" | "center" | "right" }>) {
    if (tab === "page") return;
    setTemplate((t) => ({
      ...t,
      roles: {
        ...t.roles,
        [role]: {
          ...t.roles[role],
          regions: { ...t.roles[role].regions, [region]: { ...t.roles[role].regions[region], ...patch } },
        },
      },
    }));
  }

  function moveSlot(slot: SlotName, to: RegionName) {
    if (tab === "page") return;
    setTemplate((t) => {
      const r = t.roles[role];
      const regions = { ...r.regions };
      for (const name of REGIONS) {
        regions[name] = { ...regions[name], members: regions[name].members.filter((m) => m !== slot) };
      }
      regions[to] = { ...regions[to], members: [...regions[to].members, slot] };
      return { ...t, roles: { ...t.roles, [role]: { ...r, regions } } };
    });
  }

  function patchSlot(slot: SlotName, patch: Record<string, unknown>) {
    if (tab === "page") return;
    setTemplate((t) => {
      const r = t.roles[role];
      const existing = (r.slots[slot] ?? {}) as Record<string, unknown>;
      const typePatch = patch["type"];
      const merged: Record<string, unknown> = { ...existing, ...patch };
      if (typePatch) {
        merged["type"] = { ...((existing["type"] as object) ?? {}), ...(typePatch as object) };
      }
      return { ...t, roles: { ...t.roles, [role]: { ...r, slots: { ...r.slots, [slot]: merged } } } };
    });
  }

  function patchPage(patch: { margin?: MarginStep; background?: Template["page"]["background"] }) {
    setTemplate((t) => ({
      ...t,
      page: {
        ...t.page,
        ...(patch.margin ? { grid: { ...t.page.grid, margin: patch.margin } } : {}),
        ...(patch.background ? { background: patch.background } : {}),
      },
    }));
  }

  const currentRegionOf = (slot: SlotName): RegionName | null => {
    if (tab === "page") return null;
    for (const name of REGIONS) {
      if (template.roles[role].regions[name].members.includes(slot)) return name;
    }
    return null;
  };

  const slotSpec = selected
    ? ({ ...template.page.slotStyles[selected], ...(template.roles[role].slots[selected] ?? {}) } as TextSlot)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      {/* ── top bar: 2 controls ── */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-3">
        <IconButton icon={ChevronLeft} label="Back" onClick={onDone} />
        <span className="text-body-strong text-primary">Template</span>
        {naming ? (
          <input
            autoFocus
            value={template.name}
            onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setNaming(false);
            }}
            className="h-7 rounded-sm border border-edge bg-surface-1 px-2 text-body text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="h-7 rounded-sm border border-transparent px-2 text-body text-secondary hover:border-hairline hover:text-primary"
          >
            {template.name}
          </button>
        )}
        <div className="flex-1" />
        <Button
          hero
          icon={Check}
          onClick={() => {
            saveTemplate(template);
            onDone();
          }}
        >
          Save
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── left: tab strip (1 control) ── */}
        <nav className="flex w-[132px] shrink-0 flex-col gap-0.5 border-r border-hairline bg-surface-1 p-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setSelected(null);
              }}
              className={[
                "flex h-7 items-center rounded-md px-2 text-caption capitalize",
                t === tab ? "bg-surface-4 text-primary" : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </nav>

        {/* ── centre: the real renderer over the real interpreter ── */}
        <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-sunken p-6">
          <div style={{ width: format.w * scale, height: format.h * scale }} className="shadow-slide">
            <div
              className="origin-top-left"
              style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
            >
              <SlideRenderer nodes={nodes} format={format} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Segmented
              value={length}
              options={LENGTHS.map((l) => ({ value: l, label: l[0]!.toUpperCase() + l.slice(1) }))}
              onChange={setLength}
            />
            <span className="font-mono text-caption text-muted">
              {fitReport.map((f) => `${f.length[0]!.toUpperCase()}${f.over ? " over" : " ✓"}`).join(" · ")}
            </span>
          </div>

          {tab !== "page" ? (
            <div className="flex flex-wrap justify-center gap-1">
              {(Object.keys(template.page.slotStyles) as SlotName[]).map((slot) => {
                const live = currentRegionOf(slot) !== null;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelected(slot)}
                    className={[
                      "h-7 rounded-md border px-2 text-caption",
                      selected === slot
                        ? "border-accent text-accent"
                        : live
                          ? "border-hairline text-secondary hover:text-primary"
                          : "border-transparent text-muted hover:text-tertiary",
                    ].join(" ")}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── right: inspector, empty until a click (R2) ── */}
        <aside className="w-[260px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 p-3">
          {tab === "page" ? (
            <PageTab template={template} onMargin={(m) => patchPage({ margin: m })} onBackground={(b) => patchPage({ background: b })} />
          ) : selected && slotSpec ? (
            <>
              <div className="mb-3 text-title capitalize text-primary">{selected}</div>

              <Row label="Where">
                <Segmented
                  value={currentRegionOf(selected) ?? "body"}
                  options={REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))}
                  onChange={(r) => moveSlot(selected, r)}
                />
              </Row>

              <Row label="Anchor">
                <Segmented
                  value={template.roles[role].regions[currentRegionOf(selected) ?? "body"].anchor}
                  options={[
                    { value: "start" as StackAnchor, label: "Top" },
                    { value: "center" as StackAnchor, label: "Middle" },
                    { value: "end" as StackAnchor, label: "Bottom" },
                  ]}
                  onChange={(a) => patchRegion(currentRegionOf(selected) ?? "body", { anchor: a })}
                />
              </Row>

              <Row label="When there's little">
                <Segmented
                  value={template.roles[role].regions[currentRegionOf(selected) ?? "body"].sparseAnchor}
                  options={[
                    { value: "start" as StackAnchor, label: "High" },
                    { value: "center" as StackAnchor, label: "Centre" },
                    { value: "end" as StackAnchor, label: "Low" },
                  ]}
                  onChange={(a) => patchRegion(currentRegionOf(selected) ?? "body", { sparseAnchor: a })}
                />
              </Row>

              <Row label="Alignment">
                <Segmented
                  value={template.roles[role].regions[currentRegionOf(selected) ?? "body"].align}
                  options={[
                    { value: "left" as const, label: "Left" },
                    { value: "center" as const, label: "Centre" },
                    { value: "right" as const, label: "Right" },
                  ]}
                  onChange={(a) => patchRegion(currentRegionOf(selected) ?? "body", { align: a })}
                />
              </Row>

              <Row label="Width">
                <Segmented
                  value={slotSpec.width.mode === "fraction" ? String(slotSpec.width.of) : slotSpec.width.mode}
                  options={[
                    { value: "0.5", label: "Half" },
                    { value: "0.66", label: "⅔" },
                    { value: "column", label: "Full" },
                    { value: "hug", label: "Hug" },
                  ]}
                  onChange={(v) =>
                    patchSlot(selected, {
                      width:
                        v === "column"
                          ? { mode: "column" }
                          : v === "hug"
                            ? { mode: "hug", padX: 6 }
                            : { mode: "fraction", of: Number(v) },
                    })
                  }
                />
              </Row>

              <Row label="Colour">
                <SwatchRow
                  brand={brand}
                  value={slotSpec.colour}
                  onChange={(c) => patchSlot(selected, { colour: c })}
                />
              </Row>

              <Row label="Show when">
                <Segmented
                  value={slotSpec.ifEmpty}
                  options={[
                    { value: "collapse" as const, label: "If present" },
                    { value: "reserve" as const, label: "Keep space" },
                  ]}
                  onChange={(v) => patchSlot(selected, { ifEmpty: v })}
                />
              </Row>
            </>
          ) : (
            <p className="text-caption leading-[16px] text-muted">
              Click a slot below the preview to change where it sits and how it looks.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function PageTab({
  template,
  onMargin,
  onBackground,
}: {
  template: Template;
  onMargin: (m: MarginStep) => void;
  onBackground: (b: Template["page"]["background"]) => void;
}) {
  const bg = template.page.background.treatment.kind;
  return (
    <>
      <div className="mb-3 text-title text-primary">Page</div>
      <Row label="Margin">
        <Segmented
          value={template.page.grid.margin}
          options={[
            { value: "tight" as MarginStep, label: "Tight" },
            { value: "default" as MarginStep, label: "Normal" },
            { value: "wide" as MarginStep, label: "Wide" },
          ]}
          onChange={onMargin}
        />
      </Row>
      <Row label="Background">
        <Segmented
          value={bg}
          options={[
            { value: "flat", label: "Flat" },
            { value: "gradient", label: "Fade" },
            { value: "grid", label: "Grid" },
            { value: "dots", label: "Dots" },
          ]}
          onChange={(kind) => {
            if (kind === "gradient") onBackground({ fill: "bg", treatment: { kind, to: "muted", angle: 135 } });
            else if (kind === "grid") onBackground({ fill: "bg", treatment: { kind, cell: 9, weight: 0, intensity: 2 } });
            else if (kind === "dots") onBackground({ fill: "bg", treatment: { kind, cell: 8, size: 1, intensity: 2 } });
            else onBackground({ fill: "bg", treatment: { kind: "flat" } });
          }}
        />
      </Row>
      <p className="mt-4 border-t border-hairline pt-3 text-caption leading-[16px] text-muted">
        These change all five slide types at once. Colour comes from the brand kit, so one
        template works in any palette.
      </p>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-caption text-tertiary">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "h-6 flex-1 rounded-sm px-1.5 text-caption",
            option.value === value
              ? "bg-surface-4 text-primary"
              : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Swatches preview the CURRENT brand kit, so this never reads as a duplicate picker. */
function SwatchRow({
  brand,
  value,
  onChange,
}: {
  brand: BrandKit;
  value: ColourRole;
  onChange: (c: ColourRole) => void;
}) {
  const roles: { role: ColourRole; hex: string }[] = [
    { role: "text", hex: brand.palette.text },
    { role: "muted", hex: brand.palette.muted },
    { role: "accent", hex: brand.palette.accent },
    { role: "bg", hex: brand.palette.background },
  ];
  return (
    <div className="flex gap-1.5">
      {roles.map((r) => (
        <button
          key={r.role}
          type="button"
          onClick={() => onChange(r.role)}
          className={[
            "h-7 w-7 rounded-md border",
            value === r.role ? "border-accent" : "border-hairline",
          ].join(" ")}
          style={{ background: r.hex }}
        />
      ))}
    </div>
  );
}

export type { LayoutNode };
