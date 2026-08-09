/* ---------------------------------------------------------------------------
   api.js — every call to the store goes through here.

   There is one reason to funnel all of it through a single file: the store
   reports failure in exactly one shape, and handling that in one place means
   no page ever has to think about it.

       { "error": "Your cart is empty." }

   The message is written to be shown to a shopper as-is, so `err.message` is
   safe to put straight on the screen. You do not need your own copy.
--------------------------------------------------------------------------- */

import { API_BASE } from '../config.js';

/* A failed call throws this rather than returning something falsy, so a caller
   that forgets to check does not silently carry on with undefined. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body || {};
  }

  /* 503 + storeUnavailable means the shop itself is briefly unreachable — the
     shopper did nothing wrong and a retry is likely to work. Worth telling
     apart from an ordinary refusal so you can offer "try again" instead of
     asking them to fix input that was already fine. */
  get isStoreDown() {
    return this.status === 503 && this.body.storeUnavailable === true;
  }

  /* Over the rate limit. Back off; do not treat as a hard failure. */
  get isRateLimited() {
    return this.status === 429;
  }

  /* No token, or an expired one. Send them to sign in again. */
  get isUnauthenticated() {
    return this.status === 401;
  }
}

/* --- The shopper token -----------------------------------------------------
   A stateless JWT. There is no session on the server to keep in step, so
   "signing out" is genuinely just forgetting the string.

   localStorage (not a cookie) because the credential travels as an
   Authorization header. That is also what lets the storefront live on a
   different domain to the shop without any proxy or cookie-domain juggling. */

const TOKEN_KEY = 'merch.token';

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/* --- The request itself --------------------------------------------------- */

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  /* Only attach the token where it is wanted. Sending it on public reads would
     work, but it makes it harder to see which parts of your storefront
     actually require an account. */
  if (auth) {
    const t = token.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    /* fetch only rejects when the request never completed — DNS, offline, TLS,
       or a CORS block. An HTTP 500 is a *resolved* promise, so it is handled
       below and not here. */
    throw new ApiError(
      'Could not reach the store. Check your connection and try again.',
      0,
      { networkError: String(networkError) },
    );
  }

  if (res.status === 204) return null;

  /* Read the body as text first. An error page from a proxy in front of the
     store is HTML, and res.json() on it throws a parse error that hides the
     status code — which is the one thing actually worth knowing. */
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      (data && data.error) ||
      `The store answered ${res.status} and we could not read why.`;
    throw new ApiError(message, res.status, data);
  }

  return data;
}

/* Absolute URL for an image the store returned. Product images come back as
   store-relative paths ("/api/media/ph/ITM-001-a.svg"), so a storefront hosted
   on another domain must prefix them or every image 404s against itself. */
export function mediaUrl(path) {
  if (!path) return '';
  /* Already absolute, or self-contained (a data: or blob: URI). Prefixing
     either would produce a broken URL. */
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return API_BASE + path;
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/* --- The endpoints --------------------------------------------------------
   Grouped the way a storefront actually uses them. Everything here maps 1:1
   to something in the published reference; nothing is invented. */

export const api = {
  /* Store identity and settings ------------------------------------------- */
  theme: () => request('/api/theme'),
  currencies: () => request('/api/currencies'),
  authConfig: () => request('/api/auth/config'),
  paymentConfig: () => request('/api/payment/config'),

  /* Browsing --------------------------------------------------------------
     No pagination — one call returns the whole visible catalogue as a bare
     array. With a big catalogue you would filter server-side via `search`
     and `category` rather than pulling everything and slicing it here.

     `sort` accepts exactly 'price_asc', 'price_desc' or 'name'. Anything else
     is IGNORED rather than rejected, so a typo quietly returns catalogue
     order instead of erroring. */
  catalog: (opts) => request('/api/catalog' + qs(opts)),
  product: (id) => request(`/api/catalog/${encodeURIComponent(id)}`),
  categories: () => request('/api/categories'),
  variants: (id) => request(`/api/products/${encodeURIComponent(id)}/variants`),
  reviews: (id) => request(`/api/products/${encodeURIComponent(id)}/reviews`),
  collections: () => request('/api/collections'),
  collection: (handle) => request(`/api/collections/${encodeURIComponent(handle)}`),
  blog: () => request('/api/blog'),
  post: (slug) => request(`/api/blog/${encodeURIComponent(slug)}`),

  /* Cart previews ---------------------------------------------------------
     These only ever LOOK. Nothing is applied or redeemed until checkout, so
     they are safe to call on every cart edit.

     Note the store recomputes the subtotal from its own live prices rather
     than trusting a total the browser sends — which is why these take lines
     and not an amount. */
  validateCoupon: (code, lines) =>
    request('/api/coupon/validate', { method: 'POST', body: { code, lines } }),
  autoDiscount: (lines) =>
    request('/api/discounts/auto', { method: 'POST', body: { lines } }),
  bxgy: (lines) =>
    request('/api/discounts/bxgy', { method: 'POST', body: { lines } }),
  checkGiftCard: (code) =>
    request('/api/giftcard/check', { method: 'POST', body: { code } }),
  shippingQuote: (pincode, lines, paymentMethod) =>
    request('/api/shipping/quote', {
      method: 'POST',
      body: { pincode, lines, paymentMethod },
    }),

  /* Placing an order ------------------------------------------------------
     TWO PATHS, AND YOU MUST PICK ONE. They take an identical body, so nothing
     about their shapes tells you which is right.

       Paying later (cash on delivery)
         checkout()  ->  the order exists. Done.

       Paying now (card / UPI)
         createPaymentOrder()  ->  open the gateway  ->  verifyPayment()
         and it is verifyPayment that CREATES the order.

     Calling checkout() as well on the prepaid path places a second, unpaid
     order for the same basket. See checkout.js for the flow in full. */
  checkout: (payload) => request('/api/checkout', { method: 'POST', body: payload }),
  createPaymentOrder: (payload) =>
    request('/api/payment/create-order', { method: 'POST', body: payload }),
  verifyPayment: (payload) =>
    request('/api/payment/verify', { method: 'POST', body: payload }),

  /* Orders ----------------------------------------------------------------
     Three shapes for the same order, depending how you ask — this is the one
     part of the API most likely to trip you up:
       lookupOrder()      -> the order, bare
       order()            -> { order, events, access }   <- WRAPPED
       myOrders()         -> an array of orders          */
  lookupOrder: (email, reference) =>
    request('/api/orders/lookup', { method: 'POST', body: { email, reference } }),
  order: (id) => request(`/api/orders/${encodeURIComponent(id)}`),

  /* Signed-in shopper ------------------------------------------------------
     Every one of these needs a token. */
  signInWithGoogle: (credential) =>
    request('/api/shopper/google', { method: 'POST', body: { credential } }),
  me: () => request('/api/shopper/me', { auth: true }),
  myOrders: () => request('/api/shopper/orders', { auth: true }),

  addresses: () => request('/api/shopper/addresses', { auth: true }),
  addAddress: (a) => request('/api/shopper/addresses', { method: 'POST', body: a, auth: true }),
  updateAddress: (id, a) =>
    request(`/api/shopper/addresses/${id}`, { method: 'PUT', body: a, auth: true }),
  deleteAddress: (id) =>
    request(`/api/shopper/addresses/${id}`, { method: 'DELETE', auth: true }),
  makeAddressDefault: (id) =>
    request(`/api/shopper/addresses/${id}/default`, { method: 'POST', auth: true }),

  wishlist: () => request('/api/shopper/wishlist', { auth: true }),
  addToWishlist: (itemId) =>
    request('/api/shopper/wishlist', { method: 'POST', body: { itemId }, auth: true }),
  removeFromWishlist: (itemId) =>
    request(`/api/shopper/wishlist/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      auth: true,
    }),

  /* Reviews. Posting needs a token; `verified` comes back decided by the
     store from the shopper's own order history — it is not something the
     client gets to claim. */
  postReview: (itemId, review) =>
    request(`/api/products/${encodeURIComponent(itemId)}/reviews`, {
      method: 'POST',
      body: review,
      auth: true,
    }),

  /* Analytics. Fire-and-forget; never block a page on it. `sessionId` is
     yours to invent — it only has to be stable for one visit so the store can
     group a session's events. Unknown event types are dropped rather than
     rejected, and the reply says how many of the batch it actually kept. */
  events: (sessionId, events) =>
    request('/api/events', { method: 'POST', body: { sessionId, events } }),

  /* Saves the basket against an email so the shop can send an abandoned-cart
     reminder. Needs NO token — the email is the key, which is what lets it
     work for a guest who typed their address at checkout and then left.

     The lines carry name and price too, because the reminder email has to
     render the basket as it looked at the time, not as it is priced today. */
  saveCart: (email, lines) =>
    request('/api/cart/save', { method: 'POST', body: { email, lines } }),
};
