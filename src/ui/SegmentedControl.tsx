type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. Not rendered — no labels under controls (R5). */
  label: string;
};

/**
 * 28px tall, discrete steps, no slider. Selection is instantaneous (R3) and marked
 * with a raised surface plus primary text — not an accent fill, which is reserved (R6).
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={[
              "h-6 rounded-sm px-2.5 text-caption",
              selected
                ? "bg-surface-4 text-primary"
                : "text-tertiary hover:bg-white/[0.04] hover:text-secondary",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
