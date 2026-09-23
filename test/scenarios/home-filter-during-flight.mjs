/* The render RACE: a search submitted WHILE /api/homepage is still in flight. The first loadHome had passed its
   filter check; when its fetch came back it painted the whole home over the results the shopper had just asked for.
   The fix re-reads the URL after the awaits — this fails with that re-read removed (measured: hidden=false, 36 kB
   of home HTML on a filtered page) and passes with it. */
export const page = "js/catalog.js";
export const seed = '[]';
let landed = 0;      // homepage responses that came back — the assertion is vacuous unless the delayed one did
let fetches = 0;     // homepage fetches — the render in flight is SHARED; a Clear during it must not start a second
export function before({ doc, window }) {
  const inner = window.fetch;
  window.fetch = async (url, init) => {
    const isHome = String(url).includes("/api/homepage");
    if (isHome) { fetches++; await new Promise((r) => setTimeout(r, 1000)); }
    const res = await inner(url, init);
    if (isHome) landed++;
    return res;
  };
  window.history.pushState = () => {};
  setTimeout(async () => {
    // a Clear while the first render is still in flight: re-uses it, does not fetch again
    for (const fn of doc.querySelector("#f-clear").listeners.click || []) await fn({ preventDefault() {} });
    window.location.search = "?search=grinder"; doc.querySelector("#f-search").value = "grinder";
    for (const fn of doc.querySelector("#filters").listeners.submit || []) await fn({ preventDefault() {} });
  }, 400);
}
export default async function ({ doc, errors }) {
  // wait for the delayed response itself (up to 3 s) so a slow box cannot turn the check into a no-op
  for (let i = 0; i < 60 && landed === 0; i++) await new Promise((r) => setTimeout(r, 50));
  if (landed === 0) errors.push("the delayed homepage response never landed — nothing was tested");
  await new Promise((r) => setTimeout(r, 100));
  const host = doc.querySelector("#home");
  if (!host.hidden || host.innerHTML !== "") errors.push("home painted over a filtered page: hidden=" + host.hidden + " len=" + host.innerHTML.length);
  if (fetches !== 1) errors.push("the in-flight render was not shared: " + fetches + " homepage fetches");
}
