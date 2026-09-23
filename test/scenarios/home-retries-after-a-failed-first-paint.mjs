/* One 503 on /api/homepage at first paint must not lose the home for the page life: the failed read is not cached,
   so the next Clear (or back, or Apply) tries again — like themeOnce in api.js. Measured before the fix: after boot
   hidden=true len=0, after Clear with the store healthy STILL hidden=true len=0. */
export const page = "js/catalog.js";
export const seed = '[]';
let failedOnce = false;
export function before({ window }) {
  const inner = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).includes("/api/homepage") && !failedOnce) { failedOnce = true; return new Response(JSON.stringify({ error: "down" }), { status: 503, headers: { "content-type": "application/json" } }); }
    return inner(url, init);
  };
  window.history.pushState = () => {};
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, errors }) {
  const host = doc.querySelector("#home");
  if (!host.hidden || host.innerHTML !== "") errors.push("a failed first paint should leave the home hidden: hidden=" + host.hidden);
  for (const fn of doc.querySelector("#f-clear").listeners.click || []) await fn({ preventDefault() {} });
  await wait(1500);
  if (host.hidden || !host.innerHTML.includes("home-tiles")) errors.push("the home did not come back once the store was healthy: hidden=" + host.hidden + " len=" + host.innerHTML.length);
}
