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

  /* The store's own flag on a 401: the token was ENDED by a password change,
     a reset, a Google claim or a sign-out-everywhere on another device. A
     merely expired or invalid token answers 401 without it ("Sign in to
     continue."). request() has already forgotten the token either way; on this
     one the shopper deserves the reason. */
  get sessionEnded() {
    return this.status === 401 && this.body.sessionEnded === true;
  }

  /* Over the rate limit. Back off; do not treat as a hard failure. */
  get isRateLimited() {
    return this.status === 429;
  }

  /* No token, an expired one, or one minted before the shopper last changed
     their password (a change on another device ends this session). Send them
     to sign in again. */
  get isUnauthenticated() {
    return this.status === 401;
  }
}

/* --- The shopper token -----------------------------------------------------
   A JWT the server checks against the account's credential version, so a
   password change, a reset or a "sign out everywhere" elsewhere ends it (you
   see a 401). There is no per-device session to close: signing out of THIS
   device is just forgetting the string; signing out everywhere is
   `signOutEverywhere()` below.

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
     actually require an account. `auth: 'optional'` is for the routes
     that serve guests but read the account when a token is present (checkout,
     create-order, cart save — which attach the order/cart to the account — and
     the order page, which fills `access` only for the owner) — without it, an order a
     signed-in shopper placed was a GUEST order: absent from their account and
     un-cancellable. That was this client's most expensive defect. */
  let sentToken = false;
  if (auth === true || auth === 'optional') {
    const t = token.get();
    if (t) { headers['Authorization'] = `Bearer ${t}`; sentToken = true; }
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
  let text;
  try {
    text = await res.text();
  } catch (networkError) {
    /* The connection can also drop AFTER the headers arrived (a Wi-Fi handoff,
       a truncated response): reading the body then rejects with the same bare
       TypeError, and it is the same transient failure — not a bug in the reply. */
    throw new ApiError(
      'Could not reach the store. Check your connection and try again.',
      0,
      { networkError: String(networkError) },
    );
  }
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
    /* A 401 on a request that carried our token means the token is dead —
       forget it here, once, so no page has to remember to. The page then sees
       `err.sessionEnded` and can offer sign-in (or continue as a guest, on the
       routes that allow it). */
    if (res.status === 401 && sentToken) token.clear();   // the flag, if any, is the server's — not synthesised here
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
  /* `attr` may be given as an array: the API takes the parameter REPEATED, one
     key:value per occurrence. Joining with a comma would read as several values
     of the first key, silently. */
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) { for (const each of v) u.append(k, String(each)); }
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? '?' + s : '';
}

/* --- The endpoints --------------------------------------------------------
   Grouped the way a storefront actually uses them. Everything here maps 1:1
   to something in the published reference; nothing is invented. */

let themeOnce = null;
export const api = {
  /* Store identity and settings ------------------------------------------- */
  currencies: () => request('/api/currencies'),
  /* Memoised per page: the chrome and the hero both need it on index, and it
     is the same document. A failure is not cached, so a retry can succeed. */
  theme: () => themeOnce ??= request('/api/theme').catch((e) => { themeOnce = null; throw e; }),
  authConfig: () => request('/api/auth/config'),
  paymentConfig: () => request('/api/payment/config'),

  /* Browsing --------------------------------------------------------------
     `/api/catalog` is paged (`page`, `pageSize` up to 200; totals in the
     `X-Total-Count` / `X-Total-Pages` headers) and returns the page as a bare
     array. This demo pulls one big page; with a big catalogue you would
     filter server-side via `search`, `category`, `brand`, `color`, `size` and
     `attr` — `/api/catalog/facets` gives the counts for a rail.

     `sort` accepts exactly 'price_asc', 'price_desc' or 'name'. Anything else
     is IGNORED rather than rejected, so a typo quietly returns catalogue
     order instead of erroring. */
  catalog: (opts) => request('/api/catalog' + qs(opts)),
  /* The merchant's home page, resolved: an ordered list of sections, each
     carrying what it renders (banners, category/brand tiles, products,
     groups). See catalog.js loadHome() for how each type is drawn. */
  homepage: (locale) => request('/api/homepage' + qs({ locale })),
  /* Recently viewed is per viewer: the same session id the events use, plus the
     shopper token when signed in (auth optional on both). */
  recentlyViewed: (sessionId, limit) => request('/api/recently-viewed' + qs({ sessionId, limit }), { auth: 'optional' }),
  recordView: (itemId, sessionId) =>
    request('/api/recently-viewed', { method: 'POST', body: { itemId, sessionId }, auth: 'optional' }),
  product: (id) => request(`/api/catalog/${encodeURIComponent(id)}`),
  /* The cart's line-sync: ONE call for every line (`ids=` ignores every other
     filter). A product per line is N calls against the same 120/min bucket. */
  products: (ids) => ids.length ? request('/api/catalog' + qs({ ids: ids.join(',') })) : Promise.resolve([]),   // an EMPTY ids= is dropped by qs() and would return the whole catalogue
  categories: () => request('/api/categories'),
  variants: (id) => request(`/api/products/${encodeURIComponent(id)}/variants`),
  reviews: (id) => request(`/api/products/${encodeURIComponent(id)}/reviews`),
  collections: () => request('/api/collections'),
  collection: (handle) => request(`/api/collections/${encodeURIComponent(handle)}`),
  blog: () => request('/api/blog'),
  post: (slug) => request(`/api/blog/${encodeURIComponent(slug)}`),

  /* Cart previews ---------------------------------------------------------
     These only ever LOOK. Nothing is applied or redeemed until checkout, so
     they are safe to call on every cart edit — except checkGiftCard, which
     sits on the 15/minute sign-in bucket: call it on a deliberate Apply.

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
  /* Closing the payment window WITHOUT paying: releases the stock and gift-card
     holds create-order took, so the shopper's own retry is not refused as
     "sold out" by their own abandoned attempt. Fire-and-forget. */
  abandonPayment: (razorpayOrderId) =>
    request('/api/payment/abandon', { method: 'POST', body: { razorpayOrderId } }),
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
  checkout: (payload) => request('/api/checkout', { method: 'POST', body: payload, auth: 'optional' }),
  createPaymentOrder: (payload) =>
    request('/api/payment/create-order', { method: 'POST', body: payload, auth: 'optional' }),
  verifyPayment: (payload) =>
    request('/api/payment/verify', { method: 'POST', body: payload }),

  /* Orders ----------------------------------------------------------------
     Three shapes for the same order, depending how you ask — this is the one
     part of the API most likely to trip you up:
       lookupOrder()      -> the order, bare
       order()            -> { order, events, access, items }   <- WRAPPED
       myOrders()         -> an array of orders          */
  /* `phone` only when a 404 carried `phoneRequired: true` (the address changed
     hands after the order — see the guide). */
  lookupOrder: (email, reference, phone) =>
    request('/api/orders/lookup', { method: 'POST', body: phone ? { email, reference, phone } : { email, reference } }),
  order: (id) => request(`/api/orders/${encodeURIComponent(id)}`, { auth: 'optional' }),   // the token decides whether `access` (paid downloads) is filled for an order the account owns; the route never 401s

  /* Signed-in shopper ------------------------------------------------------
     Every one of these needs a token — except the sign-in itself, which is
     where the token comes from. */
  signInWithGoogle: (credential) =>
    request('/api/shopper/google', { method: 'POST', body: { credential } }),
  me: () => request('/api/shopper/me', { auth: true }),
  myOrders: () => request('/api/shopper/orders', { auth: true }),
  /* Sign out everywhere: every other token of this account is refused from now on; the reply carries a fresh
     token for THIS device (store it — the one you sent is dead too). Needs no password, so a Google-only account
     can end a token copied from a lost phone. */
  signOutEverywhere: () => request('/api/shopper/sessions/revoke', { method: 'POST', auth: true }),

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
    request('/api/cart/save', { method: 'POST', body: { email, lines }, auth: 'optional' }),

  /* Email + password accounts. Every reply that signs the shopper in is
     { token, shopper, passwordDropped }. The 400s carry a flag you can branch
     on: exists (409, register), weakPassword, invalidLink (reset),
     useForgotPassword / wrongCurrentPassword / samePassword (change). */
  /* Build `resetUrl` on `authConfig().password.resetOrigin` — the origin the
     store is configured with — not on location.origin: a shopper on www. when
     the store is on the apex is refused with a 400 meant for you, not them. */
  register: (email, password, name, phone) =>
    request('/api/shopper/register', { method: 'POST', body: { email, password, name, phone } }),
  login: (email, password) =>
    request('/api/shopper/login', { method: 'POST', body: { email, password } }),
  forgotPassword: (email, resetUrl) =>
    request('/api/shopper/password/forgot', { method: 'POST', body: { email, resetUrl } }),
  resetPassword: (resetToken, newPassword) =>
    request('/api/shopper/password/reset', { method: 'POST', body: { token: resetToken, newPassword } }),
  /* Answers { ok, token } — store the new token; every other session has ended. */
  changePassword: (currentPassword, newPassword) =>
    request('/api/shopper/password/change', { method: 'POST', body: { currentPassword, newPassword }, auth: true }),
};
