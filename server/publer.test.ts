/**
 * Done when (31.1): a week's run appears in the connected scheduler as drafts
 * on the right dates, with nothing published, and a failure on one carousel
 * names that carousel and leaves the others sent. Against a fake Publer that
 * answers the way its documentation says it does (D66).
 */
import { describe, expect, it } from "vitest";

import { draftBody, headers, mediaIds, PUBLER, sendDrafts, type DraftItem } from "./publer.js";

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };

function fakePubler(opts: { failUploadFor?: string; jobStatus?: string } = {}) {
  const calls: Call[] = [];
  let job = 0;
  const jobs = new Map<string, unknown>();
  const f = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace(PUBLER.base, "");
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init.method ?? "GET", path, headers: init.headers as Record<string, string>, body });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (path === "/media/from-url") {
      const media = (body as { media: { url: string; name: string }[] }).media;
      if (opts.failUploadFor && media.some((m) => m.name.startsWith(opts.failUploadFor!))) return new Response(JSON.stringify({ message: "Unsupported media" }), { status: 422 });
      const id = `job-${++job}`;
      jobs.set(id, { media: media.map((m) => ({ id: `m-${m.name}` })) });
      return ok({ job_id: id });
    }
    if (path === "/posts/schedule") {
      const id = `job-${++job}`;
      jobs.set(id, { posts: 1 });
      return ok({ job_id: id });
    }
    const m = path.match(/^\/job_status\/(.+)$/);
    if (m) return ok({ status: opts.jobStatus ?? "completed", payload: jobs.get(m[1]!) });
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const week: DraftItem[] = ["mon", "wed", "fri"].map((d, i) => ({
  id: d,
  name: `Carousel ${d}`,
  platform: "instagram",
  caption: `Caption for ${d}`,
  urls: [`https://cdn.example.com/${d}/1.jpg`, `https://cdn.example.com/${d}/2.jpg`],
  alts: [`Slide one of ${d}`, ""],
  scheduledFor: `2026-10-${19 + i * 2}T09:00:00.000Z`,
}));

const conn = { workspaceId: "ws1", accounts: [{ id: "ig1", name: "@ada", network: "instagram" }, { id: "li1", name: "Ada", network: "linkedin" }] };
const instant = async () => {};

describe("send as drafts to Publer (31.1)", () => {
  it("authenticates the documented way", () => {
    expect(headers("k", "ws1")).toMatchObject({ Authorization: "Bearer-API k", "Publer-Workspace-Id": "ws1" });
  });

  it("puts a week's run in as drafts on their dates, on that network's accounts only, and publishes nothing", async () => {
    const { f, calls } = fakePubler();
    const results = await sendDrafts(f, "k", conn, week, instant);
    expect(results.every((r) => r.ok)).toBe(true);
    const posts = calls.filter((c) => c.path === "/posts/schedule").map((c) => c.body as ReturnType<typeof draftBody>);
    expect(posts).toHaveLength(3);
    for (const [i, p] of posts.entries()) {
      expect(p.bulk.state).toBe("draft");
      expect(p.bulk.posts[0]!.accounts).toEqual([{ id: "ig1", scheduled_at: week[i]!.scheduledFor }]);
      expect(p.bulk.posts[0]!.networks.instagram!.media.map((m) => m.id)).toEqual([`m-${week[i]!.id}-1`, `m-${week[i]!.id}-2`]);
      expect(p.bulk.posts[0]!.networks.instagram!.media[0]).toMatchObject({ alt_text: `Slide one of ${week[i]!.id}` });
    }
    // Nothing anywhere asks Publer to publish.
    expect(JSON.stringify(calls.map((c) => c.body))).not.toMatch(/"state":"(scheduled|publish)/);
    expect(calls.every((c) => !c.path.includes("publish"))).toBe(true);
  });

  it("names the carousel that failed and sends the others", async () => {
    const { f, calls } = fakePubler({ failUploadFor: "wed" });
    const results = await sendDrafts(f, "k", conn, week, instant);
    expect(results.map((r) => [r.id, r.ok])).toEqual([
      ["mon", true],
      ["wed", false],
      ["fri", true],
    ]);
    expect(results[1]).toMatchObject({ name: "Carousel wed", error: expect.stringContaining("422") });
    expect(calls.filter((c) => c.path === "/posts/schedule")).toHaveLength(2);
  });

  it("refuses, per carousel, what cannot be sent: no account on that network, more than ten slides", async () => {
    const { f } = fakePubler();
    const results = await sendDrafts(
      f,
      "k",
      conn,
      [
        { ...week[0]!, id: "tt", platform: "tiktok" },
        { ...week[0]!, id: "big", urls: Array.from({ length: 11 }, (_, i) => `https://cdn.example.com/${i}.jpg`) },
      ],
      instant,
    );
    expect(results.map((r) => (r.ok ? "ok" : r.error))).toEqual(["No tiktok account is connected in this Publer workspace", "11 slides; a Publer carousel takes 10"]);
  });

  it("accepts both words the docs use for a finished job, and both media shapes", async () => {
    const { f } = fakePubler({ jobStatus: "complete" });
    expect((await sendDrafts(f, "k", conn, [week[0]!], instant))[0]!.ok).toBe(true);
    expect(mediaIds([{ id: 1 }, { media_id: "b" }])).toEqual(["1", "b"]);
    expect(mediaIds({ media: [{ id: "a" }] })).toEqual(["a"]);
  });
});
