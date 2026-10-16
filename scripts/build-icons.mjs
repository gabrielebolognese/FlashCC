/**
 * Builds the bundled icon index from @tabler/icons (MIT).
 *
 *   npm run build:icons
 *
 * Tabler's package only exposes its per-icon SVG files, and its combined JSON
 * carries versions and unicode points nobody here needs. So this writes a
 * compact index once: every icon as ONE path string (Tabler icons are paths
 * only), and its search words. The files are committed, so a fresh clone and
 * the tests work without running this; re-run it when the package updates.
 *
 * Two styles, because 21.1 decided one style per deck: outline and filled.
 */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../node_modules/@tabler/icons/", import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, root), "utf8"));
const out = new URL("../src/render/iconsets/", import.meta.url);

const meta = read("icons.json");
const join = (nodes) => nodes.filter(([tag]) => tag === "path").map(([, a]) => a.d).join(" ");

for (const style of ["outline", "filled"]) {
  const nodes = read(`tabler-nodes-${style}.json`);
  const icons = {};
  for (const [name, list] of Object.entries(nodes)) icons[name] = join(list);
  writeFileSync(new URL(`tabler-${style}.json`, out), JSON.stringify(icons));
  console.log(`${style}: ${Object.keys(icons).length} icons`);
}

// Search words: the name's own words, the category, and Tabler's tags.
const words = {};
for (const [name, m] of Object.entries(meta)) {
  const w = new Set([...name.split("-"), ...(m.category ? m.category.toLowerCase().split(/\s+/) : []), ...(m.tags ?? []).map(String)]);
  words[name] = [...w].join(" ").toLowerCase();
}
writeFileSync(new URL("tabler-words.json", out), JSON.stringify(words));
console.log(`words: ${Object.keys(words).length}`);
