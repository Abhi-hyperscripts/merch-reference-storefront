/* A stored coupon with an EMPTY basket: boot must not re-check it (a refusal on
   a ₹0 basket cleared the code and erased it from storage with nothing shown). */
export const page = "js/cart-page.js";
export const seed = '[]';
export const pending = { coupon: "WELCOME10", giftCard: "" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function ({ doc, errors }) {
  const after = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (after.coupon !== "WELCOME10") errors.push("an empty-basket boot erased the stored coupon: " + JSON.stringify(after));
  // a second tab fills the basket (the same onChange this page sees from the storage event), then the first apply here
  // must not re-save the coupon as "" — memory has to have learned the stored codes even though nothing was re-checked
  const { cart } = await import("../../js/cart.js");
  cart.add({ id: "DEMO-02", name: "Grinder", price: 2499, image: "" }, 1);
  await wait(1200);
  doc.querySelector("#giftcard").value = "GIFT500";
  for (const fn of doc.querySelector("#apply-gift").listeners.click || []) await fn({ preventDefault() {} });
  await wait(600);
  const later = JSON.parse(sessionStorage.getItem("merch.pending") || "{}");
  if (later.coupon !== "WELCOME10") errors.push("the first apply after a cross-tab refill erased the stored coupon: " + JSON.stringify(later));
  if (later.giftCard !== "GIFT500") errors.push("the gift card was not stored: " + JSON.stringify(later));
}
