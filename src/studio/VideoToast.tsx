/**
 * The in-app notice that a video render finished or failed (26.5).
 *
 * Mounted beside the pricing prompt in `App`, outside the screen switch, so it
 * is heard from the projects screen as well as from the deck: a render is a
 * job, and people leave while it runs. Shown once per job; a failed one
 * carries its retry here, one click, without opening anything.
 */
import { Film, X } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../ui/IconButton.js";
import { loadDoc } from "./storage.js";
import { absoluteUrl, dismissVideo, isHosted, retryVideo, runtime, useVideoJobs } from "./videojobs.js";

export function VideoToast() {
  const jobs = useVideoJobs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = jobs.find((j) => (j.state === "done" || j.state === "failed") && !j.seen);
  if (!job) return null;
  const url = job.url ? absoluteUrl(job.url) : null;
  return (
    <div
      role="status"
      data-testid="video-toast"
      className="fixed bottom-5 right-5 z-modal flex w-[360px] items-start gap-3 rounded-2xl border border-hairline bg-surface-2 p-3 shadow-modal"
    >
      <Film size={14} strokeWidth={2} className="mt-1.5 shrink-0 text-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-primary">
          {job.state === "done" ? `Your ${runtime(job.seconds)} video is ready` : "A video render failed"}
        </p>
        <p className="truncate text-caption text-muted">{job.state === "done" ? job.name : (error ?? job.error)}</p>
        <div className="mt-2 flex gap-2">
          {job.state === "done" && url ? (
            <a
              href={isHosted(job.url) ? url : `${url}&download=1`}
              download={`${job.name}.mp4`}
              onClick={() => dismissVideo(job.id)}
              className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary"
            >
              Download
            </a>
          ) : (
            <button
              type="button"
              data-control
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void retryVideo(job, loadDoc).then((r) => {
                  setBusy(false);
                  setError(r.ok ? null : (r.error ?? "Retry failed"));
                });
              }}
              className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary"
            >
              {busy ? "Retrying" : "Retry"}
            </button>
          )}
        </div>
      </div>
      <IconButton icon={X} label="Dismiss" control onClick={() => dismissVideo(job.id)} />
    </div>
  );
}
