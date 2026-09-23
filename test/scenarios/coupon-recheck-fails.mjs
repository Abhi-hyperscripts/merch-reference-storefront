/* A coupon is applied, then a basket edit's re-check FAILS (network). The
   accepted code must survive into merch.pending — a later gift-card apply
   re-saves it — and #coupon-note must stop claiming "applied — you save".
   Freeze round 8: both regressed when the stale-preview fix nulled the
   preview that savePending() derived the code from. */
export const page = "js/cart-page.js";
export const seed = '[{"itemId":"DEMO-02","qty":2,"name":"Grinder","price":2499,"image":""}]';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, writes, errors, window }) {
  const { cart } = await import("../../js/cart.js");
  doc.querySelector("#coupon").value = "WELCOME10";
  for (const fn of doc.querySelector("#apply-coupon").listeners.click || []) await fn({ preventDefault() {} });
  await wait(600);
  const before = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (before.coupon !== "WELCOME10") errors.push("apply did not store the code: " + JSON.stringify(before));
  if (!/applied — you save/.test(writes["coupon-note"] || "")) errors.push("apply wrote no 'applied' note: " + writes["coupon-note"]);
  // a SUCCESSFUL re-check whose storage write throws (private mode, quota) must stay "applied" — the write is not the re-check
  const realSet = sessionStorage.setItem;
  sessionStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  cart.setQty("DEMO-02", 3);
  await wait(1200);
  sessionStorage.setItem = realSet;
  if (!/applied — you save/.test(writes["coupon-note"] || "")) errors.push("a storage throw after a successful re-check turned it into a failure: " + writes["coupon-note"]);
  // the re-check after an edit fails
  const real = window.fetch;
  window.fetch = async (input, init) => { if (String(input).includes("/api/coupon/validate")) throw new TypeError("network down"); return real(input, init); };
  cart.setQty("DEMO-02", 1);
  await wait(1200);   // 350 ms debounce + the mock's latency, with margin
  if (/applied — you save/.test(writes["coupon-note"] || "")) errors.push("a failed re-check left the 'applied' claim: " + writes["coupon-note"]);
  if (/Coupon WELCOME10/.test(writes["totals"] || "")) errors.push("totals still show the stale coupon row: " + writes["totals"]);   // the row is `Coupon <code> … &minus;…` — raw innerHTML, entities unparsed
  // a later gift-card apply re-saves pending: the code must survive
  window.fetch = real;
  doc.querySelector("#giftcard").value = "GIFT500";
  for (const fn of doc.querySelector("#apply-gift").listeners.click || []) await fn({ preventDefault() {} });
  await wait(600);
  const after = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (after.coupon !== "WELCOME10") errors.push("the accepted code was dropped after a failed re-check: " + JSON.stringify(after));
}
