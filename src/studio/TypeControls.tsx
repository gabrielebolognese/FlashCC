/**
 * Choosing a pair and a ramp (22.1, 22.2), for the brand editor and the style
 * editor alike. Each pair is shown set in its own two faces, grouped by voice,
 * because a pairing is judged by eye and not by name.
 */
import { useEffect } from "react";

import { allFonts, fontStack } from "./model.js";
import { pairOf, PAIRS, VOICES, type Pair } from "./pairs.js";
import type { Theme } from "./presets.js";
import { RAMPS, type RampId } from "./ramps.js";
import { installFaces } from "./typefaces.js";
import { loadKerning } from "./typemetrics.js";

export function PairPicker({ theme, onPick }: { theme: Theme; onPick: (pair: Pair) => void }) {
  const current = pairOf(theme);
  useEffect(() => installFaces(), []);
  return (
    <div className="flex flex-col gap-3">
      {VOICES.map((v) => (
        <div key={v.id}>
          <div className="mb-1 text-caption text-tertiary">{v.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PAIRS.filter((p) => p.voice === v.id).map((p) => (
              <button
                key={p.id}
                type="button"
                title={`${label(p.display)} and ${label(p.body)}`}
                onClick={() => {
                  void loadKerning([p.display, p.body]);
                  onPick(p);
                }}
                className={[
                  "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left",
                  current?.id === p.id ? "border-accent bg-accent-wash" : "border-hairline hover:border-surface-5",
                ].join(" ")}
              >
                <span className="truncate text-[17px] leading-6 text-primary" style={{ fontFamily: fontStack(p.display), fontWeight: 700 }}>
                  {p.name}
                </span>
                <span className="truncate text-[12px] leading-4 text-tertiary" style={{ fontFamily: fontStack(p.body) }}>
                  {label(p.display)} + {label(p.body)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const label = (id: string): string => allFonts().find((f) => f.id === id)?.label ?? id;

export function RampPicker({ value, onChange }: { value: RampId | undefined; onChange: (ramp: RampId | undefined) => void }) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={["h-7 rounded-md border text-caption", !value ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary"].join(" ")}
        >
          Default
        </button>
        {RAMPS.map((r) => (
          <button
            key={r.id}
            type="button"
            title={`${r.hint} Each step ${r.ratio} times the last.`}
            onClick={() => onChange(r.id)}
            className={["h-7 rounded-md border text-caption", value === r.id ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary"].join(" ")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-caption leading-4 text-muted">
        {RAMPS.find((r) => r.id === value)?.hint ?? "Each layout keeps its own sizes."} Never below 18 for body or 24 for
        headlines.
      </p>
    </div>
  );
}

/** Font options for a select, the system stacks first and the bundled faces after. */
export function FontOptions({ brandId }: { brandId?: string | undefined }) {
  const fonts = allFonts(brandId);
  const groups: [string, typeof fonts][] = [
    ["On every device", fonts.filter((f) => !f.bundled && !f.custom)],
    ["Bundled, measured", fonts.filter((f) => f.bundled)],
    ["Uploaded", fonts.filter((f) => f.custom)],
  ];
  return (
    <>
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([name, list]) => (
          <optgroup key={name} label={name}>
            {list.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  );
}
