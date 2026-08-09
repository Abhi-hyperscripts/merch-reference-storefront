/* ---------------------------------------------------------------------------
   THE ONLY FILE YOU HAVE TO EDIT.

   Point this at your own store and everything else works unchanged.

   Your store IS the API — there is no separate API host to sign up for. If
   your shop is at https://shop.mybrand.com, that is the value below.
--------------------------------------------------------------------------- */

export const API_BASE = 'http://localhost:8081';

/* Google Sign-In. Leave blank and the storefront simply runs as guest-only:
   browsing, cart and checkout all work without an account, and the account
   page explains why it is switched off rather than showing a dead button.

   To switch it on, put your Google OAuth **client ID** here AND set the same
   one in the store's admin panel. Both sides must agree — the store rejects a
   token minted for a different client id, which is what stops a token issued
   to some other app being replayed against your shop. */
export const GOOGLE_CLIENT_ID = '';

/* Fallback currency, used only for the split second before /api/theme and
   /api/currencies answer on a cold load. The store is the real authority. */
export const FALLBACK_CURRENCY = { code: 'INR', symbol: '₹' };
