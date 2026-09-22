/**
 * The bottom of the rail: who you are, what you pay, and whether your work is
 * actually somewhere safe.
 *
 * The sync line is the part that matters. A sync that fails quietly is worse than
 * no sync at all — the whole promise being sold here is "your history is safe", so
 * a failure has to be visible and retryable rather than swallowed into a console
 * nobody has open.
 */
import { AlertTriangle, Cloud, CloudOff, LogIn, RefreshCw, Sparkles } from "lucide-react";

import type { Account } from "./useAccount.js";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

export function AccountCard({
  account,
  onSignIn,
  onSeePro,
}: {
  account: Account;
  onSignIn: () => void;
  onSeePro: () => void;
}) {
  const { status, user, profile, sync } = account;
  const plan = profile?.plan ?? "free";
  const paid = plan === "pro" || plan === "agency";

  /* No Supabase project wired up: say nothing about accounts at all. */
  if (status === "off") {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} strokeWidth={2} className="text-accent" />
          <span className="text-overline uppercase text-tertiary">Free plan</span>
        </div>
        <p className="mt-1.5 text-caption leading-4 text-tertiary">
          Saved in this browser only. Pro syncs your work and keeps the history the insight screens
          run on.
        </p>
        <button
          type="button"
          onClick={onSeePro}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="mt-2.5 flex h-8 w-full items-center justify-center rounded-xl text-body-strong hover:brightness-110"
        >
          See Pro
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
        <span className="text-caption text-muted">Checking your session…</span>
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
        <div className="flex items-center gap-1.5">
          <CloudOff size={12} strokeWidth={2} className="text-tertiary" />
          <span className="text-overline uppercase text-tertiary">Not signed in</span>
        </div>
        <p className="mt-1.5 text-caption leading-4 text-tertiary">
          {account.hasUnsyncedWork
            ? "Your work is in this browser only. Sign in and it comes with you."
            : "Sign in to keep your carousels and your history on every device."}
        </p>
        <button
          type="button"
          onClick={onSignIn}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-body-strong hover:brightness-110"
        >
          <LogIn size={13} strokeWidth={2.4} />
          Sign in to sync
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
      <div className="flex items-center gap-1.5">
        <Cloud size={12} strokeWidth={2} className={paid ? "text-accent" : "text-tertiary"} />
        <span className="text-overline uppercase text-tertiary">
          {plan === "agency" ? "Agency" : paid ? "Pro" : "Free plan"}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void account.signOut()}
          className="text-caption text-muted hover:text-secondary"
        >
          Sign out
        </button>
      </div>

      <div className="mt-1.5 truncate text-caption text-secondary" title={user?.email ?? ""}>
        {user?.email ?? "Signed in"}
      </div>

      {sync.status === "error" ? (
        <div className="mt-2 rounded-xl border border-danger-dim bg-danger-wash px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={2} className="shrink-0 text-danger" />
            <span className="text-caption text-danger">Sync failed</span>
          </div>
          <p className="mt-1 line-clamp-2 text-caption leading-4 text-tertiary">{sync.message}</p>
          <button
            type="button"
            onClick={account.syncNow}
            className="mt-1.5 text-caption text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={account.syncNow}
          disabled={sync.status === "syncing"}
          className="mt-2 flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-hairline text-caption text-tertiary hover:text-primary disabled:pointer-events-none"
        >
          <RefreshCw
            size={11}
            strokeWidth={2}
            className={sync.status === "syncing" ? "fcc-spin" : ""}
          />
          {sync.status === "syncing"
            ? "Syncing…"
            : `Synced ${ago(sync.status === "idle" ? sync.at : null)}`}
        </button>
      )}

      {paid ? null : (
        <button
          type="button"
          onClick={onSeePro}
          className="mt-1.5 flex h-7 w-full items-center justify-center rounded-lg text-caption text-accent hover:underline"
        >
          See Pro
        </button>
      )}
    </div>
  );
}
