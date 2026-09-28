/* theme-check — what a new template still has to name.
 *
 *   node merch/theme-check.mjs <theme> [baseUrl]
 *   node merch/theme-check.mjs fashion http://localhost:5610
 *
 * Adding a template is mostly a matter of telling merch.js where that theme
 * keeps things. This loads the theme's own pages, tries every selector its
 * entry in THEMES declares, and prints the ones that match nothing — so the
 * job is a checklist instead of an afternoon in devtools.
 *
 * A miss is not always a bug: a theme that ships no USP strip should have no
 * `usps` entry. The point is that you SEE it and decide, rather than finding
 * out from a shopper.
 */
import { chromium } from '../../Frontend/node_modules/playwright/index.mjs';

const theme = process.argv[2];
const BASE = (process.argv[3] || 'http://localhost:5610').replace(/\/$/, '');
if (!theme) { console.error('usage: node merch/theme-check.mjs <theme> [baseUrl]'); process.exit(2); }

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

/* Read the theme map out of the copy this template actually ships. */
await page.goto(`${BASE}/${theme}/index.html`, { waitUntil: 'domcontentloaded' });
const spec = await page.evaluate(async (t) => {
  const m = await import('./merch.js');
  const T = m.THEMES?.[t];
  if (!T) return null;
  /* Flatten every selector the map declares, keyed by where it came from. */
  const out = [];
  /* Directives, not selectors: `attr: "src"` says WHAT to set, not where.
     Checking them as selectors reported a miss for every field on the page. */
  const DIRECTIVE = new Set(['attr', 'action', 'value', 'bg', 'all', 'html', 'text', 'name', 'kind']);
  const walk = (node, path, key) => {
    if (typeof node === 'string') {
      if (DIRECTIVE.has(key)) return;
      if (!/[.#[\]|>:]|^[a-z]+$/i.test(node)) return;      // not selector-shaped
      out.push({ path, sel: node });
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'pages' || typeof v === 'function') continue;
      walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  walk(T, '', '');
  return { pages: T.pages || {}, selectors: out };
}, theme);
if (!spec) { console.error(`no THEMES entry called "${theme}"`); await browser.close(); process.exit(2); }

/* Which page each selector group belongs on. Anything else is checked on the home page. */
const ROLE_OF = (path) =>
  /^banners|^categories/.test(path) ? 'home'          // both live on the home page
  : /^listing/.test(path) ? 'listing'
  : /^product/.test(path) ? 'product'
  : /^cart/.test(path) ? 'cart'
  : /^checkout/.test(path) ? 'checkout'
  : /^blog/.test(path) ? 'blog'
  : /^post/.test(path) ? 'post'
  : 'home';

const pageFor = { home: 'index.html', listing: spec.pages.listing, product: spec.pages.product, cart: spec.pages.cart, checkout: spec.pages.checkout, blog: spec.pages.blog, post: spec.pages.post };
const byRole = new Map();
for (const s of spec.selectors) {
  const role = ROLE_OF(s.path);
  if (!pageFor[role]) continue;                 // this theme has no such page
  if (!byRole.has(role)) byRole.set(role, []);
  byRole.get(role).push(s);
}

const misses = [];
let checked = 0;
/* A cart or checkout page with an empty basket renders none of its rows, so
   every selector there would read as missing. Give it something to show. */
await page.evaluate(() => localStorage.setItem('merch.cart', JSON.stringify(
  [{ itemId: '00000000-0000-0000-0000-000000000000', qty: 1, name: 'Sample', price: 100, image: '' }])));

for (const [role, list] of byRole) {
  await page.goto(`${BASE}/${theme}/${pageFor[role]}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const found = await page.evaluate((sels) => sels.map(({ path, sel }) => {
    /* merch.js selector lists are '|'-separated: the FIRST one that matches wins. */
    const hit = String(sel).split('|').some((one) => { try { return !!document.querySelector(one.trim()); } catch { return false; } });
    return { path, sel, hit };
  }), list);
  for (const f of found) { checked++; if (!f.hit) misses.push({ role, ...f }); }
}

console.log(`\ntheme-check: ${theme}`);
console.log(`  ${checked} selectors declared, ${checked - misses.length} match this theme's pages, ${misses.length} match nothing\n`);
if (!misses.length) console.log('  every selector this theme declares finds something.');
for (const m of misses) console.log(`  MISS  ${m.role.padEnd(9)} ${m.path.padEnd(30)} ${m.sel.slice(0, 60)}`);

/* The slots a merchant can now fill from the admin panel. A theme that names
   none of these keeps its own hard-coded copy, which is the thing to notice. */
const OPTIONAL = ['announcement', 'usps', 'footerContact'];
const declared = new Set(spec.selectors.map((s) => s.path.split('.')[0]));
const unnamed = OPTIONAL.filter((k) => !declared.has(k));
if (unnamed.length) {
  console.log('\n  admin-owned content this theme does not name (it keeps the template’s own):');
  for (const k of unnamed) console.log(`    ${k}`);
}
console.log('');
await browser.close();
process.exit(misses.length ? 1 : 0);
