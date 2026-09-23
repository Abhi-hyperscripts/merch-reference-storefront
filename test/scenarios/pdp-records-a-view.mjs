/* The product page with a product ASKED FOR: the all-pages run boots product.js with no `?id=`, so it stops at "No
   product asked for." and render() — the product_view event and the recently-viewed record — never runs. This one
   asks for a variant member and checks that the page rendered it and told the store it was viewed. */
export const page = "js/product.js";
export const seed = '[]';
const posts = [];
export function before({ window }) {
  window.location.search = "?id=DEMO-04-L";
  const inner = window.fetch;
  window.fetch = async (url, init) => {
    const res = await inner(url, init);
    // the body AND whether the store accepted it — a 4xx/5xx from the route must not pass as "recorded"
    if (String(url).includes("/api/recently-viewed") && (init?.method || "GET") === "POST") posts.push({ ...JSON.parse(init.body || "{}"), ok: res.ok });
    return res;
  };
}
export default async function ({ writes, errors }) {
  if (!/Linen Apron/.test(writes.pdp || "")) errors.push("the product page did not render the product asked for: " + (writes.pdp || "").slice(0, 120));
  if (!posts.some((b) => b.itemId === "DEMO-04-L" && b.sessionId && b.ok)) errors.push("no ACCEPTED recently-viewed record for the viewed product: " + JSON.stringify(posts));
}
