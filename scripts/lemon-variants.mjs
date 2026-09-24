/**
 * What are my Lemon Squeezy variant ids?
 *
 *   npm run lemon:variants
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * A Lemon Squeezy product holds variants, and the two have different ids that
 * look identical: both are plain six or seven digit numbers. The product page
 * shows the product id prominently and the variant id barely at all, so the
 * product id is the one people copy.
 *
 * A product id in `LEMON_VARIANT_PRO` fails in the worst possible way. Checkout
 * works, payment succeeds, the webhook arrives, and `planForVariant` does not
 * recognise the id, so the customer is charged and left on Free. Nothing throws.
 * The only trace is one `[billing] unknown variant` line in a server log.
 *
 * So: ask the API, print both, and say which is which.
 *
 * The key is read from `.env` and never printed.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const at = t.indexOf("=");
  process.env[t.slice(0, at).trim()] ??= t.slice(at + 1).trim();
}

const KEY = process.env.LEMON_API_KEY;
if (!KEY) {
  console.error("No LEMON_API_KEY in .env. Add it, then run this again.");
  process.exit(1);
}

const get = async (path) => {
  const response = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${KEY}`,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.errors?.[0]?.detail ?? response.statusText;
    console.error(`Lemon Squeezy said: ${detail} (${response.status})`);
    process.exit(1);
  }
  return response.json();
};

const products = await get("/products?page[size]=50");
const variants = await get("/variants?page[size]=100");

const byProduct = new Map();
for (const v of variants.data ?? []) {
  const pid = String(v.attributes?.product_id ?? "");
  if (!byProduct.has(pid)) byProduct.set(pid, []);
  byProduct.get(pid).push(v);
}

// Saves a trip to Settings, and it is right here on every product anyway.
const storeIds = new Set((products.data ?? []).map((p) => String(p.attributes?.store_id ?? "")));
console.log("");
for (const id of storeIds) {
  if (id) console.log(`LEMON_STORE_ID=${id}`);
}
console.log("");
for (const p of products.data ?? []) {
  const pid = String(p.id);
  const price = p.attributes?.price_formatted ?? "";
  console.log(`${p.attributes?.name ?? "(unnamed)"}  ${price}`);
  console.log(`  product id  ${pid}   <- NOT this one`);

  for (const v of byProduct.get(pid) ?? []) {
    const a = v.attributes ?? {};
    const interval = a.interval ? `every ${a.interval_count ?? 1} ${a.interval}` : "one time";
    console.log(`  VARIANT id  ${v.id}   ${a.name ?? ""} (${interval})  <- use this`);
  }
  console.log("");
}

// The whole point: check what is already configured, and say plainly if it is
// wrong, rather than leaving somebody to discover it after a real payment.
const productIds = new Set((products.data ?? []).map((p) => String(p.id)));
const variantIds = new Set((variants.data ?? []).map((v) => String(v.id)));

let wrong = false;
for (const name of ["LEMON_VARIANT_PRO", "LEMON_VARIANT_AGENCY"]) {
  const configured = process.env[name];
  if (!configured) {
    console.log(`${name} is not set yet.`);
    continue;
  }
  if (variantIds.has(configured)) {
    console.log(`${name}=${configured}  ok, that is a variant.`);
  } else if (productIds.has(configured)) {
    console.log(`${name}=${configured}  WRONG. That is a PRODUCT id. Use the variant above.`);
    wrong = true;
  } else {
    console.log(`${name}=${configured}  WRONG. Not a product or a variant in this account.`);
    wrong = true;
  }
}

console.log("");
process.exit(wrong ? 1 : 0);
