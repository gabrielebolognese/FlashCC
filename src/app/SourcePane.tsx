import { SegmentedControl } from "../ui/SegmentedControl.js";

export type Granularity = "few" | "balanced" | "many";

const GRANULARITY = [
  { value: "few", label: "Few" },
  { value: "balanced", label: "Balanced" },
  { value: "many", label: "Many" },
] as const satisfies readonly { value: Granularity; label: string }[];

type Props = {
  text: string;
  onTextChange: (text: string) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  blockCount: number;
};

/**
 * One row of controls above the text, one muted readout below it. Nothing else (§3).
 * Blank lines are slide breaks, so paragraph gaps get real vertical space.
 */
export function SourcePane({
  text,
  onTextChange,
  granularity,
  onGranularityChange,
  blockCount,
}: Props) {
  return (
    <section className="flex min-w-0 flex-col bg-base">
      <div className="flex h-11 shrink-0 items-center border-b border-hairline px-3">
        <SegmentedControl
          label="Slide granularity"
          options={GRANULARITY}
          value={granularity}
          onChange={onGranularityChange}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          spellCheck={false}
          className="h-full w-full resize-none bg-transparent px-5 py-5 font-mono text-[13px] leading-[22px] text-primary outline-none placeholder:text-muted"
          placeholder=""
        />

        {text.length === 0 ? (
          // Empty state: one line, at the point of action, no tour (R12).
          <div className="pointer-events-none absolute inset-0 flex flex-col items-start px-5 py-5">
            <p className="text-body text-tertiary">
              Paste your post. Blank lines become slide breaks.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-hairline px-5 text-caption text-muted">
        <span>{text.length.toLocaleString()} characters</span>
        <span>·</span>
        <span>
          {blockCount} block{blockCount === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}
