import type { LucideIcon } from "lucide-react";



type Props = {
  icon: LucideIcon;
  /** Used for the accessible name. Tooltips exist only for shortcuts (R13). */
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
};

/**
 * 28px hit box, 14px glyph (R5). Hover is a single background change with no
 * transition (R3/R4). Danger colour appears only on the control's own hover (R10).
 */
export function IconButton({ icon: Icon, label, onClick, active = false, danger = false }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[
        "grid h-7 w-7 place-items-center rounded-md",
        "hover:bg-white/[0.06]",
        active ? "text-accent" : "text-tertiary hover:text-primary",
        danger ? "hover:text-danger" : "",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}
