/* The home is drawn inside renderHome's own try/catch — a TypeError in a renderer would lose the whole feature and
   pass every other check (the class domsmoke exists for). Assert what the demo layout must produce, section by
   section, and that a filter submitted AFTER the home landed empties it. (The in-flight race has its own scenario:
   home-filter-during-flight.mjs.) */
export const page = "js/catalog.js";
export const seed = '[]';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pushed = null;
export function before({ doc, window }) {
  doc.querySelector("#home").setAttribute("aria-busy", "true");   // as index.html has it; the fake DOM does not parse markup
  window.history.pushState = (_s, _t, url) => { pushed = String(url); };
}
export default async function ({ doc, writes, errors }) {
  const home = writes.home || "";
  // the boot reservation is released the moment the home lands (the fake DOM carries the attribute via before())
  if (doc.querySelector("#home").getAttribute("aria-busy")) errors.push("aria-busy (the reserved height) was not released after the boot render");
  for (const marker of ["home-banners", "home-tiles", "Shop by category", "Shop by brand", "Featured", "Best sellers", "Our picks", "New arrivals"])
    if (!home.includes(marker)) errors.push("home lacks " + marker + ": " + home.slice(0, 160));
  // folded: the apron family is one card (its representative) in every rail — never a Medium or Large card of its own
  if (!/Linen Apron/.test(home)) errors.push("no apron card at all");
  if (/DEMO-04-M|DEMO-04-L/.test(home)) errors.push("a variant MEMBER got its own card on the home: the rails are not folded");
  // a search submitted AFTER the home landed: the host empties and stays hidden (the fake DOM has no pushState)
  const host = doc.querySelector("#home");
  globalThis.window.location.search = "?search=grinder";
  doc.querySelector("#f-search").value = "grinder";
  for (const fn of doc.querySelector("#filters").listeners.submit || []) await fn({ preventDefault() {} });
  await wait(700);
  if (!host.hidden || host.innerHTML !== "") errors.push("the home stayed drawn on a filtered page: hidden=" + host.hidden);
  // a sort alone, no search: the grid changed, the home goes
  globalThis.window.location.search = "";
  for (const fn of doc.querySelector("#f-clear").listeners.click || []) await fn({ preventDefault() {} });
  await wait(300);
  if (host.hidden) errors.push("the home did not come back after Clear");
  if (host.getAttribute("aria-busy")) errors.push("aria-busy (the reserved height) was not released once the home landed");
  doc.querySelector("#f-search").value = ""; doc.querySelector("#f-sort").value = "price_asc";
  pushed = null;
  for (const fn of doc.querySelector("#filters").listeners.submit || []) await fn({ preventDefault() {} });
  // the form→URL write is what the home reads; assert the URL the submit pushed, then mirror it into location
  if (!pushed || !pushed.includes("sort=price_asc")) errors.push("Apply did not write the sort to the URL: " + pushed);
  globalThis.window.location.search = pushed && pushed.includes("?") ? pushed.slice(pushed.indexOf("?")) : "";
  for (const fn of doc.querySelector("#filters").listeners.submit || []) await fn({ preventDefault() {} });
  await wait(300);
  if (!host.hidden) errors.push("a sort left the home drawn above the re-ordered grid");
  if (host.getAttribute("aria-busy")) errors.push("aria-busy was never cleared");
}
