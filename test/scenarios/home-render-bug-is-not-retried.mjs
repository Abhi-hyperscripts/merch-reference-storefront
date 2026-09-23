/* /api/homepage answering 200 with a body the renderer cannot use is a BUG, not an outage: it is deterministic, so
   refetching on every Clear / Apply / back only spent a browse call per action while the home stayed hidden. It is
   cached as an empty home (a real ApiError is still retried — see home-retries-after-a-failed-first-paint). */
export const page = "js/catalog.js";
export const seed = '[]';
let fetches = 0;
let warned = 0;
export function before({ window }) {
  const inner = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).includes("/api/homepage")) { fetches++; return new Response("null", { status: 200, headers: { "content-type": "application/json" } }); }
    return inner(url, init);
  };
  window.history.pushState = () => {};
  globalThis.console.warn = () => { warned++; };   // the renderer must report the bug here (and keep the check output clean)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, errors }) {
  const host = doc.querySelector("#home");
  for (let i = 0; i < 3; i++) { for (const fn of doc.querySelector("#f-clear").listeners.click || []) await fn({ preventDefault() {} }); await wait(200); }
  if (fetches !== 1) errors.push("a render bug was refetched on every action: " + fetches + " homepage fetches");
  if (!host.hidden || host.innerHTML !== "") errors.push("a broken home should stay hidden: hidden=" + host.hidden);
  if (warned === 0) errors.push("a render bug was swallowed without a console.warn");
}
