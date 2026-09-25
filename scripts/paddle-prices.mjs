/**
 * What are my Paddle price ids?
 *
 *   npm run paddle:prices
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * A Paddle product holds prices, and the two have different ids. They are at
 * least told apart by their prefix, `pro_` against `pri_`, which is one thing
 * Paddle does better than the provider this replaced, where both were plain
 * numbers. But the product page shows the product id at the top and the price
 * ids inside each price row, so the product id is still the easy one to copy.
 *
 * A product id in `PADDLE_PRICE_PRO` fails in the worst possible way. Checkout
 * works, payment succeeds, the webhook arrives, and `planForPrice` does not
 * recognise the id, so the customer is charged and left on Free. Nothing throws.
 * The only trace is one `[billing] unknown price` line in a server log.
 *
 * So: ask the API, print them all, and check what is already configured.
 *
 * The key is read from `.env` and never printed. Which environment it reaches,
 * sandbox or live, is decided by the key itself, exactly as the server does it.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const at = t.indexOf("=");
  process.env[t.slice(0, at).trim()] ??= t.slice(at + 1).trim();
}

const KEY = process.env.PADDLE_API_KEY;
if (!KEY) {
  console.error("No PADDLE_API_KEY in .env. Add it, then run this again.");
  process.exit(1);
}

const SANDBOX = KEY.startsWith("pdl_sdbx_");
const API = SANDBOX ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

const get = async (path) => {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.error?.detail ?? response.statusText;
    console.error(`Paddle said: ${detail} (${response.status})`);
    process.exit(1);
  }
  return response.json();
};

console.log("");
console.log(SANDBOX ? "SANDBOX account (pdl_sdbx_ key)" : "LIVE account (pdl_live_ key)");
console.log("");

const products = await get("/products?per_page=100&status=active");
const prices = await get("/prices?per_page=200&status=active");

const byProduct = new Map();
for (const p of prices.data ?? []) {
  const pid = String(p.product_id ?? "");
  if (!byProduct.has(pid)) byProduct.set(pid, []);
  byProduct.get(pid).push(p);
}

const money = (price) => {
  const amount = price?.unit_price?.amount;
  const code = price?.unit_price?.currency_code ?? "";
  // Paddle sends amounts in the currency's smallest unit, as a string.
  return amount === undefined ? "" : `${(Number(amount) / 100).toFixed(2)} ${code}`;
};

for (const product of products.data ?? []) {
  const pid = String(product.id);
  console.log(`${product.name ?? "(unnamed)"}`);
  console.log(`  product id  ${pid}   <- NOT this one`);

  for (const price of byProduct.get(pid) ?? []) {
    const cycle = price.billing_cycle
      ? `every ${price.billing_cycle.frequency ?? 1} ${price.billing_cycle.interval ?? ""}`
      : "one time";
    console.log(`  PRICE id    ${price.id}   ${money(price)} ${cycle}  <- use this`);
  }
  console.log("");
}

// The whole point: check what is already configured, and say plainly if it is
// wrong, rather than leaving somebody to discover it after a real payment.
const productIds = new Set((products.data ?? []).map((p) => String(p.id)));
const priceIds = new Set((prices.data ?? []).map((p) => String(p.id)));

let wrong = false;
for (const name of ["PADDLE_PRICE_PRO", "PADDLE_PRICE_AGENCY"]) {
  const configured = process.env[name];
  if (!configured) {
    console.log(`${name} is not set yet.`);
    continue;
  }
  if (priceIds.has(configured)) {
    console.log(`${name}=${configured}  ok, that is a price.`);
  } else if (productIds.has(configured)) {
    console.log(`${name}=${configured}  WRONG. That is a PRODUCT id. Use the price above.`);
    wrong = true;
  } else {
    console.log(`${name}=${configured}  WRONG. Not a product or a price in this account.`);
    wrong = true;
  }
}

// The two tokens are easy to swap, and swapping them fails late: the server
// would send a public token to the API and the API key to the browser.
const clientToken = process.env.PADDLE_CLIENT_TOKEN;
if (!clientToken) {
  console.log("PADDLE_CLIENT_TOKEN is not set yet. Checkout cannot open without it.");
} else if (clientToken.startsWith("pdl_")) {
  console.log("PADDLE_CLIENT_TOKEN  WRONG. That is an API key, not a client-side token.");
  wrong = true;
} else if (SANDBOX !== clientToken.startsWith("test_")) {
  console.log(
    `PADDLE_CLIENT_TOKEN  WRONG environment. The API key is ${SANDBOX ? "sandbox" : "live"} and the token is not.`,
  );
  wrong = true;
} else {
  console.log("PADDLE_CLIENT_TOKEN  ok.");
}

const secret = process.env.PADDLE_WEBHOOK_SECRET;
if (!secret) {
  console.log("PADDLE_WEBHOOK_SECRET is not set yet. The webhook refuses everything without it.");
} else if (!secret.startsWith("pdl_ntfset_")) {
  console.log("PADDLE_WEBHOOK_SECRET  WRONG. It should start with pdl_ntfset_.");
  wrong = true;
} else {
  console.log("PADDLE_WEBHOOK_SECRET  ok.");
}

console.log("");
process.exit(wrong ? 1 : 0);
