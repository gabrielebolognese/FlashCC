/**
 * The browser's half of billing: ask for a link, then go there.
 *
 * Deliberately thin. Nothing here decides or reports what plan someone is on —
 * that comes back from the database, written by a webhook the server verified
 * against Stripe. A client that told us its own plan would be a client that could
 * tell us any plan.
 *
 * Card details never touch this app. Checkout and the billing portal are Stripe's
 * own hosted pages, which is also what keeps card handling out of scope entirely.
 */
import { cloud } from "./cloud.js";

export type BillingStatus = {
  configured: boolean;
  plan: "free" | "pro" | "agency";
  /** True once Stripe knows this person, so the portal has something to show. */
  manageable: boolean;
};

async function authHeader(): Promise<Record<string, string>> {
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

/**
 * Leaves the app for Stripe's hosted checkout. A full navigation rather than a
 * popup: popups get blocked, and the return trip needs a real page load anyway so
 * the session is re-read and the new plan shows up.
 */
export async function startCheckout(plan: "pro" | "agency"): Promise<void> {
  const { url } = await call<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  window.location.assign(url);
}

export async function openPortal(): Promise<void> {
  const { url } = await call<{ url: string }>("/api/billing/portal", { method: "POST" });
  window.location.assign(url);
}

/**
 * Stripe sends people back with ?checkout=done, but the webhook that actually
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
