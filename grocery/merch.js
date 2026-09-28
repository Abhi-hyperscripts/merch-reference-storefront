/* ===========================================================================
   merch.js — the whole Merch storefront API, wired into ANY of the bundled
   HTML themes, from ONE file.

   Drop one line into a page, before the theme's own scripts:

       <script type="module" src="../merch/merch.js"></script>

   and nothing else changes. No markup is authored here and no CSS is touched.
   Every list on the page is built by CLONING the card, row or tile the theme
   already ships and overwriting its text, images and links — so the result is
   the theme's own DOM, with its own classes, hovers, badges and animations
   intact. If a theme changes its design, this file keeps working.

   WHAT IT COVERS
     Every public endpoint of the storefront API (see API below) and every
     commerce page role: home, listing, product, cart, checkout, order,
     tracking, account, wishlist, auth and blog.

   THE ONE THING TO GET RIGHT
     There are two ways to place an order and they take an IDENTICAL body:

       cash on delivery   POST /api/checkout              <- creates the order
       card / UPI         POST /api/payment/create-order  <- orders NOTHING yet
                          open the gateway
                          POST /api/payment/verify        <- creates the order

     Calling /api/checkout as well on the prepaid path places a SECOND, unpaid
     order for the same basket. Nothing in the shapes warns you.
   =========================================================================== */

/* ===========================================================================
   YOUR STORE — THE ONE LINE TO EDIT

   Paste the address of your shop here. It is the same address your admin
   panel is on, and pasting the admin URL itself works: only the host is kept,
   so all of these mean the same thing —

       https://shop.mybrand.com
       https://shop.mybrand.com/admin
       https://shop.mybrand.com/admin/products?page=2

   LEAVE IT EMPTY and nothing is fetched and nothing on the page is touched:
   every theme keeps its own demo products, prices, images and blog posts,
   exactly as its designer shipped them. That is the point — a storefront with
   no store behind it should look like the template, not like a broken shop.

   Fill it in and the same pages show your real catalogue instead.
   =========================================================================== */

export const STOREFRONT_URL = 'https://demo.wisetracktechnologies.com/admin';

/* ---------------------------------------------------------------------------
   WHO OWNS THE LOOK — the admin panel, or this template?

   One switch per setting, so a client can take the shop's catalogue while
   keeping the template's identity, or hand over everything, or anything in
   between. `true` means the admin panel wins; `false` means the template keeps
   what it shipped with.

   Shorthand: write `true` or `false` in place of the whole object to turn all
   of them on or off at once. A key you leave out is treated as on.

   Whatever you choose, the SHOP still works: products, prices, images,
   categories, the cart, the coupon and the checkout always come from the
   store. This decides who owns the LOOK, never whether the shop is real.

   Two settings are deliberately absent, because they are not appearance:
   whether cash on delivery is offered (the merchant's money — a shop that
   switched COD off must never be shown taking COD orders), and the currency
   (or every price on the page would be wrong).
--------------------------------------------------------------------------- */

export const USE_STORE_APPEARANCE = {
  brandName: true,      // the shop's name, in the page title and any name slot
  logo: true,           // the shop's logo, wherever the template shows one
  favicon: true,        // the tab icon
  tagline: true,        // the one-liner under the name
  menuLinks: true,      // where the header and footer menu items point
  footerContact: true,  // the phone, email and address in the footer
  announcement: true,   // the promo bar across the top of the page
  usps: true,           // the "free delivery / 24-7 support" strip
  social: true,         // the social icons, and hiding the ones you do not use
  banners: true,        // the hero — the merchant's artwork, headline and button
  writtenPages: true,   // Privacy, Terms, Refunds and Shipping
  aboutPage: false,     // About — OFF by default, see below
};

/* Why `aboutPage` is off while the other written pages are on: in all four of
   these templates About is a DESIGNED page — a hero image, a vision panel,
   counters, a team strip — and the merchant's About is a couple of hundred
   words. Measured across the four themes, prose is 35-70% of a policy page's
   text and only 4-21% of an About page's. Dropping the merchant's paragraphs
   into that layout does not replace the page, it dents it. Turn this on if
   your client's About really is just text. */

/* True when the admin panel owns this particular setting. */
function useStore(key) {
  const a = USE_STORE_APPEARANCE;
  if (a === true || a === false) return a;
  return a?.[key] !== false;
}

/* ---------------------------------------------------------------------------
   1. CONFIG

   Everything below has a sensible default. A page may override any of it on
   the script tag, which is how one build can serve two shops:

     <script type="module" src="../merch/merch.js"
             data-api="https://shop.mybrand.com"
             data-theme="grocery"></script>
--------------------------------------------------------------------------- */

const TAG = document.currentScript || document.querySelector('script[src*="merch.js"]');
const RAW = Object.assign(
  {
    api: '',                 // your shop's origin. '' = same origin as this page.
    theme: '',               // '' = auto-detect from the folder this page sits in
    page: '',                // '' = auto-detect from the filename + what's on the page
    googleClientId: '',      // blank -> Google sign-in is simply not offered
    currency: { code: 'INR', symbol: '₹' },   // used only until /api/theme answers
    debug: false,
  },
  window.MERCH_CONFIG || {},
  TAG
    ? {
        ...(TAG.dataset.api ? { api: TAG.dataset.api } : {}),
        ...(TAG.dataset.theme ? { theme: TAG.dataset.theme } : {}),
        ...(TAG.dataset.page ? { page: TAG.dataset.page } : {}),
        ...(TAG.dataset.googleClientId ? { googleClientId: TAG.dataset.googleClientId } : {}),
        ...(TAG.dataset.debug ? { debug: TAG.dataset.debug !== 'false' } : {}),
      }
    : {},
);
const CONFIG = RAW;

/* The store's ORIGIN. Whatever was pasted — a bare host, an admin URL, a deep
   link with a query string — only the scheme and host survive, because that is
   what `/api/...` hangs off. A host with no scheme is assumed https. */
function storeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw).origin;
  } catch {
    /* console.warn, not our own warn(): this runs while the module is still
       being evaluated, and `warn` is a const a few lines below — reaching for
       it here throws a ReferenceError that takes the whole file down, and on a
       page whose theme scripts we are holding, a dead merch.js is a dead page. */
    console.warn('[merch] could not read the store address: ' + raw);
    return '';
  }
}

const API_BASE = storeOrigin(STOREFRONT_URL || CONFIG.api);

/* No store address: the shop is not live yet. Nothing is fetched and nothing
   is rewritten — see boot(). */
const LIVE = API_BASE !== '';

const log = (...a) => { if (CONFIG.debug) console.log('[merch]', ...a); };
const warn = (...a) => console.warn('[merch]', ...a);

/* ---------------------------------------------------------------------------
   2. SMALL UTILITIES
--------------------------------------------------------------------------- */

const $ = (sel, root = document) => (sel ? root.querySelector(sel) : null);
const $$ = (sel, root = document) => (sel ? [...root.querySelectorAll(sel)] : []);

/* A selector list where the FIRST one that matches wins. Themes disagree about
   names far more often than about structure, so nearly every map entry is a
   list and a theme that lacks the element simply contributes nothing. */
function pick(sel, root = document) {
  if (!sel) return null;
  for (const s of String(sel).split('|')) {
    const one = s.trim();
    /* `:scope` means the node itself. */
    if (one === ':scope') return root.nodeType === 1 ? root : null;
    /* A field names an element that may BE the node we are filling or may sit
       inside it, because what gets cloned is the card's outermost wrapper and
       that is sometimes the card itself. Checking the root first makes one
       selector cover both, instead of silently filling nothing. */
    if (root.nodeType === 1 && typeof root.matches === 'function' && root.matches(one)) return root;
    const el = root.querySelector(one);
    if (el) return el;
  }
  return null;
}
/* `el.matches()` knows nothing about our '|' lists — handed one it throws a
   SyntaxError, and on the product page that took the WHOLE page's hydration
   down with it (reviews, related products, the lot) from inside a helper that
   looked like a detail. */
function matchesAny(el, sel) {
  if (!el || !sel) return false;
  return String(sel).split('|').some((one) => {
    try { return el.matches(one.trim()); } catch { return false; }
  });
}

function pickAll(sel, root = document) {
  if (!sel) return [];
  for (const s of String(sel).split('|')) {
    const els = [...root.querySelectorAll(s.trim())];
    if (els.length) return els;
  }
  return [];
}

function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
function setAttr(el, attr, value) { if (el && value != null) el.setAttribute(attr, value); }
function show(el, on = true) { if (el) el.style.display = on ? '' : 'none'; }
function remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

function param(name, url = location.search) {
  return new URLSearchParams(url).get(name);
}

function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function readJson(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/* Money. The store's currency wins; CONFIG.currency covers the split second
   before /api/theme answers on a cold load. Themes hard-code "$36.00" in their
   demo markup — every one of those is overwritten. */
let CURRENCY = CONFIG.currency;
/* The shopper's chosen DISPLAY currency, or null for the store's own.
   `/api/currencies` exists "for a currency switcher" and ships rates, so the
   conversion is ours to do. It is display only: the store prices and charges
   in its own currency, which is why the checkout and the order page always
   show that one — see displayCurrencyFor(). */
const DISPLAY_KEY = 'merch.currency';
let DISPLAY = null;
function readDisplayCurrency() {
  try { return JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null'); } catch { return null; }
}

function money(amount) {
  /* A missing figure is NOT zero. `mrp` is null on most products, and
     Number(null) is 0 — so the obvious guard prints a struck-through
     "free" next to the real price. */
  if (amount == null || amount === '') return '';
  const n0 = Number(amount);
  if (!Number.isFinite(n0)) return '';
  const d = DISPLAY && Number(DISPLAY.rate) > 0 ? DISPLAY : null;
  const n = d ? n0 * Number(d.rate) : n0;
  try {
    return new Intl.NumberFormat(CURRENCY.locale || undefined, {
      style: 'currency',
      currency: (d ? d.code : CURRENCY.code) || 'INR',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return ((d ? d.symbol : CURRENCY.symbol) || '') + n.toFixed(2);
  }
}

/* A session id for anonymous analytics and the recently-viewed rail. Not an
   identity: it is regenerated whenever storage is cleared and never sent to
   anything but this store. */
function sessionId() {
  const KEY = 'merch.session';
  let id = null;
  try { id = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (!id) {
    id = (window.crypto?.randomUUID?.() || 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  }
  return id;
}

function uuid() {
  return window.crypto?.randomUUID?.() || 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---------------------------------------------------------------------------
   3. THE API CLIENT

   Every call goes through one function because the store reports failure in
   exactly one shape:

       { "error": "Your cart is empty." }

   The message is written to be shown to a shopper as-is, so `err.message` is
   safe to put on screen. You do not need your own copy.
--------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body || {};
  }
  /* The shop itself is briefly unreachable. The shopper did nothing wrong and
     a retry is likely to work — worth telling apart from an ordinary refusal. */
  get isStoreDown() { return this.status === 503 && this.body.storeUnavailable === true; }
  /* The token was ENDED (password change, reset, sign-out-everywhere), not
     merely expired. The shopper deserves the reason. */
  get sessionEnded() { return this.status === 401 && this.body.sessionEnded === true; }
  get isRateLimited() { return this.status === 429; }
  get isUnauthenticated() { return this.status === 401; }
}

const TOKEN_KEY = 'merch.token';
export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

function qs(obj) {
  if (!obj) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

async function request(path, { method = 'GET', body, auth = false, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  /* Only attach the token where it is wanted. `auth: 'optional'` is for routes
     that serve guests but read the account when a token is present — checkout,
     create-order, cart save (they attach the order to the account) and the
     order page (which fills `access` only for the owner). Without it, an order
     a signed-in shopper placed was a GUEST order: absent from their account
     and un-cancellable. That was the reference client's most expensive bug. */
  let sentToken = false;
  if (auth === true || auth === 'optional') {
    const t = token.get();
    if (t) { headers['Authorization'] = 'Bearer ' + t; sentToken = true; }
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    /* fetch only rejects when the request never completed — DNS, offline, TLS
       or a CORS block. An HTTP 500 is a RESOLVED promise and is handled below. */
    throw new ApiError('Could not reach the store. Check your connection and try again.', 0,
      { networkError: String(networkError) });
  }

  if (res.status === 204) return null;
  if (raw) {
    if (!res.ok) throw new ApiError('That download is not available.', res.status, {});
    return res.blob();
  }

  /* Read as text first. An error page from a proxy in front of the store is
     HTML, and res.json() on it throws a parse error that hides the status
     code — the one thing actually worth knowing. */
  let text;
  try { text = await res.text(); }
  catch (networkError) {
    /* The connection can drop AFTER the headers arrived. Same transient
       failure, not a bug in the reply. */
    throw new ApiError('Could not reach the store. Check your connection and try again.', 0,
      { networkError: String(networkError) });
  }
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }

  if (!res.ok) {
    /* A 401 on a call that carried a token means this token is finished.
       Forget it here so the next page does not keep presenting a dead one. */
    if (res.status === 401 && sentToken) token.clear();
    const message = (data && (data.error || data.message)) ||
      (res.status === 404 ? 'Not found.' : 'Something went wrong. Please try again.');
    throw new ApiError(message, res.status, data || {});
  }
  return data;
}

/* Media paths come back relative; a placeholder route serves an SVG for
   products with no image at all. */
export function mediaUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return API_BASE + (path.startsWith('/') ? path : '/' + path);
}

let themeOnce = null;

export const api = {
  /* --- store settings --- */
  theme: () => (themeOnce ??= request('/api/theme').catch((e) => { themeOnce = null; throw e; })),
  currencies: () => request('/api/currencies'),
  authConfig: () => request('/api/auth/config'),
  paymentConfig: () => request('/api/payment/config'),

  /* --- catalogue --- */
  homepage: (locale) => request('/api/homepage' + qs({ locale })),
  catalog: (opts) => request('/api/catalog' + qs(opts)),
  facets: (opts) => request('/api/catalog/facets' + qs(opts)),
  product: (id) => request('/api/catalog/' + encodeURIComponent(id)),
  /* An EMPTY ids= is dropped by qs() and would return the WHOLE catalogue. */
  products: (ids) => (ids && ids.length ? request('/api/catalog' + qs({ ids: ids.join(',') })) : Promise.resolve([])),
  categories: () => request('/api/categories'),
  collections: () => request('/api/collections'),
  collection: (handle) => request('/api/collections/' + encodeURIComponent(handle)),
  variants: (id) => request('/api/products/' + encodeURIComponent(id) + '/variants'),
  reviews: (id) => request('/api/products/' + encodeURIComponent(id) + '/reviews'),
  postReview: (itemId, review) =>
    request('/api/products/' + encodeURIComponent(itemId) + '/reviews', { method: 'POST', body: review, auth: 'optional' }),
  blog: () => request('/api/blog'),
  post: (slug) => request('/api/blog/' + encodeURIComponent(slug)),

  /* --- browsing history --- */
  recentlyViewed: (sid, limit) => request('/api/recently-viewed' + qs({ sessionId: sid, limit }), { auth: 'optional' }),
  recordView: (itemId, sid) => request('/api/recently-viewed', { method: 'POST', body: { itemId, sessionId: sid }, auth: 'optional' }),
  events: (sid, events) => request('/api/events', { method: 'POST', body: { sessionId: sid, events }, auth: 'optional' }),

  /* --- basket-time money --- */
  validateCoupon: (code, lines) => request('/api/coupon/validate', { method: 'POST', body: { code, lines }, auth: 'optional' }),
  autoDiscount: (lines) => request('/api/discounts/auto', { method: 'POST', body: { lines } }),
  bxgy: (lines) => request('/api/discounts/bxgy', { method: 'POST', body: { lines } }),
  checkGiftCard: (code) => request('/api/giftcard/check', { method: 'POST', body: { code } }),
  shippingQuote: (pincode, lines, paymentMethod) =>
    request('/api/shipping/quote', { method: 'POST', body: { pincode, lines, paymentMethod } }),
  saveCart: (email, lines) => request('/api/cart/save', { method: 'POST', body: { email, lines }, auth: 'optional' }),

  /* --- placing an order: the two paths --- */
  checkout: (payload) => request('/api/checkout', { method: 'POST', body: payload, auth: 'optional' }),
  createPaymentOrder: (payload) => request('/api/payment/create-order', { method: 'POST', body: payload, auth: 'optional' }),
  verifyPayment: (payload) => request('/api/payment/verify', { method: 'POST', body: payload, auth: 'optional' }),
  abandonPayment: (razorpayOrderId) => request('/api/payment/abandon', { method: 'POST', body: { razorpayOrderId }, auth: 'optional' }),

  /* --- an order after the fact --- */
  order: (id) => request('/api/orders/' + encodeURIComponent(id), { auth: 'optional' }),
  lookupOrder: (email, reference, phone) =>
    request('/api/orders/lookup', { method: 'POST', body: { email, reference, phone } }),
  cancelOrder: (id, reason) =>
    request('/api/orders/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: { reason: reason || null }, auth: 'optional' }),
  /* The owner's own tax invoice. Answers 401 to anyone else. */
  invoicePdfUrl: (id) => API_BASE + '/api/orders/' + encodeURIComponent(id) + '/invoice.pdf',
  invoicePdf: (id) => request('/api/orders/' + encodeURIComponent(id) + '/invoice.pdf', { auth: true, raw: true }),

  /* --- returns --- */
  returns: () => request('/api/returns', { auth: true }),
  requestReturn: (payload) => request('/api/returns', { method: 'POST', body: payload, auth: true }),

  /* --- subscriptions --- */
  subscriptions: () => request('/api/subscriptions', { auth: true }),
  subscribe: (payload) => request('/api/subscriptions', { method: 'POST', body: payload, auth: true }),
  /* op is one of the store's lifecycle operations: pause | resume | cancel | skip */
  subscriptionOp: (id, op) => request('/api/subscriptions/' + encodeURIComponent(id) + '/' + encodeURIComponent(op), { method: 'POST', auth: true }),

  /* --- the account --- */
  register: (email, password, name, phone) =>
    request('/api/shopper/register', { method: 'POST', body: { email, password, name, phone } }),
  login: (email, password) => request('/api/shopper/login', { method: 'POST', body: { email, password } }),
  signInWithGoogle: (credential) => request('/api/shopper/google', { method: 'POST', body: { credential } }),
  me: () => request('/api/shopper/me', { auth: true }),
  myOrders: () => request('/api/shopper/orders', { auth: true }),
  signOutEverywhere: () => request('/api/shopper/sessions/revoke', { method: 'POST', auth: true }),
  forgotPassword: (email, resetUrl) => request('/api/shopper/password/forgot', { method: 'POST', body: { email, resetUrl } }),
  resetPassword: (resetToken, newPassword) => request('/api/shopper/password/reset', { method: 'POST', body: { token: resetToken, newPassword } }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/shopper/password/change', { method: 'POST', body: { currentPassword, newPassword }, auth: true }),

  addresses: () => request('/api/shopper/addresses', { auth: true }),
  addAddress: (a) => request('/api/shopper/addresses', { method: 'POST', body: a, auth: true }),
  updateAddress: (id, a) => request('/api/shopper/addresses/' + encodeURIComponent(id), { method: 'PUT', body: a, auth: true }),
  deleteAddress: (id) => request('/api/shopper/addresses/' + encodeURIComponent(id), { method: 'DELETE', auth: true }),
  makeAddressDefault: (id) => request('/api/shopper/addresses/' + encodeURIComponent(id) + '/default', { method: 'POST', auth: true }),

  wishlist: () => request('/api/shopper/wishlist', { auth: true }),
  addToWishlist: (itemId) => request('/api/shopper/wishlist', { method: 'POST', body: { itemId }, auth: true }),
  removeFromWishlist: (itemId) => request('/api/shopper/wishlist/' + encodeURIComponent(itemId), { method: 'DELETE', auth: true }),
};

/* ---------------------------------------------------------------------------
   4. THE BASKET

   Lives in localStorage. Only `itemId` and `qty` are ever sent — every
   endpoint that takes a basket takes exactly that. The name, price and image
   are a local cache so the cart page can paint before the store answers; the
   figures that matter always come back from the store.
--------------------------------------------------------------------------- */

const CART_KEY = 'merch.cart';
const cartListeners = new Set();

function readCart() {
  const raw = readJson(CART_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && typeof l.itemId === 'string' && Number.isFinite(Number(l.qty)))
    .map((l) => ({ ...l, qty: Math.max(1, Math.min(99, Math.floor(Number(l.qty)))) }));
}
function writeCart(lines) {
  writeJson(CART_KEY, lines);
  cartListeners.forEach((fn) => { try { fn(lines); } catch (e) { warn(e); } });
}

export const cart = {
  lines: () => readCart(),
  apiLines: () => readCart().map((l) => ({ itemId: l.itemId, qty: l.qty })),
  count: () => readCart().reduce((n, l) => n + l.qty, 0),
  localSubtotal: () => readCart().reduce((n, l) => n + (Number(l.price) || 0) * l.qty, 0),
  onChange: (fn) => { cartListeners.add(fn); return () => cartListeners.delete(fn); },

  add(product, qty = 1) {
    const lines = readCart();
    const found = lines.find((l) => l.itemId === product.id);
    if (found) found.qty = Math.min(99, found.qty + qty);
    else lines.push({
      itemId: product.id,
      qty: Math.min(99, Math.max(1, qty)),
      name: product.name,
      price: product.price,
      image: (product.imageUrls && product.imageUrls[0]) || '',
    });
    writeCart(lines);
  },
  setQty(itemId, qty) {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n < 1) return this.remove(itemId);
    const lines = readCart();
    const found = lines.find((l) => l.itemId === itemId);
    if (!found) return;
    found.qty = Math.min(99, n);
    writeCart(lines);
  },
  remove(itemId) { writeCart(readCart().filter((l) => l.itemId !== itemId)); },
  clear() { writeCart([]); },

  /* Refresh the cached names and prices from the store, and drop anything the
     merchant has withdrawn since. Called on the cart and checkout pages. */
  async refresh() {
    const lines = readCart();
    if (!lines.length) return lines;
    let fresh = [];
    try { fresh = await api.products(lines.map((l) => l.itemId)); }
    catch { return lines; }       // offline: keep what we have rather than emptying the basket
    const byId = new Map((fresh || []).map((p) => [p.id, p]));
    const kept = lines
      .filter((l) => byId.has(l.itemId))
      .map((l) => {
        const p = byId.get(l.itemId);
        return { ...l, name: p.name, price: p.price, image: (p.imageUrls && p.imageUrls[0]) || l.image, product: p };
      });
    if (kept.length !== lines.length) writeCart(kept.map(({ product, ...l }) => l));
    return kept;
  },
};

/* A local wishlist for guests, merged into the account's on sign-in. The store
   owns the real one; this is what makes the heart icon work signed out. */
const WISH_KEY = 'merch.wishlist';
export const wishlist = {
  ids: () => readJson(WISH_KEY, []),
  has: (id) => wishlist.ids().includes(id),
  async toggle(itemId) {
    const on = !wishlist.has(itemId);
    const ids = wishlist.ids().filter((x) => x !== itemId);
    if (on) ids.push(itemId);
    writeJson(WISH_KEY, ids);
    if (token.get()) {
      try { on ? await api.addToWishlist(itemId) : await api.removeFromWishlist(itemId); }
      catch (e) { if (!(e instanceof ApiError && e.isUnauthenticated)) warn(e); }
    }
    return on;
  },
  /* After sign-in: push anything collected as a guest, then adopt the store's. */
  async sync() {
    if (!token.get()) return;
    const local = wishlist.ids();
    try {
      for (const id of local) await api.addToWishlist(id).catch(() => {});
      writeJson(WISH_KEY, (await api.wishlist()) || []);
    } catch (e) { warn(e); }
  },
};

/* A compare list. There is no compare endpoint — this is entirely local, which
   is all the themes' compare pages ever needed. */
const COMPARE_KEY = 'merch.compare';
export const compare = {
  ids: () => readJson(COMPARE_KEY, []),
  toggle(itemId) {
    const ids = compare.ids();
    const i = ids.indexOf(itemId);
    if (i >= 0) ids.splice(i, 1); else ids.push(itemId);
    writeJson(COMPARE_KEY, ids.slice(-4));
    return i < 0;
  },
};

/* ---------------------------------------------------------------------------
   5. TELLING THE SHOPPER SOMETHING

   Themes all ship their own notice element and they all look different, so the
   map names one per theme and this only falls back to a plain fixed strip when
   a theme has none. It is deliberately unstyled beyond position — nothing here
   should ever compete with the theme's design.
--------------------------------------------------------------------------- */

let noticeEl = null;
function notify(message, kind = 'info') {
  const map = THEME?.notice;
  if (map) {
    const host = pick(map.el);
    if (host) {
      const textEl = pick(map.text, host) || host;
      setText(textEl, message);
      host.classList.add(...(map.openClass || '').split(' ').filter(Boolean));
      host.style.display = '';
      clearTimeout(host._merchTimer);
      host._merchTimer = setTimeout(() => {
        host.classList.remove(...(map.openClass || '').split(' ').filter(Boolean));
        if (map.hideOnClose !== false) host.style.display = 'none';
      }, 3200);
      return;
    }
  }
  if (!noticeEl) {
    noticeEl = document.createElement('div');
    noticeEl.setAttribute('role', 'status');
    noticeEl.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;' +
      'max-width:min(90vw,420px);padding:12px 18px;border-radius:6px;font:inherit;font-size:14px;' +
      'background:#1f2937;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .2s';
    document.body.appendChild(noticeEl);
  }
  noticeEl.style.background = kind === 'error' ? '#b91c1c' : kind === 'success' ? '#15803d' : '#1f2937';
  noticeEl.textContent = message;
  noticeEl.style.opacity = '1';
  clearTimeout(noticeEl._merchTimer);
  noticeEl._merchTimer = setTimeout(() => { noticeEl.style.opacity = '0'; }, 3200);
}

function showError(err) {
  if (err instanceof ApiError) {
    if (err.isStoreDown) return notify('The store is briefly unavailable. Please try again in a moment.', 'error');
    if (err.sessionEnded) return notify('You were signed out. Please sign in again.', 'error');
    if (err.isRateLimited) return notify('Too many attempts. Please wait a moment and try again.', 'error');
    return notify(err.message, 'error');
  }
  warn(err);
  notify(err?.message || 'Something went wrong. Please try again.', 'error');
}

/* ---------------------------------------------------------------------------
   6. HYDRATION — the idea this file is built on

   We never author markup. For every list, we take the FIRST item the theme
   already ships as a live template, clone it once per record, and overwrite
   only text, images and links. The node that ends up on the page is the
   theme's own, so its classes, hover states, badges, tooltips and animations
   are exactly what the designer shipped, including the ones nobody documented.

   A field whose selector matches nothing is skipped in silence. That is what
   lets ONE product binder serve a theme's 39 product-page variants and what
   keeps this file working when a theme is swapped for another.
--------------------------------------------------------------------------- */

/* How many items the DESIGNER put in this container. It is the right page
   size: the grid was laid out for that many, and asking the store for "all of
   them" is not a page — measured once at 7,842 cards in one grid, which no
   browser will lay out and no shopper wants. */
function templateCount(spec, root = document) {
  const container = spec.el || pick(spec.container, root);
  if (!container) return 0;
  return realCards(spec, container).length;
}

/* A Swiper in loop mode CLONES slides either side of the real ones. Counting
   them makes a 7-item rail look like a 21-item one, and filling them writes
   three different products into what the shopper sees as one card. */
function realCards(spec, container) {
  return pickAll(spec.card, container).filter((el) => !el.closest('.swiper-slide-duplicate, .slick-cloned'));
}

/* The repeatable unit: the HIGHEST ancestor of this card that still holds
   exactly one card. That is the column in a grid, the slide in a carousel, and
   the card itself where the designer packed several into one column.

   Two wrong rules got here first. A slot SELECTOR (`[class*="col-"]`) found a
   `.col-lg-12` outside a carousel track and rebuilt a whole rail inside one
   slide. Climbing all the way to the named container then grabbed a column
   holding FIVE cards in a list layout, so every product rendered as five. */
/* `boundary`, when given, is the container the unit must stay INSIDE. Without
   it the climb only stopped at <body>, so a template with a single card —
   every one of the returns / subscriptions / collections pages — climbed past
   its own list and out to the page section. `repeat` then replaced the whole
   section with one copy per record, and `renderEmpty` deleted it outright,
   taking the "request a return" FORM with it. A grid of twelve products never
   showed this because the second card stops the climb. */
function unitOf(card, spec, boundary = null) {
  let node = card;
  while (
    node.parentElement &&
    node.parentElement !== document.body &&
    node.parentElement !== boundary &&
    node !== boundary &&
    realCards(spec, node.parentElement).length === 1 &&
    !swallowsAForm(card, node.parentElement)
  ) node = node.parentElement;
  return node;
}

/* A repeatable unit is one record. If growing it would take in a form the card
   is not part of, we have climbed out of the list and into the page. */
function swallowsAForm(card, candidate) {
  return pickAll('form', candidate).some((f) => !f.contains(card));
}

/* The node to clone is not always the card: in a carousel it is the slide that
   wraps it, in a grid it is the column. `slot` names that wrapper; without one
   we clone the card itself. */
function takeTemplate(spec, root = document) {
  /* `spec.el` lets a caller hand us the container it already has (a single
     rail on the home page); otherwise we look it up by selector. */
  /* A spec with no container names only its card; the container is then found
     from the cards themselves, which is what themes that lay a strip out as a
     plain grid need. */
  const container = spec.el || pick(spec.container, root) || productContainers(spec, root)[0];
  if (!container) return null;
  const card = realCards(spec, container)[0];
  if (!card) {
    /* The theme's card is gone because we already emptied this list. Without
       a remembered copy the page could never fill again without a reload —
       a shopper who set up their FIRST repeat delivery was told they had
       none. */
    const kept = TEMPLATES.get(container)?.get(spec.card);
    if (!kept) return null;
    return { container, template: kept.cloneNode(true), sample: kept, card: spec.card };
  }

  const node = unitOf(card, spec, container);
  const template = node.cloneNode(true);
  const parent = node.parentElement || container;
  if (!TEMPLATES.has(parent)) TEMPLATES.set(parent, new Map());
  if (!TEMPLATES.get(parent).has(spec.card)) TEMPLATES.get(parent).set(spec.card, node.cloneNode(true));
  return { container: parent, template, sample: node, card: spec.card };
}

/* The theme's own markup for one row, kept per container so an emptied list
   can be filled again later in the same page view. */
const TEMPLATES = new WeakMap();

/* Replace every existing instance of the template in its container with one
   clone per record. Anything in the container that is NOT one of those
   instances (a heading, a sizing helper, the theme's own "no results" block)
   is left exactly where it is. */
function repeat({ container, template, sample, card }, items, fill) {
  const marker = document.createComment('merch');
  /* Which existing children this render replaces. It must be the PRODUCT rows
     and nothing else: a checkout summary's "Subtotal / Shipping / Total" rows
     are siblings carrying the SAME class, and a filter by class alone deletes
     them — the order then shows its lines and no money at all.

     So: a child qualifies when it is, or contains, the card this template was
     taken from. The class check only decides ties, and matches on the first
     class because a looped Swiper stamps `swiper-slide-duplicate` onto clones. */
  const first = (sample.className || '').trim().split(/\s+/)[0];
  const isRow = (el) => (card ? (matchesAny(el, card) || !!pick(card, el)) : matchesAny(el, sample.tagName + (first ? '.' + first : '')));
  const siblings = [...container.children].filter(isRow);
  const existing = siblings.length ? siblings : (sample.parentNode ? [sample] : []);
  /* Whatever we are about to render replaces the "nothing here yet" line. */
  pickAll('.merch-empty', container).forEach(remove);
  if (existing.length) {
    existing[0].parentNode.insertBefore(marker, existing[0]);
    existing.forEach(remove);
  } else {
    container.appendChild(marker);          // filling a list we emptied earlier
  }

  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const node = template.cloneNode(true);
    try { fill(node, item, i); } catch (e) { warn('fill failed', e); }
    frag.appendChild(node);
  });
  marker.parentNode.insertBefore(frag, marker);
  remove(marker);
  /* renderEmpty may have hidden this list and shown the theme's own "nothing
     here" block. We have rows now, so put it back the other way round. */
  show(container, true);
  const own = pick('.no-results|.empty-state|.wrap-empty_text|.cart-empty', container.parentElement || document);
  if (own) show(own, false);
  return container;
}

/* Apply a field map to one node.

   A field is { sel, ... } where sel is a '|'-separated selector list and the
   rest says what to do with the first match:

     text     string | fn(data) -> textContent
     html     fn(data)          -> innerHTML (only for values WE build)
     attr     'src' | 'href'…   with `value` giving the new value
     value    string | fn(data) -> input.value, or the attr value
     each     fn(el, data)      -> do it yourself
     all      true              -> apply to EVERY match, not just the first
     hideWhen fn(data)          -> display:none when true
     dropWhen fn(data)          -> remove the element entirely when true
     action   'add'|'wishlist'|'compare'|'qty'  -> wire the theme's own control
--------------------------------------------------------------------------- */
function fillFields(node, fields, data, ctx = {}) {
  if (!fields) return;
  for (const [name, f] of Object.entries(fields)) {
    if (!f || !f.sel) continue;
    const els = f.all ? pickAll(f.sel, node) : [pick(f.sel, node)].filter(Boolean);
    if (!els.length) continue;
    for (const el of els) {
      try { applyField(el, f, data, ctx, name); }
      catch (e) { warn('field ' + name, e); }
    }
  }
}

function value(v, data, ctx) { return typeof v === 'function' ? v(data, ctx) : v; }

function applyField(el, f, data, ctx, name) {
  if (f.dropWhen && f.dropWhen(data, ctx)) { remove(el); return; }
  if (f.hideWhen) {
    const hide = f.hideWhen(data, ctx);
    show(el, !hide);
    /* Hiding alone leaves the theme's demo value in the DOM — a struck-through
       "$69.35" one CSS rule away from being visible again, and present in
       textContent for anything that reads the page. Hidden means EMPTIED. */
    if (hide) { if (f.text !== undefined || f.html !== undefined) setText(el, ''); return; }
  }
  if (f.each) { f.each(el, data, ctx); return; }

  if (f.text !== undefined) setText(el, value(f.text, data, ctx));
  if (f.html !== undefined) el.innerHTML = value(f.html, data, ctx);

  /* Heroes are painted with a CSS background as often as with an <img>, and
     two of these four themes carry the url in `data-bg` for their own script
     to apply later. Set the inline style AND the attribute, or the theme's
     script puts the demo image back a moment after we leave. */
  if (f.bg) {
    const url = value(f.value !== undefined ? f.value : f.text, data, ctx);
    if (url) {
      el.style.backgroundImage = 'url(' + url + ')';
      if (el.hasAttribute('data-bg')) setAttr(el, 'data-bg', url);
      if (el.hasAttribute('data-background')) setAttr(el, 'data-background', url);
    }
    return;
  }

  if (f.attr) {
    const v = value(f.value !== undefined ? f.value : f.text, data, ctx);
    if (v != null && v !== '') {
      setAttr(el, f.attr, v);
      /* Lazy-loading themes read data-src and only copy it to src when the
         element scrolls in. Set both, or a hydrated card shows the DEMO image
         until the shopper scrolls past it — which is worse than no image. */
      if (f.attr === 'src') {
        if (el.hasAttribute('data-src')) setAttr(el, 'data-src', v);
        el.removeAttribute('srcset');
        el.classList.remove('lazyload', 'lazyloading');
        el.classList.add('lazyloaded');
      }
    }
  } else if (f.value !== undefined && 'value' in el) {
    el.value = value(f.value, data, ctx) ?? '';
  }

  if (f.action) wireAction(el, f.action, data, ctx);
  if (f.on) for (const [evt, handler] of Object.entries(f.on)) {
    el.addEventListener(evt, (e) => handler(e, data, ctx));
  }
}

/* The theme's own button, made to do the thing it says. We never change what
   it looks like — only what happens when it is pressed. A theme button that is
   an <a href="#"> gets its default prevented so the page does not jump. */
function wireAction(el, action, data, ctx) {
  /* An element can be named by more than one field and then again by a
     later pass — the fashion PDP's Add to cart is both `fields.add` and a
     price-carrying button. Two handlers on one button put TWO of the item in
     the basket for one press, and the shopper sees no reason why. */
  /* The guard lives on a PROPERTY, not on the attribute. Several themes
     re-render their product actions from their own scripts, and cloneNode
     copies `data-merch-action` but NOT the click listener — so an attribute
     guard saw the clone as already wired and left a dead button. A property
     is not cloned, so a clone is recognised as new and wired again. */
  if (el._merchWired?.has(action)) return;
  (el._merchWired ||= new Set()).add(action);

  const wired = el.dataset.merchAction ? el.dataset.merchAction.split(' ') : [];
  el.dataset.merchAction = [...new Set([...wired, action])].join(' ');
  /* Survives cloning, so a clone can be matched back to its record below. */
  if (data?.id) el.dataset.merchItem = data.id;
  ACTION_RECORDS.set(data?.id || '', { data, ctx });

  const stop = (e) => { if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault(); };
  switch (action) {
    case 'add':
      el.addEventListener('click', async (e) => {
        stop(e);
        if (data.availability === 'out') return notify('That one is sold out.', 'error');
        const qtyEl = ctx.qtyEl || (ctx.node && pick(THEME.qtyInput, ctx.node));
        const qty = Math.max(1, Math.floor(Number(qtyEl?.value) || 1));
        cart.add(data, qty);
        notify(data.name + ' added to your cart.', 'success');
        track('add_to_cart', { itemId: data.id, qty });
      });
      break;
    case 'buy':
      el.addEventListener('click', (e) => {
        stop(e);
        cart.add(data, 1);
        location.href = pageUrl('checkout');
      });
      break;
    case 'wishlist':
      el.addEventListener('click', async (e) => {
        stop(e);
        const on = await wishlist.toggle(data.id);
        el.classList.toggle('active', on);
        notify(on ? 'Saved to your wishlist.' : 'Removed from your wishlist.', 'success');
      });
      break;
    case 'compare':
      el.addEventListener('click', (e) => {
        stop(e);
        const on = compare.toggle(data.id);
        notify(on ? 'Added to compare.' : 'Removed from compare.', 'success');
      });
      break;
    case 'remove':
      el.addEventListener('click', (e) => { stop(e); cart.remove(data.itemId || data.id); ctx.rerender?.(); });
      break;
    default:
      warn('unknown action ' + action);
  }
}

/* Anonymous analytics, best-effort and never blocking. */
let eventQueue = [];
const flushEvents = debounce(() => {
  const batch = eventQueue.splice(0);
  if (batch.length) api.events(sessionId(), batch).catch(() => {});
}, 800);
function track(type, payload = {}) {
  eventQueue.push({ type, at: new Date().toISOString(), ...payload });
  flushEvents();
}

/* ---------------------------------------------------------------------------
   7. THE THEME MAPS

   This is the ONLY part that differs per theme, and it is data rather than
   code: which element holds the grid, which one is the card, which one inside
   it is the price. Adding a fifth theme means adding a fifth entry here and
   writing no logic at all.

   Every selector may be a '|'-separated list; the first that matches wins, so
   one entry can cover a theme's grid page and its list page at once.
--------------------------------------------------------------------------- */

/* Kept for readability in the maps below; the repeatable unit is actually
   found by walking up from the card to the container, which no selector can
   get wrong. */
const SLOT = '[class*="col-"]|.swiper-slide|.grid-item|.slick-slide';

/* Product RAILS (a home page's strips, "related products") are carousels on
   some pages and plain grids on others — a grocery home page has one carousel
   and six grids. Naming the carousel selectors alone leaves those six showing
   the demo's $36.00 forever, so instead of guessing the container we find it
   from the CARDS: every element that directly holds one is a rail. */
const RAILS = '.swiper-wrapper|.slick-track|.product-slider|.rail-track';

/* Every container on this page that holds product cards, in document order and
   without duplicates. A card's container is the parent of the card's own
   outermost wrapper — the same unit `repeat` replaces. */
function productContainers(spec = THEME.listing, root = document) {
  const seen = new Set();
  const out = [];
  for (const card of pickAll(spec.card, root)) {
    if (card.closest('.swiper-slide-duplicate, .slick-cloned')) continue;
    const container = unitOf(card, spec, root === document ? null : root).parentElement;
    if (!container || seen.has(container)) continue;
    seen.add(container);
    out.push(container);
  }
  return out;
}

/* Shared shapes. Themes from the same vendor differ by a handful of names, so
   the second one is written as a diff of the first rather than a copy. */


/* Blog fields, shared. A post is { slug, title, excerpt, coverUrl, createdAt }
   in the list and gains `body` on its own page. */
function postHref(post) { return pageUrl('post', { slug: post.slug }); }
function postImage(post) { return mediaUrl(post.coverUrl || ''); }
function postDate(post) {
  return post.createdAt ? new Date(post.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/* Shared banner fields. Every theme's hero is the same four things — a picture,
   a line above, a headline and a button — under four different class names. */
function bannerLink(b) { return storeLink(b.link); }
function bannerImage(b) { return mediaUrl(b.imageUrl || ''); }
function bannerTitle(b) { return b.title || ''; }

function cardImage(sel) {
  return { sel, attr: 'src', value: (p) => mediaUrl((p.imageUrls || [])[0] || '') };
}
function cardHoverImage(sel) {
  return { sel, attr: 'src', value: (p) => mediaUrl((p.imageUrls || [])[1] || (p.imageUrls || [])[0] || '') };
}
function priceText(p) { return money(p.price); }
function mrpText(p) { return money(p.mrp); }
function hasNoMrp(p) { return !(p.mrp && p.mrp > p.price); }
function discountText(p) {
  if (hasNoMrp(p)) return '';
  return '-' + Math.round(((p.mrp - p.price) / p.mrp) * 100) + '%';
}

const THEMES = {
  /* ======================= GROCERY ======================= */
  grocery: {
    name: 'grocery',
    pages: {
      home: 'index.html', listing: 'shop-grid-sidebar.html', product: 'shop-details.html',
      cart: 'cart.html', checkout: 'checkout.html', order: 'order-received.html',
      track: 'trackorder.html', account: 'account.html', wishlist: 'wishlist.html',
      login: 'login.html', register: 'register.html', forgot: 'forgot-password.html',
      addresses: 'addresses.html', returns: 'returns.html', subscriptions: 'subscriptions.html', collections: 'collections.html',
      blog: 'blog.html', post: 'blog-details.html',
    },
    footerContact: { phone: '.call-area a.number|a[href^="tel:"]', email: 'a[href^="mailto:"]', address: 'address|[data-store-address]' },
    /* The promo strip this theme runs across the very top, and the row of
       promises under the header. Both ship with the theme author's wording. */
    announcement: '.header-top-area p|.bwtween-area-header-top p',
    qtyInput: '.quantity-edit .input|.cart-edits .input',
    header: {
      cartCount: '.btn-border-only.cart .number|.cart-number',
      wishCount: '.btn-border-only.wishlist .number',
      cartTotal: '.price--total|.cart-total-price',
    },
    resultCount: '.top-filter span',

    banners: {
      container: '.rts-banner-area-one .swiper-wrapper|.banner-area .swiper-wrapper',
      card: '.banner-bg-image',
      fields: {
        /* The artwork is a CSS class (`bg_one-banner`), so it has to be
           overridden inline or the stylesheet keeps winning. Name the element
           that carries it — the template we cloned is the SLIDE around it. */
        bg:    { sel: '.banner-bg-image', bg: true, value: bannerImage },
        /* `alt` is the image's ACCESSIBILITY text, not a strapline. Printing
           it put "Monsoon sale banner" across the hero. The store has no
           subtitle field, so the slot comes off rather than carry either the
           alt or the template's own demo copy. */
        pre:   { sel: '.pre', dropWhen: () => true },
        title: { sel: '.title', text: bannerTitle },
        cta:   { sel: 'a.rts-btn', attr: 'href', value: bannerLink },
      },
    },
    categories: {
      /* No container named on purpose: `.swiper-wrapper` matches the PRODUCT
         carousel first, and `pick` stops at the first selector that matches
         anything. Found from the tiles instead, which cannot be wrong. */
      container: null,
      card: 'a.single-category-one',
      fields: {
        link:  { sel: 'a.single-category-one', attr: 'href', value: (c) => pageUrl('listing', { category: c.name }) },
        image: { sel: 'img', attr: 'src', value: (c) => mediaUrl(c.imageUrl || '') },
        name:  { sel: 'p', text: (c) => c.name },
      },
    },

    listing: {
      container: '.product-area-wrapper-shopgrid-list .row|.product-area-wrapper .row|.row.g-4',
      card: '.single-shopping-card-one',
      slot: SLOT,
      fields: {
        link:      { sel: 'a.thumbnail-preview', attr: 'href', value: (p) => productHref(p) },
        titleLink: { sel: '.body-content > a', attr: 'href', value: (p) => productHref(p) },
        image:     cardImage('.thumbnail-preview img'),
        title:     { sel: '.body-content .title', text: (p) => p.name },
        availability: { sel: '.availability', text: (p) => stockLabel(p) },
        price:     { sel: '.price-area .current', text: priceText },
        mrp:       { sel: '.price-area .previous', text: mrpText, hideWhen: hasNoMrp },
        taxNote:   { sel: '.tax-note', text: (p) => p.taxNote || '' },
        badge:     { sel: '.badge span', html: (p) => (hasNoMrp(p) ? '' : discountText(p) + ' <br> Off'), hideWhen: hasNoMrp },
        qty:       { sel: '.quantity-edit .input', value: () => 1 },
        add:       { sel: '.cart-counter-action .rts-btn', action: 'add' },
        wish:      { sel: '.action-share-option .single-action:nth-child(1)', action: 'wishlist' },
        compare:   { sel: '.action-share-option .single-action:nth-child(2)', action: 'compare' },
      },
    },

    product: {
      fields: {
        title:    { sel: '.contents .product-title', text: (p) => p.name },
        category: { sel: '.product-catagory', text: (p) => p.category || '' },
        desc:     { sel: '.contents > p', text: (p) => p.description || '' },
        /* The price sits as a bare text node next to the struck-through one,
           so we rewrite that node rather than the element — but only when it
           really is text, because the quick-view modal shapes it differently
           and `childNodes[0].nodeValue` throws there. */
        price:    { sel: '.product-price', each: (el, p) => {
          const first = el.firstChild;
          if (first && first.nodeType === 3) first.nodeValue = money(p.price) + ' ';
          else el.insertBefore(document.createTextNode(money(p.price) + ' '), el.firstChild);
        } },
        mrp:      { sel: '.product-price .old-price', text: mrpText, hideWhen: hasNoMrp },
        sku:      { sel: '.product-uniques .sku', text: (p) => p.unit ? 'Unit: ' + p.unit : '' },
        add:      { sel: '.product-bottom-action .rts-btn:not(.ml--20)', action: 'add' },
        wish:     { sel: '.product-bottom-action .ml--20', action: 'wishlist' },
        reviews:  { sel: '.rating-stars-group span', each: (el) => el.classList.add('review-count') },
      },
      gallery: { images: '.product-thumb-area .thumb-wrapper .product-thumb', thumbs: '.product-thumb-filter-group .thumb-filter' },
      taxNote: '.product-price + .tax-note',
    },

    cart: {
      container: '.rts-cart-list-area',
      card: '.single-cart-area-list.main',
      fields: {
        image:    { sel: '.thumbnail img', attr: 'src', value: (l) => mediaUrl(l.image) },
        title:    { sel: '.information .title', text: (l) => l.name },
        sku:      { sel: '.information span', text: (l) => l.unit || '' },
        price:    { sel: '.price p', text: (l) => money(l.price) },
        qty:      { sel: '.quantity .input', value: (l) => l.qty },
        subtotal: { sel: '.subtotal p', text: (l) => money(l.price * l.qty) },
        remove:   { sel: '.close', action: 'remove' },
      },
      totals: { subtotal: '.cart-totals .subtotal h6.price|.subtotal h6.price', total: '.bottom .wrapper h6.price' },
      coupon: { input: '.bottom-cupon-code-cart-area input', button: '.bottom-cupon-code-cart-area button' },
      checkoutBtn: '.button-area .rts-btn|a[href*="checkout"]',
      empty: '.cart-top-area-note',
    },

    blog: {
      container: null,
      card: '.single-blog-area-start|.blog-single-one',
      fields: {
        link:  { sel: 'a', attr: 'href', all: true, value: postHref },
        image: { sel: 'img', attr: 'src', value: postImage },
        title: { sel: '.title|h4|h5', text: (b) => b.title },
        date:  { sel: '.date|.blog-date|.single-meta:first-child span', text: postDate },
        category: { sel: '.single-meta:has(.fa-folder)', dropWhen: (b) => !b.category, text: (b) => b.category },
        excerpt: { sel: '.disc|p', text: (b) => b.excerpt || '' },
      },
    },
    post: { title: '.blog-listing-content .blog-title|.blog-title', date: '.user-info .date|.date', cover: '.blog-listing .thumbnail img|.thumbnail img', body: '.blog-listing-content .blog-content|.blog-content' },

    checkout: {
      summary: {
        container: '.right-card-sidebar-checkout',
        card: '.single-shop-list:has(a.thumbnail)',
        fields: {
          image: { sel: 'a.thumbnail img', attr: 'src', value: (l) => mediaUrl(l.image) },
          title: { sel: 'a.title', text: (l) => l.name + ' × ' + l.qty },
          price: { sel: '.price', text: (l) => money(l.price * l.qty) },
        },
      },
      totalsRows: '.right-card-sidebar-checkout .single-shop-list',
      form: {
        email: '#email', firstName: '#f-name', lastName: '#l-name', company: '#comp',
        country: '#country', address1: '#street', city: '#city', state: '#state',
        pincode: '#zip', phone: '#phone',
      },
      paymentRadios: '.cottom-cart-right-area input[type="radio"]',
      placeBtn: '.cottom-cart-right-area .rts-btn.btn-primary',
      terms: '#cat14',
    },

    reinit() { refreshSwipers(); },
  },

  /* ======================= JEWELLERY ======================= */
  jewellery: {
    name: 'jewellery',
    pages: {
      home: 'index.html', listing: 'shop.html', product: 'product-details.html',
      cart: 'cart.html', checkout: 'checkout.html', account: 'my-account.html',
      login: 'login-register.html', register: 'login-register.html', wishlist: 'wishlist.html',
      blog: 'blog-grid-full-width.html', post: 'blog-details.html', forgot: 'forgot-password.html',
      order: 'order-received.html', track: 'track-order.html',
      addresses: 'addresses.html', returns: 'returns.html', subscriptions: 'subscriptions.html', collections: 'collections.html',
    },
    footerContact: { phone: 'li:has(i.pe-7s-call)|a[href^="tel:"]', email: 'li:has(i.pe-7s-mail) a|a[href^="mailto:"]', address: 'address|li:has(i.pe-7s-home)' },
    announcement: '.header-top-area .welcome-msg|.header-top-area p|.header-top p',
    usps: { container: '.policy-area .row|.policy-area', card: '.policy-item|.single-policy', title: 'h6|.policy-content h6', text: 'p|.policy-content p' },
    qtyInput: '.pro-qty input|.quantity input',
    header: { cartCount: '.cart-item-count|.item-count|.cart-item_count', cartTotal: '.cart-total-price' },
    resultCount: '.toolbar-amount|.product-showing',

    banners: {
      container: '.hero-slider-active|.slider-area',
      card: '.hero-single-slide',
      fields: {
        /* Slick reads `data-bg` in its own init, so both must change. */
        bg:    { sel: '.hero-slider-item', bg: true, value: bannerImage },
        title: { sel: '.slide-title', text: bannerTitle },
        desc:  { sel: '.slide-desc', dropWhen: () => true },
        cta:   { sel: 'a.btn-hero', attr: 'href', value: bannerLink },
      },
    },

    listing: {
      /* grid view and list view sit in the SAME column, so cloning the column
         keeps the theme's grid/list toggle working. `all` fills both copies. */
      container: '.shop-product-wrap',
      card: '.product-item',
      slot: SLOT,
      fields: {
        /* The IMAGE link only. `.product-thumb a` with `all` also caught the
           Quick View / wishlist / compare anchors that sit inside the same
           figure, so pressing Quick View NAVIGATED to the product page
           instead of opening the modal — and the modal went on showing the
           template's necklace. */
        link:   { sel: 'figure.product-thumb > a', attr: 'href', value: (p) => productHref(p) },
        nameLink: { sel: '.product-name a', attr: 'href', all: true, value: (p) => productHref(p) },
        image:  { sel: 'img.pri-img', attr: 'src', all: true, value: (p) => mediaUrl((p.imageUrls || [])[0] || '') },
        hover:  { sel: 'img.sec-img', attr: 'src', all: true, value: (p) => mediaUrl((p.imageUrls || [])[1] || (p.imageUrls || [])[0] || '') },
        title:  { sel: '.product-name a', text: (p) => p.name, all: true },
        brand:  { sel: '.manufacturer-name a', text: (p) => p.brandName || '', all: true },
        price:  { sel: '.price-regular', text: priceText, all: true },
        mrp:    { sel: '.price-old del', text: mrpText, all: true },
        mrpBox: { sel: '.price-old', hideWhen: hasNoMrp, all: true },
        discount: { sel: '.product-label.discount span', text: discountText, all: true },
        discountBox: { sel: '.product-label.discount', hideWhen: hasNoMrp, all: true },
        newBadge: { sel: '.product-label.new', hideWhen: (p) => !p.featured, all: true },
        desc:   { sel: '.product-content-list p', text: (p) => p.description || '' },
        colors: { sel: '.color-categories', dropWhen: () => true, all: true },
        add:    { sel: '.btn-cart', action: 'add', all: true },
        wish:   { sel: '.button-group a:nth-child(1)', action: 'wishlist', all: true },
        compare:{ sel: '.button-group a:nth-child(2)', action: 'compare', all: true },
      },
    },

    product: {
      fields: {
        /* Each of these carries a bare fallback because the quick-view modal
           reuses the same class names WITHOUT the `.product-details-des`
           wrapper — scoped-only selectors matched nothing there, and the modal
           went on showing "Handmade Golden Necklace, $70.00". */
        title:   { sel: '.product-details-des .product-name|.product-name', text: (p) => p.name },
        brand:   { sel: '.product-details-des .manufacturer-name a|.manufacturer-name a', text: (p) => p.brandName || '' },
        desc:    { sel: '.pro-desc', text: (p) => p.description || '' },
        price:   { sel: '.product-details-des .price-regular|.price-regular', text: priceText },
        mrp:     { sel: '.product-details-des .price-old del|.price-old del', text: mrpText },
        mrpBox:  { sel: '.product-details-des .price-old|.price-old', hideWhen: hasNoMrp },
        stock:   { sel: '.availability span', text: (p) => stockLabel(p) },
        reviews: { sel: '.pro-review span', each: (el) => el.classList.add('review-count') },
        add:     { sel: '.action_link .btn-cart2', action: 'add' },
        countdown: { sel: '.product-countdown', dropWhen: () => true },
        offer:   { sel: '.offer-text', dropWhen: () => true },
        size:    { sel: '.pro-size', dropWhen: (p) => !(p.variantCount > 1) },
        colorOpt:{ sel: '.color-option', dropWhen: () => true },
      },
      gallery: { images: '.product-large-slider .pro-large-img img', thumbs: '.pro-nav .pro-nav-thumb img' },
    },

    cart: {
      container: '.cart-table tbody',
      card: 'tr',
      fields: {
        image:    { sel: '.pro-thumbnail img', attr: 'src', value: (l) => mediaUrl(l.image) },
        imageLink:{ sel: '.pro-thumbnail a', attr: 'href', value: (l) => productHref({ id: l.itemId }) },
        title:    { sel: '.pro-title a', text: (l) => l.name, attr: 'href', value: (l) => productHref({ id: l.itemId }) },
        price:    { sel: '.pro-price span', text: (l) => money(l.price) },
        qty:      { sel: '.pro-quantity input', value: (l) => l.qty },
        subtotal: { sel: '.pro-subtotal span', text: (l) => money(l.price * l.qty) },
        remove:   { sel: '.pro-remove a', action: 'remove' },
      },
      totals: {
        subtotal: '.cart-calculate-items tr:nth-child(1) td:last-child',
        shipping: '.cart-calculate-items tr:nth-child(2) td:last-child',
        total: '.cart-calculate-items .total-amount',
      },
      coupon: { input: '.apply-coupon-wrapper input', button: '.apply-coupon-wrapper button' },
      checkoutBtn: '.cart-calculator-wrapper a[href*="checkout"]',
    },

    checkout: {
      summary: {
        container: '.order-details-table tbody|.checkout-cart-total tbody|table tbody',
        card: 'tr',
        fields: {
          title: { sel: 'td:first-child a', html: (l) => escapeHtml(l.name) + ' <strong> × ' + l.qty + '</strong>' },
          price: { sel: 'td:last-child', text: (l) => money(l.price * l.qty) },
        },
      },
      totals: {
        subtotal: 'tfoot tr:nth-child(1) td:last-child strong',
        total: 'tfoot tr:last-child td:last-child strong',
      },
      form: {
        firstName: '#f_name', lastName: '#l_name', email: '#email', company: '#com-name',
        address1: '#street-address', city: '#town', state: '#state', pincode: '#postcode', phone: '#phone',
      },
      paymentRadios: 'input[name="paymentmethod"]',
      placeBtn: '.summary-footer-area button',
      terms: '#terms',
    },

    blog: {
      container: null,
      card: '.blog-post-item',
      fields: {
        link:  { sel: '.blog-thumb a', attr: 'href', value: postHref },
        titleLink: { sel: '.blog-title a', attr: 'href', value: postHref },
        image: { sel: '.blog-thumb img', attr: 'src', value: postImage },
        title: { sel: '.blog-title a', text: (b) => b.title },
        date:  { sel: '.blog-meta p', html: (b) => escapeHtml(postDate(b)) },
        excerpt: { sel: '.blog-content > p:not(.blog-meta p)', text: (b) => b.excerpt || '' },
      },
    },
    post: { title: '.blog-content .blog-title|.blog-title|h2.title', date: '.blog-meta p|.date', cover: '.blog-single-slide img|.blog-thumb img', body: '.entry-summary|.blog-details-content' },

    reinit() {
      /* Slick caches its slide list and its clones. `refresh` is the one call
         that rebuilds both without losing the carousel's settings. */
      const jq = window.jQuery;
      if (!jq) return;
      jq('.slick-initialized').each(function () { try { jq(this).slick('refresh'); } catch { /* ignore */ } });
    },
  },
};

/* ======================= ELECTRONIC ======================= */
THEMES.electronic = {
  name: 'electronic',
  pages: {
    home: 'index.html', listing: 'shop-default-grid.html', product: 'product-detail.html',
    cart: 'shopping-cart.html', checkout: 'checkout.html', order: 'order-received.html',
    /* `payment-confirmation.html` is this theme's PRE-payment screen — demo
       card digits and a "Confirm Payment" button. Landing a paid shopper on
       it showed them someone else's card and no reference, so the receipt
       lives on a page written in this theme's own markup. */
    track: 'order-tracking.html', account: 'my-account.html', orders: 'my-account-orders.html',
    addresses: 'my-account-address.html', login: 'login.html', register: 'register.html',
    wishlist: 'wish-list.html', forgot: 'forget-password.html',
    blog: 'blog-grid.html', post: 'blog-detail.html',
    returns: 'returns.html', subscriptions: 'subscriptions.html', collections: 'collections.html',
  },
  footerContact: { phone: 'li:has(i.icon-phone) p|a[href^="tel:"]', email: 'li:has(i.icon-mail) p|a[href^="mailto:"]', address: '.footer-address p, .mb-contact p|address' },
  /* No `announcement` here on purpose: this theme ships NO promo bar. The only
     thing in its topbar is the shop's own phone and email, and pointing the
     announcement at `.text-caption-1` replaced the PHONE with it — the
     merchant's number vanished from the header to make room for a sale. A
     theme without the slot simply does not show the bar. */
  qtyInput: '.wg-quantity .quantity-product|.quantity-product',
  header: { cartCount: '.nav-cart .count-box|.count-box', cartTotal: '.sub-total-price|.tf-totals-total-value' },
  resultCount: '.count-text|.wrapper-control-shop .count-text',

  banners: {
    container: '.tf-sw-slideshow .swiper-wrapper|.tf-slideshow .swiper-wrapper',
    card: '.wrap-slider',
    fields: {
      image: { sel: 'img', attr: 'src', value: bannerImage },
      pre:   { sel: '.subtitle', dropWhen: () => true },
      title: { sel: '.title-display|.heading', text: bannerTitle },
      desc:  { sel: '.subheading', dropWhen: () => true },
      cta:   { sel: '.box-btn-slider a', attr: 'href', value: bannerLink },
    },
  },
  categories: {
    container: null,
    card: '.collection-circle',
    fields: {
      link:  { sel: 'a.img-style', attr: 'href', value: (c) => pageUrl('listing', { category: c.name }) },
      image: { sel: 'a.img-style img', attr: 'src', value: (c) => mediaUrl(c.imageUrl || '') },
      titleLink: { sel: 'a.cls-title', attr: 'href', value: (c) => pageUrl('listing', { category: c.name }) },
      name:  { sel: '.cls-title .text', text: (c) => c.name },
    },
  },

  listing: {
    container: '.wrapper-shop|.tf-grid-layout|.tf-list-layout',
    card: '.card-product',
    slot: SLOT,
    fields: {
      link:  { sel: 'a.product-img', attr: 'href', value: (p) => productHref(p) },
      image: cardImage('img.img-product'),
      hover: cardHoverImage('img.img-hover'),
      title: { sel: '.card-product-info .title', text: (p) => p.name, attr: 'href', value: (p) => productHref(p) },
      price: { sel: '.card-product-info .price-on-sale|.card-product-info .price', text: priceText },
      mrp:   { sel: '.card-product-info .compare-at-price', text: mrpText, hideWhen: hasNoMrp },
      badge: { sel: '.on-sale-item|.badges-on-sale', text: discountText, hideWhen: hasNoMrp },
      sizes: { sel: '.size-list|.variant-box', dropWhen: (p) => !(p.variantCount > 1) },
      add:   { sel: '.btn-main-product|.btn-add-to-cart', action: 'add' },
      wish:  { sel: '.box-icon.wishlist', action: 'wishlist' },
      compare: { sel: '.box-icon.compare', action: 'compare' },
    },
  },

  product: {
    fields: {
      title:    { sel: '.tf-product-info-name .name|.tf-product-info-heading .name', text: (p) => p.name },
      category: { sel: '.tf-product-info-name .text', text: (p) => p.category || '' },
      desc:     { sel: '.tf-product-info-desc > p', text: (p) => p.description || '' },
      price:    { sel: '.tf-product-info-price .price-on-sale', text: priceText },
      mrp:      { sel: '.tf-product-info-price .compare-at-price', text: mrpText, hideWhen: hasNoMrp },
      badge:    { sel: '.tf-product-info-price .badges-on-sale', text: discountText, hideWhen: hasNoMrp },
      reviews:  { sel: '.tf-product-info-rate .text', each: (el) => el.classList.add('review-count') },
      sold:     { sel: '.tf-product-info-sold', dropWhen: () => true },
      liveview: { sel: '.tf-product-info-liveview', dropWhen: () => true },
      qty:      { sel: '.quantity-product', value: () => 1 },
      add:      { sel: '.btn-add-to-cart|.btn-action-price', action: 'add' },
      buy:      { sel: '.btns-full|.tf-btn.btn-white', action: 'buy' },
      wish:     { sel: '.tf-product-btn-wishlist|.box-icon.wishlist', action: 'wishlist' },
    },
    variants: { container: '.tf-product-info-choose-option', group: '.variant-picker-item' },
    gallery: { images: '.tf-product-media-main .item img|.thumbs-slider .item img', thumbs: '.tf-product-media-thumbs .item img' },
  },

  cart: {
    container: 'table.tf-table-page-cart tbody',
    card: 'tr.tf-cart-item',
    fields: {
      image:    { sel: '.img-box img', attr: 'src', value: (l) => mediaUrl(l.image) },
      imageLink:{ sel: 'a.img-box', attr: 'href', value: (l) => productHref({ id: l.itemId }) },
      title:    { sel: '.cart-title', text: (l) => l.name, attr: 'href', value: (l) => productHref({ id: l.itemId }) },
      variants: { sel: '.variant-box', dropWhen: () => true },
      price:    { sel: '.cart-price', text: (l) => money(l.price) },
      qty:      { sel: '.quantity-product', value: (l) => l.qty },
      subtotal: { sel: '.cart-total', text: (l) => money(l.price * l.qty) },
      remove:   { sel: '.remove-cart .remove|.remove', action: 'remove' },
    },
    totals: {
      subtotal: '.tf-cart-totals-discounts .tf-totals-total-value|.total-value',
      total: '.tf-cart-totals-discounts .tf-totals-total-value|.total-value',
    },
    coupon: { input: '.ip-discount-code input|input[placeholder*="iscount"]', button: '.ip-discount-code button|.tf-btn' },
    checkoutBtn: 'a[href*="checkout"]',
  },

  checkout: {
    summary: {
      container: '.sidebar-checkout-content .list-product',
      card: '.item-product',
      fields: {
        image: { sel: 'img', attr: 'src', value: (l) => mediaUrl(l.image) },
        link:  { sel: 'a.img-product', attr: 'href', value: (l) => productHref({ id: l.itemId }) },
        title: { sel: '.info .name|.info a|.name', text: (l) => l.name },
        meta:  { sel: '.info .variant|.info .text', text: (l) => 'Qty ' + l.qty },
        price: { sel: '.total-price', text: (l) => money(l.price * l.qty) },
      },
    },
    totals: {
      shipping: '.sec-total-price .top .item:nth-child(1) span:last-child',
      discount: '.sec-total-price .top .item:nth-child(2) span:last-child',
      total: '.total-price-checkout',
    },
    /* This theme's checkout inputs carry no id or name — only placeholders.
       Binding by placeholder is exact here and survives a re-skin, because the
       words are what the designer intended the field to mean. */
    form: {
      firstName: 'input[placeholder="First Name*"]',
      lastName: 'input[placeholder="Last Name*"]',
      email: 'input[placeholder="Email Address*"]',
      phone: 'input[placeholder="Phone Number*"]',
      city: 'input[placeholder="Town/City*"]',
      address1: 'input[placeholder="Street,..."]',
      pincode: 'input[placeholder="Postal Code*"]',
    },
    coupon: { input: 'input[placeholder="Add voucher discount"]', button: '.ip-discount-code button' },
    /* One of this vendor's two templates has no `#payment-box` at all and
       names its radios `payment-method`, so NOTHING was matched there: no
       method was labelled, and the checkout silently took the online path
       whatever the shopper picked. */
    paymentRadios: 'input[name="payment-method"]|#payment-box input[type="radio"]|input[name="payment"]',
    /* `.btn-checkout` exists in neither of this vendor's templates — the
       control is an <a> reading "Check Out" or "Pay Now". Matched by class
       where we can and by its WORDS where we cannot; see findPlaceButton. */
    placeBtn: '.tf-btn.btn-fill|.sidebar-checkout-content .tf-btn',
  },

  blog: {
    container: null,
    card: '.wg-blog',
    fields: {
      link:  { sel: '.image a|a.link', attr: 'href', value: postHref },
      titleLink: { sel: '.title a', attr: 'href', value: postHref },
      image: { sel: '.image img', attr: 'src', value: postImage },
      title: { sel: '.title a', text: (b) => b.title },
      date:  { sel: '.meta-item p', text: postDate },
      author:{ sel: '.meta-item:nth-child(2)', dropWhen: () => true },
      excerpt: { sel: '.body-text', text: (b) => b.excerpt || '' },
    },
  },
  post: { title: '.blog-detail-wrap .heading h3|.title-display|h2.title', date: '.blog-detail-wrap .meta .body-text-1|.meta-item p', cover: '.blog-detail-wrap .image img|.image img', body: '.blog-detail-wrap .inner|.blog-content|.content-inner' },

  reinit() { refreshSwipers(); },
};

/* ======================= FASHION ======================= */
/* Same vendor family as electronic, so this is written as the differences. */
THEMES.fashion = {
  ...THEMES.electronic,
  name: 'fashion',
  pages: {
    home: 'index.html', listing: 'shop-left-sidebar.html', product: 'product-detail.html',
    cart: 'view-cart.html', checkout: 'checkout.html', order: 'thank-you.html',
    track: 'track-order.html', account: 'account-page.html', orders: 'account-orders.html',
    addresses: 'account-addresses.html', login: 'login.html', register: 'register.html',
    wishlist: 'wishlist.html', forgot: 'forget-password.html', invoice: 'invoice.html',
    blog: 'blog.html', post: 'blog-single.html',
    returns: 'returns.html', subscriptions: 'subscriptions.html', collections: 'collections.html',
  },
  footerContact: { phone: 'a[href^="tel:"]', email: 'a[href^="mailto:"]', address: '.footer-infor p.lh-26, .need-help-wrap p.lh-26|address' },
  announcement: '.tf-topbar .swiper-slide p|.tf-topbar p',
  /* Scope this to the icon-box strip. `.swiper-wrapper` alone matched the
     TOPBAR's carousel first, so the promises were written over the promo bar
     and the announcement had nowhere left to go. */
  usps: { container: '.swiper-wrapper:has(.box-icon_V01)', card: '.swiper-slide:has(.box-icon_V01)', title: '.content .title', text: '.content .desc|.content p:not(.title)' },
  /* This theme names its basket badge `.count`; the inherited `.count-box`
     matches nothing here, so the header kept the template's "12". */
  header: { cartCount: '.nav-icon-item .count|.toolbar-count|.count', cartTotal: '.sub-total-price|.tf-totals-total-value' },

  banners: {
    container: '.sw-slide-show .swiper-wrapper|.tf-slideshow .swiper-wrapper',
    card: '.slideshow-wrap',
    fields: {
      image: { sel: '.sld_image img|img', attr: 'src', value: bannerImage },
      /* `.heading` is the WRAPPER around this theme's strapline and headline.
         Writing to it replaced both with one unstyled line — the hero read as
         16px body text. Name the headline itself, and drop the strapline the
         store has no field for. */
      title: { sel: '.heading .title_sld|.title_sld|.heading', text: bannerTitle },
      strap: { sel: '.sub-text_sld', dropWhen: () => true },
      cta:   { sel: '.sld_content a', attr: 'href', value: bannerLink },
    },
  },
  categories: {
    container: null,
    card: 'a.category-v01',
    fields: {
      link:  { sel: 'a.category-v01', attr: 'href', value: (c) => pageUrl('listing', { category: c.name }) },
      image: { sel: '.cate-image img', attr: 'src', value: (c) => mediaUrl(c.imageUrl || '') },
      name:  { sel: '.cate-name', text: (c) => c.name },
    },
  },

  listing: {
    container: '.wrapper-shop|.tf-grid-layout|.tf-list-layout',
    card: '.card-product',
    slot: SLOT,
    fields: {
      link:  { sel: 'a.product-img', attr: 'href', value: (p) => productHref(p) },
      image: cardImage('img.img-product'),
      hover: cardHoverImage('img.img-hover'),
      title: { sel: '.name-product', text: (p) => p.name, attr: 'href', value: (p) => productHref(p) },
      price: { sel: '.price-new', text: priceText },
      mrp:   { sel: '.price-old', text: mrpText, hideWhen: hasNoMrp },
      desc:  { sel: '.card-product_info .description', text: (p) => p.description || '' },
      colors:{ sel: '.product-color_list', dropWhen: () => true },
      marquee: { sel: '.product-marquee_sale', hideWhen: hasNoMrp },
      badges: { sel: '.product-badge_list .product-badge_item', text: (p) => (p.featured ? 'FEATURED' : discountText(p)), hideWhen: (p) => hasNoMrp(p) && !p.featured },
      add:   { sel: '.btn-add-to-cart|.box-icon.bg_white.quick-add', action: 'add' },
      /* This theme puts the class on the <li>, not on the icon: neither
         `.box-icon.wishlist` nor `.box-icon.compare` exists anywhere in it,
         so both controls were dead on every card. */
      wish:  { sel: '.product-action_list .wishlist a|.box-icon.wishlist', action: 'wishlist' },
      compare: { sel: '.product-action_list .compare a|.box-icon.compare', action: 'compare' },
    },
  },

  product: {
    fields: {
      title:    { sel: '.product-infor-name', text: (p) => p.name },
      category: { sel: '.product-infor-cate', text: (p) => p.category || '' },
      desc:     { sel: '.product-infor-desc', text: (p) => p.description || '' },
      price:    { sel: '.product-infor-price .price-on-sale', text: priceText },
      mrp:      { sel: '.product-infor-price .text-decoration-line-through', text: mrpText, hideWhen: hasNoMrp },
      badge:    { sel: '.product-infor-price .badge-sale', text: discountText, hideWhen: hasNoMrp },
      code:     { sel: '.meta_prd_code', text: (p) => p.unit ? 'Unit: ' + p.unit : '' },
      sold:     { sel: '.meta_sold', dropWhen: () => true },
      reality:  { sel: '.product-infor-reality', dropWhen: () => true },
      qty:      { sel: '.quantity-product', value: () => 1 },
      /* `.btn-action-price` is the big one under the price; `.btn-add-to-cart`
         is the sticky bar that appears on scroll. Both are real buttons a
         shopper presses, and wiring only the second left the main one inert. */
      add:      { sel: '.btn-action-price', action: 'add' },
      addSticky:{ sel: '.btn-add-to-cart', action: 'add' },
      buy:      { sel: 'a[href*="checkout"].tf-btn', action: 'buy' },
    },
    variants: { container: '.tf-product-variant', group: '.variant-picker-item' },
    gallery: { images: '.tf-product-media-main .item img', thumbs: '.tf-product-media-thumbs .item img' },
  },

  blog: {
    container: null,
    card: 'article.article-blog',
    fields: {
      link:  { sel: 'a.blog-image', attr: 'href', value: postHref },
      titleLink: { sel: '.entry-title a', attr: 'href', value: postHref },
      image: { sel: '.blog-image img', attr: 'src', value: postImage },
      title: { sel: '.entry-title a', text: (b) => b.title },
      date:  { sel: '.entry-date', text: postDate },
      excerpt: { sel: '.entry-desc', text: (b) => b.excerpt || '' },
    },
  },
  post: { title: '.blog-content .entry-title|.entry-title', date: '.entry-meta .meta-date span|.entry-date', cover: '.blog-image img|article img', body: '.blog-content|.entry-content' },

  cart: {
    container: 'table.tf-table-page-cart tbody',
    card: 'tr.tf-cart_item',
    fields: {
      image:    { sel: '.img-prd img', attr: 'src', value: (l) => mediaUrl(l.image) },
      imageLink:{ sel: 'a.img-prd', attr: 'href', value: (l) => productHref({ id: l.itemId }) },
      title:    { sel: '.prd_name', text: (l) => l.name, attr: 'href', value: (l) => productHref({ id: l.itemId }) },
      variants: { sel: '.prd_select', dropWhen: () => true, all: true },
      price:    { sel: '.cart_price', text: (l) => money(l.price) },
      qty:      { sel: '.quantity-product', value: (l) => l.qty },
      subtotal: { sel: '.cart_total', text: (l) => money(l.price * l.qty) },
      remove:   { sel: '.cart_remove', action: 'remove' },
    },
    totals: { subtotal: '.each-subtotal|.tf-totals-total-value', total: '.total-price|.tf-totals-total-value' },
    coupon: { input: 'input[placeholder*="iscount"]', button: '.ip-discount-code button' },
    checkoutBtn: 'a[href*="checkout"]',
  },
};

/* Swiper keeps its own copy of the slide list, and in loop mode a set of
   clones built from it. update() alone leaves the clones stale, so a looped
   carousel needs its loop rebuilt — in the order Swiper expects, and guarded,
   because the method names differ across the versions these themes ship. */
/* Themes decorate almost every page with extra product strips — "featured"
   beside a shop grid, "you may also like" under a cart. None of them belongs
   to the page's role, so no binder touches them, and each one goes on offering
   demo stock at demo prices on a real shop.

   Fill them with something real. Hide them only if the store cannot answer,
   because an empty strip is still better than an invented one. */
async function fillStrayStrips() {
  const strays = productContainers().filter((el) => !hydrated.has(el) && el.offsetParent !== null);
  if (!strays.length) return;

  let stock = [];
  try {
    const res = await api.catalog({ pageSize: 12 });
    stock = Array.isArray(res) ? res : res.products || [];
  } catch { /* fall through to hiding them */ }

  for (const el of strays) {
    if (!stock.length) {
      const section = el.closest('section, .rts-section, .section') || el;
      show(section, false);
      continue;
    }
    const room = Math.max(1, Math.min(12, templateCount({ ...THEME.listing, el })));
    renderProducts(stock.slice(0, room), THEME.listing, el);
  }
}

/* Work that must happen AFTER the theme's own scripts have run.

   Some themes BUILD text out of the price they find on the page: this one
   writes its "Add To Cart - $79.99" label by parsing the price element. Once
   that element says "₹468", its parser produces `NaN` and the shopper is
   offered "Add To Cart - $NaN". Our correction therefore has to land after
   the theme's, not before it. */
const afterTheme = [];
function onThemeReady(fn) { afterTheme.push(fn); }
function runAfterTheme() {
  for (const fn of afterTheme.splice(0)) {
    try { fn(); } catch (e) { warn('after-theme step failed', e); }
  }
  rewireClones();
}

/* What each wired control was wired FOR, kept by product id so a clone the
   theme made can be given its handler back. */
const ACTION_RECORDS = new Map();

/* A theme script that re-renders its product actions leaves behind elements
   that look wired and do nothing. Give every such orphan its listener back.
   This is why the wishlist button did nothing on two of the templates. */
function rewireClones() {
  for (const el of $$('[data-merch-action]')) {
    const actions = (el.dataset.merchAction || '').split(' ').filter(Boolean);
    const missing = actions.filter((a) => !el._merchWired?.has(a));
    if (!missing.length) continue;
    const rec = ACTION_RECORDS.get(el.dataset.merchItem || '');
    if (!rec) continue;
    for (const a of missing) wireAction(el, a, rec.data, rec.ctx);
  }
}

function refreshSwipers() {
  for (const el of $$('.swiper, .swiper-container')) {
    const sw = el.swiper;
    if (!sw) continue;
    try {
      if (sw.params?.loop && typeof sw.loopDestroy === 'function') {
        sw.loopDestroy();
        sw.update();
        sw.loopCreate();
      }
      sw.update();
      sw.slideTo(0, 0);
    } catch { /* a carousel that refuses to refresh still shows real data */ }
  }
  try { window.lazySizes?.autoSizer?.checkElems(); } catch { /* ignore */ }
  try {
    if (window.bootstrap) $$('[data-bs-toggle="tooltip"]').forEach((el) => new window.bootstrap.Tooltip(el));
  } catch { /* ignore */ }
}

/* ---------------------------------------------------------------------------
   8. WHICH THEME, WHICH PAGE

   Both are inferred so a page needs no attributes at all. The theme is the
   folder the page sits in; the role is the filename, checked against the
   theme's own page table first and then against the names these themes share.
--------------------------------------------------------------------------- */

let THEME = null;
let PAGE = null;

function detectTheme() {
  if (CONFIG.theme && THEMES[CONFIG.theme]) return THEMES[CONFIG.theme];
  const segs = location.pathname.split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) if (THEMES[segs[i]]) return THEMES[segs[i]];
  /* Fall back to what the markup says about itself — a folder rename should
     not silently disable the shop. */
  if ($('.single-shopping-card-one, .rts-cart-list-area')) return THEMES.grocery;
  if ($('.product-item .product-thumb, .cart-calculator-wrapper')) return THEMES.jewellery;
  if ($('.card-product_wrapper, tr.tf-cart_item')) return THEMES.fashion;
  if ($('.card-product-wrapper, tr.tf-cart-item')) return THEMES.electronic;
  return null;
}

const ROLE_PATTERNS = [
  [/^index|^home/, 'home'],
  [/thank-you|payment-confirmation|order-received|order-complete/, 'order'],
  [/payment-failure/, 'paymentFailed'],
  [/invoice/, 'invoice'],
  [/track|order-tracking|trackorder/, 'track'],
  [/view-cart|shopping-cart|^cart/, 'cart'],
  [/^checkout/, 'checkout'],
  [/wish-?list/, 'wishlist'],
  [/^returns?$|order-returns/, 'returns'],
  [/^subscriptions?$/, 'subscriptions'],
  [/^collections?$/, 'collections'],
  [/^addresses$/, 'addresses'],
  [/compare/, 'compare'],
  [/forget|forgot|reset-password/, 'forgot'],
  [/login|register|sign-?in|sign-?up|login-register/, 'auth'],
  [/my-account-orders-details|account-order-details/, 'orderDetail'],
  [/my-account-orders|account-orders/, 'orders'],
  [/my-account-address|account-addresses/, 'addresses'],
  [/account|my-account|dashboard|account-setting/, 'account'],
  [/privacy/, 'policy:privacy'],
  [/term/, 'policy:terms'],
  [/(refund|return)/, 'policy:refund'],
  [/^shipping|delivery-information/, 'policy:shipping'],
  [/^about/, 'policy:about'],
  [/blog-(detail|details|single)/, 'post'],
  [/^blog/, 'blog'],
  /* Anything with "details" or "detail" in a product context is the PDP, and
     it must be tested before the listing rule — `shop-details.html` matches
     both. */
  [/product-detail|product-details|shop-details|product-[a-z0-9-]*$/, 'product'],
  [/shop|collection|store|catalog|product-deals/, 'listing'],
];

function detectRole() {
  if (CONFIG.page) return CONFIG.page;
  const file = (location.pathname.split('/').pop() || 'index.html').replace(/\.html?$/i, '').toLowerCase();

  /* The theme's own table is the authority — it knows that this theme calls
     its basket `view-cart` and that one calls it `shopping-cart`. */
  for (const [role, name] of Object.entries(THEME?.pages || {})) {
    if (name.replace(/\.html?$/i, '').toLowerCase() === file) return role;
  }
  for (const [re, role] of ROLE_PATTERNS) if (re.test(file)) return role;

  /* Nothing in the name: ask the page. A file called `e.html` that contains a
     cart table is a cart page. */
  if (pick(THEME?.cart?.container)) return 'cart';
  if (pick(THEME?.checkout?.summary?.container)) return 'checkout';
  if (pick(THEME?.product?.fields?.title?.sel)) return 'product';
  if (pick(THEME?.listing?.container)) return 'listing';
  return 'unknown';
}

/* Where each role lives in THIS theme, so links we write stay inside it. */
function pageUrl(role, query = {}) {
  const file = THEME?.pages?.[role];
  if (!file) {
    /* The fallback below is a guess, and `post.html` exists in none of these
       themes — so every blog post link pointed at a 404 on three of them,
       silently. Say so instead of shipping a dead link in silence. */
    warn(`this theme names no '${role}' page; linking to ${role}.html, which probably does not exist`);
    return role + '.html' + qs(query);
  }
  return file + qs(query);
}
function productHref(p) {
  return pageUrl('product', { id: p.id });
}
function stockLabel(p) {
  if (p.availability === 'out') return 'Out of stock';
  if (p.availability === 'low') return p.qtyHint ? 'Only ' + p.qtyHint + ' left' : 'Low stock';
  /* Where the theme shows a pack size under the name ("500g Pack"), the
     product's own `unit` is the honest thing to put there. */
  return p.unit || 'In stock';
}
function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------------------------------------------------------------------
   9. SHARED PIECES EVERY PAGE GETS

   The header basket count, the currency, and the theme's own "empty" state.
--------------------------------------------------------------------------- */

/* The merchant's settings, kept for the whole page life. */
let STORE = null;

async function loadStoreSettings() {
  try {
    const theme = await api.theme();
    STORE = theme;
    /* `currency` is the ISO CODE as a string and the symbol travels beside it.
       Reading it as an object (the obvious guess) leaves every price unformatted. */
    if (theme?.currency) CURRENCY = { code: theme.currency, symbol: theme.currencySymbol || CURRENCY.symbol };
    return theme;
  } catch (e) {
    /* A store that will not answer /api/theme is a store that is down. Say so
       once, quietly, and let the page render with the fallback currency rather
       than showing nothing at all. */
    if (!(e instanceof ApiError && e.status === 0)) warn('theme', e);
    return null;
  }
}

function paintHeader() {
  const h = THEME?.header || {};
  const count = cart.count();
  pickAll(h.cartCount).forEach((el) => setText(el, count));
  pickAll(h.wishCount).forEach((el) => setText(el, wishlist.ids().length));
  pickAll(h.cartTotal).forEach((el) => setText(el, money(cart.localSubtotal())));
}

/* --- The shop's own identity -------------------------------------------------
   Everything the merchant sets in Appearance that is CONTENT rather than
   design: the name, the logo, the tagline, where the menu points, how to
   contact them. Applied on every page, because every page shows a header.

   Deliberately NOT applied: colours, fonts, radius and customCss. Each of
   these themes has its own designed palette that it hardcodes in CSS rules
   rather than in variables (only grocery exposes a usable `--color-primary`),
   so forcing a brand colour over it means guessing at a hundred rules and
   would change exactly the look the theme was chosen for. Those settings are
   for the merchant's OWN storefront; here the template is the design. */
function paintStoreChrome(theme) {
  if (!theme) return;

  /* The logo. Themes ship several — header, sticky header, mobile drawer,
     footer — and they are the clearest sign of whose shop this is. */
  if (theme.logoUrl && useStore('logo')) {
    const url = mediaUrl(theme.logoUrl);
    for (const img of $$('img')) {
      const src = (img.getAttribute('src') || img.getAttribute('data-src') || '').toLowerCase();
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const cls = ((img.className || '') + ' ' + (img.parentElement?.className || '')).toLowerCase();
      if (!/logo/.test(src + ' ' + alt + ' ' + cls)) continue;
      if (/payment|card|visa|master|paypal|app-store|google-play/.test(src + cls)) continue;   // footer payment marks are not logos
      setAttr(img, 'src', url);
      if (img.hasAttribute('data-src')) setAttr(img, 'data-src', url);
      img.removeAttribute('srcset');
      if (theme.brandName) setAttr(img, 'alt', theme.brandName);
    }
  }

  if (theme.brandName && useStore('brandName')) {
    document.title = document.title.replace(/^[^|\u2013-]+/, theme.brandName + ' ');
    pickAll('.site-title|.brand-name|[data-brand-name]').forEach((el) => setText(el, theme.brandName));
  }
  if (theme.tagline && useStore('tagline')) pickAll('.site-tagline|[data-tagline]').forEach((el) => setText(el, theme.tagline));

  if (theme.faviconUrl && useStore('favicon')) {
    let link = $('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = mediaUrl(theme.faviconUrl);
  }

  /* The menu. We repoint the theme's OWN items rather than replacing them —
     these navs carry mega-menus and columns that a wholesale rewrite would
     flatten. An item whose label the merchant also uses gets their target. */
  const links = useStore('menuLinks')
    ? [...(theme.navLinks || []), ...(theme.footerLinks || [])].filter((l) => l && l.label)
    : [];
  if (links.length) {
    const byLabel = new Map(links.map((l) => [String(l.label).trim().toLowerCase(), l]));
    for (const a of $$('a')) {
      const l = byLabel.get((a.textContent || '').trim().toLowerCase());
      if (l && l.href) a.setAttribute('href', storeLink(l.href));
    }
  }

  /* How to reach them. A shop that publishes the template's phone number is
     publishing someone else's phone number. */
  if (!useStore('footerContact')) return;
  const f = theme.footer || {};

  /* A contact detail the merchant has NOT set must not fall back to the
     template's. These read as facts about the shop — this jewellery template
     ships "4710-4890 Breckinridge USA" and "demo@yourdomain.com", and an
     Indian grocer publishing those is telling customers where to write and
     where to turn up. Unset means the line comes off the page. */
  /* `mailto:` / `tel:` / <address> covers ONE of these four themes. The rest
     print the shop's email and street address as plain <p> or <li> text, so
     the merchant's details reached nothing and the template's own
     "themesflat@gmail.com" and "600 N Michigan Ave, Chicago" stayed on the
     page under the shop's name. Each theme names its own below. */
  const sel = THEME.footerContact || {};

  /* Several of these lines are an icon followed by the text. Replacing the
     element's content would take the icon with it, so only the text moves. */
  const writeText = (el, v) => {
    const node = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (node && el.children.length) node.textContent = ' ' + v;
    else setText(el, v);
  };

  const contact = (selector, value, kind) => {
    for (const el of pickAll(selector)) {
      if (!value) { show(el.closest('li, .single-contact, .footer-contact-item, p, address') || el, false); continue; }
      if (el.tagName === 'A' && kind === 'tel') el.setAttribute('href', 'tel:' + value.replace(/\s+/g, ''));
      if (el.tagName === 'A' && kind === 'mail') el.setAttribute('href', 'mailto:' + value);
      writeText(el, value);
    }
  };
  contact(sel.phone || 'a[href^="tel:"]', f.phone, 'tel');
  contact(sel.email || 'a[href^="mailto:"]', f.email, 'mail');
  contact(sel.address || 'address|[data-store-address]', f.address, 'text');

  /* These themes repeat the shop's details OUTSIDE the footer — a topbar, a
     mobile menu, an offcanvas "need help" panel — each with its own icon
     classes. Naming every one per theme is a losing game, so match on what
     the text IS, and only inside the page's chrome: never in the content,
     where an email belongs to a customer or a comment, not to the shop. */
  /* A `tel:` or `mailto:` anchor anywhere on a shop's page IS the shop's, so
     those are swept document-wide. One theme puts its phone in a bar with no
     <header> ancestor and a class no list would guess, and its link pointed at
     a DIFFERENT demo number than the one it displayed — tapping it called
     Norway. */
  for (const a of $$('a[href^="tel:"]')) if (f.phone) { a.setAttribute('href', 'tel:' + f.phone.replace(/\s+/g, '')); setText(a, f.phone); }
  for (const a of $$('a[href^="mailto:"]')) if (f.email) { a.setAttribute('href', 'mailto:' + f.email); setText(a, f.email); }

  const CHROME = 'header, footer, [class*="header-top"], [class*="topbar"], [class*="contact"], '
    + '.tf-topbar, .tf-topbar_wrap, .topbar, .header-top, '
    + '.offcanvas, .mb-canvas-content, .off-canvas-contact-widget, .need-help-wrap, .mb-contact, '
    + '.footer-address, .rts-footer-area, .footer-widget-area, .footer-area, .tf-footer';
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
  const PHONE_RE = /^[+(]?[\d][\d\s()+-]{6,}$/;
  const LABELLED_PHONE_RE = /\+?\d[\d\s()-]{7,}\d/;
  const seen = new Set();
  for (const root of $$(CHROME)) {
    /* `div` and `h6` belong here too: one theme's hotline is a bare
       `div.text-title`, so leaving them out meant the sweep walked straight
       past the number it was written to replace. */
    for (const el of $$('a, p, span, li, address, div, h6, strong', root)) {
      if (el.children.length || seen.has(el)) continue;
      seen.add(el);
      const t = (el.textContent || '').trim();
      if (f.email && EMAIL_RE.test(t)) {
        if (el.tagName === 'A') el.setAttribute('href', 'mailto:' + f.email);
        setText(el, f.email);
      } else if (f.phone && PHONE_RE.test(t)) {
        if (el.tagName === 'A') el.setAttribute('href', 'tel:' + f.phone.replace(/\s+/g, ''));
        setText(el, f.phone);
      } else if (f.phone && LABELLED_PHONE_RE.test(t)) {
        /* "Hotline: +01 1234 8888" — the label and the number share one text
           node, so a whole-string match never fires and the template's number
           stays under the shop's name. Replace the NUMBER, keep the label.
           Eight digits minimum, so a price or a badge count cannot match. */
        setText(el, t.replace(LABELLED_PHONE_RE, f.phone));
      }
    }
  }

  /* The "about us" blurb is marketing copy rather than a fact a customer acts
     on, so an unset one keeps the template's. */
  if (f.about) pickAll('[data-store-about]').forEach((el) => setText(el, f.about));
}

/* ---------------------------------------------------------------------------
   MERCHANT-OWNED CHROME

   Three things every bought theme ships with the THEME AUTHOR's words in them:
   a promo bar, a row of promises, and social icons. The store now carries all
   three (`announcement`, `usps`, `social` on /api/theme), so a shop stops
   advertising a sale it never agreed to and stops linking to someone else's
   Instagram.

   `social` needs no per-theme selector at all: a social icon is recognisable
   from its href's host, its own class, or its icon's class, in every one of
   these templates. The other two name their slot in the theme map, because
   nothing reliable distinguishes a promo bar from a heading by looking at it.
--------------------------------------------------------------------------- */

const SOCIAL_ALIASES = {
  fb: 'facebook', facebook: 'facebook',
  twitter: 'x', twiter: 'x', x: 'x',
  ig: 'instagram', insta: 'instagram', instagram: 'instagram',
  yt: 'youtube', youtube: 'youtube',
  linkedin: 'linkedin', 'linked-in': 'linkedin',
  pinterest: 'pinterest', tiktok: 'tiktok', snapchat: 'snapchat',
  whatsapp: 'whatsapp', telegram: 'telegram',
};

/* What platform is this anchor for? Themes say it three different ways and a
   fifth theme will pick one of them. */
function socialPlatformOf(a) {
  const href = (a.getAttribute('href') || '').toLowerCase();
  const host = href.match(/https?:\/\/(?:www\.)?([a-z0-9-]+)\./);
  if (host && SOCIAL_ALIASES[host[1]]) return SOCIAL_ALIASES[host[1]];
  const words = ((a.className || '') + ' ' + [...a.querySelectorAll('i, span, svg')].map((e) => e.className?.baseVal || e.className || '').join(' ')).toLowerCase();
  for (const key of Object.keys(SOCIAL_ALIASES)) {
    if (new RegExp('(^|[^a-z])' + key + '([^a-z]|$)').test(words)) return SOCIAL_ALIASES[key];
  }
  return null;
}

function paintSocialLinks(theme) {
  if (!useStore('social')) return;
  const wanted = new Map();
  for (const s of theme.social || []) {
    const key = SOCIAL_ALIASES[String(s.platform || '').toLowerCase()] || String(s.platform || '').toLowerCase();
    if (key && s.url) wanted.set(key, s.url);
  }
  const anchors = $$('[class*="social"] a, .tf-social-icon a, .social-link a, footer a[href*="facebook.com"], footer a[href*="instagram.com"]');
  if (!anchors.length) return;
  let matched = 0;
  for (const a of anchors) {
    const platform = socialPlatformOf(a);
    if (!platform) {
      /* Inside an explicit social row, an icon we cannot name is still not the
         merchant's — a leftover `#` or the theme author's own network. Take it
         off rather than leave a dead or borrowed link. */
      if (a.closest('[class*="social"], .tf-social-icon, .social-link')) show(a.closest('li') || a, false);
      continue;
    }
    matched++;
    const url = wanted.get(platform);
    if (url) {
      a.setAttribute('href', url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      show(a.closest('li') || a, true);
    } else {
      /* The merchant does not have this one. The theme's link goes to the
         author's own profile — or to `#`, which is worse than absent. */
      show(a.closest('li') || a, false);
    }
  }
  if (matched && !wanted.size) log('no social links set, so the theme\u2019s own icons were hidden');
}

function paintAnnouncement(theme) {
  if (!useStore('announcement')) return;
  const a = theme.announcement || {};
  const el = pick(THEME.announcement);
  if (!el) return;                              // this theme names no promo bar
  const bar = el.closest('.tf-topbar, .topbar, [class*="header-top"], .announcement') || el;
  if (!a.enabled || !a.text) { show(bar, false); return; }
  show(bar, true);
  const existing = el.matches('a') ? el : (pick('a', el) || el.closest('a'));
  if (!a.link) { setText(el, a.text); if (existing && existing !== el) setText(existing, a.text); return; }

  if (existing) {
    setText(existing, a.text);
    existing.setAttribute('href', storeLink(a.link));
    return;
  }
  /* The merchant gave the bar a destination and the theme's bar is a bare <p>,
     so there was nothing to click: the admin offered a Link field that did
     nothing. Put the text in an anchor INSIDE the theme's own element, so the
     bar keeps its colour, font and spacing and only becomes clickable. */
  const link = document.createElement('a');
  link.href = storeLink(a.link);
  link.textContent = a.text;
  link.style.color = 'inherit';
  link.style.textDecoration = 'inherit';
  link.dataset.merchAnnouncement = '1';
  el.replaceChildren(link);
}

function paintUsps(theme) {
  if (!useStore('usps')) return;
  const list = (theme.usps || []).filter((u) => u && u.title);
  const spec = THEME.usps;
  if (!spec || !list.length) return;            // unset ⇒ the theme keeps its own
  const t = takeTemplate(spec);
  if (!t) return;
  repeat(t, list, (node, u) => {
    setText(pick(spec.title, node), u.title);
    setText(pick(spec.text, node), u.text || '');
    const img = spec.icon ? pick(spec.icon, node) : null;
    if (img && u.icon && /^(https?:|\/)/.test(u.icon)) setAttr(img, 'src', mediaUrl(u.icon));
  });
}

/* The currency switcher in the header. Every one of these templates ships one
   reading "USD" next to prices the store quotes in its own currency. The store
   says which currencies it actually offers — usually none, in which case the
   control is a lie and comes off. */
/* Menus already rebuilt, so a second pass cannot append to them again. */
const CURRENCY_MENUS = new WeakSet();

async function paintCurrencySwitcher() {
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  /* A currency label is a code, optionally behind its symbol ("$ USD"), or the
     word Currency. `children.length === 0` missed every one that carries an
     icon or a flag — three of the four — so they went on saying USD while the
     store quoted INR. */
  const CODE_RE = /\b(USD|EUR|EURO|GBP|INR|AUD|CAD|AED|SGD|JPY)\b/i;
  const isLabel = (t) => CODE_RE.test(t) || /^\W{0,2}\s*Currency$/i.test(t);
  /* Skip the entries WE added. They read as currency labels, so on the second
     pass (this runs again once the theme's own scripts have built their
     control) each one was treated as another switcher and had the whole menu
     appended to it again — four copies of the currency list in the topbar. */
  const labels = $$('a, span, button, div, li').filter((el) => {
    if (el.dataset.merchCurrency || el.closest('[data-merch-currency]')) return false;
    const t = ownText(el);
    return t && t.length <= 34 && isLabel(t);
  });
  if (!labels.length) return;

  let list = null;
  try { list = await api.currencies(); } catch { return; }
  const base = list?.base || { code: CURRENCY.code, symbol: CURRENCY.symbol };
  const others = list?.currencies || [];
  const active = DISPLAY || base;

  /* Rewrite the code and the symbol inside whatever wording the theme used,
     so "$ USD" becomes "₹ INR" and a plain "USD" becomes "INR". A label that
     also names a country is left alone — "United States (INR ₹)" would be a
     worse lie than the one we are fixing. */
  const retitle = (el, cur) => {
    const t = ownText(el);
    if (/united states|united kingdom|india|emirates|singapore|japan|canada|australia/i.test(t)) return;
    let next = t.replace(CODE_RE, cur.code).replace(/[$£€₹]|د\.إ/g, cur.symbol || '');
    /* A label reading "$ Currency" carries no code, but its SYMBOL is still
       the template's dollar over a rupee shop. Swap the symbol, keep the word. */
    if (!CODE_RE.test(t)) next = t.replace(/[$£€₹]|د\.إ/g, cur.symbol || '');
    if (next !== t) setText(el, next);
  };
  for (const el of labels) retitle(el, active);

  /* Nothing to switch to: the control is a lie, so take the menu off. */
  if (!others.length) {
    for (const el of labels) {
      const menu = el.closest('li, .dropdown, .currency-switcher');
      const sub = menu?.querySelector('ul, .dropdown-menu, .submenu');
      if (sub) remove(sub);
      if (menu) menu.style.pointerEvents = 'none';
    }
    return;
  }

  /* The theme's own menu, filled with the currencies the merchant enabled.
     Only entries that already look like a currency are touched — these menus
     carry languages in the same list. */
  const choices = [base, ...others.filter((c) => c.code !== base.code)];
  for (const el of labels) {
    const menu = el.closest('li, .dropdown, .currency-switcher, .header-currency');
    const items = menu ? $$('.dropdown-item, .dropdown-menu a, ul li a', menu).filter((a) => CODE_RE.test(ownText(a) || a.textContent || '')) : [];
    if (!items.length) continue;
    const template = items[0];
    const parent = template.parentElement;
    const unit = parent && parent.tagName === 'LI' ? parent : template;
    const host = unit.parentElement;
    if (!host || CURRENCY_MENUS.has(host)) continue;   // once per menu, per page
    CURRENCY_MENUS.add(host);
    items.forEach((a) => remove(a.parentElement?.tagName === 'LI' ? a.parentElement : a));

    for (const cur of choices) {
      const node = unit.cloneNode(true);
      const a = node.matches('a') ? node : node.querySelector('a');
      if (!a) continue;
      node.dataset.merchCurrency = '1';
      a.dataset.merchCurrency = '1';
      setText(a, (cur.symbol ? cur.symbol + ' ' : '') + cur.code);
      a.setAttribute('href', '#');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const pick = cur.code === base.code ? null : { code: cur.code, symbol: cur.symbol, rate: cur.rate };
        try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(pick)); } catch { /* private window */ }
        location.reload();
      });
      host.appendChild(node);
    }
  }
}

/* Prices are quoted, and money is taken, in the store's OWN currency — the
   catalogue has no currency parameter. So the pages where the shopper agrees
   to an amount always show that currency, whatever they are browsing in. */
function displayCurrencyFor(role) {
  if (['checkout', 'order', 'orderDetail', 'invoice', 'track'].includes(role)) return null;
  return readDisplayCurrency();
}

/* A list that came back empty. Rather than invent a message in our own styling,
   hide the grid and reveal whatever the theme already ships for this — and if
   it ships nothing, put the sentence where the grid was, unstyled. */
function renderEmpty(container, message, spec) {
  if (!container) return;
  const own = pick('.no-results|.empty-state|.wrap-empty_text|.cart-empty', container.parentElement || document);
  if (own) { show(own, true); show(container, false); return; }

  /* Take out the ITEMS and nothing else. Replacing everything in the
     container destroyed whatever else lived there — on the account page that
     was the "add an address" FORM, so a shopper with no addresses yet was
     shown "No saved addresses" and given no way to add one. */
  if (spec?.card) pickAll(spec.card, container).forEach((el) => remove(unitOf(el, spec, container)));
  else if (!pick('form', container)) container.replaceChildren();

  if (pick('.merch-empty', container)) return;
  const p = document.createElement('p');
  p.className = 'merch-empty';
  p.style.cssText = 'padding:24px 0;';
  p.textContent = message;
  container.insertBefore(p, container.firstChild);
}

/* ---------------------------------------------------------------------------
   10. THE PAGES

   Each one is the same three steps: find the theme's own template, ask the
   store, clone. Nothing below knows what any theme looks like.
--------------------------------------------------------------------------- */

/* Paint a product grid into whichever container the theme names. Used by the
   listing page, the home rails, the wishlist, the collection page and the
   "related products" strip — every one of them is a list of products. */
/* Every container this page has already filled, so the sweep at the end of
   boot can tell a hydrated strip from one still showing demo stock. */
const hydrated = new WeakSet();

function renderProducts(items, spec = THEME.listing, regionEl = null) {
  const region = regionEl || pick(spec.container) || document;
  const cards = realCards(spec, region);
  if (!cards.length) { log('no product template in this region'); return null; }

  /* A "region" can hold more than one container: a list layout is often two
     columns of five, and filling each of them with the whole result set shows
     every product twice. Group the units by their real parent and give each
     container its own share, in order, so the designer's balance survives. */
  const groups = new Map();
  for (const card of cards) {
    const unit = unitOf(card, spec, region === document ? null : region);
    const parent = unit.parentElement;
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, 0);
    groups.set(parent, groups.get(parent) + 1);
  }
  const containers = [...groups.keys()];
  if (!containers.length) return null;

  if (!items.length) { renderEmpty(containers[0], 'No products found.', spec); containers.slice(1).forEach((c) => show(c, false)); return containers[0]; }

  const capacity = containers.reduce((n, c) => n + groups.get(c), 0);
  let offset = 0;
  for (const container of containers) {
    show(container, true);
    const share = containers.length === 1
      ? items.length
      : Math.round((groups.get(container) / capacity) * items.length);
    const slice = containers[containers.length - 1] === container
      ? items.slice(offset)
      : items.slice(offset, offset + share);
    offset += slice.length;

    const t = takeTemplate({ ...spec, el: container });
    if (!t) continue;
    if (!slice.length) { show(container, false); continue; }
    hydrated.add(container);
    repeat(t, slice, (node, p) => {
      node.dataset.merchId = p.id;
      fillFields(node, spec.fields, p, { node, qtyEl: pick(THEME.qtyInput, node) });
      if (p.availability === 'out') node.classList.add('out-of-stock');
    });
  }
  return containers[0];
}

/* --- QUICK VIEW ----------------------------------------------------------
   Every one of these templates puts a "Quick view" eye on each card, and every
   one of them opens the SAME hard-coded modal: "Handmade Golden Necklace,
   $70.00" on a shop that sells groceries. It is a click away from every
   product on every listing page, and nothing else on the page would tell the
   shopper the price they just saw is fiction.

   The modal is a small product page, so it takes the theme's own product
   field map — scoped to the modal instead of the document. */
/* The quick view ships its OWN gallery and its own colour and size pickers,
   neither of which the product-page selectors reach: the panel opened over a
   jar of peanut butter showing the template's fashion photography, a colour
   swatch reading "Beige" and a size run of S/M/L/XL. The pictures come from
   the product; the pickers are the template's clothing demo and come off. */
function paintQuickViewExtras(panel, p) {
  const imgs = (p.imageUrls || []).filter(Boolean);
  const items = pickAll('.quickView-item|.tf-quick-view-image .item|.tf-quick-view-image .swiper-slide', panel);
  if (items.length && imgs.length) {
    items.forEach((item, i) => {
      if (i >= imgs.length) { remove(item); return; }     // six slots, two photos
      const img = pick('img', item);
      if (!img) return;
      const url = mediaUrl(imgs[i]);
      setAttr(img, 'src', url);
      if (img.hasAttribute('data-src')) setAttr(img, 'data-src', url);
      img.removeAttribute('srcset');
      img.classList.remove('lazyload', 'lazyloading');
      img.classList.add('lazyloaded');
    });
  }
  /* Static swatches and sizes, hard-coded by the template. They describe a
     dress, and nothing in the store backs them. */
  pickAll('.tf-product-info-choose-option|.tf-product-info-variant-picker', panel).forEach(remove);
}

let quickViewProduct = null;

function wireQuickView() {
  /* A theme can ship more than one of these — fashion has a Quick View
     offcanvas AND a Quick Add modal, on the same card. Fill them all: whichever
     the shopper opens has to be the product they clicked. */
  const panels = [];
  for (const sel of ['#quickView', '#quick_view', '#quickAdd', '.product-details-popup-wrapper', '.modal-quick-view']) {
    $$(sel).forEach((el) => { if (!panels.includes(el)) panels.push(el); });
  }
  if (!panels.length || panels[0].dataset.merchQuickView) return;
  panels.forEach((el) => { el.dataset.merchQuickView = '1'; });

  /* The text fields only. Anything carrying an `action` is wired once, below,
     against whichever product is currently showing — re-running wireAction per
     open would either be ignored (it guards against double-wiring) or stack a
     handler per open. */
  const fields = Object.fromEntries(
    Object.entries(THEME.product?.fields || {}).filter(([, f]) => f && !f.action),
  );

  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest(
      '.quickview, .cta-quickview, .product-details-popup-btn, [data-quickview], ' +
      'a[href="#quickView"], a[href="#quick_view"], a[href="#quickAdd"], ' +
      '[data-bs-target="#quick_view"], [data-bs-target="#quickAdd"]',
    );
    if (!trigger) return;
    const id = trigger.closest('[data-merch-id]')?.dataset.merchId;
    if (!id) return;                       // a trigger on markup we never filled

    try {
      const p = await api.product(id);
      quickViewProduct = p;
      for (const panel of panels) {
        fillFields(panel, fields, p, { node: panel, qtyEl: pick(THEME.qtyInput, panel) });
        paintGalleryIn(panel, THEME.product?.gallery, p);
        paintQuickViewExtras(panel, p);
      }
    } catch (err) { showError(err); }
  }, true);                                 // capture, so we fill BEFORE the theme opens it

  /* One handler for the panels' own buttons, reading whatever is showing. */
  for (const modal of panels) modal.addEventListener('click', (e) => {
    const add = e.target.closest('.btn-add-to-cart, .btn-action-price, .btn-cart2, .btn-cart, .rts-btn.btn-primary, .tf-btn');
    if (!add || !quickViewProduct) return;
    if (/wish/i.test(add.className)) return;
    e.preventDefault();
    const qty = Math.max(1, Math.floor(Number(pick(THEME.qtyInput, modal)?.value) || 1));
    if (quickViewProduct.availability === 'out') return notify('That one is sold out.', 'error');
    cart.add(quickViewProduct, qty);
    notify(quickViewProduct.name + ' added to your cart.', 'success');
    track('add_to_cart', { itemId: quickViewProduct.id, qty, via: 'quickview' });
  });
}

const pages = {};

/* --- HOME ----------------------------------------------------------------
   The home page is the MERCHANT's: /api/homepage returns their ordered
   sections, already resolved. We map each section onto the rail the theme
   already has in that position, so a merchant reordering their sections
   reorders the shop without anyone touching HTML. */
pages.home = async () => {
  let data = null;
  try { data = await api.homepage(); } catch (e) { warn('homepage', e); }

  /* Look up the containers AFTER the fetch, never before it.

     A theme whose main.js runs at parse time (jewellery's does — there is no
     ready wrapper) has already handed its rails to Slick by the time our
     answer arrives, and Slick REBUILDS the DOM: the elements we would have
     captured a moment earlier are detached, so every render goes into a node
     nobody can see. On that theme it left 93 of 99 products showing demo
     prices, with no error anywhere.

     A DOM reference held across an `await` is a reference to the page as it
     WAS. Take it after. */
  const rails = productContainers();
  const filled = new Set();

  /* The merchant's own ordered sections. These are the types the store
     actually emits. A plausible guess like 'rail' or 'category-products'
     matches NOTHING and leaves the whole home page showing demo products,
     which looks exactly like a working shop. */
  const PRODUCT_SECTIONS = new Set([
    'featuredProducts', 'bestSellers', 'newArrivals', 'homepageProducts', 'recentlyViewed', 'categoryProducts',
  ]);
  const sections = (data?.sections || []).filter(
    (sec) => PRODUCT_SECTIONS.has(sec.type) && ((sec.products?.length || 0) > 0 || (sec.groups?.length || 0) > 0),
  );

  /* One section per rail the theme ships, in the merchant's order. A theme
     with more rails than the merchant has sections keeps its own content in
     the extras rather than showing an empty strip. */
  let railIndex = 0;
  for (const sec of sections) {
    const groups = sec.groups?.length ? sec.groups : [{ title: sec.title, products: sec.products || [] }];
    for (const g of groups) {
      const rail = rails[railIndex];
      if (!rail) break;
      const size = Math.min(24, Math.max(4, templateCount({ ...THEME.listing, el: rail }) || 8));
      const items = (g.products || []).slice(0, size);
      if (!items.length) continue;
      renderProducts(items, THEME.listing, rail);
      setSectionHeading(rail, g.title || sec.title);
      filled.add(rail);
      railIndex++;
    }
  }

  /* No homepage sections configured at all: fill the first rail, so a shop is
     never blank on its own front page. */
  if (!railIndex && rails.length) {
    try {
      const size = Math.min(24, Math.max(4, templateCount({ ...THEME.listing, el: rails[0] }) || 8));
      const res = await api.catalog({ pageSize: size });
      renderProducts(Array.isArray(res) ? res : res.products || [], THEME.listing, rails[0]);
    } catch (e) { warn(e); }
  }

  paintBanners(data);
  paintCategoryTiles(data);
  await renderRecentlyViewed(rails[rails.length - 1]);
  await paintBlogStrip(4);
  wireQuickView();
};

/* The strip's own heading, which lives OUTSIDE the container. Searching from a
   shared ancestor without that constraint finds a product card's `.title`
   inside the strip and writes the section name into a product. */
function setSectionHeading(container, title) {
  if (!title) return;
  let scope = container;
  for (let i = 0; i < 5 && scope.parentElement; i++) {
    scope = scope.parentElement;
    const heading = pickAll('h1|h2|h3|h4|.section-title|.title-area .title', scope)
      .find((el) => !container.contains(el));
    if (heading) { setText(heading, title); return; }
    if (scope.matches('section, .rts-section, .section')) break;
  }
}

/* The merchant's own hero artwork, copy and links — a `banner` section is
   { id, title, imageUrl, imageMobileUrl, link, alt }. The slider is rebuilt
   from the theme's own slide, so a merchant with one banner gets one slide and
   a merchant with four gets four; the slider is built to handle any count, and
   refreshSwipers() tells it what changed.

   Left alone, a hero is the loudest lie on the page: full-width demo artwork
   reading "Get up to 30% off on your first $150 purchase". */
function paintBanners(data) {
  /* The hero is the loudest thing on the page, so it follows the flag: with
     the template owning the look, its own artwork stays. */
  if (!useStore('banners')) return;
  let banners = (data?.sections || []).filter((x) => x.type === 'banner').flatMap((x) => x.banners || []);

  /* No banner sections, but the merchant filled in the Hero block in
     Appearance. It is the same thing wearing different field names, so it gets
     the same slot rather than being ignored while the template's artwork
     claims to be theirs. */
  const hero = STORE?.hero;
  if (!banners.length && hero && (hero.headline || hero.imageUrl)) {
    banners = [{
      title: hero.headline || '',
      alt: hero.subtext || '',
      imageUrl: hero.imageUrl || '',
      link: hero.ctaHref || '/shop',
    }];
  }

  const spec = THEME.banners;
  if (!spec) return;
  const t = takeTemplate(spec);
  if (!t) return;
  if (!banners.length) {
    /* No banners configured: hide the hero rather than leave the theme's. */
    const section = t.container.closest('section, .tf-slideshow, .slider-area, .rts-banner-area-one') || t.container;
    show(section, false);
    return;
  }
  repeat(t, banners, (node, b) => fillFields(node, spec.fields, b, { node }));
}

/* "Browse categories" — { slug, name, count, imageUrl }. Every theme ships a
   strip of these pointing at demo pages; each one becomes a real filter. */
function paintCategoryTiles(data) {
  const cats = (data?.sections || [])
    .filter((x) => x.type === 'browseCategories')
    .flatMap((x) => x.categories || []);
  const spec = THEME.categories;
  if (!spec || !cats.length) return;
  /* A home page often carries the SAME strip twice (a compact one in the
     header band and a full one below). Filling only the first leaves the
     other insisting the shop sells Organic Vegetable. */
  for (const el of productContainers(spec)) {
    const t = takeTemplate({ ...spec, el });
    if (!t) continue;
    /* Never more tiles than the strip was laid out for: these sit on one row,
       and forty of them is not a design. */
    const room = Math.max(1, templateCount({ ...spec, el }));
    repeat(t, cats.slice(0, Math.max(room, Math.min(cats.length, room * 2))), (node, c) => {
      fillFields(node, spec.fields, c, { node });
    });
  }
}

/* Blog posts on pages outside the blog archive - e.g. the home page's
   "Latest Blog Post Insights" strip. Shown with at most `max` posts (default 4). */
const hydratedBlogs = new WeakSet();
async function paintBlogStrip(max = 4) {
  const spec = THEME?.blog;
  if (!spec) return;
  const cards = pickAll(spec.card);
  if (!cards.length) return;

  const containers = productContainers(spec).filter((el) => !hydratedBlogs.has(el));
  if (!containers.length) return;

  let posts = [];
  try { posts = (await api.blog()) || []; } catch (e) { return warn('blog strip', e); }

  if (!posts.length) {
    containers.forEach((el) => show(el.closest('section, .section, .rts-section, .blog-area-start') || el, false));
    return;
  }

  for (const el of containers) {
    hydratedBlogs.add(el);
    const t = takeTemplate({ ...spec, el });
    if (!t) continue;
    repeat(t, posts.slice(0, max), (node, post) => {
      node.dataset.merchSlug = post.slug;
      fillFields(node, spec.fields, post, { node });
    });
  }
}

/* A banner's link may be absolute, a mailto/tel, or a store-relative path. The
   two paths the store owns are mapped onto THIS theme's pages; anything else
   is left exactly as the merchant wrote it. */
function storeLink(link) {
  if (!link) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(link)) return link;

  const collection = link.match(/^\/collections\/([^/?#]+)/);
  if (collection) return pageUrl('listing', { collection: collection[1] });
  const product = link.match(/^\/product\/([^/?#]+)/);
  if (product) return pageUrl('product', { id: product[1] });
  const category = link.match(/^\/(?:shop|category|collections)\/?$/) ? '' : null;
  if (category !== null) return pageUrl('listing');

  /* The merchant writes these against their OWN storefront's routes. Left as
     sent, a hero button reading "Shop Now" goes to /shop — a 404 on a folder
     of static pages. Map the ones the store owns; leave the rest alone, since
     a merchant may well be linking somewhere real. */
  const known = { '/cart': 'cart', '/checkout': 'checkout', '/account': 'account', '/orders': 'orders', '/track': 'track', '/wishlist': 'wishlist', '/blog': 'blog' };
  const role = known[link.replace(/\/$/, '')];
  if (role) return pageUrl(role);
  return link;
}

async function renderRecentlyViewed(container) {
  if (!container) return;
  try {
    const seen = (await api.recentlyViewed(sessionId(), 8))?.products || [];
    /* Worth a rail only once there is something in it. On a first visit a
       strip of "recently viewed" products the shopper has never seen is a lie. */
    if (seen.length >= 2) renderProducts(seen, THEME.listing, container);
  } catch { /* a rail that will not load simply stays as the theme shipped it */ }
}

/* --- LISTING -------------------------------------------------------------
   Search, category, brand, sort, price and in-stock, all held in the URL so a
   filtered grid can be linked, bookmarked and gone Back to. */
pages.listing = async () => {
  /* A listing page usually ships the SAME products twice — once as a grid and
     once as a list, behind the theme's own view toggle. Hydrating only the
     first leaves the other showing demo data, one click away.

     The theme's own grid also decides the page size: a page laid out for 15
     cards asks for 15. */
  /* Measured before the first fetch only to size the request; the containers
     themselves are looked up again after every answer, because the theme's own
     scripts may rebuild them in between (see pages.home). */
  const pageSize = Math.min(60, Math.max(8, Math.max(
    0, ...pickAll(THEME.listing.container).map((el) => templateCount({ ...THEME.listing, el })),
  ) || 24));

  const state = {
    q: param('q') || '',
    category: param('category') || '',
    brand: param('brand') || '',
    color: param('color') || '',
    size: param('size') || '',
    collection: param('collection') || '',
    sort: param('sort') || '',
    minPrice: param('minPrice') || '',
    maxPrice: param('maxPrice') || '',
    inStock: param('inStock') === 'true',
    page: Number(param('page') || 1),
  };

  const run = async () => {
    let res;
    try {
      res = state.collection
        ? (await api.collection(state.collection)).products
        : await api.catalog({
            /* The store calls it `search`. A `q=` is silently IGNORED, which
               reads as "the shop has everything": a narrowing question
               answered with the full catalogue. */
            search: state.q || undefined,
            pageSize,
            category: state.category || undefined,
            brand: state.brand || undefined,
            sort: state.sort || undefined,
            minPrice: state.minPrice || undefined,
            maxPrice: state.maxPrice || undefined,
            inStock: state.inStock || undefined,
            color: state.color || undefined,
            size: state.size || undefined,
            page: state.page > 1 ? state.page : undefined,
          });
    } catch (e) { showError(e); return; }
    const items = Array.isArray(res) ? res : (res.products || res.items || []);
    for (const grid of pickAll(THEME.listing.container)) renderProducts(items, THEME.listing, grid);
    wireQuickView();
    paintResultCount(items, state, pageSize);
    THEME.reinit?.();
  };

  wireSearchInputs((q) => { state.q = q; state.page = 1; pushState(state); run(); });
  wireSortSelects((sort) => { state.sort = sort; state.page = 1; pushState(state); run(); });
  wireCategoryLinks();
  wirePagination(state, run, pageSize);
  wirePriceFilter(state, run);
  wireStockFilter(state, run);
  await paintFilters(state, run);
  await run();
};

/* Every theme ships a static pager. We keep its markup and give its numbers
   meaning; a page beyond the last simply comes back empty, which the store
   answers honestly rather than by wrapping around. */
function wirePagination(state, run, pageSize) {
  const pager = pick('.pagination|.pagination-area|.wd-navigation|.page-numbers');
  if (!pager) return;
  const links = pickAll('a, li', pager).filter((el) => /^\d+$|prev|next|\u2039|\u203A/i.test((el.textContent || '').trim()));
  for (const el of links) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const label = (el.textContent || '').trim().toLowerCase();
      if (/prev|\u2039/.test(label)) state.page = Math.max(1, state.page - 1);
      else if (/next|\u203A/.test(label)) state.page += 1;
      else if (/^\d+$/.test(label)) state.page = Number(label);
      else return;
      pushState(state);
      run();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

/* The price slider every one of these themes ships. We read whatever it ends
   up with rather than driving it, because each theme uses a different widget
   and re-implementing four of them would change how they feel. */
function wirePriceFilter(state, run) {
  const apply = pick('.price-filter button|.filter-btn|.button-area .rts-btn');
  const from = pick('.price-range .from|#slider-range-value1|input[name="min_price"]');
  const to = pick('.price-range .to|#slider-range-value2|input[name="max_price"]');
  if (!apply || (!from && !to)) return;
  apply.addEventListener('click', (e) => {
    e.preventDefault();
    const num = (el) => { const n = Number(String(el?.textContent || el?.value || '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : ''; };
    state.minPrice = num(from);
    state.maxPrice = num(to);
    state.page = 1;
    pushState(state);
    run();
  });
}

/* /api/catalog answers a plain array with no total, so the honest number for
   "N products found" comes from the facets endpoint, which counts the same
   filter. Without it we would print the PAGE size and call it the total. */
async function paintResultCount(items, state, pageSize) {
  /* Themes write this as a sentence in an unnamed <span> ("Showing 1-20 of 57
     results"), so the reliable way to find it is the SENTENCE, not a class.
     Left alone it keeps announcing the demo's 57 products forever. */
  const named = pickAll(THEME.resultCount);
  const sentence = named.length ? named : $$('*').filter(
    (el) => el.children.length === 0 && /showing\s+[\d,]+\s*[-\u2013]\s*[\d,]+\s+of\s+[\d,]+/i.test(el.textContent || ''),
  );
  if (!sentence.length) return;

  let total = items.length;
  try {
    const f = await api.facets({
      search: state.q || undefined,
      category: state.category || undefined,
      brand: state.brand || undefined,
      inStock: state.inStock || undefined,
    });
    if (Number.isFinite(f?.total)) total = f.total;
  } catch { /* the page count is a fair fallback */ }

  const from = items.length ? (state.page - 1) * pageSize + 1 : 0;
  const to = (state.page - 1) * pageSize + items.length;
  sentence.forEach((el) => setText(el, 'Showing ' + from + '\u2013' + to + ' of ' + total + ' results'));
}

function pushState(state) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(state)) {
    if (v === '' || v === false || v === 1) url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  }
  history.replaceState(null, '', url);
}

/* Themes put a search box in the header of every page. One handler covers all
   of them, on every page, and sends the shopper to this theme's listing. */
function wireSearchInputs(onSearch) {
  const inputs = pickAll('input[placeholder*="Search" i]|input[type="search"]|.header-search-field');
  for (const input of inputs) {
    const form = input.closest('form');
    const go = (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (onSearch) onSearch(q);
      else location.href = pageUrl('listing', { q });
    };
    if (form) form.addEventListener('submit', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
  }
}

function wireSortSelects(onSort) {
  /* The store accepts price_asc, price_desc and name — nothing else. A theme's
     "Best selling" option has nothing behind it, so it sorts by name rather
     than sending a value the store will ignore. */
  const map = {
    'price, low to high': 'price_asc', 'price: low to high': 'price_asc', 'low to high': 'price_asc',
    'price, high to low': 'price_desc', 'price: high to low': 'price_desc', 'high to low': 'price_desc',
    'alphabetically, a-z': 'name', 'name': 'name', 'a to z': 'name',
  };
  pickAll('select.sort|select[name="sort"]|.sort-by select|.nice-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const label = (sel.options?.[sel.selectedIndex]?.text || '').trim().toLowerCase();
      onSort(map[label] || '');
    });
  });
  /* Themes that render sorting as a list of links rather than a <select>. */
  pickAll('.sort-list a|.dropdown-menu a[data-sort]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onSort(a.dataset.sort || map[(a.textContent || '').trim().toLowerCase()] || '');
    });
  });
}

/* The category menus in every theme's header are static links to demo pages.
   Point them at the real categories without touching how they look. */
async function wireCategoryLinks() {
  let cats = [];
  try { cats = await api.categories(); } catch { return; }
  /* This endpoint answers an array of plain STRINGS — category names, which
     are also what ?category= takes. There is no id or slug to look up. */
  if (!cats?.length) return;
  const known = new Map(cats.map((name) => [String(name).trim().toLowerCase(), name]));
  pickAll('.menu-item a|.sub-menu a|.category-list a|.single-category a|.categories a').forEach((a) => {
    const name = known.get((a.textContent || '').trim().toLowerCase());
    if (name) a.setAttribute('href', pageUrl('listing', { category: name }));
  });
}

/* --- PRODUCT -------------------------------------------------------------
   One product. The gallery, the variants, the reviews and the add button.
   `?id=` says which; without one we show the store's first product rather
   than leaving the theme's demo copy on screen pretending to be real. */
pages.product = async () => {
  const id = param('id');
  let p;
  try {
    const first = id ? null : await api.catalog({ pageSize: 1 });
    p = id ? await api.product(id) : (Array.isArray(first) ? first : first?.products || [])[0];
  } catch (e) { return showError(e); }
  if (!p) return;

  const spec = THEME.product;
  fillFields(document, spec.fields, p, { node: document, qtyEl: pick(THEME.qtyInput) });
  document.title = p.name + document.title.replace(/^[^|–-]*/, '');

  paintGallery(spec.gallery, p);
  await paintVariants(spec, p);
  await paintReviews(p);
  await paintRelated(p);

  /* Tell the store it was seen, so the shopper's own recently-viewed rail
     fills as they browse. Best-effort: a failure here must never break a PDP. */
  try { wireReviewForm(p); } catch (e) { warn('review form', e); }
  api.recordView(p.id, sessionId()).catch(() => {});
  track('product_view', { itemId: p.id });
  THEME.reinit?.();
  onThemeReady(() => paintPriceButtons(p));
};

/* Any control whose LABEL carries the price. The theme rewrites these from the
   price element after it loads, so they are corrected here, last. */
function paintPriceButtons(p) {
  /* EVERY one of these, not the first selector that matches something —
     `pickAll` stops at the first non-empty list, which left the sticky bar
     still offering "Add To Cart - $79.99" under a ₹468 product. */
  const buttons = new Set();
  for (const sel of ['.btn-action-price', '.btn-add-to-cart', '.btn-main-product']) {
    $$(sel).forEach((el) => buttons.add(el));
  }
  for (const btn of buttons) {
    if (!/add to (cart|bag)/i.test(btn.textContent || '')) continue;
    setText(btn, 'Add to cart' + (p.availability === 'out' ? '' : ' - ' + money(p.price)));
    wireAction(btn, 'add', p, { node: document });
  }
}

/* Galleries are the one place where the number of nodes matters: a theme's
   slider was built around N images. We rewrite the first N and drop the rest,
   which keeps the slider's own arrows and counters honest. */
function paintGalleryIn(root, gallery, p) {
  if (!gallery) return;
  const scoped = {
    images: gallery.images, thumbs: gallery.thumbs,
  };
  const within = (sel) => pickAll(sel, root);
  paintGallery(scoped, p, within);
}

function paintGallery(gallery, p, within = (sel) => pickAll(sel)) {
  if (!gallery) return;
  const urls = (p.imageUrls || []).map(mediaUrl);
  if (!urls.length) return;
  for (const sel of [gallery.images, gallery.thumbs]) {
    const nodes = within(sel);
    if (!nodes.length) continue;
    nodes.forEach((node, i) => {
      if (i >= urls.length) {
        const slide = node.closest('.swiper-slide, .slick-slide, .item, .thumb-wrapper') || node;
        remove(slide);
        return;
      }
      /* A zoom gallery paints the visible image as a CSS BACKGROUND and keeps
         a hidden <img> for the lens. Setting only the <img> changes nothing on
         screen, so set whichever the node actually uses — and both when it
         uses both. */
      if (node.style.backgroundImage || node.tagName !== 'IMG') {
        node.style.backgroundImage = 'url(' + urls[i] + ')';
        if (node.dataset.image !== undefined) node.dataset.image = urls[i];
      }
      const img = node.tagName === 'IMG' ? node : node.querySelector('img');
      if (img) {
        setAttr(img, 'src', urls[i]);
        if (img.hasAttribute('data-src')) setAttr(img, 'data-src', urls[i]);
        img.removeAttribute('srcset');
      }
    });
  }
}

/* Variants. Where a theme has a picker we relabel its options; where it has
   none we leave the page alone and the add button sends the base item. */
/* Variants are not option combinations to be assembled: the store answers
   { groupId, title, options: [{ id, name, label, price, availability, current }] }
   and every option IS a product in its own right. Choosing one is therefore a
   navigation, not a state change — which is also why the price never has to be
   recomputed here. */
async function paintVariants(spec, p) {
  if (!spec.variants) return;
  /* `variantCount` stays 0 even for a product that IS in one of the store's
     own variant groups — the catalogue projection does not carry them — so
     gating on it meant the selector never appeared for any product. The
     endpoint answers 200 with an empty list when there is no group, so the
     honest thing is to ask, once, on the product page. */
  let group = null;
  try { group = await api.variants(p.id); } catch { return; }
  const options = group?.options || [];
  if (options.length < 2) return;

  const container = pick(spec.variants.container);
  if (!container) return;
  const picker = pickAll(spec.variants.group, container)[0];
  if (!picker) return;
  /* Hide the theme's other pickers: it ships one per option type (colour,
     size) and this store has exactly one axis. */
  pickAll(spec.variants.group, container).slice(1).forEach((el) => show(el, false));

  setText(pick('.variant-picker-label|.option-title|h6', picker), (group.title || 'Options') + ':');
  const values = pick('.variant-picker-values|select|ul', picker);
  if (!values) return;

  if (values.tagName === 'SELECT') {
    values.replaceChildren(...options.map((o) => {
      const el = document.createElement('option');
      el.value = o.id; el.textContent = o.label || o.name;
      el.selected = !!o.current;
      return el;
    }));
    values.addEventListener('change', () => { location.href = productHref({ id: values.value }); });
    return;
  }

  /* Clone the theme's own swatch — input + label, or whatever single node it
     uses — once per option. */
  const unit = [...values.children].slice(0, values.firstElementChild?.tagName === 'INPUT' ? 2 : 1);
  if (!unit.length) return;
  values.replaceChildren();
  options.forEach((o, i) => {
    const id = 'merch-variant-' + i;
    for (const proto of unit) {
      const node = proto.cloneNode(true);
      if (node.tagName === 'INPUT') { node.id = id; node.value = o.id; node.name = 'merch-variant'; node.checked = !!o.current; }
      else {
        if (node.tagName === 'LABEL') node.setAttribute('for', id);
        node.dataset.value = o.label || o.name;
        const t = pick('.text-title|.tooltip|span', node);
        setText(t || node, o.label || o.name);
        if (o.availability === 'out') node.classList.add('disabled');
      }
      node.addEventListener('click', () => { if (!o.current) location.href = productHref({ id: o.id }); });
      values.appendChild(node);
    }
  });
}

async function paintReviews(p) {
  let data = null;
  try { data = await api.reviews(p.id); } catch { return; }
  /* { summary: { average, count }, reviews: [...] } — not a bare array. */
  const reviews = data?.reviews || [];
  const summary = data?.summary || { average: 0, count: 0 };

  pickAll('.rating-count|.review-count|[data-review-count]').forEach((el) => setText(el, summary.count + ' Reviews'));
  pickAll('.rating-average|[data-review-average]').forEach((el) => setText(el, (summary.average || 0).toFixed(1)));

  const spec = { container: '.review-list|.product-reviews|.comment-list|.tab-reviews', card: '.review-item|.single-review|li' };
  const t = takeTemplate(spec);
  if (!t) return;
  if (!reviews.length) return renderEmpty(t.container, 'No reviews yet.', spec);
  repeat(t, reviews, (node, r) => {
    setText(pick('.review-author|.author|h5|h6', node), r.author || r.name || 'Verified buyer');
    setText(pick('.review-body|.comment-text|p', node), r.body || r.comment || '');
    setText(pick('.review-date|.date', node), r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '');
  });
}

/* The review form every product template ships. Without this it looks like a
   shopper can leave a review and nothing happens when they press send. */
function wireReviewForm(product) {
  for (const form of $$('form')) {
    const body = pick('textarea', form);
    if (!body) continue;
    if (!/review|comment|rating/i.test(form.className + ' ' + (form.id || '') + ' ' + (body.placeholder || '') + ' ' + (form.closest('[class*="review"], [id*="review"]') ? 'review' : ''))) continue;
    if (form.dataset.merchReview) continue;
    form.dataset.merchReview = '1';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = pick('input[type="text"]', form)?.value.trim();
      const email = pick('input[type="email"]', form)?.value.trim();
      /* Themes draw the stars as radios, or as a row of links with an index. */
      const checked = pickAll('input[type="radio"]', form).find((r) => r.checked);
      const rating = Number(checked?.value) || Number(form.dataset.merchRating) || 5;
      if (!body.value.trim()) return notify('Please write your review first.', 'error');
      try {
        await api.postReview(product.id, { rating, title: '', body: body.value.trim(), author: name || '', email: email || '' });
        notify('Thank you — your review has been sent.', 'success');
        form.reset();
      } catch (err) { showError(err); }
    });

    /* Star widgets that are not radios: remember which one was pressed. */
    pickAll('.rating a, .rating-stars a, .stars a, .rate a', form).forEach((a, i) => {
      a.addEventListener('click', (e) => { e.preventDefault(); form.dataset.merchRating = String(i + 1); });
    });
  }
}

async function paintRelated(p) {
  /* "Related products" is the last strip on a product page. */
  const rail = productContainers().pop();
  if (!rail) return;
  try {
    const size = Math.min(16, Math.max(4, templateCount({ ...THEME.listing, el: rail }) || 8));
    const res = await api.catalog({ category: p.category, pageSize: size + 1 });
    const items = (Array.isArray(res) ? res : res.products || []).filter((x) => x.id !== p.id).slice(0, size);
    if (items.length) renderProducts(items, THEME.listing, rail);
  } catch { /* related is a nicety; never let it fail a product page */ }
}

/* --- CART ----------------------------------------------------------------
   What the shopper has, priced by the store rather than by us. The coupon and
   gift card they enter here are carried to checkout in sessionStorage — the
   only figures that count are the ones the store returns at checkout. */

const PENDING_KEY = 'merch.pending';
const pending = {
  get: () => { try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || '{}'); } catch { return {}; } },
  set: (patch) => {
    const next = { ...pending.get(), ...patch };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  },
  clear: () => { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } },
};

pages.cart = async () => {
  const spec = THEME.cart;
  const lines = await cart.refresh();

  const draw = () => {
    const t = takeTemplate(spec);
    const current = cart.lines();
    if (!t) return;
    if (!current.length) {
      renderEmpty(t.container, 'Your cart is empty.');
      paintCartTotals(spec, current);
      try { paintFreeShippingBar(current); } catch (e) { warn('free-shipping bar', e); }
      return;
    }
    repeat(t, current, (node, l) => {
      node.dataset.merchId = l.itemId;
      fillFields(node, spec.fields, l, { node, rerender: draw });
    });
    wireQuantityWidgets(t.container, draw);
    paintCartTotals(spec, current);
    try { paintFreeShippingBar(current); } catch (e) { warn('free-shipping bar', e); }
    paintHeader();
    THEME.reinit?.();
  };

  draw();
  wireCoupon(spec, draw);
  wireGiftCard(spec, draw);

  /* "Proceed to checkout" is a link on some themes and a plain <button> on
     others — a <button> outside a form goes NOWHERE on its own, so the button
     the designer drew has to be given the navigation as well as the guard. */
  pickAll(spec.checkoutBtn).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!cart.count()) { e.preventDefault(); notify('Your cart is empty.', 'error'); return; }
      const href = btn.tagName === 'A' ? (btn.getAttribute('href') || '') : '';
      if (/checkout/i.test(href)) return;        // already points at the right page
      e.preventDefault();
      location.href = pageUrl('checkout');
    });
  });

  cart.onChange(() => paintHeader());
};

/* --- THE FILTER SIDEBAR ---------------------------------------------------
   Every template ships one, listing brands and categories its designer made
   up — "Bags (112)", "Clothing (42)" — and clicking them did nothing at all.
   `/api/catalog/facets` has the real ones with real counts; it was already
   being called for the result count and otherwise thrown away.

   The themes structure these sidebars completely differently, so the group is
   found by its HEADING — the one thing they agree on, because the words are
   the designer's statement of intent — and each option row is cloned from the
   theme's own. */
const FILTER_GROUPS = [
  { key: 'category', rx: /categor/i,            values: (f) => (f.categories || []).map((c) => ({ value: c.name, label: c.name, count: c.count })) },
  { key: 'brand',    rx: /brand|manufacturer/i, values: (f) => (f.brands || []).map((b) => ({ value: b.slug || b.name, label: b.name, count: b.count })) },
  { key: 'size',     rx: /size|weight/i,        values: (f) => attrValues(f, 'size') },
  { key: 'color',    rx: /colou?r/i,            values: (f) => attrValues(f, 'color') },
];

function attrValues(facets, key) {
  const group = (facets.attributes || []).find((a) => (a.key || '').toLowerCase() === key);
  return (group?.values || []).map((v) => ({ value: v.value, label: v.value, count: v.count }));
}

async function paintFilters(state, run) {
  let facets = null;
  try { facets = await api.facets({ search: state.q || undefined, category: state.category || undefined }); }
  catch { return; }
  if (!facets) return;

  for (const group of FILTER_GROUPS) {
    const values = group.values(facets);
    if (!values.length) continue;
    const scope = filterGroupScope(group.rx);
    if (!scope) continue;
    paintFilterGroup(scope, group, values, state, run);
  }

  /* The price slider's ends should be the shop's real range, not $10-$90. */
  const price = facets.price;
  if (price && Number.isFinite(price.min) && Number.isFinite(price.max)) {
    pickAll('.filter-value-min-max span|.price-range|.widget-price .title-price').forEach((el) => {
      if (/\d/.test(el.textContent || '')) setText(el, 'Price: ' + money(price.min) + ' — ' + money(price.max));
    });
    $$('input[type="range"]').forEach((r) => { r.min = String(Math.floor(price.min)); r.max = String(Math.ceil(price.max)); });
  }
}

/* The block that holds one group's options, found from its heading. */
function filterGroupScope(rx) {
  const heads = $$('h1,h2,h3,h4,h5,h6,.facet-title,.sidebar-title,.widget-title,legend,button')
    .filter((el) => el.children.length <= 2 && rx.test((el.textContent || '').trim()));
  for (const head of heads) {
    if (head.closest('header, footer, nav')) continue;
    const box = head.closest('.single-filter-box, .facet, .sidebar-single, .widget, .filter-group, .collapse-item, .tf-filter-group')
      || head.parentElement;
    if (!box) continue;
    /* The list is whichever descendant holds more than one option row. */
    const list = [...box.querySelectorAll('*')].find(
      (el) => el.children.length > 1
        && [...el.children].filter((c) => c.querySelector('input[type="checkbox"], input[type="radio"], a, label')).length > 1,
    );
    if (list) return list;
  }
  return null;
}

function paintFilterGroup(list, group, values, state, run) {
  if (list.dataset.merchFilter === group.key) return;
  list.dataset.merchFilter = group.key;

  const sample = [...list.children].find((c) => c.querySelector('input, a, label')) || list.firstElementChild;
  if (!sample) return;
  const template = sample.cloneNode(true);

  /* Never more rows than the designer laid out room for — these sidebars are
     a fixed column, and 100 brands is a scroll, not a filter. */
  const room = Math.max(6, [...list.children].length);
  const shown = values.slice(0, Math.min(values.length, Math.max(room, 12)));

  list.replaceChildren();
  for (const v of shown) {
    const node = template.cloneNode(true);
    const input = node.querySelector('input[type="checkbox"], input[type="radio"]');
    const label = node.querySelector('label') || node.querySelector('a') || node;

    if (input) {
      const id = 'merch-' + group.key + '-' + v.value.replace(/[^\w-]+/g, '-').toLowerCase();
      input.id = id;
      input.checked = String(state[group.key] || '') === String(v.value);
      if (label.tagName === 'LABEL') label.setAttribute('for', id);
    }
    setText(label, v.count ? `${v.label} (${v.count})` : v.label);
    if (label.tagName === 'A') label.setAttribute('href', pageUrl('listing', { [group.key]: v.value }));

    const choose = (e) => {
      e.preventDefault();
      /* The store takes ONE value per filter, so picking another replaces it
         and picking the current one clears it. */
      const already = String(state[group.key] || '') === String(v.value);
      state[group.key] = already ? '' : v.value;
      state.page = 1;
      pushState(state);
      run();
      pickAll('input', list).forEach((i) => { i.checked = false; });
      if (input && !already) input.checked = true;
    };
    (input || label).addEventListener('click', choose);
    if (input) input.addEventListener('change', choose);
    list.appendChild(node);
  }
}

/* "In stock only" — a checkbox every theme has somewhere near the filters. */
function wireStockFilter(state, run) {
  const boxes = $$('input[type="checkbox"]').filter((el) => {
    const row = el.closest('li, .single-category, .facet, label, div');
    return /in stock|availability|stock only/i.test(row?.textContent || '');
  });
  for (const box of boxes) {
    box.checked = state.inStock;
    box.addEventListener('change', () => {
      state.inStock = box.checked;
      state.page = 1;
      pushState(state);
      run();
    });
  }
}

/* Every theme builds its quantity stepper differently, and every one of them
   already updates its own <input>. Rather than re-implement four steppers, we
   listen to the input and let the theme do the pressing. The click handler
   reads the value AFTER the theme's own handler has run. */
function wireQuantityWidgets(container, rerender) {
  const idOf = (el) => el.closest('[data-merch-id]')?.dataset.merchId;

  container.addEventListener('change', (e) => {
    const input = e.target.closest('input');
    if (!input) return;
    const id = idOf(input);
    if (!id) return;
    cart.setQty(id, input.value);
    rerender();
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .btn-quantity, .qtybtn, .button, .quantity-button');
    if (!btn) return;
    const box = btn.closest('.quantity-edit, .wg-quantity, .pro-qty, .quantity, .cart-counter-action');
    const input = box?.querySelector('input');
    if (!input) return;
    const id = idOf(input);
    if (!id) return;

    /* Which way this button goes. Themes say it with a class, a data attribute
       or just the character on the face of the button. */
    const label = (btn.className + ' ' + (btn.dataset.action || '') + ' ' + btn.textContent).toLowerCase();
    const delta = /plus|increase|increment|\bup\b|\+/.test(label) ? 1
      : /minus|decrease|decrement|\bdown\b|-/.test(label) ? -1
      : 0;

    const before = Number(input.value) || 1;

    /* The theme's own stepper handler was bound to the nodes that were on the
       page when its main.js ran — which we have since replaced. So the button
       it drew is now inert, and reading the input after the click reads the
       same number back. Give the theme a tick to prove it still works, and
       step the value ourselves only when it did not.

       Doing it unconditionally would double every press on a theme whose
       handler IS still live (anything loaded with type="text/merch-deferred",
       or delegated from document). */
    setTimeout(() => {
      let next = Number(input.value) || before;
      if (next === before && delta) {
        next = Math.max(1, Math.min(99, before + delta));
        input.value = next;
      }
      if (next !== before) { cart.setQty(id, next); rerender(); }
    }, 0);
  });
}

/* "Add $59.69 to cart and get free shipping" — every one of these templates
   ships a line like it, with a progress bar, quoting a figure the template's
   designer made up. The store knows the real threshold. */
function paintFreeShippingBar(lines) {
  const free = Number(STORE?.shipping?.freeAbove) || 0;
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);

  const notes = $$('p, span, div').filter(
    (el) => el.children.length === 0 && /free (shipping|delivery)/i.test(el.textContent || ''),
  );
  const bars = $$('.progress-bar, .progress .bar, .tf-progress-bar > div');

  /* The merchant has not set a threshold: the promise is not theirs to make. */
  if (!free) {
    notes.forEach((el) => show(el.closest('.cart-top-area-note, .free-shipping, .tf-progress-msg') || el, false));
    bars.forEach((el) => show(el.closest('.progress, .tf-progress-bar') || el, false));
    return;
  }

  const left = Math.max(0, free - subtotal);
  notes.forEach((el) => {
    setText(el, left > 0
      ? 'Add ' + money(left) + ' more to your cart and get free delivery'
      : 'Your order qualifies for free delivery');
  });
  bars.forEach((el) => { el.style.width = Math.min(100, Math.round((subtotal / free) * 100)) + '%'; });
}

async function paintCartTotals(spec, lines) {
  const t = spec.totals || {};
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  pickAll(t.subtotal).forEach((el) => setText(el, money(subtotal)));

  const p = pending.get();
  let discount = 0;
  if (p.coupon && lines.length) {
    try {
      const res = await api.validateCoupon(p.coupon, cart.apiLines());
      /* A coupon the store will not honour answers 200 with `valid: false` and
         a reason. It does NOT throw. Reading only the amount leaves a dead
         code applying nothing while the shopper believes it held. */
      if (res.valid) discount = res.discountAmount || 0;
      else {
        pending.set({ coupon: null, discount: 0 });
        notify(res.reason || 'That coupon is no longer valid.', 'error');
      }
    } catch (e) {
      pending.set({ coupon: null, discount: 0 });
      if (e instanceof ApiError) notify(e.message, 'error');
    }
  }
  pending.set({ discount });
  /* Discounts the MERCHANT set up, which apply with no code typed: a
     percentage off a category, a buy-two-get-one. The shopper never asks for
     these, so a cart that ignores them quietly overcharges. */
  if (lines.length) {
    const apiLines = cart.apiLines();
    const [auto, bxgy] = await Promise.all([
      api.autoDiscount(apiLines).catch(() => null),
      api.bxgy(apiLines).catch(() => null),
    ]);
    discount += Number(auto?.discountAmount ?? auto?.discount ?? 0) || 0;
    discount += Number(bxgy?.discountAmount ?? bxgy?.discount ?? 0) || 0;
  }

  pickAll(t.discount).forEach((el) => setText(el, discount ? '-' + money(discount) : money(0)));
  pickAll(t.shipping).forEach((el) => setText(el, p.shipping == null ? 'Calculated at checkout' : (p.shipping ? money(p.shipping) : 'Free')));
  pickAll(t.total).forEach((el) => setText(el, money(Math.max(0, subtotal - discount + (p.shipping || 0)))));
}

function wireCoupon(spec, rerender) {
  const c = spec.coupon;
  if (!c) return;
  const input = pick(c.input);
  const button = pick(c.button);
  if (!input || !button) return;
  const saved = pending.get().coupon;
  if (saved) input.value = saved;
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code) return notify('Enter a coupon code.', 'error');
    if (!cart.count()) return notify('Add something to your cart first.', 'error');
    try {
      const res = await api.validateCoupon(code, cart.apiLines());
      if (!res.valid) {
        pending.set({ coupon: null, discount: 0 });
        /* One box, two kinds of code: the shopper does not know or care which
           of the two the merchant issued them. Try the other before refusing. */
        if (await applyGiftCard(code, rerender)) return;
        return notify(res.reason || 'That code cannot be used.', 'error');
      }
      pending.set({ coupon: code, discount: res.discountAmount || 0 });
      notify('Coupon applied — ' + money(res.discountAmount) + ' off.', 'success');
      rerender();
    } catch (err) { pending.set({ coupon: null, discount: 0 }); showError(err); }
  });
}

/* A dedicated gift-card box where a theme has one. NONE of the four templates
   does — they all ship a single "coupon code" field — so a code typed there is
   tried as a coupon first and then as a gift card, which is what one box has
   to mean if gift cards are to work at all. */
function wireGiftCard(spec, rerender) {
  const input = pick('input[placeholder*="gift" i]|input[name="giftcard"]');
  if (!input) return;
  const button = input.closest('form')?.querySelector('button') || input.nextElementSibling;
  button?.addEventListener('click', async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (code) await applyGiftCard(code, rerender);
  });
}

async function applyGiftCard(code, rerender) {
  try {
    const res = await api.checkGiftCard(code);
    if (!res.valid) { pending.set({ giftCard: null }); notify(res.reason || 'That code is not valid.', 'error'); return false; }
    pending.set({ giftCard: code });
    notify('Gift card accepted — ' + money(res.balance) + ' available.', 'success');
    rerender();
    return true;
  } catch (err) { pending.set({ giftCard: null }); showError(err); return false; }
}

/* --- CHECKOUT ------------------------------------------------------------
   THE PART TO READ TWICE.

   Paying later and paying now take an IDENTICAL body. On the prepaid path,
   calling /api/checkout as well places a SECOND, unpaid order for the same
   basket, and nothing in the shapes will warn you.
--------------------------------------------------------------------------- */

let currentKey = null;        // ONE idempotency key per attempt-series
let moneyCaptured = false;    // once money was taken, Place order never re-arms

pages.checkout = async () => {
  const spec = THEME.checkout;
  const lines = await cart.refresh();
  if (!lines.length) {
    notify('Your cart is empty.', 'error');
    setTimeout(() => { location.href = pageUrl('cart'); }, 1200);
    return;
  }

  ensureCustomerFields(spec);
  paintCheckoutSummary(spec, lines);
  await prefillCustomer(spec);
  const paymentCfg = await paintPaymentOptions(spec);
  wireShippingQuote(spec, lines);
  wireCartSave(spec);

  const placeBtn = findPlaceButton(spec);
  if (!placeBtn) return warn('no place-order button found on this checkout');

  placeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (moneyCaptured) return;
    const problem = validateCustomer(spec);
    if (problem) return notify(problem, 'error');
    const terms = pick(spec.terms);
    if (terms && !terms.checked) return notify('Please accept the terms and conditions.', 'error');

    busy(placeBtn, true);
    try {
      const method = chosenPaymentMethod(spec, paymentCfg);
      if (method === 'online') await payNow(spec);
      else await payLater(spec);
    } catch (err) {
      if (err?.moneyCaptured) { moneyCaptured = true; notify(err.message, 'error'); }
      else if (!handleRefusal(err)) showError(err);
    } finally {
      busy(placeBtn, false);
    }
  });
};

function paintCheckoutSummary(spec, lines) {
  const s = spec.summary;
  const t = takeTemplate(s);
  if (t) repeat(t, lines, (node, l) => fillFields(node, s.fields, l, { node }));

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const p = pending.get();
  const total = Math.max(0, subtotal - (p.discount || 0) + (p.shipping || 0));
  const tt = spec.totals || {};
  pickAll(tt.subtotal).forEach((el) => setText(el, money(subtotal)));
  pickAll(tt.shipping).forEach((el) => setText(el, p.shipping == null ? 'Calculated' : (p.shipping ? money(p.shipping) : 'Free')));
  pickAll(tt.discount).forEach((el) => setText(el, p.discount ? '-' + money(p.discount) : money(0)));
  pickAll(tt.total).forEach((el) => setText(el, money(total)));

  /* Themes that lay their summary out as generic label/value rows (grocery)
     name nothing; match them by the words the designer wrote. */
  if (spec.totalsRows) {
    for (const row of pickAll(spec.totalsRows)) {
      const label = (row.textContent || '').trim().toLowerCase();
      const valueEl = pick('.price|td:last-child|span:last-child', row);
      if (!valueEl) continue;
      if (/^sub\s*total/.test(label)) setText(valueEl, money(subtotal));
      else if (/^shipping/.test(label)) setText(valueEl, p.shipping == null ? 'Calculated' : (p.shipping ? money(p.shipping) : 'Free'));
      else if (/^(total|total price|order total|grand total)/.test(label)) setText(valueEl, money(total));
    }
  }
}

/* Fill the address form from the account, so a signed-in shopper types nothing. */
async function prefillCustomer(spec) {
  const f = spec.form || {};
  const set = (key, value) => { const el = pick(f[key]); if (el && value) el.value = value; };
  if (!token.get()) return;
  try {
    const [me, addresses] = await Promise.all([api.me(), api.addresses().catch(() => [])]);
    const a = (addresses || []).find((x) => x.isDefault) || (addresses || [])[0];
    set('email', me?.email);
    const [first, ...rest] = String(me?.name || '').split(' ');
    set('firstName', first); set('lastName', rest.join(' ')); set('name', me?.name);
    set('phone', me?.phone || a?.phone);
    if (a) {
      /* A saved address is { name, phone, line, city, state, pincode } — one
         `line`, matching what checkout sends back. */
      set('address1', a.line);
      set('city', a.city); set('state', a.state); set('pincode', a.pincode);
    }
  } catch (e) { if (!(e instanceof ApiError && e.isUnauthenticated)) warn(e); }
}

/* The store's customer is { name, email, phone, address, city, state, pincode }.
   The street is ONE field called `address`. A line1/line2 pair — which is the
   shape most of these themes' forms are in, and the obvious thing to send — is
   dropped in full, and the order is placed with no street on it at all. */
/* The store requires a state on every order. Two of these four checkout forms
   do not HAVE a state field — so every order placed on them came back
   `400 Your state is required.` and the shop could not take money at all.

   Rather than change the design, we clone the theme's OWN city field: same
   markup, same classes, same spacing, so it looks like the designer put it
   there — which, in every respect that matters, they did. */
/* Some templates simply have no box for something the store requires. Rather
   than refuse the shopper for a question they were never asked, copy one of
   the form's OWN fields and relabel it: same wrapper, same classes, same
   spacing, so the design is untouched and the field belongs to the theme. */
function cloneFieldAfter(source, { id, name, placeholder, label }) {
  if (!source) return null;
  const wrapper = source.closest('[class*="col-"], .form-group, .field, .tf-field, p') || source;
  const clone = wrapper.cloneNode(true);
  const input = clone.matches('input') ? clone : clone.querySelector('input');
  if (!input || !wrapper.parentElement) return null;

  input.id = id;
  input.name = name;
  input.value = '';
  input.setAttribute('placeholder', placeholder);
  input.required = true;
  input.removeAttribute('readonly');
  /* A cloned label would still say "Town / City". */
  const lbl = clone.querySelector('label');
  if (lbl) { setText(lbl, label); lbl.setAttribute('for', id); }

  wrapper.parentElement.insertBefore(clone, wrapper.nextSibling);
  return input;
}

function ensureCustomerFields(spec) {
  const form = spec.form || {};
  if (pick(form.state)) return;                     // the template has one

  const source = pick(form.city) || pick(form.pincode);
  if (!source) { warn('this checkout has no city field to model a state field on'); return; }
  const input = cloneFieldAfter(source, { id: 'merch-state', name: 'state', placeholder: 'State*', label: 'State' });
  if (!input) return;
  form.state = '#merch-state';
  log('added a state field: this template has none and the store requires one');
}

function readCustomer(spec) {
  const f = spec.form || {};
  const v = (key) => (pick(f[key])?.value || '').trim();
  const name = [v('firstName'), v('lastName')].filter(Boolean).join(' ') || v('name');
  return {
    name,
    email: v('email'),
    phone: v('phone'),
    address: [v('address1'), v('address2')].filter(Boolean).join(', '),
    city: v('city'),
    state: v('state'),
    pincode: v('pincode'),
  };
}

function validateCustomer(spec) {
  const c = readCustomer(spec);
  if (!c.name) return 'Please enter your name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return 'Please enter a valid email address.';
  if (!c.phone || c.phone.replace(/\D/g, '').length < 7) return 'Please enter a phone number we can reach you on.';
  if (!c.address) return 'Please enter your address.';
  if (!c.city) return 'Please enter your town or city.';
  if (!c.state) return 'Please enter your state.';
  if (!c.pincode) return 'Please enter your postal code.';
  return null;
}

/* The store says which methods it actually accepts. A theme's static list of
   PayPal, cheque and bank transfer is demo copy: anything the store does not
   offer is hidden rather than left there to be chosen and refused. */
async function paintPaymentOptions(spec) {
  let cfg = null;
  try { cfg = await api.paymentConfig(); } catch { /* a store with no gateway is COD-only */ }
  const online = !!cfg?.enabled;

  /* Cash on delivery is a MERCHANT setting, and it lives in Appearance, not in
     the payment config. Leaving it on for a shop that switched it off takes
     orders nobody is going to deliver. */
  const cod = STORE?.payment?.codEnabled !== false;

  const radios = pickAll(spec.paymentRadios);
  let firstVisible = null;
  let onlineTaken = false;
  for (const radio of radios) {
    const row = radio.closest('li, .single-payment-method, .payment-item') || radio.parentElement;
    const label = (row?.textContent || '').toLowerCase();
    const isCod = /cash|delivery|cod/.test(label);
    const isOnline = /card|upi|net ?bank|online|razorpay|paypal|credit|debit|stripe/.test(label);
    /* Only ONE online option survives. A theme lists PayPal, Stripe and card
       separately; this store has exactly one gateway, and leaving three
       choices that all do the same thing is a lie about what happens next. */
    const keep = (isCod && cod) || (isOnline && online && !onlineTaken);
    show(row, keep);
    if (!keep) { if (radio.checked) radio.checked = false; continue; }

    radio.dataset.merchMethod = isCod ? 'cod' : 'online';
    if (!isCod) {
      onlineTaken = true;
      /* Relabel it: "PayPal" next to a Razorpay checkout tells the shopper
         something that is not true about where their card details go. */
      const text = row.querySelector('label');
      if (text) setText(text, 'Card, UPI or net banking' + (cfg?.name ? ' \u2014 ' + cfg.name : ''));
      const blurb = row.parentElement?.querySelector('.payment-method-details p, .disc');
      if (blurb) setText(blurb, 'You will be taken to a secure payment window to finish paying.');
    }
    if (!firstVisible) { firstVisible = radio; radio.checked = true; }
  }

  /* The theme's own scripts run AFTER we hydrate, and they reset their radio
     groups — so the method we selected here is unselected a moment later, and
     the checkout falls back to whatever `chosenPaymentMethod` guesses. Assert
     it again once they have finished. */
  if (firstVisible) onThemeReady(() => { if (!pickAll(spec.paymentRadios).some((r) => r.checked)) firstVisible.checked = true; });

  /* Neither method available. Saying so beats a Place order button that can
     only ever be refused. */
  if (!firstVisible && radios.length) {
    notify('This shop is not taking orders right now.', 'error');
    pickAll(spec.placeBtn).forEach((b) => { b.disabled = true; show(b, false); });
  }
  return cfg;
}

function chosenPaymentMethod(spec, cfg) {
  const radios = pickAll(spec.paymentRadios);
  const chosen = radios.find((r) => r.checked);
  if (chosen?.dataset.merchMethod) return chosen.dataset.merchMethod;

  /* Something is checked but it is not one of ours, or nothing is: use the
     first method we actually kept rather than guessing. Guessing sent an
     order down the ONLINE path on a template where the shopper had picked
     cash on delivery. */
  const firstKept = radios.find((r) => r.dataset.merchMethod);
  if (firstKept) return firstKept.dataset.merchMethod;

  if (STORE?.payment?.codEnabled === false) return 'online';
  return cfg?.enabled ? 'online' : 'cod';
}

/* Shipping is quoted by the store from the postal code, not guessed here. */
function wireShippingQuote(spec, lines) {
  const pin = pick(spec.form?.pincode);
  if (!pin) return;
  const quote = debounce(async () => {
    const code = pin.value.trim();
    if (code.length < 4) return;
    try {
      const res = await api.shippingQuote(code, cart.apiLines(), chosenPaymentMethod(spec, null));
      /* `available: false` does NOT mean "we do not deliver there". The demo
         store answers exactly that, with `options: [{ name: "Free shipping",
         amount: 0 }]` — it means no LIVE courier rate was fetched. Reading it
         as a refusal blocks checkout on every flat-rate and free-shipping
         store there is.

         The real refusal is having no options at all. */
      const options = res.options || [];
      if (res.available === false && !options.length) {
        pending.set({ shipping: null, shippingRateId: null });
        notify(res.reason || 'We could not work out delivery for that postal code.', 'error');
      } else {
        const rate = options[0];
        /* An option's charge is `amount`; `shipping` at the top level is the
           same figure for the rate the store picked. An empty id is a real id
           here (the store's own default), so it travels as sent. */
        pending.set({
          shipping: rate ? (rate.amount ?? rate.shipping ?? 0) : (res.shipping ?? 0),
          shippingRateId: rate?.id ?? null,
        });
        paintShippingOptions(spec, res);
      }
      paintCheckoutSummary(spec, cart.lines());
    } catch (e) { if (e instanceof ApiError && e.status !== 400) warn(e); }
  }, 500);
  pin.addEventListener('input', quote);
  pin.addEventListener('blur', quote);
}

/* Hand the basket to the store once we know who is carrying it, so the
   merchant's abandoned-cart list has something in it when the shopper leaves
   without paying. Best-effort and never in the way. */
function wireCartSave(spec) {
  const email = pick(spec.form?.email);
  if (!email) return;
  let lastSaved = '';
  const save = () => {
    const value = email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || value === lastSaved || !cart.count()) return;
    lastSaved = value;
    api.saveCart(value, cart.apiLines()).catch(() => {});
  };
  email.addEventListener('blur', save);
  email.addEventListener('change', save);
}

/* When the store quotes more than one rate, relabel the theme's own shipping
   radios with what it actually offered rather than leaving "Flat Rate: $70.00"
   on screen next to a different number in the total. */
function paintShippingOptions(spec, quote) {
  const options = quote.options || [];
  const radios = pickAll('input[name="shipping"]|.shipping-type input[type="radio"]|.shipping input[type="radio"]');
  if (!radios.length || !options.length) return;
  radios.forEach((radio, i) => {
    const o = options[i];
    const row = radio.closest('li, .custom-control, .shipping-option') || radio.parentElement;
    if (!o) { show(row, false); return; }
    show(row, true);
    const label = row.querySelector('label');
    const charge = o.amount ?? o.shipping ?? 0;
    const eta = o.etaMin && o.etaMax ? ' (' + o.etaMin + '\u2013' + o.etaMax + ' days)' : '';
    if (label) setText(label, (o.name || o.courier || 'Delivery') + (charge ? ': ' + money(charge) : '') + eta);
    radio.addEventListener('change', () => {
      pending.set({ shippingRateId: o.id ?? null, shipping: charge });
      paintCheckoutSummary(spec, cart.lines());
    });
    if (i === 0) radio.checked = true;
  });
}

/* The control that places the order. Named by class where the theme gives us
   one, and otherwise by the WORDS on it — every template writes "Place Order",
   "Check Out" or "Pay Now", and two of the four give that control no class we
   could have guessed. */
const onScreen = (el) => !!el && el.offsetParent !== null;

function findPlaceButton(spec) {
  const named = pick(spec.placeBtn);
  if (onScreen(named)) return named;

  const WORDS = /^(place order|check ?out|pay now|complete order|confirm order|order now)$/i;
  const candidates = $$('a, button').filter((el) => {
    if (el.closest('header, footer, nav, .modal, .offcanvas')) return false;
    /* A button a shopper cannot see is not a button. One theme's only
       "Check Out" lives in the mini-cart DRAWER, and accepting it made the
       order look placeable while the checkout page offered nothing to press. */
    if (!onScreen(el)) return false;
    return WORDS.test((el.textContent || '').replace(/\s+/g, ' ').trim());
  });
  /* The order summary sits last on these pages, so the final match is the one
     that submits rather than a "checkout" link higher up. */
  if (candidates.length) return candidates[candidates.length - 1];
  return buildPlaceButton(spec);
}

/* No visible way to place the order. Rather than leave the shopper stuck,
   borrow the theme's OWN button — its element, its classes — and put one at
   the end of the summary, so it looks like the rest of the page. */
function buildPlaceButton(spec) {
  const host = pick(spec.summary?.container) || pick('.tf-page-checkout|.wd-form-order|.checkout-area|.cottom-cart-right-area|main');
  if (!host) { warn('this checkout has no place-order button and nowhere to put one'); return null; }
  const model = $$('a, button').find((el) => onScreen(el)
    && /\b(tf-btn|rts-btn|btn-sqr|btn-fill|btn-primary)\b/.test(el.className || '')
    && !el.closest('header, footer, nav, .offcanvas, .modal'));
  const btn = model ? model.cloneNode(true) : document.createElement('button');
  for (const a of ['href', 'data-bs-toggle', 'data-bs-target', 'data-merch-action', 'id']) btn.removeAttribute?.(a);
  btn.textContent = 'Place Order';
  btn.style.width = '100%';
  btn.style.marginTop = '16px';
  host.appendChild(btn);
  warn('this theme ships no place-order button on its checkout page; added one in the theme\u2019s own style');
  return btn;
}

function busy(btn, on) {
  btn.disabled = on || moneyCaptured;
  btn.setAttribute('aria-busy', String(on));
  if (on) { btn.dataset.merchLabel ??= btn.textContent; btn.textContent = 'Placing your order…'; }
  else if (btn.dataset.merchLabel) btn.textContent = btn.dataset.merchLabel;
}

/* The SAME body for both paths. Building it once is the honest way to show
   that the shapes really are identical. */
function orderPayload(spec, method) {
  const p = pending.get();
  return {
    lines: cart.apiLines(),
    customer: readCustomer(spec),
    paymentMethod: method,
    couponCode: p.coupon || null,
    giftCardCode: p.giftCard || null,
    /* Quote the rate back, so the shipping the shopper was shown is the
       shipping they are charged. */
    shippingRateId: p.shippingRateId || null,
    /* ONE key per checkout attempt-series: the same key returns the SAME order
       instead of creating a second one. A fresh key on every press would make
       that guarantee impossible. Replaced only after a refusal the store
       answered — a retry after a fix is a new order. */
    idempotencyKey: (currentKey ??= uuid()),
  };
}

/* Path A: pay later. One call, and the order exists. */
async function payLater(spec) {
  const result = await api.checkout(orderPayload(spec, 'cod'));
  /* The reply carries no paymentMethod: say which this was, or the order page
     reads "You paid" for money the courier has yet to collect. */
  done({ ...result, paymentMethod: 'cod' });
}

/* create-order's 409s carry recovery data; each needs its own exit, not a
   toast. Returns true when it has been handled. */
function handleRefusal(err) {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const b = err.body || {};
  if (b.orderId) {
    /* An order ALREADY exists (and gift-card value was spent) — take them to it. */
    notify(err.message, 'error');
    currentKey = null;
    done({ id: b.orderId, amountDue: b.amountDue, paymentMethod: 'online' });
    return true;
  }
  if (typeof b.giftCardAvailable === 'number') {
    notify(err.message + ' This card currently has ' + money(b.giftCardAvailable) + ' left.', 'error');
    currentKey = null;
    return true;
  }
  if (typeof b.availableQty === 'number') {
    notify(err.message + ' Only ' + b.availableQty + ' left — reduce the quantity in your cart.', 'error');
    currentKey = null;
    return true;
  }
  return false;
}

/* Path B: pay now. Three steps, and only the third one creates the order. */
async function payNow(spec) {
  const intent = await api.createPaymentOrder(orderPayload(spec, 'online'));

  /* …unless nothing is owed. A gift card (or a 100% coupon with waived
     shipping) covering the total makes create-order PLACE the order and answer
     `{ freeOrder: true, orderId }` — with no gateway fields at all. */
  if (intent.freeOrder) {
    done({ id: intent.orderId, amountDue: 0, paymentMethod: 'online' });
    return;
  }

  await loadRazorpay();

  await new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: intent.keyId,
      /* Already in the currency's MINOR unit (paise for INR). Do NOT multiply
         by 100 again — the store has done it. */
      amount: intent.amount,
      currency: intent.currency,
      name: intent.name,
      order_id: intent.razorpayOrderId,
      prefill: intent.prefill,
      handler: async (response) => {
        try {
          /* THIS is what creates the order. */
          const order = await api.verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          done(order);
          resolve();
        } catch (err) {
          /* Money may well have been taken. Never tell them the order failed
             and invite them to pay again. `permanent: true` says the order will
             never be created and a refund is owed; otherwise the webhook
             finishes it and "check Track order in a minute" is true. */
          const permanent = err instanceof ApiError && err.body?.permanent === true;
          const captured = new Error(
            permanent
              ? (err.message || 'Your payment went through but the order could not be created.') +
                ' Please contact the store with your payment reference — do not pay again.'
              : (err?.message || 'Your payment went through but we could not confirm the order.') +
                ' Please check "Track order" in a minute before paying again.',
          );
          captured.moneyCaptured = true;
          reject(captured);
        }
      },
      modal: {
        ondismiss: () => {
          /* Release the stock holds create-order took, or the shopper's own
             retry is refused as "sold out" until they expire. */
          api.abandonPayment(intent.razorpayOrderId).catch(() => {});
          reject(new Error('Payment cancelled — your cart is still here.'));
        },
      },
    });
    rz.open();
  });
}

/* The gateway's widget is the one external script this file loads, and only
   when someone actually chooses to pay online. */
let razorpayOnce = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return (razorpayOnce ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  }).catch((e) => { razorpayOnce = null; throw e; }));
}

function done(order) {
  try { sessionStorage.setItem('merch.justPaid', JSON.stringify({ id: order.id, at: Date.now(), paymentMethod: order.paymentMethod })); } catch { /* ignore */ }
  cart.clear();
  pending.clear();
  currentKey = null;

  /* Not every template HAS an order page — one of these four ships none, and
     sending the shopper to `order.html` after they have paid lands them on a
     404 holding a real order. Confirm it where they are instead. */
  if (!THEME.pages?.order) {
    notify('Order placed. Your reference is ' + (order.orderRef || order.id) + '.', 'success');
    paintOrder({ order, items: order.items || [] });
    return;
  }

  location.href = pageUrl('order', { id: order.id });
}

/* --- ORDER ---------------------------------------------------------------
   The confirmation page, and the same page reached later from an email. */
pages.order = async () => {
  const id = param('id') || readJustPaid()?.id;

  /* One template serves BOTH roles from one file (`trackorder.html` is its
     order page and its lookup page), and the page table returns whichever
     role it listed first. With no `?id=` there is no order to show, so the
     page is the lookup form — and binding it as an order page left that form
     dead. */
  if (!id) return pages.track();
  let order;
  try { order = await api.order(id); } catch (e) { return showError(e); }
  paintOrder(order);
  /* The same page may also carry a lookup form for a different order. */
  await pages.track();
};

function readJustPaid() {
  try { return JSON.parse(sessionStorage.getItem('merch.justPaid') || 'null'); } catch { return null; }
}

function paintOrder(order) {
  const o = order.order || order;
  const items = order.items || o.lines || [];

  const put = (sel, value) => pickAll(sel).forEach((el) => setText(el, value));
  /* `orderRef` is the human reference. `orderStatus` is the one to show: the
     bare `status` is the INVOICE's, so a cancelled order still reads
     "confirmed" if you print that one. */
  put('.order-number|.order-code .code|.order-id|[data-order-number]', o.orderRef || o.id);
  /* These templates label the reference in prose ("Order number: #12345")
     rather than giving it a class. */
  for (const el of $$('p, span, li, div')) {
    if (el.children.length) continue;
    const text = (el.textContent || '').trim();
    if (/^(order (number|id|ref[a-z]*)|reference)\s*[:#]/i.test(text)) {
      setText(el, text.replace(/[:#].*$/, ': ') + (o.orderRef || o.id));
    }
  }
  put('.order-date .date|.order-date|[data-order-date]', o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '');
  /* The value node FIRST: on one theme `.order-total` is the wrapper that also
     holds the "Order total" caption, and writing to it deleted the caption. */
  put('.order-total .total|.order-total|.total-amount|[data-order-total]|.tf-totals-total-value|.total-value|.list-total .total', money(o.total));
  put('.order-status|[data-order-status]', o.orderStatus || o.status);
  put('.order-tracking|[data-order-tracking]', o.trackingNumber || o.awb || '');
  put('.order-carrier|[data-order-carrier]', o.carrier || '');
  put('.payment-method .metod|.order-payment|[data-order-payment]', paymentLine(o));
  put('.gift-card-applied|[data-gift-card]', Number(o.giftCardApplied) > 0 ? money(o.giftCardApplied) : '');
  pickAll('a[href*="tracking"]|.track-shipment').forEach((a) => {
    if (o.trackingUrl) { a.setAttribute('href', o.trackingUrl); a.setAttribute('target', '_blank'); show(a, true); }
    else show(a, false);
  });

  /* The order's own lines, drawn into whatever list the theme shows here. */
  /* `.item-parent` is one theme's order ROW. Leaving it out meant the lines
     rendered as the template shipped them — "Product", "—", "—" — on a page
     the shopper reads to check what they just bought. */
  const spec = { container: '.order-items|.tf-table-page-cart tbody|.single-shop-list|table tbody|.list-product', card: 'tr|.item-product|.single-shop-list|.item-parent' };
  const t = takeTemplate(spec);
  if (t && items.length) {
    repeat(t, items, (node, l) => {
      setText(pick('.cart-title|.prd_name|.information .title|.title|a|td:first-child', node), l.name);
      /* Where the theme gives each figure its own cell, fill each one; where
         it gives one, that one carries the line total. */
      const qtyEl = pick('.quantity p|.quantity', node);
      const priceEl = pick('.price p|.price', node);
      const subEl = pick('.subtotal p|.subtotal', node);
      if (qtyEl) setText(qtyEl, String(l.qty));
      if (priceEl) setText(priceEl, money(l.price));
      if (subEl) setText(subEl, money(l.price * l.qty));
      if (!priceEl && !subEl) setText(pick('.cart-total|td:last-child', node), money(l.price * l.qty));
      if (!qtyEl && priceEl) setText(priceEl, money(l.price) + ' × ' + l.qty);
      const img = pick('img', node);
      if (img && l.imageUrl) setAttr(img, 'src', mediaUrl(l.imageUrl));
    });
  }

  /* The tax invoice is the owner's own download; the route answers 401 to
     anyone else, so the link is only offered when we hold their token. */
  pickAll('a[href*="invoice"]|.download-invoice').forEach((a) => {
    if (!(o.invoicePdfUrl || o.invoiceId)) { show(a, false); return; }
    show(a, true);
    /* The store answers a RELATIVE path (`/api/orders/…/invoice.pdf`). Put
       that on a link and the browser resolves it against the SHOP FRONT's own
       host, not the store's — so a guest, who has no token and follows the
       href, lands on a 404 of the wrong server. Resolve it against the API. */
    a.setAttribute('href', mediaUrl(o.invoicePdfUrl) || api.invoicePdfUrl(o.id));
    /* The invoice route is the OWNER's: it answers 401 without an
       Authorization header, and a plain link cannot send one. Following the
       href would hand the shopper a 401 page. Fetch it with the token and
       give them the file. */
    if (a.dataset.merchInvoice) return;
    a.dataset.merchInvoice = '1';
    a.addEventListener('click', async (e) => {
      if (!token.get()) return;                    // a guest order: let the plain link try
      e.preventDefault();
      try {
        const blob = await api.invoicePdf(o.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'invoice-' + (o.orderRef || o.id) + '.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) { showError(err); }
    });
  });

  /* Cancelling is the shopper's own, and only while the store still allows it. */
  /* There is no `canCancel` flag. An order is cancellable while it has not
     already been cancelled or shipped; the store decides for real and answers
     409 if we guessed wrong, which showError reports as written. */
  const cancellable = !o.cancelledAt && !/cancel|deliver|ship/i.test(o.orderStatus || o.fulfillmentStatus || '');
  pickAll('.cancel-order|[data-cancel-order]').forEach((btn) => {
    show(btn, cancellable);
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Cancel this order?')) return;
      try {
        const res = await api.cancelOrder(o.id);
        notify(res.refundBlocked
          ? 'Order cancelled. A credit note was raised; the refund follows separately.'
          : 'Order cancelled and refunded.', 'success');
        location.reload();
      } catch (err) { showError(err); }
    });
  });
}

/* What the shopper actually paid with. A gift card is a TENDER, not a
   discount: the order total stays the same and the card settles it. The store
   reports `giftCardApplied` and nothing read it, so an order paid in full by a
   gift card said "Cash on delivery" and never mentioned the card. */
function paymentLine(o) {
  const gift = Number(o.giftCardApplied) || 0;
  const due = Number(o.amountDue);
  const parts = [];
  if (gift > 0) parts.push('Gift card \u2014 ' + money(gift) + ' applied');
  if (gift === 0 || due !== 0) {
    parts.push(o.paymentMethod === 'cod'
      ? (o.amountUncollected > 0 ? 'Cash on delivery \u2014 ' + money(o.amountUncollected) + ' due' : 'Cash on delivery')
      : 'Paid online');
  }
  return parts.join(' \u00b7 ');
}

/* --- TRACK ---------------------------------------------------------------
   Find an order with an email and a reference, no account needed. */
pages.track = async () => {
  /* Pick the form by what it CONTAINS, not by being first on the page — the
     first form is the header search on every one of these templates, so the
     lookup was submitted with two empty strings and the store answered
     "Enter your email and order reference." */
  /* Pick the REFERENCE first and let the email be whatever is left. Scoring
     both independently failed on a template where BOTH captions mention an
     order — "Found in your order confirmation email" and a field whose id is
     `order-idt` — so neither could win the email role and the form was thrown
     away as incomplete. There are two boxes; naming one names the other. */
  const REF = /order|reference|tracking|confirmation|invoice|#|\d{5}/i;
  const caption = (i) => [i.placeholder, i.name, i.id,
    i.closest('label, .single-input, p, div')?.querySelector('label')?.textContent || ''].join(' ');

  const candidates = $$('form').map((form) => {
    const inputs = $$('input', form).filter((i) => !/^(hidden|checkbox|radio|submit|button)$/.test(i.type));
    if (inputs.length < 2) return { score: 0 };

    /* The reference is the one whose caption is MOST about an order. */
    const refScore = (i) => (REF.test(caption(i)) ? 1 : 0) + (/\bref|order\s*(id|no|number)|#/i.test(caption(i)) ? 1 : 0);
    const ranked = [...inputs].sort((a, b) => refScore(b) - refScore(a));
    const ref = refScore(ranked[0]) > 0 ? ranked[0] : null;

    const rest = inputs.filter((i) => i !== ref);
    const email = rest.find((i) => i.type === 'email') || rest.find((i) => /e-?mail/i.test(caption(i))) || rest[0];
    return { form, email, ref, score: (email ? 1 : 0) + (ref ? 1 : 0) };
  }).filter((c) => c.score === 2);

  const found = candidates[0];
  if (!found) { warn('no order-tracking form found on ' + location.pathname); return; }
  const { form, email, ref } = found;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const addr = email.value.trim();
    const reference = ref.value.trim();
    if (!addr || !reference) return notify('Enter the email you ordered with and your order reference.', 'error');
    try {
      const order = await api.lookupOrder(addr, reference);
      const id = order.id || order.orderId || order.order?.id;
      if (id) location.href = pageUrl('order', { id });
      else paintOrder(order);
    } catch (err) { showError(err); }
  });
};

/* --- ACCOUNT -------------------------------------------------------------
   Sign-in, the order history, addresses and the password form — whichever of
   them this particular theme puts on this particular page. */
pages.account = async () => {
  wireAuthForms();
  wirePasswordChange();
  if (!token.get()) { showSignedOut(); return; }

  let me = null;
  try { me = await api.me(); }
  catch (e) { if (e instanceof ApiError && e.isUnauthenticated) { showSignedOut(); return; } showError(e); return; }

  showSignedIn(me);
  STORE_ME = me;
  api.addresses().then((list) => { STORE_ADDRESS = (list || []).find((a) => a.isDefault) || (list || [])[0] || null; }).catch(() => {});
  await Promise.all([paintOrders(), paintAddresses(), wishlist.sync()]);
  wireAddressForm();
  wireSignOut();
};
pages.orders = async () => { if (token.get()) await paintOrders(); else showSignedOut(); };
pages.addresses = async () => {
  if (!token.get()) return showSignedOut();
  wireAddressForm();
  await paintAddresses();
};
pages.orderDetail = pages.order;

function showSignedOut() {
  pickAll('.signed-in-only|[data-signed-in]').forEach((el) => show(el, false));
  pickAll('.signed-out-only|[data-signed-out]').forEach((el) => show(el, true));
}
function showSignedIn(me) {
  pickAll('.signed-out-only|[data-signed-out]').forEach((el) => show(el, false));
  pickAll('.signed-in-only|[data-signed-in]').forEach((el) => show(el, true));
  pickAll('.account-name|.customer-name|[data-account-name]').forEach((el) => setText(el, me.name || me.email));
  pickAll('.account-email|[data-account-email]').forEach((el) => setText(el, me.email));
  fillAccountDetails(me);
}

/* None of these themes ships a "you are signed in" element, so the classes
   above match nothing and the account page said nothing about who was on it.
   Every theme does ship an account-details form, and one of them ships it
   filled in with the demo person — a signed-in shopper was shown "Tony
   Nguyen / themesflat@gmail.com" as their own details. Put the real account
   into the theme's own boxes; nothing is added and nothing moves. */
function fillAccountDetails(me) {
  const parts = String(me.name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ');
  for (const form of $$('form')) {
    /* Never the sign-in, search, newsletter or contact forms — they ask for
       an email too, and filling them would put the shopper's address into a
       box they did not choose to complete. */
    if (form.closest('footer, .offcanvas, .modal, .tf-topbar')) continue;
    if (/newsletter|search|log|contact|subscribe/i.test(form.className || '')) continue;
    if (pick('input[name="remember"]|input[type="checkbox"][name*="remember" i]', form)) continue;

    const fn = pick('input[placeholder*="first" i]|input[name*="first" i]', form);
    const ln = pick('input[placeholder*="last" i]|input[name*="last" i]', form);
    const dn = pick('input[placeholder*="display" i]|input[name*="display" i]', form);
    const em = pick('input[type="email"]|input[placeholder*="email address" i]', form);
    if (!em || !(fn || ln || dn)) continue;        // not an account-details form

    if (fn && fn.type === 'text') fn.value = first;
    if (ln && ln.type === 'text') ln.value = last;
    if (dn && dn.type === 'text') dn.value = me.name || me.email;
    em.value = me.email;
    /* The demo phone is presented as the shopper's own and would be SAVED as
       theirs. An empty box is honest; a stranger's number is not. */
    const ph = pick('input[type="tel"]|input[placeholder*="phone" i]|input[name*="phone" i]', form);
    if (ph) ph.value = me.phone || '';
  }
}

async function paintOrders() {
  let orders = [];
  try { orders = await api.myOrders(); } catch (e) { return showError(e); }
  const spec = { container: '.order-list|.account-orders tbody|table tbody|.tf-table-page-cart tbody', card: 'tr|.order-item' };
  const t = takeTemplate(spec);
  if (!t) return;
  if (!orders.length) return renderEmpty(t.container, 'You have not placed an order yet.', spec);
  repeat(t, orders, (node, o) => {
    const cells = pickAll('td', node);
    const texts = [o.reference || o.id, new Date(o.createdAt).toLocaleDateString(), o.orderStatus || o.status, money(o.total ?? o.totalAmount)];
    cells.forEach((td, i) => { if (texts[i] !== undefined && !td.querySelector('a, button')) setText(td, texts[i]); });
    pickAll('a', node).forEach((a) => a.setAttribute('href', pageUrl('order', { id: o.id })));
  });
}

async function paintAddresses() {
  let list = [];
  try { list = await api.addresses(); } catch (e) { return showError(e); }
  /* `.row` used to be in this list and matched the row that also holds the
     "add an address" form, so an empty list took the form with it. */
  const spec = { container: '.address-list|.account-addresses|.list-address', card: '.address-item|.single-address|.account-address-item' };
  const t = takeTemplate(spec);
  if (!t) return;
  if (!list.length) return renderEmpty(t.container, 'No saved addresses yet.', spec);
  repeat(t, list, (node, a) => {
    setText(pick('.address-name|h5|h6', node), a.name || '');
    /* A saved address uses `line`, SINGULAR — the edit handler below already
       knew that; this line did not, so every saved address was shown without
       its street: "Noida, Uttar Pradesh, 201301" and nothing to deliver to. */
    setText(pick('.address-body|p|address', node),
      [a.line, a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', '));
    pick('.address-default|[data-default]', node)?.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.makeAddressDefault(a.id); notify('Default address updated.', 'success'); }
      catch (err) { showError(err); }
    });
    pick('.address-edit|[data-edit]', node)?.addEventListener('click', (e) => {
      e.preventDefault();
      const form = $$('form').find((f) => f.dataset.merchAddress);
      if (!form) return;
      form.dataset.merchEditing = a.id;
      const set = (sel, v) => { const el = pick(sel, form); if (el) el.value = v || ''; };
      set('input[placeholder*="name" i]:not([placeholder*="user" i])', a.name);
      set('input[type="tel"]|input[placeholder*="phone" i]', a.phone);
      set('input[placeholder*="address" i]|input[placeholder*="street" i]|textarea', a.line);
      set('input[placeholder*="city" i]|input[placeholder*="town" i]', a.city);
      set('input[placeholder*="state" i]', a.state);
      set('input[placeholder*="zip" i]|input[placeholder*="post" i]|input[placeholder*="pin" i]', a.pincode);
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    pick('.address-delete|[data-delete]', node)?.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.deleteAddress(a.id); node.remove(); }
      catch (err) { showError(err); }
    });
  });
}

/* The "add a new address" form on the account pages. Every template has one
   and none of them was connected to anything. */
function wireAddressForm() {
  for (const form of $$('form')) {
    if (form.dataset.merchAddress) continue;
    const fields = {
      name: pick('input[placeholder*="name" i]:not([placeholder*="user" i])', form),
      phone: pick('input[type="tel"]|input[placeholder*="phone" i]|input[placeholder*="mobile" i]', form),
      line: pick('input[placeholder*="address" i]|input[placeholder*="street" i]|textarea', form),
      city: pick('input[placeholder*="city" i]|input[placeholder*="town" i]', form),
      state: pick('input[placeholder*="state" i]', form),
      pincode: pick('input[placeholder*="zip" i]|input[placeholder*="post" i]|input[placeholder*="pin" i]', form),
    };
    /* An address form is the one with a street and a town. Requiring a
       postcode here matched nothing on one of these templates, whose address
       block has only Address and City — so the form sat inert and pressing
       Save submitted it natively. */
    if (!fields.line || !(fields.city || fields.pincode)) continue;
    form.dataset.merchAddress = '1';

    /* The store will not save an address without a postcode, and one of these
       templates asks only for Address and City. Give the form the boxes the
       store needs, built from its own, or a shopper adding their FIRST
       address is refused with nowhere to put the missing detail. */
    if (!fields.pincode) {
      fields.pincode = cloneFieldAfter(fields.city || fields.line,
        { id: 'merch-address-pincode', name: 'pincode', placeholder: 'ZIP / Postal code*', label: 'ZIP / Postal code' });
      if (fields.pincode) log('added a postal-code field to the address form; this template has none');
    }
    if (!fields.state) {
      fields.state = cloneFieldAfter(fields.city || fields.line,
        { id: 'merch-address-state', name: 'state', placeholder: 'State*', label: 'State' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!token.get()) return notify('Please sign in first.', 'error');
      const body = {
        name: fields.name?.value.trim() || '',
        phone: fields.phone?.value.trim() || '',
        line: fields.line.value.trim(),
        city: fields.city?.value.trim() || '',
        state: fields.state?.value.trim() || '',
        pincode: fields.pincode?.value.trim() || '',
      };
      /* The store requires a postcode. Where the template has no field for
         one, borrow it from an address the shopper already has rather than
         refusing them for something they were never asked. */
      if (!body.pincode) {
        try { body.pincode = ((await api.addresses()) || []).find((a) => a.pincode)?.pincode || ''; } catch { /* ignore */ }
      }
      if (!body.name || !body.line) return notify('Please fill in your name and address.', 'error');
      if (!body.pincode) {
        warn('this template\u2019s address form has no postal-code field, and the store requires one');
        return notify('We need a postal code to save this address. Please add one at checkout.', 'error');
      }
      try {
        const editing = form.dataset.merchEditing;
        if (editing) await api.updateAddress(editing, body);
        else await api.addAddress(body);
        notify(editing ? 'Address updated.' : 'Address saved.', 'success');
        delete form.dataset.merchEditing;
        form.reset();
        await paintAddresses();
      } catch (err) { showError(err); }
    });
  }
}

function wireSignOut() {
  /* Matched on href before, but these themes point Logout at `login.html` and
     only the WORDS say what it does. */
  const links = new Set([
    ...$$('a[href*="logout"], a[href*="sign-out"], .sign-out, [data-signout]'),
    ...$$('a, button').filter((el) => /^(log ?out|sign ?out)$/i.test((el.textContent || '').trim())),
  ]);
  links.forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.signOutEverywhere(); } catch { /* the local token goes either way */ }
      token.clear();
      location.href = pageUrl('home');
    });
  });
}

function wirePasswordChange() {
  /* Themes label the first box just "Password*", not "Current password", so
     matching on the word "current" found nothing and the form did nothing.
     Three password boxes in one form means current / new / confirm, in order. */
  let current = pick('input[placeholder*="current" i][type="password"]');
  let next = pick('input[placeholder*="new" i][type="password"]');
  let confirmEl = pick('input[placeholder*="confirm" i][type="password"]');
  if (!current || !next) {
    const form = $$('form').find((f) => f.querySelectorAll('input[type="password"]').length >= 3);
    if (!form) return;
    const boxes = $$('input[type="password"]', form);
    [current, next, confirmEl] = boxes;
  }
  if (!current || !next) return;

  /* `closest('form, div')` returns whichever ancestor comes FIRST — which is
     the wrapper div around the input, not the form, so the button was never
     found and the form did nothing. Take the form, and listen for its submit
     as well as the button, because either can be how the shopper sends it. */
  const form = current.closest('form');
  if (!form || form.dataset.merchPassword) return;
  form.dataset.merchPassword = '1';

  const submit = async (e) => {
    e.preventDefault();
    if (!current.value || !next.value) return notify('Please fill in your current and new password.', 'error');
    if (confirmEl && confirmEl.value !== next.value) return notify('The two new passwords do not match.', 'error');
    try {
      await api.changePassword(current.value, next.value);
      notify('Password changed. You are signed out everywhere else.', 'success');
      current.value = next.value = ''; if (confirmEl) confirmEl.value = '';
    } catch (err) { showError(err); }
  };

  form.addEventListener('submit', submit);
  form.querySelector('button, input[type="submit"]')?.addEventListener('click', submit);
}

/* --- AUTH ----------------------------------------------------------------
   Sign-in, registration, forgot and reset. Every theme lays these out
   differently and several put two of them on one page, so we find each form by
   what it CONTAINS rather than by a class name we would have to invent. */

function wireAuthForms() {
  for (const form of $$('form')) {
    const pw = $$('input[type="password"]', form);
    const email = pick('input[type="email"]|input[placeholder*="mail" i]|input[name*="email" i]', form);
    if (!email) continue;

    if (pw.length === 0) { if (looksLikeForgot(form)) wireForgotForm(form, email); continue; }
    /* Two password boxes (or a name field) means registration. */
    const nameEl = pick('input[placeholder*="name" i]:not([placeholder*="user" i])', form);
    if (pw.length >= 2 || nameEl) wireRegisterForm(form, email, pw[0], nameEl);
    else wireLoginForm(form, email, pw[0]);
  }
  mountGoogleButton();
}
pages.auth = async () => { wireAuthForms(); };

/* The theme tables name these pages `login` and `register`, and the binder was
   called `auth` — so on three of the four themes the sign-in page fell through
   to `unknown` and its form was never wired. The theme's form then submitted
   NATIVELY, as a GET, which puts the shopper's password in the address bar,
   in browser history and in the referrer of the next request. */
pages.login = pages.auth;
pages.register = pages.auth;
pages.forgot = async () => { wireAuthForms(); wireResetForm(); };

function wireLoginForm(form, email, password) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api.login(email.value.trim(), password.value);
      token.set(res.token);
      await wishlist.sync();
      notify('Signed in.', 'success');
      location.href = param('next') || pageUrl('account');
    } catch (err) { showError(err); }
  });
}

function wireRegisterForm(form, email, password, nameEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boxes = $$('input[type="password"]', form);
    if (boxes.length >= 2 && boxes[0].value !== boxes[1].value) {
      return notify('The two passwords do not match.', 'error');
    }
    const phoneEl = pick('input[type="tel"]|input[placeholder*="phone" i]', form);
    try {
      const res = await api.register(email.value.trim(), password.value, nameEl?.value.trim() || '', phoneEl?.value.trim() || '');
      if (res?.token) token.set(res.token);
      notify('Welcome. Your account is ready.', 'success');
      location.href = pageUrl('account');
    } catch (err) { showError(err); }
  });
}

/* "An email box and no password" describes the NEWSLETTER SUBSCRIBE form on
   every one of these templates. Wiring that as "forgot my password" meant a
   shopper who typed their address into the footer and pressed Subscribe was
   sent a password-reset email, and was never subscribed to anything. It also
   made the endpoint look covered on a theme that ships no recovery page.

   On a recovery page, the password-less email form IS the one — the themes do
   not label it ("Submit" is all one of them says). Anywhere else it has to say
   so. Marketing and utility forms are excluded either way. */
function looksLikeForgot(form) {
  const cls = (form.className || '') + ' ' + (form.id || '') + ' ' + (form.getAttribute('action') || '');
  if (/newsletter|subscribe|form-sub\b|search|contact|comment|coupon|share|estimate/i.test(cls)) return false;
  if (form.closest('footer, header, nav, .offcanvas, .modal, .tf-topbar')) return false;
  if (/forgot|forget|reset-password|lost-password|recover/i.test(location.pathname)) return true;
  return /forgot|reset|recover|lost (your )?password/i.test((form.innerText || '') + ' ' + cls);
}

function wireForgotForm(form, email) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    /* The store may pin its own reset origin; when it does, ours is ignored. */
    const resetUrl = new URL(pageUrl('forgot'), location.href).href;
    try {
      await api.forgotPassword(email.value.trim(), resetUrl);
      /* Deliberately the same answer whether or not the address is on file —
         telling a stranger which emails have accounts is a leak. */
      notify('If that address has an account, a reset link is on its way.', 'success');
    } catch (err) { showError(err); }
  });
}

/* The page a reset email links to: ?token=… turns this into the new-password
   form without the theme needing a page of its own. */
function wireResetForm() {
  const resetToken = param('token');
  if (!resetToken) return;
  const boxes = $$('input[type="password"]');
  if (!boxes.length) return;
  const form = boxes[0].closest('form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (boxes.length >= 2 && boxes[0].value !== boxes[1].value) return notify('The two passwords do not match.', 'error');
    try {
      await api.resetPassword(resetToken, boxes[0].value);
      notify('Password updated. Please sign in.', 'success');
      location.href = pageUrl('login');
    } catch (err) { showError(err); }
  });
}

/* Google sign-in, offered only when BOTH sides are configured: a client id
   here and the same one in the store's admin. Otherwise the button is hidden
   rather than left on the page to fail when pressed. */
async function mountGoogleButton() {
  const holders = pickAll('.google-login|[data-google-signin]|a[href*="google"]');
  if (!holders.length) return;
  let cfg = null;
  try { cfg = await api.authConfig(); } catch { /* ignore */ }
  /* { google: { enabled, clientId }, password: { enabled, resetByEmail } } —
     the client id is NOT at the top level. Reading it there hides the button
     on a store that has Google switched on. */
  const clientId = CONFIG.googleClientId || cfg?.google?.clientId;
  if (!clientId || cfg?.google?.enabled === false) { holders.forEach((el) => show(el, false)); return; }

  await new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  }).catch(() => {});
  if (!window.google?.accounts?.id) { holders.forEach((el) => show(el, false)); return; }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const res = await api.signInWithGoogle(response.credential);
        token.set(res.token);
        await wishlist.sync();
        location.href = pageUrl('account');
      } catch (err) { showError(err); }
    },
  });
  holders.forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); window.google.accounts.id.prompt(); }));
}

/* --- WISHLIST, COMPARE, BLOG --------------------------------------------- */

pages.wishlist = async () => {
  let ids = wishlist.ids();
  if (token.get()) {
    /* An array of item-id STRINGS, not objects. `.map(x => x.itemId)` on it
       yields a list of undefineds, and `api.products` on those returns the
       whole catalogue as "your wishlist". */
    try { ids = (await api.wishlist()) || []; } catch { /* fall back to the local list */ }
  }
  let items = [];
  try { items = await api.products(ids); } catch (e) { return showError(e); }
  /* A wishlist page is a product grid, and several themes render it as a cart
     table instead — try the grid first, then the table. */
  if (!renderProducts(items)) {
    const spec = THEME.cart;
    const t = takeTemplate(spec);
    if (!t) return;
    if (!items.length) return renderEmpty(t.container, 'Your wishlist is empty.');
    repeat(t, items, (node, p) => fillFields(node, spec.fields,
      { itemId: p.id, name: p.name, price: p.price, qty: 1, image: (p.imageUrls || [])[0] }, { node }));
  }
};

pages.compare = async () => {
  let items = [];
  try { items = await api.products(compare.ids()); } catch (e) { return showError(e); }
  if (!items.length) return;
  renderProducts(items);
};

pages.blog = async () => {
  let posts = [];
  try { posts = (await api.blog()) || []; } catch (e) { return warn('blog', e); }

  const spec = THEME.blog || {
    container: null,
    card: '.blog-item|.single-blog|.blog-post|article',
    fields: {
      link:  { sel: 'a', attr: 'href', all: true, value: postHref },
      image: { sel: 'img', attr: 'src', value: postImage },
      title: { sel: 'h3 a|h4 a|h5 a|h3|h4|h5', text: (b) => b.title },
      excerpt: { sel: 'p', text: (b) => b.excerpt || '' },
    },
  };

  const containers = productContainers(spec);
  if (!containers.length) { log('no blog template on this page'); return; }

  if (!posts.length) {
    /* A shop with no posts should not publish the template's invented ones
       under its own name. Hide the strip and say so once. */
    containers.forEach((el) => show(el.closest('section, .section, .rts-section') || el, false));
    log('the store has no blog posts, so the blog strip is hidden');
    return;
  }

  for (const el of containers) {
    const t = takeTemplate({ ...spec, el });
    if (!t) continue;
    const room = Math.max(1, templateCount({ ...spec, el }));
    repeat(t, posts.slice(0, Math.max(room, Math.min(posts.length, room * 2))), (node, post) => {
      node.dataset.merchSlug = post.slug;
      fillFields(node, spec.fields, post, { node });
    });
  }
};

pages.post = async () => {
  const slug = param('slug');
  let post = null;
  try {
    post = slug ? await api.post(slug) : ((await api.blog()) || [])[0];
  } catch (e) { return showError(e); }
  if (!post) return;

  const spec = THEME.post || {};
  setText(pick(spec.title || '.blog-title|.entry-title|.post-title|article h1|h1.title'), post.title);
  setText(pick(spec.date || '.blog-date|.date|.entry-date'), postDate(post));
  document.title = post.title + document.title.replace(/^[^|\u2013-]*/, '');

  const cover = pick(spec.cover || 'article img|.blog-details img');
  if (cover && post.coverUrl) {
    setAttr(cover, 'src', postImage(post));
    if (cover.hasAttribute('data-src')) setAttr(cover, 'data-src', postImage(post));
    cover.removeAttribute('srcset');
  }

  /* The post body is the merchant's own Markdown, escaped before it is
     interpreted — the same renderer the policy pages use.

     The theme's OWN body selector comes first here. Unlike a policy page,
     where we cannot know the container, a blog template names it — and
     measuring instead picks whichever block happens to be longest, which on
     one of these themes was a sidebar of recent posts. */
  const html = markdown(String(post.body || post.excerpt || ''));
  const named = pick(spec.body);
  if (named) {
    /* On two of these themes the body container ALSO holds the article's
       heading and date, so replacing its innerHTML deleted the title we had
       just written and the post rendered with no heading at all. Keep the
       block the heading sits in and replace only what follows it. */
    const head = spec.title ? pick(spec.title, named) : null;
    const keep = head && [...named.children].find((c) => c === head || c.contains(head));
    if (keep) {
      [...named.children].forEach((c) => { if (c !== keep) c.remove(); });
      const holder = document.createElement('div');
      holder.innerHTML = html;
      named.appendChild(holder);
    } else {
      named.innerHTML = html;
    }
    return;
  }

  const blocks = proseBlocks();
  if (blocks.length) { blocks[0].innerHTML = html; blocks.slice(1).forEach(remove); }
  else warn('no body container found for the post on ' + location.pathname);
};

/* --- THE MERCHANT'S OWN WRITTEN PAGES -----------------------------------
   Privacy, terms, refunds, shipping, about. The store keeps them as MARKDOWN
   under `theme.pages`, plus anything else the merchant added in
   `theme.customPages`.

   Left alone, these pages publish the template's filler as the shop's legal
   terms — which is worse than an empty page, because it reads like a policy
   and is not one. */
pages.policy = async (key) => {
  /* With the template owning the look, its own copy stands. We do NOT
     overwrite it and we do not replace it with "not published" either. */
  if (!useStore('writtenPages')) return;
  if (key === 'about' && !useStore('aboutPage')) return;

  const written = STORE?.pages || {};
  let body = written[key];
  let title = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', refund: 'Returns & Refunds', shipping: 'Shipping', about: 'About Us' }[key];

  /* A custom page can also claim this slug. */
  const custom = (STORE?.customPages || []).find((pg) => (pg.slug || '').toLowerCase() === key || (pg.slug || '').toLowerCase() === param('page'));
  if (custom) { body = custom.body ?? custom.content ?? body; title = custom.title || title; }

  const blocks = proseBlocks();
  if (!blocks.length) { warn('no prose block found on ' + location.pathname); return; }

  /* A safety net for any page that turns out to be design rather than text:
     if what we would replace is only a small share of what the page says, we
     would leave a page half in the merchant's words and half in the
     template's — which reads as the shop's policy and is not one. Leave it
     whole instead, and say why. */
  const share = proseShare(blocks);
  if (share < 0.3) {
    warn('leaving ' + location.pathname + ' alone: its text is only ' +
      Math.round(share * 100) + '% prose, so it is a designed page, not a written one');
    return;
  }

  /* EVERY block, not the biggest one. These themes split a policy across
     several sibling panels, so replacing only the largest leaves the rest of
     the template's filler on the page — still reading like the shop's terms,
     and now contradicting the half that is real. */
  const html = (body && String(body).trim())
    ? markdown(String(body))
    : '<p>This page has not been published yet.</p>';
  blocks[0].innerHTML = html;
  blocks.slice(1).forEach(remove);

  if (title) pickAll('.breadcrumb .current|.page-title|h1.title').forEach((el) => setText(el, title));
};

/* How much of what this page SAYS lives in the blocks we would replace. */
function proseShare(blocks) {
  const inMain = (el) => !el.closest('header, footer, nav, .modal, .offcanvas');
  const total = $$('h1,h2,h3,h4,h5,p,li').filter(inMain)
    .reduce((n, el) => n + (el.textContent || '').trim().length, 0);
  if (!total) return 0;
  const mine = blocks.reduce((n, el) => n + (el.textContent || '').trim().length, 0);
  return mine / total;
}

/* Every block of prose this page is FOR, in document order. A policy page is
   a long run of text, so the honest way to find it is to measure — the
   elements that directly hold paragraphs, minus the furniture every page
   carries. Blocks nested inside another block are dropped, so we replace a
   region once rather than once per level. */
function proseBlocks() {
  const FURNITURE = /header|footer|nav|menu|modal|offcanvas|drawer|cart|sidebar|breadcrumb|widget|newsletter|copyright|comment/i;
  const hosts = [];
  for (const el of $$('p')) {
    const host = el.parentElement;
    if (!host || host === document.body || hosts.includes(host)) continue;
    if (host.closest('header, footer, nav, .modal, .offcanvas')) continue;
    if (FURNITURE.test(host.className + ' ' + (host.id || ''))) continue;
    if ((host.textContent || '').trim().length < 80) continue;
    hosts.push(host);
  }
  return hosts.filter((h) => !hosts.some((other) => other !== h && other.contains(h)));
}

/* Just enough Markdown for a policy page or a blog post, and every scrap of
   merchant text is escaped BEFORE any of it is interpreted — so a stray
   `<script>` in the admin's editor renders as the characters they typed. */
function markdown(src) {
  const inline = (t) => escapeHtml(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (m, text, href) => '<a href="' + escapeHtml(href) + '">' + text + '</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };

  for (const raw of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const n = Math.min(6, h[1].length + 1); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { closeList(); out.push('<hr>'); continue; }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(ul[1]) + '</li>'); continue; }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(ol[1]) + '</li>'); continue; }

    closeList();
    out.push('<p>' + inline(line) + '</p>');
  }
  closeList();
  return out.join('\n');
}

/* --- RETURNS ------------------------------------------------------------- */
pages.returns = async () => {
  wireReturnForm();
  if (!token.get()) return showSignedOut();
  let list = [];
  try { list = (await api.returns()) || []; } catch (e) { return showError(e); }

  const spec = { container: '.returns-list', card: '.return-item' };
  const t = takeTemplate(spec);
  if (!t) return;
  if (!list.length) return renderEmpty(t.container, 'You have not requested a return yet.', spec);
  repeat(t, list, (node, r) => {
    setText(pick('.return-order', node), r.orderRef || r.orderId);
    setText(pick('.return-reason', node), r.reason || '');
    setText(pick('.return-status', node), r.status || '');
    setText(pick('.return-refund', node), r.refundAmount ? money(r.refundAmount) : '');
  });
};

function wireReturnForm() {
  const form = pick('.merch-return-form');
  if (!form || form.dataset.merchWired) return;
  form.dataset.merchWired = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!token.get()) return notify('Please sign in to request a return.', 'error');
    const orderRef = pick('input', form)?.value.trim();
    const reason = pick('textarea', form)?.value.trim();
    if (!orderRef || !reason) return notify('Tell us the order and why you are returning it.', 'error');
    try {
      /* The store wants the order's id. A shopper has the reference, so look
         it up first rather than making them find a uuid. */
      let orderId = orderRef;
      if (!/^[0-9a-f-]{36}$/i.test(orderRef)) {
        const me = await api.me().catch(() => null);
        const found = await api.lookupOrder(me?.email || '', orderRef).catch(() => null);
        orderId = found?.id || found?.order?.id || orderRef;
      }
      await api.requestReturn({ orderId, reason });
      notify('Return requested. We will email you about it.', 'success');
      form.reset();
      await pages.returns();
    } catch (err) { showError(err); }
  });
}

/* --- SUBSCRIPTIONS -------------------------------------------------------- */
pages.subscriptions = async () => {
  wireSubscribeForm();
  if (!token.get()) return showSignedOut();
  if (!STORE_ME) {
    STORE_ME = await api.me().catch(() => null);
    STORE_ADDRESS = ((await api.addresses().catch(() => [])) || []).find((a) => a.isDefault) || null;
  }
  let list = [];
  try { list = (await api.subscriptions()) || []; } catch (e) { return showError(e); }

  const spec = { container: '.subscriptions-list', card: '.subscription-item' };
  const t = takeTemplate(spec);
  if (!t) return;
  if (!list.length) return renderEmpty(t.container, 'You have no repeat deliveries set up.', spec);
  repeat(t, list, (node, sub) => {
    setText(pick('.subscription-title', node), sub.title || 'Repeat delivery');
    setText(pick('.subscription-frequency', node), sub.frequency || '');
    setText(pick('.subscription-status', node), sub.status || '');
    setText(pick('.subscription-next', node), sub.nextRunAt ? new Date(sub.nextRunAt).toLocaleDateString() : '');

    /* Only offer the operations that make sense for the state it is in. */
    const status = String(sub.status || '').toLowerCase();
    for (const [sel, op, when] of [
      ['.subscription-pause', 'pause', status === 'active'],
      ['.subscription-resume', 'resume', status === 'paused'],
      ['.subscription-cancel', 'cancel', status !== 'cancelled'],
    ]) {
      const btn = pick(sel, node);
      if (!btn) continue;
      show(btn, when);
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await api.subscriptionOp(sub.id, op);
          notify('Subscription ' + op + 'd.', 'success');
          await pages.subscriptions();
        } catch (err) { showError(err); }
      });
    }
  });
};

function wireSubscribeForm() {
  const form = pick('.merch-subscribe-form');
  if (!form || form.dataset.merchWired) return;
  form.dataset.merchWired = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!token.get()) return notify('Please sign in to set up a repeat delivery.', 'error');
    if (!cart.count()) return notify('Put what you want delivered in your basket first.', 'error');
    const title = pick('input', form)?.value.trim();
    const frequency = pick('select', form)?.value || 'monthly';
    try {
      await api.subscribe({ lines: cart.apiLines(), customer: readSubscriber(), frequency, title: title || null });
      notify('Repeat delivery set up.', 'success');
      form.reset();
      await pages.subscriptions();
    } catch (err) { showError(err); }
  });
}

/* A subscription needs somewhere to send the goods. Reuse the account's
   default address rather than asking again for what the shopper has told us. */
function readSubscriber() {
  const me = STORE_ME || {};
  const a = STORE_ADDRESS || {};
  return {
    name: me.name || a.name || '',
    email: me.email || '',
    phone: me.phone || a.phone || '',
    address: a.line || '',
    city: a.city || '',
    state: a.state || '',
    pincode: a.pincode || '',
  };
}
let STORE_ME = null;
let STORE_ADDRESS = null;

/* --- COLLECTIONS ---------------------------------------------------------- */
pages.collections = async () => {
  let list = [];
  try { list = (await api.collections()) || []; } catch (e) { return showError(e); }

  const spec = { container: '.collections-list', card: '.collection-title' };
  const t = takeTemplate({ container: '.collections-list', card: '.collection-title' });
  if (!t) return;
  if (!list.length) return renderEmpty(t.container, 'No collections yet.', spec);
  repeat(t, list, (node, c) => {
    setText(pick('.collection-title', node), c.title);
    setText(pick('.collection-description', node), c.description || '');
    pickAll('.collection-link', node).forEach((a) => a.setAttribute('href', pageUrl('listing', { collection: c.handle })));
    const img = pick('.collection-image', node) || pick('img', node);
    if (img && c.imageUrl) setAttr(img, 'src', mediaUrl(c.imageUrl));
  });
};

/* Roles a theme has a page for but the API has no concept of. Saying so out
   loud is better than a page that quietly shows demo data forever. */
pages.vendor = async () => warn('This store has no vendors; the vendor pages stay as the theme shipped them.');
pages.unknown = async () => log('no binder for this page; only the header and search were wired');
pages.paymentFailed = async () => {};
pages.invoice = pages.order;

/* ---------------------------------------------------------------------------
   11. BOOT

   Order matters here. The theme's own scripts initialise sliders, tooltips and
   lazy images against whatever DOM exists when they run, so anything we add
   afterwards is invisible to them: a carousel would count the demo slides, not
   the real ones.

   Two ways out, and this file supports both:

   A. DEFAULT — hydrate, then call the theme's reinit() to refresh the plugins
      over what we changed. Needs no change to any page beyond the one script
      tag. This is what happens if you do nothing.

   B. BETTER — give the theme's own script tags type="text/merch-deferred":

        <script type="text/merch-deferred" src="js/main.js"></script>

      We then run them ourselves, in their original order, AFTER the data is
      on the page. The theme initialises over real content and there is
      nothing to refresh. Three of the four themes already show a preloader
      over exactly this window, so the shopper sees no extra wait.

   Either way the theme's scripts always run. A store that is down leaves an
   ordinary (static) page, never a dead one.
--------------------------------------------------------------------------- */

function deferredThemeScripts() {
  return $$('script[type="text/merch-deferred"]');
}

/* A site served with `require-trusted-types-for 'script'` refuses a plain
   string assigned to script.src — and we assign one for every theme script we
   are holding, so on such a site NONE of them would run and the page would be
   dead. Mint a policy when the browser asks for one. */
let scriptUrlPolicy;
function trustedScriptUrl(url) {
  try {
    if (!window.trustedTypes?.createPolicy) return url;
    scriptUrlPolicy ??= window.trustedTypes.createPolicy('merch-theme-scripts', { createScriptURL: (u) => u });
    return scriptUrlPolicy.createScriptURL(url);
  } catch {
    return url;   // a policy this page will not allow: try the plain string
  }
}

async function runDeferredThemeScripts() {
  const tags = deferredThemeScripts();
  for (const old of tags) {
    await new Promise((resolve) => {
      const s = document.createElement('script');
      for (const { name, value } of old.attributes) {
        if (name === 'type' || name === 'src' || name === 'data-merch-type') continue;
        s.setAttribute(name, value);
      }
      /* Put back the type the tag had BEFORE it was marked. `type="module"` is
         not decoration: re-running such a file as a classic script throws on
         its first `import`/`export`, and whatever it powered dies quietly —
         which is how 35 of these pages lost their product zoom and lightbox. */
      const originalType = old.getAttribute('data-merch-type');
      if (originalType) s.type = originalType;
      if (old.src) s.src = trustedScriptUrl(old.getAttribute('src'));
      if (!old.src) { s.textContent = old.textContent; }
      s.onload = resolve;
      s.onerror = () => { warn('theme script failed: ' + old.src); resolve(); };
      old.parentNode.replaceChild(s, old);
      if (!old.src) resolve();     // an inline script has already run by now
    });
  }
  if (tags.length) log('ran ' + tags.length + ' theme scripts after hydration');

  /* A theme script that waits for the page to be ready registers its handler
     AFTER the real event has fired, because we ran it late on purpose. Those
     handlers then never run at all: one theme starts every carousel inside
     `$(window).on('load')`, so its hero never initialised and the headline
     sat at opacity 0 — a blank banner on the shop's front page.

     Firing both events once, after the scripts are in, makes the deferral
     invisible to them. Neither can have run for these listeners already. */
  if (tags.length) {
    try {
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
      window.dispatchEvent(new Event('load'));
    } catch (e) { warn('could not replay the ready events', e); }
  }
}

async function boot() {
  /* No store address at the top of this file: the shop is not live yet. Touch
     nothing — every theme keeps its own demo products, prices, images and
     posts — but STILL run the theme's own scripts, because this page handed
     them to us and a page whose scripts never run is a dead page, not a demo. */
  if (!LIVE) {
    console.info(
      '[merch] No store address set, so the page is showing the theme\u2019s own demo content. ' +
      'Put your shop\u2019s URL in STOREFRONT_URL at the top of merch/merch.js to show your real catalogue.',
    );
    await runDeferredThemeScripts();
    return;
  }

  THEME = detectTheme();
  if (!THEME) {
    warn('no theme recognised for ' + location.pathname + ' — set data-theme on the script tag');
    await runDeferredThemeScripts();
    return;
  }
  PAGE = detectRole();
  log('theme=' + THEME.name, 'page=' + PAGE);

  /* The currency has to be right before anything is priced, so this one call
     is awaited ahead of the page. Everything else happens inside the binder. */
  /* A display currency the shopper chose earlier, EXCEPT where they are about
     to agree to an amount — the store charges in its own currency. */
  DISPLAY = displayCurrencyFor(PAGE);
  await loadStoreSettings();

  /* Things every page has: the basket count in the header, the search box,
     and a category menu pointing at real categories. */
  /* Sign-in forms are not only on the sign-in page — these themes put one in a
     header dropdown and an offcanvas panel too, and an unwired one submits the
     password in the URL. Wire every form on every page. */
  try { wireAuthForms(); } catch (e) { warn('auth forms', e); }

  /* The account controls are spread across several pages that no single role
     covers — fashion keeps its change-password form on `account-setting.html`
     and its addresses on `account-addresses.html`, and every theme puts a
     Logout link in the header of all of them. Wire whichever are present. */
  if (token.get()) {
    try { wirePasswordChange(); wireAddressForm(); wireSignOut(); }
    catch (e) { warn('account controls', e); }
  }

  paintHeader();
  cart.onChange(paintHeader);
  try { paintStoreChrome(STORE); } catch (e) { warn('store chrome', e); }
  try { paintAnnouncement(STORE); } catch (e) { warn('announcement', e); }
  try { paintUsps(STORE); } catch (e) { warn('usps', e); }
  try { paintSocialLinks(STORE); } catch (e) { warn('social links', e); }
  paintCurrencySwitcher().catch((e) => warn('currency switcher', e));
  /* Two of these themes BUILD their currency control from their own script,
     so at this point there is nothing on the page to find and the header went
     on claiming USD over rupee prices. Run it again once they have. */
  onThemeReady(() => { paintCurrencySwitcher().catch((e) => warn('currency switcher', e)); });
  if (PAGE !== 'listing') { wireSearchInputs(null); wireCategoryLinks(); }

  const run = PAGE.startsWith('policy:') ? () => pages.policy(PAGE.slice(7)) : (pages[PAGE] || pages.unknown);
  try { await run(); }
  catch (e) {
    /* A hydration bug must not take the shop down with it: the page stays as
       the theme shipped it and the reason goes to the console. */
    warn('page "' + PAGE + '" failed to hydrate', e);
  }

  /* Whatever the role did not reach. */
  try { await fillStrayStrips(); } catch (e) { warn('stray strips', e); }
  if (PAGE !== 'blog') { try { await paintBlogStrip(4); } catch (e) { warn('blog strip', e); } }
  try { wireQuickView(); } catch (e) { warn('quick view', e); }

  await runDeferredThemeScripts();
  /* Only needed on path A; on path B the theme has just initialised over the
     finished DOM and there is nothing to refresh. */
  if (!deferredThemeScripts().length) { try { THEME.reinit?.(); } catch (e) { warn(e); } }
  runAfterTheme();
}

/* Modules are deferred, so the document is usually parsed by now; the guard is
   for anyone who loads this file some other way. */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

/* What a page may want to reach for. Everything else is deliberately private —
   the surface you integrate against is the API object, not this file's guts. */
export { api as default, CONFIG, THEMES, pages, money, notify, renderProducts, pageUrl };
