/* ---------------------------------------------------------------------------
   demo-store.js — a fake shop, so this runs the moment you clone it.

   ===========================================================================
   THIS FILE IS SCAFFOLDING. DELETE IT.

   The instant you point config.js at a real store it does nothing at all, and
   once you are building for real you should remove it:

     1. delete this file
     2. delete the two demo lines at the bottom of config.js

   Nothing else refers to it. That is deliberate — api.js has no idea this
   exists, so the code you are learning from is the code that talks to a real
   store, not a version bent around a fixture.
   ===========================================================================

   How it works: it replaces window.fetch, and only for requests to the API.
   Everything else on the page is untouched, and every other file behaves
   exactly as it would against a live shop — same URLs, same request bodies,
   same response shapes, same error shape.

   What is NOT faked, because faking it would teach you the wrong thing:
   nothing here is a security boundary. A real store recomputes every price
   from its own books; this one is a few lines of arithmetic in your browser
   that anyone could edit. That is the whole reason the real API refuses to
   accept a total from the client.
--------------------------------------------------------------------------- */

/* --- The catalogue -------------------------------------------------------- */

/* Product images are generated rather than shipped, so the repo stays small
   and there are no binaries to review. */
function img(label, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="300" cy="110" r="80" fill="#fff" opacity=".13"/>
    <circle cx="110" cy="300" r="110" fill="#fff" opacity=".10"/>
    <text x="200" y="232" font-family="Georgia,serif" font-size="120" fill="#fff"
          opacity=".92" text-anchor="middle">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
}

const PRODUCTS = [
  {
    id: 'DEMO-01', name: 'Stovetop Moka Pot', category: 'Coffee', unit: 'pc',
    description: 'Six-cup aluminium moka pot. Thick-walled, even heat — the espresso ritual without a machine.',
    price: 1799, mrp: 2249, availability: 'in_stock', isDigital: false,
    imageUrls: [img('1', '#4F46E5', '#9333EA'), img('1', '#6366F1', '#C026D3')],
  },
  {
    id: 'DEMO-02', name: 'Hand Grinder — Conical Burr', category: 'Coffee', unit: 'pc',
    description: 'Stainless conical burr with 40 clicks of adjustment. Consistent from espresso to French press.',
    price: 2499, mrp: 3199, availability: 'in_stock', isDigital: false,
    imageUrls: [img('2', '#DB2777', '#F97316')],
  },
  {
    id: 'DEMO-03', name: 'Single-Origin Beans, 250g', category: 'Coffee', unit: 'pack',
    description: 'Washed Arabica from Chikmagalur. Roasted to order, so it ships within two days of roasting.',
    price: 649, mrp: 799, availability: 'low', isDigital: false,
    imageUrls: [img('3', '#16A34A', '#65A30D')],
  },
  /* A variant family. The catalogue folds these to ONE card and the product
     page expands them — exactly what a real store does, and the reason the
     variants endpoint exists at all. */
  {
    id: 'DEMO-04-S', name: 'Linen Apron — Small', category: 'Kitchen', unit: 'pc',
    description: 'Heavy stonewashed linen, cross-back straps, deep front pocket.',
    price: 1299, mrp: 1699, availability: 'in_stock', isDigital: false,
    variantGroupId: 'apron', variantLabel: 'Small',
    imageUrls: [img('4', '#0891B2', '#2563EB')],
  },
  {
    id: 'DEMO-04-M', name: 'Linen Apron — Medium', category: 'Kitchen', unit: 'pc',
    description: 'Heavy stonewashed linen, cross-back straps, deep front pocket.',
    price: 1299, mrp: 1699, availability: 'in_stock', isDigital: false,
    variantGroupId: 'apron', variantLabel: 'Medium',
    imageUrls: [img('4', '#0891B2', '#2563EB')],
  },
  {
    id: 'DEMO-04-L', name: 'Linen Apron — Large', category: 'Kitchen', unit: 'pc',
    description: 'Heavy stonewashed linen, cross-back straps, deep front pocket.',
    price: 1399, mrp: 1799, availability: 'out', isDigital: false,
    variantGroupId: 'apron', variantLabel: 'Large',
    imageUrls: [img('4', '#0891B2', '#2563EB')],
  },
  {
    id: 'DEMO-05', name: 'Cast Iron Skillet 10"', category: 'Kitchen', unit: 'pc',
    description: 'Pre-seasoned, sand-cast, oven-safe to 260°C. Improves for the next thirty years.',
    price: 2299, mrp: 2899, availability: 'in_stock', isDigital: false,
    imageUrls: [img('5', '#B45309', '#78350F')],
  },
  {
    id: 'DEMO-06', name: 'Beeswax Candle, Set of 3', category: 'Home', unit: 'set',
    description: 'Pure beeswax, cotton wick, roughly nine hours each. No fragrance, no paraffin.',
    price: 599, mrp: 749, availability: 'low', isDigital: false,
    imageUrls: [img('6', '#CA8A04', '#EA580C')],
  },
  {
    id: 'DEMO-07', name: 'Merino Throw Blanket', category: 'Home', unit: 'pc',
    description: 'Lambswool and merino, herringbone weave, 130×180cm. Warm without the weight.',
    price: 3499, mrp: 4499, availability: 'in_stock', isDigital: false,
    imageUrls: [img('7', '#0D9488', '#0369A1')],
  },
  /* A digital product. It is here because digital goods change the checkout:
     they cannot be cash on delivery, so the payment options have to react. */
  {
    id: 'DEMO-08', name: 'Brewing Guide (PDF + video)', category: 'Coffee', unit: 'pc',
    description: 'Forty pages and six short videos on ratios, grind and water. Delivered as a download.',
    price: 399, mrp: 699, availability: 'in_stock', isDigital: true,
    imageUrls: [img('8', '#7C3AED', '#DB2777')],
  },
];

const REVIEWS = {
  'DEMO-01': [
    { id: 'r1', author: 'Ananya R.', rating: 5, title: 'Better than my machine', body: 'Three months in and it makes a properly thick brew. The handle stays cool.', verified: true, createdAt: '2026-06-14T09:20:00Z' },
    { id: 'r2', author: 'Karthik S.', rating: 4, title: '', body: 'Takes a couple of goes to get the grind right. Worth persevering.', verified: true, createdAt: '2026-07-02T17:05:00Z' },
  ],
  'DEMO-05': [
    { id: 'r3', author: 'Meera J.', rating: 5, title: 'Heavy in a good way', body: 'Seasoned beautifully after a few uses. Eggs slide right off now.', verified: false, createdAt: '2026-05-30T11:40:00Z' },
  ],
};

const THEME = {
  brandName: 'Demo Roastery',
  tagline: 'A pretend shop, so you can click around',
  logoUrl: '', faviconUrl: '', layout: 'standard',
  colors: {
    primary: '#4F46E5', primaryHover: '#4338CA', accent: '#0891B2',
    bg: '#F5F6FA', surface: '#FFFFFF', text: '#0F1222',
    muted: '#5B6478', border: '#E3E6EF',
  },
  radius: '10px', fontHeading: 'Inter', fontBody: 'Inter', customCss: '',
  hero: {
    headline: 'This shop is not real. The code is.',
    subtext: 'Everything here is served from js/demo-store.js so you can click through the whole flow before pointing config.js at your own store.',
  },
};

/* --- Fake persistence -----------------------------------------------------
   Orders live in localStorage so the confirmation page and order tracking can
   find them after a navigation, exactly as they would against a real store. */

const ORDERS_KEY = 'merch.demo.orders';

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveOrder(o) {
  const all = loadOrders();
  all.unshift(o);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(all.slice(0, 20)));
}

/* --- Helpers -------------------------------------------------------------- */

const visible = () => PRODUCTS;

function fold(list) {
  /* One card per variant family, like the real catalogue. */
  const seen = new Set();
  return list.filter((p) => {
    if (!p.variantGroupId) return true;
    if (seen.has(p.variantGroupId)) return false;
    seen.add(p.variantGroupId);
    return true;
  });
}

function view(p) {
  const family = p.variantGroupId
    ? PRODUCTS.filter((x) => x.variantGroupId === p.variantGroupId)
    : [];
  return {
    id: p.id, name: p.name, description: p.description,
    imageUrls: p.imageUrls, category: p.category, unit: p.unit,
    price: p.price, mrp: p.mrp, taxNote: 'incl. GST',
    availability: p.availability, qtyHint: null, featured: false,
    variantGroupId: p.variantGroupId || null,
    variantCount: family.length,
    isDigital: !!p.isDigital,
  };
}

function subtotalOf(lines) {
  return (lines || []).reduce((sum, l) => {
    const p = PRODUCTS.find((x) => x.id === l.itemId);
    return sum + (p ? p.price * Math.max(1, Number(l.qty) || 1) : 0);
  }, 0);
}

const round2 = (n) => Math.round(n * 100) / 100;

const ok = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/* Errors come back in the SAME shape a real store uses, so your error handling
   is exercised here too rather than only in production. */
const fail = (status, error, extra = {}) =>
  new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* --- The router ----------------------------------------------------------- */

async function handle(path, search, method, body) {
  const p = (id) => PRODUCTS.find((x) => x.id === id);

  /* Store settings ------------------------------------------------------- */
  if (path === '/api/theme') return ok(THEME);
  if (path === '/api/currencies')
    return ok({ base: { code: 'INR', symbol: '₹' }, currencies: [] });
  if (path === '/api/auth/config') return ok({ google: { enabled: false, clientId: null } });
  if (path === '/api/payment/config')
    /* Off, so checkout offers cash on delivery. Flip `enabled` to true and the
       prepaid path appears — though it cannot complete without a real gateway. */
    return ok({ enabled: false, keyId: null, currency: 'INR', symbol: '₹', name: THEME.brandName });

  /* Browsing -------------------------------------------------------------- */
  if (path === '/api/categories')
    return ok([...new Set(PRODUCTS.map((x) => x.category))].sort());

  if (path === '/api/catalog') {
    let list = visible();
    const q = (search.get('search') || '').trim().toLowerCase();
    if (q) list = list.filter((x) => (x.name + ' ' + x.description).toLowerCase().includes(q));
    const cat = search.get('category');
    if (cat) list = list.filter((x) => x.category === cat);
    if (search.get('inStock') === 'true') list = list.filter((x) => x.availability !== 'out');

    list = fold(list);

    /* Same three sorts the real store accepts, and the same behaviour for
       anything else: ignored, not rejected. */
    const sort = search.get('sort');
    if (sort === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));

    return ok(list.map(view));
  }

  let m;
  if ((m = path.match(/^\/api\/catalog\/(.+)$/))) {
    const found = p(decodeURIComponent(m[1]));
    return found ? ok(view(found)) : fail(404, 'Product not found.');
  }

  if ((m = path.match(/^\/api\/products\/(.+)\/variants$/))) {
    const found = p(decodeURIComponent(m[1]));
    if (!found || !found.variantGroupId) return ok({ groupId: null, title: null, options: [] });
    const family = PRODUCTS.filter((x) => x.variantGroupId === found.variantGroupId);
    return ok({
      groupId: found.variantGroupId,
      title: 'Size',
      options: family.map((x) => ({
        id: x.id, name: x.name, label: x.variantLabel || x.name,
        price: x.price, availability: x.availability, current: x.id === found.id,
      })),
    });
  }

  if ((m = path.match(/^\/api\/products\/(.+)\/reviews$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'POST') return fail(401, 'Please sign in to leave a review.');
    const list = REVIEWS[id] || [];
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
    return ok({ summary: { average: round2(avg), count: list.length }, reviews: list });
  }

  if (path === '/api/collections')
    return ok([
      { id: 'c1', handle: 'coffee-essentials', title: 'Coffee Essentials',
        description: 'Everything for a better cup at home.', imageUrl: null },
    ]);

  if ((m = path.match(/^\/api\/collections\/(.+)$/))) {
    if (decodeURIComponent(m[1]) !== 'coffee-essentials') return fail(404, 'Collection not found.');
    return ok({
      collection: { id: 'c1', handle: 'coffee-essentials', title: 'Coffee Essentials',
        description: 'Everything for a better cup at home.', imageUrl: null },
      products: PRODUCTS.filter((x) => x.category === 'Coffee').map(view),
    });
  }

  if (path === '/api/blog') return ok([]);

  /* Cart previews --------------------------------------------------------- */
  if (path === '/api/discounts/auto') {
    const sub = subtotalOf(body.lines);
    if (sub >= 2000) {
      const off = round2(sub * 0.05);
      return ok({ applies: true, title: '5% off orders over ₹2,000',
        discountAmount: off, newSubtotal: round2(sub - off), freeShipping: true });
    }
    return ok({ applies: false, title: null, discountAmount: 0, newSubtotal: sub, freeShipping: false });
  }

  if (path === '/api/discounts/bxgy')
    return ok({ applies: false, title: null, discountAmount: 0 });

  if (path === '/api/coupon/validate') {
    const code = String(body.code || '').trim().toUpperCase();
    const sub = subtotalOf(body.lines);
    /* One code works, everything else does not — so both branches of your
       coupon UI get exercised. Note a refusal is a 200 with valid:false and a
       reason, NOT an error status. */
    if (code === 'WELCOME10') {
      if (sub < 500)
        return ok({ valid: false, reason: 'WELCOME10 needs a basket of ₹500 or more.',
          code, discountAmount: 0, newSubtotal: sub });
      const off = round2(sub * 0.1);
      return ok({ valid: true, reason: null, code, discountAmount: off, newSubtotal: round2(sub - off) });
    }
    return ok({ valid: false, reason: 'That coupon code isn’t valid.', code, discountAmount: 0, newSubtotal: sub });
  }

  if (path === '/api/giftcard/check') {
    const code = String(body.code || '').trim().toUpperCase();
    if (code === 'GIFT500') return ok({ valid: true, reason: null, code, balance: 500 });
    return ok({ valid: false, reason: 'We could not find that gift card.', code, balance: 0 });
  }

  if (path === '/api/shipping/quote') {
    const pincode = String(body.pincode || '').trim();
    if (!/^\d{6}$/.test(pincode)) return fail(400, 'Enter a valid 6-digit pincode.');

    const sub = subtotalOf(body.lines);
    const allDigital = (body.lines || []).every((l) => p(l.itemId)?.isDigital);
    if (allDigital)
      return ok({ available: false, shipping: 0, courier: null, etaDays: null,
        options: [{ id: '', name: 'No shipping needed', amount: 0, etaMin: null, etaMax: null, live: false }] });

    const free = sub >= 2000;
    /* NOTE `available: false` WITH REAL OPTIONS. This is the trap, reproduced
       on purpose: this pretend store has no courier account, so there is no
       LIVE rate — but it ships perfectly happily on a flat rate. A front end
       that reads `available` as "can we deliver" refuses the sale. Read
       `options`. */
    return ok({
      available: false, shipping: free ? 0 : 49, courier: null, etaDays: null,
      options: free
        ? [{ id: 'free', name: 'Free delivery', amount: 0, etaMin: 4, etaMax: 7, live: false }]
        : [{ id: 'standard', name: 'Standard', amount: 49, etaMin: 4, etaMax: 7, live: false }],
    });
  }

  /* Placing an order ------------------------------------------------------ */
  if (path === '/api/checkout') {
    const lines = body.lines || [];
    if (!lines.length) return fail(400, 'Your cart is empty.');
    const c = body.customer || {};
    if (!c.name || !c.email) return fail(400, 'Name and email are required to place an order.');

    const method_ = String(body.paymentMethod || 'cod').toLowerCase();
    if (method_ === 'cod' && lines.some((l) => p(l.itemId)?.isDigital))
      return fail(400, 'Items in your cart are delivered digitally and must be paid for online. Please choose online payment.');

    let total = subtotalOf(lines);
    const code = String(body.couponCode || '').trim().toUpperCase();
    if (code === 'WELCOME10' && total >= 500) total = round2(total - total * 0.1);
    else if (total >= 2000) total = round2(total - total * 0.05);
    if (total < 2000 && !lines.every((l) => p(l.itemId)?.isDigital)) total = round2(total + 49);

    let giftApplied = 0;
    if (String(body.giftCardCode || '').trim().toUpperCase() === 'GIFT500') {
      giftApplied = Math.min(500, total);
    }

    const ref = 'SO-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const order = {
      id: 'demo-' + Math.random().toString(36).slice(2, 12),
      invoiceId: ref.replace('SO-', 'INV-'),
      orderRef: ref, status: 'confirmed',
      total, invoicePdfUrl: null,
      giftCardApplied: giftApplied, amountDue: round2(total - giftApplied),
      createdAt: new Date().toISOString(),
      awb: null, trackingUrl: null, fulfillmentStatus: 'unfulfilled',
      carrier: null, trackingNumber: null, fulfilledAt: null, cancelledAt: null,
      _email: String(c.email || '').toLowerCase(),
      _access: lines.filter((l) => p(l.itemId)?.isDigital).map((l) => ({
        itemId: l.itemId, name: p(l.itemId).name, url: '#demo-download',
      })),
    };
    saveOrder(order);
    return ok(order);
  }

  if (path === '/api/payment/create-order')
    return fail(400, 'This demo has no payment gateway connected. Point config.js at a real store to try the prepaid flow.');

  if (path === '/api/payment/verify')
    return fail(400, 'This demo has no payment gateway connected.');

  /* Orders ---------------------------------------------------------------- */
  if (path === '/api/orders/lookup') {
    const email = String(body.email || '').trim().toLowerCase();
    const ref = String(body.reference || '').trim().toUpperCase();
    const found = loadOrders().find((o) => o._email === email && o.orderRef.toUpperCase() === ref);
    return found ? ok(found) : fail(404, 'No order found with that email and reference.');
  }

  if ((m = path.match(/^\/api\/orders\/(.+)$/))) {
    const found = loadOrders().find((o) => o.id === decodeURIComponent(m[1]));
    if (!found) return fail(404, 'Order not found.');
    /* WRAPPED — same as the real endpoint, and different from lookup above. */
    return ok({
      order: found,
      events: [{ type: 'placed', at: found.createdAt }],
      access: found._access || [],
    });
  }

  /* Signed-in surface ------------------------------------------------------
     Answered as 401 rather than faked. Pretending someone is signed in would
     hide the one thing worth learning here: which calls need a token. */
  if (path.startsWith('/api/shopper/') || path.startsWith('/api/subscriptions') || path === '/api/returns')
    return fail(401, 'Please sign in.');

  /* Fire-and-forget ------------------------------------------------------- */
  if (path === '/api/events') return ok({ ok: true, recorded: (body.events || []).length });
  if (path === '/api/cart/save') return ok({ ok: true });

  return fail(404, 'Unknown endpoint in the demo store: ' + path);
}

/* --- Installation --------------------------------------------------------- */

export function installDemo(apiBase) {
  if (apiBase !== 'demo') return;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;

    /* Only ours. Anything else — fonts, a gateway script — goes to the network
       untouched. */
    if (!url.startsWith('demo/api/') && !url.startsWith('/api/') && !url.includes('demo/api/')) {
      return realFetch(input, init);
    }

    const withoutBase = url.replace(/^demo/, '');
    const [rawPath, rawQuery] = withoutBase.split('?');
    const search = new URLSearchParams(rawQuery || '');
    const method = (init.method || 'GET').toUpperCase();

    let body = {};
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = {};
      }
    }

    /* A touch of latency, so loading states are visible rather than skipped —
       which is how you notice a missing one before a shopper does. */
    await new Promise((r) => setTimeout(r, 90 + Math.random() * 160));

    try {
      return await handle(rawPath, search, method, body);
    } catch (err) {
      console.error('[demo-store]', err);
      return fail(500, 'The demo store hit an error. This is a bug in demo-store.js.');
    }
  };

  /* Say so, loudly and once. Nobody should mistake this for a real shop, and
     nobody should waste an afternoon wondering why their orders are not in
     their books. */
  const say = () => {
    if (document.getElementById('demo-ribbon')) return;
    const bar = document.createElement('div');
    bar.id = 'demo-ribbon';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'background:#0F1222;color:#fff;padding:9px 16px;text-align:center;' +
      "font:400 13.5px/1.5 Inter,system-ui,sans-serif";
    bar.innerHTML =
      '<strong>Demo mode.</strong> No real store, no real orders &mdash; served from ' +
      '<code>js/demo-store.js</code>. Try coupon <code>WELCOME10</code> or gift card ' +
      '<code>GIFT500</code>. Set <code>API_BASE</code> in <code>config.js</code> to your own shop when you are ready.';
    document.body.insertBefore(bar, document.body.firstChild);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', say);
  } else {
    say();
  }
}
