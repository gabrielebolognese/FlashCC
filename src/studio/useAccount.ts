/**
 * Session, plan and sync, as one thing.
 *
 * They are separate concerns on paper and hopelessly coupled in practice: signing
 * in has to trigger a sync, the sync needs the user id, and the plan decides what
 * the sync is allowed to carry. Splitting them into three hooks would mean three
 * places that each have to know when the other two are ready.
 *
 * Signing in is OPTIONAL and this hook never blocks the app. With no account, or
 * no Supabase configured at all, everything keeps working against localStorage,
 * that is the free tier, not a degraded mode.
 */
import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { currentSession, ensureProfile, loadProfile, onAuthChange, signOut as endSession } from "./auth.js";
import { checkoutOutcome, clearCheckoutFlag } from "./billing.js";
import { isCloudConfigured, type Profile } from "./cloud.js";
import { listAssets } from "./assets.js";
import { forgetFonts } from "./fonts.js";
import { ensureUrls, migrateInlineDocs, syncPendingUploads } from "./library.js";
import { setSession } from "./session.js";
import { forgetLocal, hasLocalWork, lastSyncedAt, syncAll } from "./sync.js";

export type SyncState =
  | { status: "off" }
  | { status: "idle"; at: string | null }
  | { status: "syncing" }
  | { status: "error"; message: string };

export type Account = {
  /** "off" when there is no Supabase project wired up at all. */
  status: "off" | "loading" | "signedOut" | "signedIn";
  user: User | null;
  profile: Profile | null;
  sync: SyncState;
  syncNow: () => void;
  signOut: () => Promise<void>;
  /** True when this machine has work that has never been near an account. */
  hasUnsyncedWork: boolean;
  /** Stripe has a customer for them, so the billing portal has something to show. */
  manageable: boolean;
  /** Paid, came back from Stripe, and the webhook has not landed yet. */
  activating: boolean;
};

/** Long enough that tabbing between windows does not hammer the database. */
const REFOCUS_QUIET_MS = 30_000;
/** Long enough to let a burst of edits settle into one push. */
const DEBOUNCE_MS = 3_000;
/** How long to keep asking whether the Stripe webhook has granted the plan. */
const ACTIVATION_TRIES = 10;
const ACTIVATION_GAP_MS = 2_000;

export function useAccount(changeSignal: number): Account {
  const configured = isCloudConfigured();

  const [status, setStatus] = useState<Account["status"]>(configured ? "loading" : "off");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sync, setSync] = useState<SyncState>(
    configured ? { status: "idle", at: lastSyncedAt() } : { status: "off" },
  );
  const [activating, setActivating] = useState(() => checkoutOutcome() === "done");

  // Refs, not state: these are read inside callbacks that must not be rebuilt
  // every time they change, or the effects below would resubscribe constantly.
  const userRef = useRef<User | null>(null);
  const running = useRef(false);
  const lastRun = useRef(0);
  /** The asset migration is once per session, not once per sync. */
  const lifted = useRef(false);

  const run = useCallback(async () => {
    const id = userRef.current?.id;
    if (!id || running.current) return;

    running.current = true;
    lastRun.current = Date.now();
    setSync({ status: "syncing" });

    // Assets first, and only once. Both of these CREATE records that the sync
    // then pushes, so running them after it would leave everything a round
    // behind, the pictures would reach the bucket and the rows describing them
    // would not go up until the next sync fired.
    if (!lifted.current) {
      lifted.current = true;
      try {
        await syncPendingUploads(id);
        await migrateInlineDocs(id);
      } catch {
        // A migration that cannot finish leaves the documents exactly as they
        // were, inline and working, so it must never fail a sync.
      }
    }

    const result = await syncAll(id);

    // One signing pass for the whole library once the records have landed.
    // Everything that paints an asset, the pool, the library grid, a brand's
    // logo, reads the same cache, so this is one round trip for all of it
    // rather than one per picture per screen.
    if (result.ok) await ensureUrls(listAssets());

    running.current = false;

    setSync(
      result.ok
        ? { status: "idle", at: lastSyncedAt() }
        : { status: "error", message: result.error ?? "Sync failed" },
    );
  }, []);

  /* ── session ── */
  useEffect(() => {
    if (!configured) return;
    let alive = true;

    const adopt = async (session: Session | null) => {
      if (!alive) return;
      const next = session?.user ?? null;
      userRef.current = next;
      setUser(next);
      // Told before anything else runs: the library reads this to decide whether
      // an upload has anywhere to go. See session.ts.
      setSession({ userId: next?.id ?? null });

      if (!next) {
        setProfile(null);
        setStatus("signedOut");
        return;
      }

      setStatus("signedIn");
      // First sign-in creates the row; afterwards this is just a read.
      const p = await ensureProfile(next);
      if (p) setSession({ plan: p.plan });
      if (alive) setProfile(p);
      void run();
    };

    void currentSession().then(adopt);
    const off = onAuthChange((session) => void adopt(session));

    return () => {
      alive = false;
      off();
    };
  }, [configured, run]);

  /* ── sync when the window comes back ── */
  useEffect(() => {
    if (!configured) return;

    const onFocus = () => {
      if (!userRef.current) return;
      if (Date.now() - lastRun.current < REFOCUS_QUIET_MS) return;
      void run();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [configured, run]);

  /* ── sync after local edits settle ── */
  useEffect(() => {
    if (!configured || !userRef.current || changeSignal === 0) return;
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [changeSignal, configured, run]);

  /**
   * Stripe returns the browser the moment payment succeeds, but the plan is
   * granted by a webhook arriving separately, usually within a second, sometimes
   * not. Without this the person who just paid lands back on a page that says
   * Free, which is the worst possible first impression of a subscription. So poll
   * briefly, then give up quietly rather than claiming anything went wrong.
   */
  useEffect(() => {
    if (!configured || !activating) return;
    clearCheckoutFlag();

    let alive = true;
    let tries = 0;

    const tick = async () => {
      const id = userRef.current?.id;
      if (!alive) return;

      if (id) {
        const fresh = await loadProfile(id);
        if (!alive) return;
        if (fresh) setProfile(fresh);
        if (fresh && fresh.plan !== "free") {
          setActivating(false);
          return;
        }
      }

      tries += 1;
      if (tries >= ACTIVATION_TRIES) {
        setActivating(false);
        return;
      }
      timer = setTimeout(() => void tick(), ACTIVATION_GAP_MS);
    };

    let timer = setTimeout(() => void tick(), ACTIVATION_GAP_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [configured, activating]);

  const signOut = useCallback(async () => {
    // Push first, or anything edited since the last sync dies with the local copy.
    if (userRef.current) await run();
    await endSession();
    // Unregisters the FontFaces as well as dropping the records, or the next
    // person at this machine sees families with nothing behind them.
    forgetFonts();
    forgetLocal();
    setSession({ userId: null, plan: "free" });
    lifted.current = false;
    userRef.current = null;
    setUser(null);
    setProfile(null);
    setStatus("signedOut");
    setSync({ status: "idle", at: null });
  }, [run]);

  return {
    status,
    user,
    profile,
    sync,
    syncNow: () => void run(),
    signOut,
    hasUnsyncedWork: status === "signedOut" && hasLocalWork(),
    manageable: profile?.hasBilling ?? false,
    activating,
  };
}
