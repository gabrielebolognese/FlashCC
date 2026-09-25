/**
 * The browser's half of billing: ask the server for a checkout, then open it.
 *
 * Deliberately thin. Nothing here decides or reports what plan someone is on,
 * that comes back from the database, written by a webhook the server verified
 * against Paddle's signing secret. A client that told us its own plan would be a
 * client that could tell us any plan.
 *
 * Card details never touch this app. The checkout is Paddle's own iframe and the
 * billing portal is their hosted page, which is what keeps card handling out of
 * scope, and they are the merchant of record, which keeps VAT out of scope too.
 *
 * ── Why there is a script loader in here ─────────────────────────────────────
 *
 * The previous provider hosted the checkout, so this file only had to navigate
 * to a URL. Paddle's checkout runs in the page: there is no hosted page to send
 * anybody to, and a transaction is opened by their script. So Paddle.js is
 * fetched **on the click**, never at startup. Somebody who never opens the
 * pricing screen never downloads a payment script, and the bundle does not carry
 * one.
 */
import { cloud } from "./cloud.js";

export type BillingStatus = {
  configured: boolean;
  plan: "free" | "pro" | "agency";
  /** True once they are a customer, so the portal has something to show. */
  manageable: boolean;
};

/**
 * The bearer token, for any call the server gates.
 *
 * Exported since Batch 9: five routes outside billing now need it, and a second
 * copy of this would be a second place for the "Sign in first" wording and the
 * session lookup to drift.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const db = cloud();
  if (!db) throw new Error("Sign in first");

  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first");

  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: await authHeader() });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

export const fetchBillingStatus = (): Promise<BillingStatus> =>
  call<BillingStatus>("/api/billing/status");

/* ── Paddle.js ────────────────────────────────────────────────────────────── */

type Paddle = {
  Environment: { set: (env: string) => void };
  Initialize: (options: { token: string }) => void;
  Checkout: {
    open: (options: {
      transactionId: string;
      settings?: { successUrl?: string; theme?: "light" | "dark"; displayMode?: string };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: Paddle;
  }
}

const SCRIPT = "https://cdn.paddle.com/paddle/v2/paddle.js";

/**
 * Loaded once, initialised once, then reused.
 *
 * The promise itself is the cache rather than a boolean beside it, so a second
 * click while the first load is still in flight waits for that load instead of
 * starting another. Two `<script>` tags for the same library is the kind of bug
 * that only shows up on a slow connection.
 *
 * `Environment.set` has to happen **before** `Initialize`, and only for sandbox:
 * production is the default and setting it explicitly is not part of their API.
 */
let loading: Promise<Paddle> | null = null;

function loadPaddle(token: string, environment: string): Promise<Paddle> {
  if (loading) return loading;

  loading = new Promise<Paddle>((resolve, reject) => {
    const start = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle did not load"));
        return;
      }
      if (environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({ token });
      resolve(paddle);
    };

    if (window.Paddle) {
      start();
      return;
    }

    const el = document.createElement("script");
    el.src = SCRIPT;
    el.async = true;
    el.onload = start;
    el.onerror = () => {
      // Cleared so a retry can try again rather than replaying the failure for
      // the rest of the session. A blocked script is usually an ad blocker, and
      // that is worth saying plainly rather than reporting as "checkout failed".
      loading = null;
      reject(new Error("Could not load the payment script. A blocker may be stopping it."));
    };
    document.head.appendChild(el);
  });

  return loading;
}

/* ── the two things somebody can do ───────────────────────────────────────── */

type CheckoutHandoff = {
  transactionId: string;
  clientToken: string;
  environment: string;
  successUrl: string;
};

/**
 * Opens Paddle's checkout over the app.
 *
 * The transaction is created **on the server**, with the user id on it, so what
 * is being bought and who is buying it are both decided somewhere the browser
 * cannot edit. All that travels back here is an id to open.
 *
 * `successUrl` is a full page load back into the app, which is deliberate: it
 * re-reads the session and picks up the plan the webhook has just written.
 */
export async function startCheckout(plan: "pro" | "agency"): Promise<void> {
  const handoff = await call<CheckoutHandoff>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });

  const paddle = await loadPaddle(handoff.clientToken, handoff.environment);

  paddle.Checkout.open({
    transactionId: handoff.transactionId,
    settings: {
      successUrl: handoff.successUrl,
      // The app is dark, and a white overlay on top of it looks like a mistake.
      theme: "dark",
      displayMode: "overlay",
    },
  });
}

export async function openPortal(): Promise<void> {
  const { url } = await call<{ url: string }>("/api/billing/portal", { method: "POST" });
  window.location.assign(url);
}

/**
 * Paddle sends people back with ?checkout=done, but the webhook that actually
 * grants the plan may still be in flight. Reading the flag lets the UI say "we
 * are finishing up" instead of showing Free to somebody who has just paid.
 */
export function checkoutOutcome(): "done" | "cancelled" | null {
  const value = new URLSearchParams(window.location.search).get("checkout");
  return value === "done" || value === "cancelled" ? value : null;
}

/** Takes the flag back out of the URL so a refresh does not re-trigger the banner. */
export function clearCheckoutFlag(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  window.history.replaceState({}, "", url.toString());
}
