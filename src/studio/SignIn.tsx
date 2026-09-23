/**
 * Sign in with a code, not a password — and not, if it can be helped, by leaving
 * the app at all.
 *
 * The screen has one field because there is one thing to know, then a second
 * because six digits is the safest way back in. Both come from the same email;
 * the link still works for anyone who prefers it.
 *
 * ── Why the code leads ───────────────────────────────────────────────────────
 *
 * Corporate mail scanners fetch every URL in an incoming message to check it,
 * and that fetch REDEEMS a one-time magic link — so the recipient clicks and is
 * told it has already been used. It is invisible from this side and it is one of
 * the commonest ways this kind of auth fails. A code cannot be spent by
 * something that only follows links.
 *
 * And under PKCE the verifier lives in the browser that asked, so a link opened
 * on a phone cannot complete a sign-in begun on a laptop. Typing six digits into
 * the tab that is already open has neither problem.
 *
 * ── The copy does real work ──────────────────────────────────────────────────
 *
 * Someone signing in has carousels on this machine already, and "sign in" reads
 * like it might replace them. Saying plainly that the work comes along is the
 * difference between a click and a closed tab.
 */
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { useRef, useState } from "react";

import { CODE_LENGTH, cleanCode, sendCode, verifyCode } from "./auth.js";

const field =
  "h-9 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

export function SignIn({
  hasLocalWork,
  onClose,
}: {
  hasLocalWork: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const codeInput = useRef<HTMLInputElement>(null);

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    const result = await sendCode(email);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Could not send the email");
      return;
    }
    setStep("code");
    // The field is the only thing to do next, so put the cursor in it.
    setTimeout(() => codeInput.current?.focus(), 0);
  };

  const confirm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    const result = await verifyCode(email, code);
    setBusy(false);

    // On success `onAuthStateChange` fires and useAccount takes over; closing is
    // all this screen has left to do.
    if (result.ok) onClose();
    else setError(result.error ?? "That code did not work");
  };

  const resend = async () => {
    setResent(false);
    const result = await sendCode(email);
    if (result.ok) setResent(true);
    else setError(result.error ?? "Could not send another");
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-hairline bg-surface-2 p-6 shadow-modal">
        {step === "code" ? (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-wash text-accent">
              <KeyRound size={19} strokeWidth={2.2} />
            </span>

            <h2 className="mt-3 text-[19px] font-semibold leading-6 tracking-[-0.3px] text-primary">
              Enter the code
            </h2>
            <p className="mt-1.5 text-body text-tertiary">
              We sent six digits to <span className="text-secondary">{email}</span>. Type them here
              and you are in — no need to leave this tab.
            </p>

            <form onSubmit={(e) => void confirm(e)} className="mt-4">
              <input
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  const next = cleanCode(e.target.value);
                  setCode(next);
                  setError(null);
                  // Six digits is the whole input; waiting for a button press
                  // after the last one is a step nobody wants.
                  if (next.length === CODE_LENGTH) setTimeout(() => void confirm(), 0);
                }}
                placeholder="000000"
                className={`${field} text-center font-mono text-[20px] tracking-[0.4em]`}
              />

              {error ? (
                <p className="mt-2 rounded-xl border border-danger-dim bg-danger-wash px-3 py-2 text-caption leading-4 text-danger">
                  {error}
                </p>
              ) : null}

              {resent && !error ? (
                <p className="mt-2 text-caption text-tertiary">Another one is on its way.</p>
              ) : null}

              <p className="mt-2.5 text-caption leading-4 text-muted">
                The same email has a link in it if you would rather click. Open it in{" "}
                <span className="text-tertiary">this</span> browser — a link opened somewhere else
                cannot finish a sign-in started here.
              </p>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                    setResent(false);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
                >
                  <ArrowLeft size={13} strokeWidth={2} />
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resend()}
                  className="flex h-9 items-center rounded-xl px-2.5 text-caption text-tertiary hover:text-accent disabled:opacity-50"
                >
                  Send another
                </button>
                <div className="flex-1" />
                <button
                  type="submit"
                  disabled={busy || cleanCode(code).length !== CODE_LENGTH}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className="flex h-9 items-center rounded-xl px-4 text-body-strong hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy ? "Checking…" : "Sign in"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-hairline text-tertiary">
              <Mail size={19} strokeWidth={1.9} />
            </span>

            <h2 className="mt-3 text-[19px] font-semibold leading-6 tracking-[-0.3px] text-primary">
              Sign in to sync
            </h2>
            <p className="mt-1.5 text-body text-tertiary">
              Your carousels and your posting history follow you to any browser, and stop living
              one cache clear from gone.
            </p>

            {hasLocalWork ? (
              <p className="mt-3 rounded-2xl border border-accent-dim bg-accent-wash px-3.5 py-2.5 text-body text-secondary">
                Everything already on this machine comes with you. Signing in adds an account to
                your work; it does not start you over.
              </p>
            ) : null}

            <form onSubmit={(e) => void ask(e)} className="mt-4">
              <label className="block">
                <span className="text-overline uppercase text-tertiary">Email</span>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="you@example.com"
                  className={`${field} mt-1.5`}
                />
              </label>

              {error ? (
                <p className="mt-2 rounded-xl border border-danger-dim bg-danger-wash px-3 py-2 text-caption leading-4 text-danger">
                  {error}
                </p>
              ) : null}

              <p className="mt-2.5 text-caption leading-4 text-muted">
                No password. We send a six-digit code you type here.
              </p>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
                >
                  Not now
                </button>
                <div className="flex-1" />
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className="flex h-9 items-center rounded-xl px-4 text-body-strong hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send the code"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}
