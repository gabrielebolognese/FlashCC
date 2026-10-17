/**
 * The video queue's promise (26.5): an interrupted render completes after a
 * restart, or is reported failed with a retry. Never silently lost.
 *
 * The process "dies" here by abandoning a queue whose runner never returns
 * and opening a second queue on the same directory, which is exactly what a
 * deploy that outlasts the grace period looks like from the disk.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KEEP_MS, MAX_ATTEMPTS, VideoQueue, view, type Job, type Runner } from "./jobs.js";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fcc-jobs-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const fields = { owner: "u1", signedIn: true, name: "deck", docId: "d1", target: "vertical", seconds: 12, animated: false };

const ok: Runner = async (_job, _payload, file, progress) => {
  progress(0.5);
  await writeFile(file, "mp4");
  return { url: "https://cdn/x.mp4" };
};

const hang: Runner = () => new Promise(() => {});

async function until(check: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const onDisk = async (id: string): Promise<Job> => JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")) as Job;
const exists = (p: string) => stat(p).then(() => true, () => false);

describe("VideoQueue", () => {
  it("renders a job, records it done with its URL, and drops the deck it no longer needs", async () => {
    const q = new VideoQueue(dir, ok);
    await q.recover();
    const job = await q.add(fields, { slides: [] });
    await until(() => q.get(job.id, job.token)?.state === "done");
    expect(q.get(job.id, job.token)).toMatchObject({ state: "done", progress: 1, url: "https://cdn/x.mp4", attempts: 1 });
    await until(async () => (await onDisk(job.id)).state === "done");
    expect(await exists(join(dir, `${job.id}.payload.json`))).toBe(false);
  });

  it("reads a job only with its token, and never shows the owner or token", async () => {
    const q = new VideoQueue(dir, hang);
    const job = await q.add(fields, {});
    expect(q.get(job.id, "wrong")).toBeNull();
    expect(view(job)).not.toHaveProperty("token");
    expect(view(job)).not.toHaveProperty("owner");
  });

  it("counts an owner's waiting and running jobs for the concurrent ceiling", async () => {
    const q = new VideoQueue(dir, hang);
    await q.add(fields, {});
    await q.add(fields, {});
    await q.add({ ...fields, owner: "u2" }, {});
    expect(q.activeFor("u1")).toBe(2);
    expect(q.activeFor("u2")).toBe(1);
  });

  it("finishes a render that was interrupted, after a restart", async () => {
    const first = new VideoQueue(dir, hang);
    await first.recover();
    const job = await first.add(fields, { slides: ["kept"] });
    await until(async () => (await onDisk(job.id)).state === "running");
    // The process dies here: `first` is abandoned mid-render.

    let seen: unknown = null;
    const second = new VideoQueue(dir, async (j, payload, file, p) => {
      seen = payload;
      return ok(j, payload, file, p);
    });
    const { requeued } = await second.recover();
    expect(requeued).toEqual([job.id]);
    await until(() => second.get(job.id, job.token)?.state === "done");
    expect(seen).toEqual({ slides: ["kept"] });
    expect(second.get(job.id, job.token)!.attempts).toBe(2);
  });

  it("reports a job that keeps dying as failed, and its retry runs it", async () => {
    const first = new VideoQueue(dir, hang);
    const job = await first.add(fields, {});
    await until(async () => (await onDisk(job.id)).state === "running");
    await writeFile(join(dir, `${job.id}.json`), JSON.stringify({ ...(await onDisk(job.id)), attempts: MAX_ATTEMPTS }));

    const second = new VideoQueue(dir, ok);
    const { failed } = await second.recover();
    expect(failed).toEqual([job.id]);
    expect(second.get(job.id, job.token)).toMatchObject({ state: "failed", error: expect.stringMatching(/Retry/) });

    expect(await second.retry(second.get(job.id, job.token)!)).toBe(true);
    await until(() => second.get(job.id, job.token)?.state === "done");
  });

  it("reports a job whose deck did not survive as failed, and says the editor must resend it", async () => {
    const first = new VideoQueue(dir, hang);
    const job = await first.add(fields, {});
    await until(async () => (await onDisk(job.id)).state === "running");
    await rm(join(dir, `${job.id}.payload.json`));

    const second = new VideoQueue(dir, ok);
    expect((await second.recover()).failed).toEqual([job.id]);
    expect(await second.retry(second.get(job.id, job.token)!)).toBe(false);
  });

  it("records a render that throws as failed, with the reason", async () => {
    const q = new VideoQueue(dir, async () => {
      throw new Error("ffmpeg failed: nope");
    });
    const job = await q.add(fields, {});
    await until(() => q.get(job.id, job.token)?.state === "failed");
    expect(q.get(job.id, job.token)!.error).toBe("ffmpeg failed: nope");
  });

  it("drains: waits for the job in hand, and leaves an unfinished one running on disk for the next start", async () => {
    const quick = new VideoQueue(dir, async (j, p, f, pr) => {
      await new Promise((r) => setTimeout(r, 50));
      return ok(j, p, f, pr);
    });
    const a = await quick.add(fields, {});
    expect(await quick.drain(2000)).toEqual({ finished: true });
    expect(quick.get(a.id, a.token)!.state).toBe("done");
    await expect(quick.add(fields, {})).rejects.toThrow(/restarting/);

    const slow = new VideoQueue(dir, hang);
    const b = await slow.add(fields, {});
    await until(async () => (await onDisk(b.id)).state === "running");
    expect(await slow.drain(20)).toEqual({ finished: false });
    expect((await onDisk(b.id)).state).toBe("running");
  });

  it("sweeps finished jobs and their files after a week", async () => {
    let now = 1_000_000;
    const q = new VideoQueue(dir, ok, 1, () => now);
    const job = await q.add(fields, {});
    await until(() => q.get(job.id, job.token)?.state === "done");
    now += KEEP_MS + 1;
    await q.sweep();
    expect(q.get(job.id, job.token)).toBeNull();
    expect(await exists(join(dir, `${job.id}.json`))).toBe(false);
    expect(await exists(join(dir, `${job.id}.mp4`))).toBe(false);
  });
});
