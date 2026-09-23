/* A coupon accepted on an earlier visit (merch.pending) must survive a reload
   of the cart page AND the first gift-card apply after it. Freeze round 10:
   boot() never rehydrated pendingCoupon, so that apply wrote coupon:"" and
   checkout placed the order at full price. */
export const page = "js/cart-page.js";
export const seed = '[{"itemId":"DEMO-02","qty":2,"name":"Grinder","price":2499,"image":""}]';
export const pending = { coupon: "WELCOME10", giftCard: "" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, writes, errors }) {
  if (doc.querySelector("#coupon").value !== "WELCOME10") errors.push("the stored coupon was not put back in the field: " + JSON.stringify(doc.querySelector("#coupon").value));
  if (!/applied — you save/.test(writes["coupon-note"] || "")) errors.push("the stored coupon was not re-checked on boot: " + writes["coupon-note"]);
  if (!/Coupon WELCOME10/.test(writes["totals"] || "")) errors.push("totals do not show the restored coupon row");
  doc.querySelector("#giftcard").value = "GIFT500";
  for (const fn of doc.querySelector("#apply-gift").listeners.click || []) await fn({ preventDefault() {} });
  await wait(600);
  const after = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (after.coupon !== "WELCOME10") errors.push("the first gift-card apply after a reload dropped the coupon: " + JSON.stringify(after));
  if (after.giftCard !== "GIFT500") errors.push("the gift card was not stored: " + JSON.stringify(after));
}
