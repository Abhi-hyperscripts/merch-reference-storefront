/* The connection can drop AFTER the headers: reading the body rejects with a bare TypeError. That is the same transient
   failure as a fetch that never connected, so the home is retried on the next Clear — it was classed as a render bug
   (cached empty, never refetched) because api.js wrapped only the fetch() call, not res.text(). */
export const page = "js/catalog.js";
export const seed = '[]';
let dropped = false;
let fetches = 0;
export function before({ window }) {
  const inner = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).includes("/api/homepage")) {
      fetches++;
      if (!dropped) {
        dropped = true;
        const body = new ReadableStream({ start(c) { c.error(new TypeError("Failed to fetch")); } });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    return inner(url, init);
  };
  window.history.pushState = () => {};
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, errors }) {
  const host = doc.querySelector("#home");
  for (const fn of doc.querySelector("#f-clear").listeners.click || []) await fn({ preventDefault() {} });
  await wait(1500);
  if (fetches < 2) errors.push("a dropped body was not retried: " + fetches + " homepage fetches");
  if (host.hidden || !host.innerHTML.includes("home-tiles")) errors.push("the home did not come back after the dropped body: hidden=" + host.hidden + " len=" + host.innerHTML.length);
}
