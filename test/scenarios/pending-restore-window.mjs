/* Both stored codes must be in storage for the WHOLE restore: while the gift
   card's re-check is in flight, merch.pending must still name it (the coupon's
   own re-check wrote the gift card out — a Checkout click then paid full
   price). And emptying the basket must keep the stored coupon. */
export const page = "js/cart-page.js";
export const seed = '[{"itemId":"DEMO-02","qty":2,"name":"Grinder","price":2499,"image":""}]';
export const pending = { coupon: "WELCOME10", giftCard: "GIFT500" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let seenDuringGiftCheck = null;
export function before({ window }) {
  const real = window.fetch;
  window.fetch = async (input, init) => {
    if (String(input).includes("/api/giftcard/check")) seenDuringGiftCheck = sessionStorage.getItem("merch.pending");
    return real(input, init);
  };
}
export default async function ({ errors }) {
  const { cart } = await import("../../js/cart.js");
  if (seenDuringGiftCheck === null) errors.push("the gift card was never re-checked on boot");
  else if (!/GIFT500/.test(seenDuringGiftCheck)) errors.push("storage lost the gift card during its own re-check: " + seenDuringGiftCheck);
  const after = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (after.coupon !== "WELCOME10" || after.giftCard !== "GIFT500") errors.push("codes not both restored: " + JSON.stringify(after));
  cart.setQty("DEMO-02", 0);   // empty the basket live
  await wait(1200);
  const emptied = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (emptied.coupon !== "WELCOME10") errors.push("emptying the basket erased the stored coupon: " + JSON.stringify(emptied));
}
