/**
 * Keeping the browser and the database agreeing.
 *
 * The model is deliberately the dull one: LAST WRITE WINS on the record's own
 * `updatedAt`. Not CRDTs, not operational transforms, not field-level merging.
 * One person editing on a laptop and a phone almost never touches the same
 * carousel in the same minute, and when they do, "the newer edit survives" is a
 * result they can predict. A clever merge that silently interleaves two versions
 * of a slide produces something neither device ever had, and nobody can explain
 * it afterwards.
 *
 * Deletion is not a special case. A deleted record becomes an entry whose value is
 * null and whose timestamp is when it went, so it competes on exactly the same
 * terms as an edit. That is the only way a delete on one device survives contact
 * with a second device that still has the row — see tombstones.ts.
 *
 * `mergeEntries` is pure and has no idea localStorage or Supabase exist. That is
 * where the reasoning lives, and it is the part worth testing.
 */

import {
  assetToRow,
  brandToRow,
  clientToRow,
  cloud,
  docToRow,
  forWrite,
  postToRow,
  rowToAsset,
  rowToBrand,
  rowToClient,
  rowToDoc,
  rowToPost,
  type AssetRow,
  type BrandRow,
  type ClientRow,
  type DocRow,
  type PostRow,
} from "./cloud.js";
import { listAssets, saveAssets, type Asset } from "./assets.js";
import { listBrands, saveBrands, type Brand } from "./brand.js";
import { listClients, saveClients, type Client } from "./clients.js";
import { forgetLibrary } from "./library.js";
import { forgetAllVersions } from "./versions.js";
import type { Doc } from "./model.js";
import { listPosts, savePosts, type Post } from "./pipeline.js";
import { dropDoc, listDocs, loadDoc, putDoc } from "./storage.js";
import { clearAllTombstones, clearTombstones, listTombstones } from "./tombstones.js";

/* ── the pure part ────────────────────────────────────────────────────────── */

/** One record's state on one side. A null value means "deleted at this time". */
export type Entry<T> = { id: string; updatedAt: string; value: T | null };

export type Merge<T> = {
  /** What both sides should end up holding. */
  merged: Entry<T>[];
  /** Local was newer: send these up. */
  toPush: Entry<T>[];
  /** Remote was newer: write these down. */
  toApply: Entry<T>[];
};

/**
 * Ties resolve to "do nothing" rather than to either side, which is what makes a
 * repeated sync free: run it twice with no edits in between and the second run
 * pushes nothing and applies nothing.
 */
export function mergeEntries<T>(local: Entry<T>[], remote: Entry<T>[]): Merge<T> {
  const byId = new Map<string, { local?: Entry<T>; remote?: Entry<T> }>();

  for (const e of local) byId.set(e.id, { ...byId.get(e.id), local: e });
  for (const e of remote) byId.set(e.id, { ...byId.get(e.id), remote: e });

  const merged: Entry<T>[] = [];
  const toPush: Entry<T>[] = [];
  const toApply: Entry<T>[] = [];

  for (const { local: l, remote: r } of byId.values()) {
    if (l && !r) {
      merged.push(l);
      toPush.push(l);
    } else if (r && !l) {
      merged.push(r);
      toApply.push(r);
    } else if (l && r) {
      const cmp = l.updatedAt.localeCompare(r.updatedAt);
      if (cmp > 0) {
        merged.push(l);
        toPush.push(l);
      } else if (cmp < 0) {
        merged.push(r);
        toApply.push(r);
      } else {
        merged.push(r);
      }
    }
  }

  return { merged, toPush, toApply };
}

/** The surviving records, deletions stripped out. */
export const live = <T>(entries: Entry<T>[]): T[] =>
  entries.flatMap((e) => (e.value === null ? [] : [e.value]));

/* ── local state as entries ───────────────────────────────────────────────── */

function localDocEntries(): Entry<Doc>[] {
  const alive: Entry<Doc>[] = listDocs().flatMap((summary) => {
    const doc = loadDoc(summary.id);
    return doc ? [{ id: doc.id, updatedAt: doc.updatedAt, value: doc }] : [];
  });
  const gone: Entry<Doc>[] = listTombstones("doc").map((t) => ({
    id: t.id,
    updatedAt: t.deletedAt,
    value: null,
  }));
  return [...alive, ...gone];
}

function localBrandEntries(): Entry<Brand>[] {
  const alive: Entry<Brand>[] = listBrands().map((b) => ({
    id: b.id,
    updatedAt: b.updatedAt,
    value: b,
  }));
  const gone: Entry<Brand>[] = listTombstones("brand").map((t) => ({
    id: t.id,
    updatedAt: t.deletedAt,
    value: null,
  }));
  return [...alive, ...gone];
}

/**
 * Only assets that have reached the bucket are pushed.
 *
 * An asset still carrying its bytes inline has no `path`, and the table's check
 * constraint refuses a row without one — correctly, because a library entry that
 * points at nothing is worse than an entry that is not there yet. `library.ts`
 * uploads it on the next sign-in and it joins the sync then.
 */
function localAssetEntries(): Entry<Asset>[] {
  const alive: Entry<Asset>[] = listAssets()
    .filter((a) => a.path !== "")
    .map((a) => ({ id: a.id, updatedAt: a.updatedAt, value: a }));
  const gone: Entry<Asset>[] = listTombstones("asset").map((t) => ({
    id: t.id,
    updatedAt: t.deletedAt,
    value: null,
  }));
  return [...alive, ...gone];
}

function localClientEntries(): Entry<Client>[] {
  const alive: Entry<Client>[] = listClients().map((c) => ({
    id: c.id,
    updatedAt: c.updatedAt,
    value: c,
  }));
  const gone: Entry<Client>[] = listTombstones("client").map((t) => ({
    id: t.id,
    updatedAt: t.deletedAt,
    value: null,
  }));
  return [...alive, ...gone];
}

function localPostEntries(): Entry<Post>[] {
  const alive: Entry<Post>[] = listPosts().map((p) => ({
    id: p.id,
    updatedAt: p.updatedAt,
    value: p,
  }));
  const gone: Entry<Post>[] = listTombstones("post").map((t) => ({
    id: t.id,
    updatedAt: t.deletedAt,
    value: null,
  }));
  return [...alive, ...gone];
}

/**
 * A remote row carries its own deletion in `deleted_at`. When it is set, the row's
 * timestamp for merge purposes is when it was deleted, not when it was last
 * edited — otherwise an old delete would lose to the edit that preceded it.
 */
const docRowToEntry = (row: DocRow): Entry<Doc> =>
  row.deleted_at
    ? { id: row.id, updatedAt: row.deleted_at, value: null }
    : { id: row.id, updatedAt: row.updated_at, value: rowToDoc(row) };

const brandRowToEntry = (row: BrandRow): Entry<Brand> =>
  row.deleted_at
    ? { id: row.id, updatedAt: row.deleted_at, value: null }
    : { id: row.id, updatedAt: row.updated_at, value: rowToBrand(row) };

const clientRowToEntry = (row: ClientRow): Entry<Client> =>
  row.deleted_at
    ? { id: row.id, updatedAt: row.deleted_at, value: null }
    : { id: row.id, updatedAt: row.updated_at, value: rowToClient(row) };

const assetRowToEntry = (row: AssetRow): Entry<Asset> =>
  row.deleted_at
    ? { id: row.id, updatedAt: row.deleted_at, value: null }
    : { id: row.id, updatedAt: row.updated_at, value: rowToAsset(row) };

const postRowToEntry = (row: PostRow): Entry<Post> =>
  row.deleted_at
    ? { id: row.id, updatedAt: row.deleted_at, value: null }
    : { id: row.id, updatedAt: row.updated_at, value: rowToPost(row) };

/* ── the round trip ───────────────────────────────────────────────────────── */

export type SyncResult = {
  ok: boolean;
  pushed: number;
  applied: number;
  error?: string;
};

const CURSOR = "flashcc:v1:sync-cursor";

const readCursor = (): string | null => {
  try {
    return localStorage.getItem(CURSOR);
  } catch {
    return null;
  }
};

const writeCursor = (at: string): void => {
  try {
    localStorage.setItem(CURSOR, at);
  } catch {
    /* ignore */
  }
};

export function clearCursor(): void {
  try {
    localStorage.removeItem(CURSOR);
  } catch {
    /* ignore */
  }
}

/**
 * Pull everything, merge, push what we won, apply what we lost.
 *
 * The pull is full rather than incremental on purpose. An incremental pull keyed
 * on the server clock is a worthwhile optimisation later, but it can only be
 * correct once every device is known to have seen every tombstone — and getting
 * that wrong resurrects deleted records, which is precisely the bug tombstones
 * exist to prevent. At the scale of one person's carousels the whole set is a
 * cheap read.
 */
export async function syncAll(userId: string): Promise<SyncResult> {
  const db = cloud();
  if (!db) return { ok: false, pushed: 0, applied: 0, error: "Cloud is not configured" };

  try {
    const [docsRes, postsRes, brandsRes, assetsRes, clientsRes] = await Promise.all([
      db.from("docs").select("*").eq("user_id", userId),
      db.from("posts").select("*").eq("user_id", userId),
      db.from("brands").select("*").eq("user_id", userId),
      db.from("assets").select("*").eq("user_id", userId),
      db.from("clients").select("*").eq("user_id", userId),
    ]);

    if (docsRes.error) throw new Error(docsRes.error.message);
    if (postsRes.error) throw new Error(postsRes.error.message);

    // Brands are optional: the table arrives with 03-brands.sql, and until it is
    // run PostgREST answers PGRST205. Everything else must still sync, so a
    // missing table degrades brands to local-only rather than failing the sync.
    const brandsTableMissing = brandsRes.error?.code === "PGRST205";
    if (brandsRes.error && !brandsTableMissing) throw new Error(brandsRes.error.message);

    // Same bargain for assets: the table arrives with 04-storage.sql, and until
    // it does the library is a local one. Nothing else in the sync may fail
    // because of it.
    const assetsTableMissing = assetsRes.error?.code === "PGRST205";
    if (assetsRes.error && !assetsTableMissing) throw new Error(assetsRes.error.message);

    // And again for clients, which arrive with 06-clients.sql. Three optional
    // tables is a pattern now rather than an exception: each migration ships
    // separately, and a sync that fails because one has not been run yet would
    // take the whole account offline over a feature nobody is using.
    const clientsTableMissing = clientsRes.error?.code === "PGRST205";
    if (clientsRes.error && !clientsTableMissing) throw new Error(clientsRes.error.message);

    const docMerge = mergeEntries(
      localDocEntries(),
      (docsRes.data as DocRow[]).map(docRowToEntry),
    );
    const postMerge = mergeEntries(
      localPostEntries(),
      (postsRes.data as PostRow[]).map(postRowToEntry),
    );
    const brandMerge = brandsTableMissing
      ? { merged: [], toPush: [], toApply: [] }
      : mergeEntries(
          localBrandEntries(),
          ((brandsRes.data ?? []) as BrandRow[]).map(brandRowToEntry),
        );

    const assetMerge = assetsTableMissing
      ? { merged: [], toPush: [], toApply: [] }
      : mergeEntries(
          localAssetEntries(),
          ((assetsRes.data ?? []) as AssetRow[]).map(assetRowToEntry),
        );

    const clientMerge = clientsTableMissing
      ? { merged: [], toPush: [], toApply: [] }
      : mergeEntries(
          localClientEntries(),
          ((clientsRes.data ?? []) as ClientRow[]).map(clientRowToEntry),
        );

    /* ── push ── */
    const docRows = docMerge.toPush.map((e) =>
      forWrite(
        e.value
          ? docToRow(e.value, userId)
          : // A deletion still needs a row to land on, so the placeholder carries
            // the id and the timestamp and nothing else worth keeping.
            docToRow(emptyDoc(e.id, e.updatedAt), userId, e.updatedAt),
      ),
    );
    const postRows = postMerge.toPush.map((e) =>
      forWrite(
        e.value
          ? postToRow(e.value, userId)
          : postToRow(emptyPost(e.id, e.updatedAt), userId, e.updatedAt),
      ),
    );
    const brandRows = brandMerge.toPush.map((e) =>
      forWrite(
        e.value
          ? brandToRow(e.value, userId)
          : brandToRow(emptyBrand(e.id, e.updatedAt), userId, e.updatedAt),
      ),
    );

    const clientRows = clientMerge.toPush.map((e) =>
      forWrite(
        e.value
          ? clientToRow(e.value, userId)
          : clientToRow(emptyClient(e.id, e.updatedAt), userId, e.updatedAt),
      ),
    );

    if (clientRows.length > 0) {
      const { error } = await db.from("clients").upsert(clientRows, { onConflict: "user_id,id" });
      // Past the plan's allowance is the paywall working, not a sync failure —
      // the same bargain brands strike. The client stays local.
      if (error && error.code !== "42501") throw new Error(error.message);
    }

    const assetRows = assetMerge.toPush.flatMap((e) =>
      e.value
        ? [forWrite(assetToRow(e.value, userId))]
        : // A deleted asset has no row to rebuild from — the record is gone
          // locally and only the tombstone remains — so the deletion is sent as
          // an UPDATE of the existing row rather than as an upsert of a
          // placeholder. A path is required by the table and a placeholder has
          // none to offer.
          [],
    );

    if (assetRows.length > 0) {
      const { error } = await db.from("assets").upsert(assetRows, { onConflict: "user_id,id" });
      if (error) throw new Error(error.message);
    }

    const assetTombstones = assetMerge.toPush.filter((e) => e.value === null);
    for (const gone of assetTombstones) {
      const { error } = await db
        .from("assets")
        .update({ deleted_at: gone.updatedAt, updated_at: gone.updatedAt })
        .eq("user_id", userId)
        .eq("id", gone.id);
      if (error) throw new Error(error.message);
    }

    if (docRows.length > 0) {
      const { error } = await db.from("docs").upsert(docRows, { onConflict: "user_id,id" });
      if (error) throw new Error(error.message);
    }
    // Posts reference docs, so the carousels have to exist before the posts do.
    if (postRows.length > 0) {
      const { error } = await db.from("posts").upsert(postRows, { onConflict: "user_id,id" });
      if (error) throw new Error(error.message);
    }
    if (brandRows.length > 0) {
      const { error } = await db.from("brands").upsert(brandRows, { onConflict: "user_id,id" });
      // A brand past the plan's allowance is refused by the INSERT policy. That
      // is the paywall working, not a sync failure, so it must not take the rest
      // of the sync down with it — the brand simply stays local.
      if (error && error.code !== "42501") throw new Error(error.message);
    }

    /* ── apply ── */
    for (const e of docMerge.toApply) {
      if (e.value) putDoc(e.value);
      else dropDoc(e.id);
    }

    if (postMerge.toApply.length > 0) {
      savePosts(live(postMerge.merged));
    }

    if (brandMerge.toApply.length > 0) {
      saveBrands(live(brandMerge.merged));
    }

    if (clientMerge.toApply.length > 0) {
      saveClients(live(clientMerge.merged));
    }

    if (assetMerge.toApply.length > 0) {
      // Locally-pending uploads are kept: they are the ones still carrying their
      // bytes, they are invisible to the server, and a merge that only saw the
      // server's view would drop them on the floor.
      const pending = listAssets().filter((a) => a.path === "");
      saveAssets([...pending, ...live(assetMerge.merged)]);
    }

    // Only now is it safe to forget what was deleted: the server has it.
    clearTombstones("doc", docMerge.toPush.filter((e) => e.value === null).map((e) => e.id));
    clearTombstones("post", postMerge.toPush.filter((e) => e.value === null).map((e) => e.id));
    clearTombstones("brand", brandMerge.toPush.filter((e) => e.value === null).map((e) => e.id));
    clearTombstones("asset", assetTombstones.map((e) => e.id));
    clearTombstones("client", clientMerge.toPush.filter((e) => e.value === null).map((e) => e.id));

    writeCursor(new Date().toISOString());

    return {
      ok: true,
      pushed:
        docRows.length + postRows.length + brandRows.length + assetRows.length + clientRows.length,
      applied:
        docMerge.toApply.length +
        postMerge.toApply.length +
        brandMerge.toApply.length +
        assetMerge.toApply.length +
        clientMerge.toApply.length,
    };
  } catch (err) {
    return {
      ok: false,
      pushed: 0,
      applied: 0,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

const emptyClient = (id: string, at: string): Client => ({
  id,
  name: "Deleted",
  colour: "#888888",
  createdAt: at,
  updatedAt: at,
});

const emptyBrand = (id: string, at: string): Brand => ({
  id,
  name: "Deleted",
  logos: {},
  theme: { bg: "#000000", fg: "#ffffff", accent: "#ffffff", muted: "#888888" },
  width: 1080,
  height: 1350,
  createdAt: at,
  updatedAt: at,
});

/** Placeholders for a tombstone push. Never read back — deleted_at hides them. */
const emptyDoc = (id: string, at: string): Doc => ({
  version: 3,
  id,
  name: "Deleted",
  width: 1080,
  height: 1350,
  palette: [],
  media: [],
  slides: [],
  createdAt: at,
  updatedAt: at,
});

const emptyPost = (id: string, at: string): Post => ({
  id,
  docId: null,
  title: "Deleted",
  stage: "idea",
  platform: "linkedin",
  framework: null,
  slideCount: 0,
  hook: "",
  styleId: null,
  series: null,
  scheduledFor: null,
  postedAt: null,
  url: null,
  caption: "",
  notes: "",
  pillar: "",
  campaign: "",
  objective: null,
  reviewer: "",
  approvalNotes: "",
  metrics: null,
  createdAt: at,
  updatedAt: at,
});

/**
 * The first sign-in. Everything already on this machine becomes the starting
 * point for the account, which is what makes signing up feel like a rescue rather
 * than a reset — and it is the only moment the upgrade prompt is genuinely
 * persuasive, because the work is right there.
 */
export function hasLocalWork(): boolean {
  return (
    listDocs().length > 0 ||
    listPosts().length > 0 ||
    listBrands().length > 0 ||
    listAssets().length > 0 ||
    listClients().length > 0
  );
}

/** Signing out leaves the machine clean, so the next person sees their own work. */
export function forgetLocal(): void {
  for (const d of listDocs()) dropDoc(d.id);
  savePosts([]);
  saveBrands([]);
  saveClients([]);
  forgetLibrary();
  // Swept by prefix, because version keys are per document and there is no index
  // to walk. Without this, signing out on a shared machine leaves whole
  // documents behind for whoever signs in next.
  forgetAllVersions();
  clearAllTombstones();
  clearCursor();
}

export const lastSyncedAt = (): string | null => readCursor();
