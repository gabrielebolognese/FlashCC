import type { LucideIcon } from "lucide-react";



type Props = {
  children: string;
  onClick?: () => void;
  icon?: LucideIcon;
  /** The one hero control per screen. Brand gold gradient. */
  hero?: boolean;
  disabled?: boolean;
};

/**
 * R6: the hero variant is the only filled, accent-coloured control in the app.
 * Everything else is ghost or text.
 */
export function Button({ children, onClick, icon: Icon, hero = false, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={hero ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" } : undefined}
      className={[
        "flex h-7 items-center gap-1.5 rounded-md px-3 text-body-strong",
        hero
          ? "hover:brightness-110"
          : "border border-hairline bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary",
        disabled ? "pointer-events-none opacity-60" : "",
      ].join(" ")}
    >
      {Icon ? <Icon size={14} strokeWidth={hero ? 2.5 : 2} /> : null}
      {children}
    </button>
  );
}
