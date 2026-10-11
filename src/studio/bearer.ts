/**
 * The bearer token, for any call the server gates.
 *
 * ── Why this is its own file ─────────────────────────────────────────────────
 *
 * It used to live in `billing.ts` next to the checkout, which made a kind of
 * sense when billing was the only gated thing. By the time the payment
 * integration was torn out to be rebuilt, **nine** modules imported it: drafting,
 * angles, captions, distilling, exporting, voice learning, publishing, rewriting
 * and variants. None of them have anything to do with taking money.
 *
 * So it is here, where deleting a payment provider cannot take authentication
 * with it. There is one copy on purpose: a second would be a second place for
 * the "Sign in first" wording and the session lookup to drift apart.
 */
import { cloud } from "./cloud.js";

export async function authHeader(): Promise<Record<string, string>> {
  const db = cloud();
  if (!db) throw new Error("Sign in first");

  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first");

  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
