/* ---------------------------------------------------------------------------
   THE ONLY FILE YOU HAVE TO EDIT.

   Point this at your own store and everything else works unchanged.

   Your store IS the API — there is no separate API host to sign up for. If
   your shop is at https://shop.mybrand.com, that is the value below.
--------------------------------------------------------------------------- */

/* Out of the box this is 'demo', which runs a pretend shop entirely in the
   browser so you can click through the whole flow the moment you clone this —
   no server, no store, no setup at all. See js/demo-store.js.

   Replace it with your own shop and the demo switches itself off:

     export const API_BASE = 'https://shop.mybrand.com';

   For a store you are running locally, that is usually 'http://localhost:8081'. */
export const API_BASE = 'demo';

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

/* --- Demo mode -------------------------------------------------------------
   Delete these two lines (and js/demo-store.js) once you are pointed at a real
   store. Nothing else in the project refers to either. */
import { installDemo } from './js/demo-store.js';
installDemo(API_BASE);
