/* ---------------------------------------------------------------------------
   cart.js — the basket, kept in localStorage.

   The store has no concept of "the current cart". It is deliberately yours:
   the API takes a list of lines on each call and prices it live. That means
   the cart is plain client-side state, and you can model it however suits you.

   One rule worth keeping: STORE ONLY itemId AND qty as the truth. Names and
   prices are cached here purely so the cart can paint instantly on load, and
   they are refreshed from the store on every cart view. Never send a price to
   the store and never trust a cached one at checkout — the store prices the
   order from its own books, and a stale copy here would just mean the shopper
   is shown one number and charged another.
--------------------------------------------------------------------------- */

const KEY = 'merch.cart';

/* Anyone can re-render when the cart changes — the header badge, the cart
   page, an "added" toast — without those pieces knowing about each other. */
const listeners = new Set();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    /* Defend against a hand-edited or half-written localStorage value. A
       corrupt cart should degrade to an empty one, never throw on every page. */
    return raw
      .filter((l) => l && typeof l.itemId === 'string' && Number.isFinite(l.qty))
      .map((l) => ({
        itemId: l.itemId,
        qty: Math.max(1, Math.min(99, Math.floor(l.qty))),
        name: typeof l.name === 'string' ? l.name : '',
        price: Number.isFinite(l.price) ? l.price : 0,
        image: typeof l.image === 'string' ? l.image : '',
      }));
  } catch {
    return [];
  }
}

function write(lines) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  listeners.forEach((fn) => fn(lines));
}

export const cart = {
  lines: () => read(),

  /* What the API wants: itemId and qty only. Every endpoint that takes a
     basket takes exactly this. */
  apiLines: () => read().map((l) => ({ itemId: l.itemId, qty: l.qty })),

  count: () => read().reduce((n, l) => n + l.qty, 0),

  /* A local subtotal for instant feedback only. The figure that matters comes
     back from the store. */
  localSubtotal: () => read().reduce((n, l) => n + l.price * l.qty, 0),

  add(product, qty = 1) {
    const lines = read();
    const found = lines.find((l) => l.itemId === product.id);
    if (found) {
      found.qty = Math.min(99, found.qty + qty);
    } else {
      lines.push({
        itemId: product.id,
        qty,
        name: product.name,
        price: product.price,
        image: (product.imageUrls && product.imageUrls[0]) || '',
      });
    }
    write(lines);
  },

  setQty(itemId, qty) {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n < 1) return this.remove(itemId);
    const lines = read();
    const found = lines.find((l) => l.itemId === itemId);
    if (!found) return;
    found.qty = Math.min(99, n);
    write(lines);
  },

  remove(itemId) {
    write(read().filter((l) => l.itemId !== itemId));
  },

  clear() {
    write([]);
  },

  /* Refresh the cached names and prices from the store. Call this when the
     cart is shown: a product may have been repriced, renamed or hidden since
     it went in, and the shopper should see that before they pay, not after.

     Returns the ids that are no longer available so the page can say so. */
  async refresh(api) {
    const lines = read();
    if (!lines.length) return { removed: [] };

    /* One call for every line (`ids=`), not one per line: a 12-line cart on a
       120/min browse bucket spent a tenth of it here on every visit. */
    let batch;
    try { batch = await api.products(lines.map((l) => l.itemId)); }
    catch {
      /* The STORE could not be reached — that says nothing about the lines.
         Leave the basket exactly as it was (the per-line version dropped a
         line on a network blip; the batch version would have dropped them ALL). */
      return { removed: [], stale: true };
    }
    /* Case-insensitive, like the store's `ids=` lookup: a stored id that differs only in case is the same product. */
    const byId = new Map((batch || []).map((p) => [String(p.id).toLowerCase(), p]));
    const results = lines.map((l) => byId.get(String(l.itemId).toLowerCase()) || null);

    const removed = [];
    const fresh = [];
    lines.forEach((line, i) => {
      const p = results[i];
      /* A null here means the store no longer serves it — sold out and hidden,
         delisted, or the id is simply wrong. Dropping it now is kinder than
         letting checkout refuse the whole basket. */
      if (!p) {
        removed.push(line.name || line.itemId);
        return;
      }
      fresh.push({
        itemId: p.id,
        qty: line.qty,
        name: p.name,
        price: p.price,
        image: (p.imageUrls && p.imageUrls[0]) || '',
      });
    });

    write(fresh);
    return { removed };
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/* Keep two open tabs in step. Without this, adding something in one tab
   leaves the other showing a stale badge and a stale basket. */
window.addEventListener('storage', (e) => {
  if (e.key === KEY) listeners.forEach((fn) => fn(read()));
});
