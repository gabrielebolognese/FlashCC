/**
 * The video queue (26.5). **Durable**, and this file is where that is decided.
 *
 * A render takes from seconds to a few minutes, longer than any request should
 * be held open and longer than a deploy is willing to wait. So a job is a pair
 * of files on disk before it is anything in memory: `<id>.json`, its state, and
 * `<id>.payload.json`, what it renders. Every change of state is written before
 * it is acted on.
 *
 * What happens to a job when the process stops:
 *
 * - **SIGTERM** (a deploy): `drain` stops taking new work and waits up to a
 *   grace period for the job in hand. One that finishes is done. One that does
 *   not is left `running` on disk.
 * - **Next start**: `recover` puts every `queued` or `running` job back in the
 *   queue and renders it again from the beginning. Rendering is deterministic
 *   (`video.ts`), so a restarted job produces the same file the first attempt
 *   would have.
 * - **A job that keeps dying** (the third interrupted attempt), or whose
 *   payload is gone, is marked `failed` with a reason and keeps its retry. It is
 *   never dropped. The editor also remembers the jobs it started, so a job the
 *   server has no record of at all (a disk that did not survive the deploy) is
 *   reported as lost with the same one-click retry, re-sent from the deck.
 *
 * The directory is `VIDEO_DIR`, default `.data/video`. It has to be on a volume
 * that outlives a deploy for the first two promises; the third holds anyway.
 *
 * The ceilings are about abuse, not price (invariant 7): two jobs at a time per
 * account and twelve an hour, so one script cannot hold the renderer. Nothing
 * here counts anything a plan pays for.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type JobState = "queued" | "running" | "done" | "failed";

export type Job = {
  id: string;
  /** The capability that reads this job: a job is reached by id AND token, never by id alone. */
  token: string;
  /** An account id, or `ip:<address>` for a free render with nobody signed in. */
  owner: string;
  signedIn: boolean;
  state: JobState;
  /** 0 to 1. */
  progress: number;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  name: string;
  docId: string | null;
  target: string;
  seconds: number;
  animated: boolean;
  /** Where the finished file is: a public URL, or this server's own file route. */
  url?: string | undefined;
  error?: string | undefined;
};

/** What the browser is told: everything but the owner and the token it already has. */
export type JobView = Omit<Job, "token" | "owner">;

export const view = ({ token: _t, owner: _o, ...rest }: Job): JobView => rest;

export const MAX_ACTIVE_PER_OWNER = 2;
export const MAX_PER_HOUR = 12;
/** A job interrupted this many times is reported failed rather than tried again. */
export const MAX_ATTEMPTS = 3;
/** Finished jobs and their files are swept after a week. */
export const KEEP_MS = 7 * 24 * 3600_000;

export type Runner = (job: Job, payload: unknown, file: string, progress: (p: number) => void) => Promise<{ url?: string | undefined }>;

export class VideoQueue {
  private waiting: string[] = [];
  private running = new Map<string, Promise<void>>();
  private draining = false;
  private jobs = new Map<string, Job>();

  constructor(
    readonly dir: string,
    private readonly run: Runner,
    private readonly workers = 1,
    private readonly now: () => number = Date.now,
  ) {}

  private jobPath = (id: string) => join(this.dir, `${id}.json`);
  private payloadPath = (id: string) => join(this.dir, `${id}.payload.json`);
  /** Where a finished render lands, and stays when there is no bucket to send it to. */
  filePath = (id: string) => join(this.dir, `${id}.mp4`);

  private writes = new Map<string, Promise<void>>();

  /**
   * Memory first, then disk. Writes to one job are chained, each writing the
   * latest state, so a late progress tick can never land on top of `done`.
   * Each goes to a temporary name and is renamed, so a crash mid-write never
   * leaves half a job.
   */
  private async save(job: Job): Promise<void> {
    job.updatedAt = this.now();
    this.jobs.set(job.id, job);
    const next = (this.writes.get(job.id) ?? Promise.resolve()).then(async () => {
      const latest = this.jobs.get(job.id);
      if (!latest) return;
      const tmp = `${this.jobPath(job.id)}.tmp`;
      await writeFile(tmp, JSON.stringify(latest));
      await rename(tmp, this.jobPath(job.id));
    });
    this.writes.set(job.id, next.catch(() => {}));
    await next;
  }

  /**
   * Reads the directory and puts back in the queue every job a previous
   * process left unfinished. Call once, before taking requests.
   */
  async recover(): Promise<{ requeued: string[]; failed: string[] }> {
    await mkdir(this.dir, { recursive: true });
    const requeued: string[] = [];
    const failed: string[] = [];
    const names = (await readdir(this.dir)).filter((n) => /^[\w-]+\.json$/.test(n) && !n.includes(".payload."));
    const found: Job[] = [];
    for (const n of names) {
      try {
        found.push(JSON.parse(await readFile(join(this.dir, n), "utf8")) as Job);
      } catch {
        /* A file that is not a job is not ours to delete. */
      }
    }
    found.sort((a, b) => a.createdAt - b.createdAt);
    for (const job of found) {
      this.jobs.set(job.id, job);
      if (job.state !== "queued" && job.state !== "running") continue;
      const hasPayload = await exists(this.payloadPath(job.id));
      if (!hasPayload) {
        await this.save({ ...job, state: "failed", error: "This render was interrupted and its deck did not survive. Retry sends it again." });
        failed.push(job.id);
      } else if (job.state === "running" && job.attempts >= MAX_ATTEMPTS) {
        await this.save({ ...job, state: "failed", error: `Interrupted ${job.attempts} times. Retry to try once more.` });
        failed.push(job.id);
      } else {
        await this.save({ ...job, state: "queued", progress: 0 });
        this.waiting.push(job.id);
        requeued.push(job.id);
      }
    }
    await this.sweep();
    this.pump();
    return { requeued, failed };
  }

  /** Jobs this owner has waiting or rendering: the concurrent ceiling. */
  activeFor(owner: string): number {
    let n = 0;
    for (const j of this.jobs.values()) if (j.owner === owner && (j.state === "queued" || j.state === "running")) n += 1;
    return n;
  }

  get(id: string, token: string): Job | null {
    const job = this.jobs.get(id);
    return job && job.token === token ? job : null;
  }

  async add(fields: Pick<Job, "owner" | "signedIn" | "name" | "docId" | "target" | "seconds" | "animated">, payload: unknown): Promise<Job> {
    if (this.draining) throw new Error("The server is restarting. Try again in a moment.");
    const at = this.now();
    const job: Job = {
      ...fields,
      id: randomUUID(),
      token: randomBytes(18).toString("base64url"),
      state: "queued",
      progress: 0,
      attempts: 0,
      createdAt: at,
      updatedAt: at,
    };
    await mkdir(this.dir, { recursive: true });
    // The payload first: a job on disk always has its deck beside it.
    await writeFile(this.payloadPath(job.id), JSON.stringify(payload));
    await this.save(job);
    this.waiting.push(job.id);
    this.pump();
    return job;
  }

  /** A failed job, queued again from its stored deck. False when the deck is gone and the editor must send it. */
  async retry(job: Job): Promise<boolean> {
    if (job.state !== "failed") return true;
    if (!(await exists(this.payloadPath(job.id)))) return false;
    await this.save({ ...job, state: "queued", progress: 0, attempts: 0, error: undefined });
    this.waiting.push(job.id);
    this.pump();
    return true;
  }

  private pump(): void {
    while (!this.draining && this.running.size < this.workers && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      const work = this.work(id).finally(() => {
        this.running.delete(id);
        this.pump();
      });
      this.running.set(id, work);
    }
  }

  private async work(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.state !== "queued") return;
    // `attempts` is counted BEFORE the render starts, so a process that dies
    // mid-render has already recorded the attempt it died in.
    await this.save({ ...job, state: "running", attempts: job.attempts + 1 });
    let last = 0;
    try {
      const payload = JSON.parse(await readFile(this.payloadPath(id), "utf8")) as unknown;
      const result = await this.run(this.jobs.get(id)!, payload, this.filePath(id), (p) => {
        const current = this.jobs.get(id);
        if (current?.state !== "running" || p - last < 0.05) return;
        last = p;
        void this.save({ ...current, progress: Math.min(0.99, p) });
      });
      await this.save({ ...this.jobs.get(id)!, state: "done", progress: 1, url: result.url });
      // Done: the deck is not needed again, and it is the biggest file here.
      await rm(this.payloadPath(id), { force: true });
    } catch (error) {
      if (this.draining) return; // Left `running`; the next start picks it up.
      const message = error instanceof Error ? error.message : "The render failed";
      await this.save({ ...this.jobs.get(id)!, state: "failed", error: message });
    }
  }

  /**
   * For SIGTERM: no new work starts, and the jobs in hand get `graceMs` to
   * finish. Whatever is still running after that stays `running` on disk and
   * is restarted by the next process's `recover`.
   */
  async drain(graceMs: number): Promise<{ finished: boolean }> {
    this.draining = true;
    const all = Promise.allSettled([...this.running.values()]);
    const timeout = new Promise<void>((r) => setTimeout(r, graceMs).unref());
    await Promise.race([all, timeout]);
    // Read from the jobs, not from which promise won: a render that died
    // during the drain settles too, and is still unfinished.
    return { finished: ![...this.jobs.values()].some((j) => j.state === "running") };
  }

  /** Finished and failed jobs older than `KEEP_MS`, with their files. */
  async sweep(): Promise<void> {
    const cutoff = this.now() - KEEP_MS;
    for (const job of [...this.jobs.values()]) {
      if ((job.state === "done" || job.state === "failed") && job.updatedAt < cutoff) {
        this.jobs.delete(job.id);
        const files = [this.jobPath(job.id), this.payloadPath(job.id), this.filePath(job.id), `${this.filePath(job.id)}.part`];
        await Promise.all(files.map((p) => rm(p, { force: true })));
      }
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
