/**
 * Driving the engine page (Batch 31.3) from the API server.
 *
 * One headless page at `${APP_ORIGIN}/engine.html`, kept warm like the export
 * browser, called one request at a time. The page may reach its own origin and
 * nothing else: every other request is aborted, so a document cannot make the
 * server's browser fetch somebody else's URL (Batch 13's rule, and the reason
 * `/v1/render` takes pictures only as data URLs).
 */
import type { BrowserContext, Page } from "playwright";

import { HttpError } from "./http.js";
import { getBrowser } from "./render.js";

/** Where the built app is served. Read when called (env.test.ts). */
export const appOrigin = (): string => (process.env.APP_ORIGIN || "http://localhost:5173").replace(/\/$/, "");

let context: BrowserContext | null = null;
let page: Page | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function enginePage(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  const origin = appOrigin();
  context = await (await getBrowser()).newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith(`${origin}/`) || url.startsWith("data:") || url.startsWith("blob:") ? route.continue() : route.abort();
  });
  try {
    await page.goto(`${origin}/engine.html`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction("window.__fccEngine && window.__fccEngine.ready === true", undefined, { timeout: 30_000 });
  } catch {
    await context.close();
    context = null;
    page = null;
    throw new HttpError(503, `The layout engine is not reachable at ${origin}/engine.html. Set APP_ORIGIN to where the app is served.`);
  }
  return page;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string; input: boolean };

/** One call into the page, after any call already running. A bad input is a 400; anything else a 500. */
export function engine<T>(method: string, ...args: unknown[]): Promise<T> {
  const run = async (): Promise<T> => {
    const p = await enginePage();
    const call = `window.__fccEngine[${JSON.stringify(method)}](...${JSON.stringify(args)})`;
    const result = (await p.evaluate(call)) as Result<T>;
    if (!result.ok) throw new HttpError(result.input ? 400 : 500, result.error);
    return result.value;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function closeEngine(): Promise<void> {
  await context?.close();
  context = null;
  page = null;
}
