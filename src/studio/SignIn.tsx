/**
 * Sign in with a link, not a password.
 *
 * The screen has one field because there is one thing to know. No password, no
 * confirm, no strength meter, no reset path to build or support — the whole
 * category is skipped for the price of one email.
 *
 * The copy does real work here. Someone signing in has carousels on this machine
 * already, and "sign in" reads like it might replace them. Saying plainly that
 * the work comes along is the difference between a click and a closed tab.
 */
import { ArrowLeft, Check, Mail } from "lucide-react";
import { useState } from "react";

import { sendMagicLink } from "./auth.js";

export function SignIn({
  hasLocalWork,
  onClose,
}: {
  hasLocalWork: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    const result = await sendMagicLink(email);
    setSending(false);

    if (result.ok) setSent(true);
    else setError(result.error ?? "Could not send the link");
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-hairline bg-surface-2 p-6 shadow-modal">
        {sent ? (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-wash text-accent">
              <Check size={20} strokeWidth={2.4} />
            </span>
            <h2 className="mt-3 text-[19px] font-semibold leading-6 tracking-[-0.3px] text-primary">
              Check your inbox
            </h2>
            <p className="mt-1.5 text-body text-tertiary">
              A sign-in link is on its way to <span className="text-secondary">{email}</span>. Open
              it in this browser and you will land back here, signed in.
            </p>
            <p className="mt-2 text-caption text-muted">
              Nothing arrives after a minute or two? Check spam, and make sure the address is
              right — an unknown address gets no error, by design.
            </p>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
              >
                <ArrowLeft size={13} strokeWidth={2} />
                Different address
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
              >
                Done
              </button>
            </div>
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

            <form onSubmit={(e) => void submit(e)} className="mt-4">
              <label className="block">
                <span className="text-overline uppercase text-tertiary">Email</span>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 h-9 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
                />
              </label>

              {error ? (
                <p className="mt-2 rounded-xl border border-danger-dim bg-danger-wash px-3 py-2 text-caption text-danger">
                  {error}
                </p>
              ) : null}

              <p className="mt-2.5 text-caption text-muted">
                No password. We send a link that signs you in when you open it.
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
                  disabled={sending || email.trim() === ""}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className={[
                    "flex h-9 items-center rounded-xl px-4 text-body-strong",
                    sending || email.trim() === ""
                      ? "pointer-events-none opacity-50"
                      : "hover:brightness-110",
                  ].join(" ")}
                >
                  {sending ? "Sending…" : "Send the link"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}
