/* ---------------------------------------------------------------------------
   test/domsmoke.mjs — EXECUTES each page script against the demo mock under a
   fake DOM (no jsdom, no install). Run: `node test/domsmoke.mjs` (all pages) or
   `node test/domsmoke.mjs js/cart-page.js '<cart json>'`, or a SCENARIO after
   boot: `node test/domsmoke.mjs js/cart-page.js '<cart json>' test/scenarios/<x>.mjs`
   — the module's default export gets { doc, writes, errors, window } and pushes
   its own failures onto `errors`; an optional `pending` export is written to
   sessionStorage `merch.pending` BEFORE the page boots, and an optional
   `before({ doc, window })` export runs after the mock is installed and before
   the page boots (to wrap `window.fetch` and observe the boot itself). The all-pages run includes every scenario in
   test/scenarios/ (each names its page + seed in its `page`/`seed` exports).

   Why it exists: `node --check` proves syntax and the mock smoke proves the
   API shapes, but a page script that throws inside its own catch (a `note(sel,
   null)` that destructured null) passed both and silently lost a feature.
   NOT covered: a `$('#x')` for an id the page lacks — this DOM hands back a
   stub for every selector, so a missing id runs clean here and throws in a
   browser; the page-id parity check is a grep, not this file. This runs boot() for real and fails on any
   unhandled error. The DOM is fake: rendered HTML is NOT parsed, querySelector
   returns one stub element per selector, so it proves "the script runs and
   writes what it should", not layout.
--------------------------------------------------------------------------- */
// A fake DOM just deep enough to EXECUTE the reference client's page scripts against the demo mock.
// Usage: node domsmoke.mjs <page-script> [seedCartJson] [scenarioPath]
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SEED = '[{"itemId":"DEMO-02","qty":1,"name":"Grinder","price":2499,"image":""}]';
const PAGES = ["js/catalog.js", "js/collection.js", "js/product.js", "js/cart-page.js", "js/checkout.js", "js/order.js", "js/track.js", "js/account.js", "js/reset.js"];
if (process.argv.length < 3) {   // all pages, each in its own process (module state must not leak between pages)
  const { spawnSync } = await import("node:child_process");
  let failed = 0;
  const { readdirSync } = await import("node:fs");
  const scenarios = [];
  for (const f of readdirSync(ROOT + "test/scenarios").filter((x) => x.endsWith(".mjs")).sort()) {
    const m = await import(ROOT + "test/scenarios/" + f);
    scenarios.push({ page: m.page, seed: m.seed ?? SEED, scenario: "test/scenarios/" + f });
  }
  for (const { page: p, seed: sd, scenario } of [...PAGES.map((p) => ({ page: p, seed: SEED })), ...scenarios]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), p, sd, ...(scenario ? [scenario] : [])], { encoding: "utf8" });
    const out = r.stdout.trim().split("\n").pop() || "{}";
    let j = {}; try { j = JSON.parse(out); } catch { j = { errors: ["no report: " + (r.stderr || r.stdout).slice(0, 300)] }; }
    const ok = r.status === 0 && j.errors && j.errors.length === 0;
    console.log((ok ? "ok   " : "FAIL ") + (scenario ? scenario + " (" + p + ")" : p) + (ok ? "" : "\n     " + (j.errors || []).join("\n     ")));
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
const [,, page, seed, scenarioPath] = process.argv;
const errors = [];
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + (e?.stack || e)));
process.on("uncaughtException", (e) => errors.push("uncaughtException: " + (e?.stack || e)));
const writes = {};   // id → last innerHTML
class El {
  constructor(tag = "div", id = "") { this.tagName = tag.toUpperCase(); this.id = id; this._html = ""; this.textContent = ""; this.value = ""; this.hidden = false; this.disabled = false; this.checked = false; this.dataset = {}; this.style = {}; this.children = []; this.attrs = {}; this.listeners = {}; this.required = false; this.name = ""; }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (this.id) writes[this.id] = this._html; }
  get classList() { const s = new Set((this.attrs.class || "").split(" ").filter(Boolean)); const self = this; return { add: (...c) => { c.forEach((x) => s.add(x)); self.attrs.class = [...s].join(" "); }, remove: (...c) => { c.forEach((x) => s.delete(x)); self.attrs.class = [...s].join(" "); }, toggle: (c, on) => { on ?? !s.has(c) ? s.add(c) : s.delete(c); self.attrs.class = [...s].join(" "); }, contains: (c) => s.has(c) }; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); } removeEventListener() {}
  querySelector(sel) { return doc.querySelector(sel); } querySelectorAll(sel) { return [doc.querySelector(sel)]; } closest() { return null; }
  appendChild(c) { this.children.push(c); return c; } insertBefore(c) { this.children.unshift(c); return c; } remove() {} setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
  focus() {} reportValidity() { return true; } reset() {} get firstChild() { return this.children[0] ?? null; }
  get elements() { return new Proxy({}, { get: (_, n) => doc.querySelector("[name=" + String(n) + "]") }); }
}
const registry = new Map();
const doc = {
  readyState: "complete", title: "Page", body: new El("body"), head: new El("head"), documentElement: new El("html"),
  querySelector(sel) { if (!registry.has(sel)) { const m = /^#([\w-]+)$/.exec(sel) || /^\[name=([\w-]+)\]$/.exec(sel); registry.set(sel, new El("div", m ? m[1] : "")); } return registry.get(sel); },
  querySelectorAll(sel) { return [this.querySelector(sel)]; }, getElementById(id) { return this.querySelector("#" + id); }, createElement: (t) => new El(t), addEventListener() {},
};
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
Object.assign(globalThis, { document: doc, localStorage: store(), sessionStorage: store(), confirm: () => true, alert: () => {}, Headers: globalThis.Headers });
globalThis.window = Object.assign(new EventTarget(), { document: doc, location: { href: "http://localhost/" + page.replace(/^js\//, "").replace(/\.js$/, ".html"), pathname: "/" + page.replace(/^js\//, "").replace(/\.js$/, ".html"), search: "", origin: "http://localhost" }, history: { replaceState() {} }, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, crypto: globalThis.crypto, addEventListener() {}, google: undefined, fetch: globalThis.fetch.bind(globalThis) });
Object.defineProperty(globalThis, 'fetch', { get: () => window.fetch, set: (f) => { window.fetch = f; }, configurable: true });
globalThis.location = window.location; globalThis.history = window.history;
if (seed) localStorage.setItem("merch.cart", seed);
const scenarioModule = scenarioPath ? await import(ROOT + scenarioPath) : null;
if (scenarioModule?.pending) sessionStorage.setItem("merch.pending", JSON.stringify(scenarioModule.pending));
await import(ROOT + "config.js");
await new Promise((r) => setTimeout(r, 50));
if (scenarioModule?.before) scenarioModule.before({ doc, window: globalThis.window });   // after the mock installed itself on window.fetch, before the page boots
await new Promise((r) => setTimeout(r, 50));
await import(ROOT + page);
await new Promise((r) => setTimeout(r, 1800)); // the mock's latency, twice over
if (scenarioPath) {
  try { await scenarioModule.default({ doc, writes, errors, window: globalThis.window }); }
  catch (e) { errors.push("scenario threw: " + (e?.stack || e)); }
}
console.log(JSON.stringify({ errors, writes: Object.fromEntries(Object.entries(writes).map(([k, v]) => [k, v.replace(/\s+/g, " ").slice(0, 220)])) }));
process.exit(errors.length ? 1 : 0);
