/**
 * Session, plan and sync, as one thing.
 *
 * They are separate concerns on paper and hopelessly coupled in practice: signing
 * in has to trigger a sync, the sync needs the user id, and the plan decides what
 * the sync is allowed to carry. Splitting them into three hooks would mean three
 * places that each have to know when the other two are ready.
 *
 * Signing in is OPTIONAL and this hook never blocks the app. With no account, or
 * no Supabase configured at all, everything keeps working against localStorage —
 * that is the free tier, not a degraded mode.
 */
import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { currentSession, ensureProfile, onAuthChange, signOut as endSession } from "./auth.js";
import { isCloudConfigured, type Profile } from "./cloud.js";
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
};

/** Long enough that tabbing between windows does not hammer the database. */
const REFOCUS_QUIET_MS = 30_000;
/** Long enough to let a burst of edits settle into one push. */
const DEBOUNCE_MS = 3_000;

export function useAccount(changeSignal: number): Account {
  const configured = isCloudConfigured();

  const [status, setStatus] = useState<Account["status"]>(configured ? "loading" : "off");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sync, setSync] = useState<SyncState>(
    configured ? { status: "idle", at: lastSyncedAt() } : { status: "off" },
  );

  // Refs, not state: these are read inside callbacks that must not be rebuilt
  // every time they change, or the effects below would resubscribe constantly.
  const userRef = useRef<User | null>(null);
  const running = useRef(false);
  const lastRun = useRef(0);

  const run = useCallback(async () => {
    const id = userRef.current?.id;
    if (!id || running.current) return;

    running.current = true;
    lastRun.current = Date.now();
    setSync({ status: "syncing" });

    const result = await syncAll(id);
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

      if (!next) {
        setProfile(null);
        setStatus("signedOut");
        return;
      }

      setStatus("signedIn");
      // First sign-in creates the row; afterwards this is just a read.
      const p = await ensureProfile(next);
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

  const signOut = useCallback(async () => {
    // Push first, or anything edited since the last sync dies with the local copy.
    if (userRef.current) await run();
    await endSession();
    forgetLocal();
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
  };
}
