/**
 * The small presentational pieces the pipeline and insight screens share.
 *
 * Nothing here knows what a post is. They take numbers and strings so the screens
 * above them stay about meaning, and so a stat tile cannot quietly start disagreeing
 * with the one on the next screen over.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* ── stat tile ────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "plain" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon size={12} strokeWidth={2} className="text-tertiary" /> : null}
        <span className="text-overline uppercase text-tertiary">{label}</span>
      </div>
      <div
        className={[
          "mt-2 text-[26px] font-semibold leading-7 tracking-[-0.5px]",
          tone === "accent" ? "text-accent" : "text-primary",
        ].join(" ")}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-caption text-tertiary">{sub}</div> : null}
    </div>
  );
}

/* ── bars ─────────────────────────────────────────────────────────────── */

/**
 * A proportional bar with the baseline drawn on it. The marker is the point of the
 * component: a bar with no reference line invites the reader to compare bars against
 * each other, when the only comparison that means anything is against average.
 */
export function LiftBar({ ratio, max }: { ratio: number; max: number }) {
  const span = Math.max(max, 1.2);
  const width = Math.min(ratio / span, 1) * 100;
  const baseline = Math.min(1 / span, 1) * 100;
  const up = ratio >= 1;

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${width}%`, background: up ? "var(--accent)" : "var(--text-muted)" }}
      />
      <div
        className="absolute inset-y-0 w-px"
        style={{ left: `${baseline}%`, background: "rgba(255,255,255,0.35)" }}
      />
    </div>
  );
}

/** A plain column chart. Heights are relative to the tallest bar, never to zero. */
export function Columns({
  data,
  format,
}: {
  data: { key: string; value: number; label: string; strong?: boolean }[];
  format: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-[132px] items-end gap-1.5">
      {data.map((d) => (
        <div key={d.key} className="group/bar relative flex h-full flex-1 flex-col justify-end">
          <div
            className="w-full rounded-t-md"
            style={{
              height: `${Math.max((d.value / max) * 100, 2)}%`,
              background: d.strong ? "var(--accent)" : "var(--surface-4)",
            }}
          />
          <div className="pointer-events-none absolute -top-1 left-1/2 z-overlay hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-hairline bg-surface-3 px-2 py-1 text-caption text-primary shadow-overlay group-hover/bar:block">
            {d.label} · {format(d.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── chrome ───────────────────────────────────────────────────────────── */

export function Chip({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "accent" | "danger" | "success";
}) {
  const tones = {
    plain: "border-hairline text-tertiary",
    accent: "border-accent-dim bg-accent-wash text-accent",
    danger: "border-danger-dim bg-danger-wash text-danger",
    success: "border-hairline text-success",
  };
  return (
    <span
      className={[
        "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-overline uppercase",
        tones[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-overline uppercase text-tertiary">{children}</span>
      {count === undefined ? null : <span className="text-caption text-muted">{count}</span>}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-hairline px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-hairline text-tertiary">
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <div className="mt-3 text-[15px] font-semibold leading-5 text-primary">{title}</div>
      <p className="mt-1.5 max-w-[380px] text-body text-tertiary">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Shown wherever the app is holding a conclusion back. It is a feature, not an error:
 * saying "not yet, and here is how much further" is what keeps the numbers worth
 * trusting when they do arrive.
 */
export function NotEnough({ have, need, what }: { have: number; need: number; what: string }) {
  const left = Math.max(need - have, 0);
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="text-body-strong text-primary">Not enough history yet</span>
        <Chip>
          {have} of {need}
        </Chip>
      </div>
      <p className="mt-1.5 max-w-[560px] text-body text-tertiary">
        {what} needs {need} measured posts before it means anything. {left} to go. Until then any
        pattern here would be noise, so nothing is claimed.
      </p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(have / need, 1) * 100}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

/** A segmented control. The one control shape used for every either/or on these screens. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-8 items-center gap-0.5 rounded-xl border border-hairline bg-surface-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            "flex h-7 items-center rounded-lg px-2.5 text-caption",
            o.id === value ? "bg-accent-wash text-accent" : "text-tertiary hover:text-primary",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
