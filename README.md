# Merch reference storefront

A complete, working shop front built on the **Merch storefront API** — in plain
HTML, CSS and JavaScript.

No framework. No build step. No dependencies to install. Open the folder, serve
it, and it runs. If you can read a `.js` file you can read all of this.

It exists so you do not have to start from an empty directory. Take it, point it
at your store, and change whatever you like — or read it once, throw it away and
write your own now that you know what the API expects.

---

## Run it in two minutes

```bash
git clone https://github.com/Abhi-hyperscripts/merch-reference-storefront
cd merch-reference-storefront

# Any static server will do; here are three.
python3 -m http.server 5610
#   npx serve -l 5610
#   php -S localhost:5610
```

Then open <http://localhost:5610>. **There is no step two** — it ships in demo
mode and runs a pretend shop entirely in the browser, so you can click through
the catalogue, cart, coupons, checkout and order tracking before you have a
store to point it at. Try coupon `WELCOME10` and gift card `GIFT500`.

When you are ready, edit one line in `config.js`:

```js
export const API_BASE = 'https://shop.mybrand.com';
```

The demo switches itself off the moment that is not `'demo'`. Once you are on
a real store, delete `js/demo-store.js` and the two demo lines at the bottom of
`config.js` — nothing else refers to either, deliberately, so the code you are
learning from is the code that talks to a real shop.

**It must be served over `http://`, not opened as a file.** The code uses ES
modules (`import` / `export`), which browsers refuse to load from `file://`.
That is the only requirement.

### Deploying it

It is a folder of static files, so anywhere that serves static files works:
GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, or nginx on a box you
already own. There is nothing to build and no server-side runtime.

You do **not** need to host it on the same domain as your shop. The store
answers requests from any origin on purpose, and the credential is an
`Authorization` header rather than a cookie, so nothing depends on the two
sharing a site.

---

## What's in the box

| File | What it does |
|---|---|
| `config.js` | **The only file you must edit.** API base URL, Google client id. |
| `index.html` / `js/catalog.js` | The store's home (`GET /api/homepage`: banners, tiles, product rails, recently viewed) + catalogue: search, category, sort, in-stock, collections |
| `product.html` / `js/product.js` | One product: gallery, variants, stock, reviews |
| `collection.html` / `js/collection.js` | A curated group of products |
| `cart.html` / `js/cart-page.js` | Basket, coupon, gift card, shipping quote |
| `checkout.html` / `js/checkout.js` | **Both payment paths.** Read this one carefully. |
| `order.html` / `js/order.js` | Confirmation, status, timeline, downloads |
| `track.html` / `js/track.js` | Find an order with email + reference, no account |
| `account.html` / `js/account.js` | Sign-in (Google and email + password), orders, addresses, wishlist |
| `reset.html` / `js/reset.js` | The page a forgot-password email links to |
| `test/domsmoke.mjs` | `node test/domsmoke.mjs` runs every page script against the demo mock under a fake DOM and fails on any unhandled error — the check that catches a script throwing inside its own catch — then every `test/scenarios/*.mjs`, which drives a booted page (fires listeners, fails one route, edits the cart, opens a product, filters while the home is in flight) and asserts what it wrote, stored and sent |
| `js/api.js` | Every network call. One error shape, handled once. |
| `js/cart.js` | Basket state in `localStorage` |
| `js/ui.js` | Money, escaping, header/footer, toasts, product card |
| `js/demo-store.js` | **Scaffolding — delete it.** The pretend shop, so this runs with no backend |
| `css/base.css` | Reset, design tokens, layout |
| `css/components.css` | Cards, buttons, forms, everything else |

**The home page is the store's.** `index.html` first draws `GET /api/homepage` into `#home` — the
merchant's ordered sections, each already resolved (banners with a mobile image, category and brand
tiles, product rails, per-category groups, and a "recently viewed" rail this client fetches itself from
`GET /api/recently-viewed` with its session id). `catalog.js` `renderHome()` is one switch on the section
`type`; a type it does not know is skipped, and a failed read leaves the block hidden and is retried on the
next Clear / back / Apply (never cached), so the filterable catalogue grid below is always the page. The
home belongs to the **unfiltered** page only: a tile's own link (`?category=`), a search, a brand, a sort or
"in stock only" changes the grid and the home is hidden above it, re-shown on the way back — rendered once
per page life (a failed read — including a connection that drops mid-body — is retried; a render bug is
not, and is reported in the console). A banner may link to http(s), `mailto:`, `tel:` or a store-relative
path; `/collections/<handle>` and `/product/<id>` are mapped onto this client's own pages, other paths are
left as the store sent them. A brand
tile filters by slug (`?brand=`); the form has no brand field, so an active brand shows as a chip in the
filter row with its own clear that keeps the other filters. `product.js` records each view with
`api.recordView` (and the `product_view` event) so the rail fills as the shopper browses.

---

## The five things worth knowing before you change anything

### 1. There are two ways to place an order, and they take an identical body

This is the one mistake here that costs real money.

```
Paying later (cash on delivery)
  POST /api/checkout                 <- this creates the order. Done.

Paying now (card / UPI / net banking)
  POST /api/payment/create-order     -> nothing is ordered yet
  open the gateway
  POST /api/payment/verify           <- THIS creates the order
```

On the prepaid path, calling `/api/checkout` **as well** places a second,
unpaid order for the same basket. Nothing in the request or response shapes
will warn you — they are the same shape either way.

Two things you therefore do not have to build: `verify` is idempotent (calling
it twice returns the order already created), and if the shopper pays then closes
the tab before `verify` runs, the store still receives the gateway's own
server-to-server notification and creates the order anyway.

See `js/checkout.js`.

### 2. The browser never decides a price

Coupons, automatic discounts, gift cards and shipping are all previews computed
by the store from its own live prices. You send lines; it sends back money.

That is not ceremony. If the browser could name a subtotal, anyone could name a
cheaper one. It also means the totals you show are figures the store has already
agreed to — so what the shopper sees is what they are charged.

### 3. `available: false` on a shipping quote does not mean "we cannot deliver"

It reports whether a **live courier rate** was found. A store on flat-rate
shipping, or one that has not connected a courier account, answers
`available: false` on every quote while shipping perfectly happily.

Read `options` instead — it is always populated, and `shipping` is the cheapest
option's amount. Wiring the obvious-looking flag to "we cannot deliver to your
pincode" tells most shoppers of most stores that the shop does not serve them.

### 4. The same order comes back in three different shapes

```
GET  /api/orders/{id}      ->  { order, events, access, items }    WRAPPED
POST /api/orders/lookup    ->  the order, bare
GET  /api/shopper/orders   ->  an array of orders
```

Reading `data.orderRef` where you should read `data.order.orderRef` gives you a
page full of `undefined` and no error to explain it.

### 5. Every failure is the same JSON shape

```json
{ "error": "Your cart is empty." }
```

The message is written to be shown to a shopper as-is, so you do not need your
own copy for each case. Status codes: `400` refused, `401` no/expired token,
`403` not yours — on `password/change` it means the address now belongs to
another account (`sessions/revoke` still works for that account — it needs no
address); on `orders/{id}/cancel` it means the
order belongs to another account, `404` unknown id, `409` already
exists / changed elsewhere (register carries `"exists": true`), `429` rate
limited, `503` store briefly unreachable (this one also carries
`"storeUnavailable": true`, so you can offer a retry instead of blaming input
that was already fine).

All of it is handled once, in `js/api.js`.

---

## A few smaller traps

- **Product images are store-relative** (`/api/media/ph/ITM-001-a.svg`). Prefix
  them with your API base or they 404 against your own domain. `mediaUrl()` in
  `js/api.js` does it.
- **`/api/catalog` is paged**: `page` and `pageSize` (default 24, at most 200),
  with `X-Total-Count` / `X-Total-Pages` headers. It returns a bare array of the
  page. Filter server-side with `search`, `category`, `brand`, `color`, `size`
  and `attr` rather than pulling everything; `/api/catalog/facets` gives the
  counts to draw a filter rail from.
- **`sort` accepts exactly `price_asc`, `price_desc`, `name`.** Anything else is
  ignored rather than rejected, so a typo silently returns catalogue order.
- **`amount` from `create-order` is in paise**, not rupees. Do not multiply by
  100 again — the store already has.
- **Digital items cannot be cash on delivery.** The store refuses it; show the
  right options rather than letting the shopper be turned away at the end.
- **Rate limits** are per IP per minute: 15 sign-in and everything worth
  guessing (register, login, Google, forgot/reset/change, sign-out everywhere,
  gift-card check, guest order lookup, posting a review), 25 checkout/payment,
  creating a return or subscription, and order cancel, 90 cart previews,
  shipping quotes and every signed-in account read or write (me, orders, addresses,
  wishlist, cart save, listing returns and subscriptions), 120 browsing (theme,
  catalogue, facets, categories, collections, currencies, auth/config,
  payment/config, product-by-id, events, order-by-id, the home page, recently viewed). A page that
  renders theme + catalogue + facets + categories + auth/config spends five of
  the 120 (`index.html` spends seven: theme, currencies, home page, categories,
  collections, catalogue, recently viewed); an address book edit spends one of the 90.
- **Do not stack a coupon on top of an automatic discount in your own maths.**
  Whether they combine is decided by the merchant's books, not by the
  storefront, so subtracting both quietly promises a discount that may never
  arrive. Use the `newSubtotal` each preview returns — that is the store's own
  figure. (Found the hard way: the cart said ₹1,624.15 and the order came to
  ₹2,249.10.) `js/cart-page.js` shows the conservative version.
- **`giftCardApplied`, `amountDue`, `paymentMethod` and `amountUncollected` are
  on every order shape** — `GET /api/orders/{id}`, the account list and
  `POST /api/orders/lookup` — so a confirmation page can re-fetch them. Read
  `paymentMethod` before labelling `amountDue`: on `online` it is money already
  taken; on `cod` it is what the courier has yet to collect. `js/checkout.js`
  still stashes the checkout reply so the page renders before the re-fetch.
- **Whatever carries a coupon to checkout must survive a refresh.** Hanging it
  off the Checkout button looks equivalent and is not: a bookmark, a reload or
  the back button then arrives with no coupon and the shopper is charged more
  than the cart quoted, silently.

---

## Sign-in

The sign-in page implements both methods the store offers: Google, and email +
password (one form with sign-in / create-account / forgot-password modes; the
reset email lands on `reset.html`). The account page implements **change
password** and **sign out everywhere**, and shows the recycled-address state
(`emailDetached`). `js/api.js` exposes the whole password surface (`register`,
`login`, `forgotPassword`, `resetPassword`, `changePassword`) — see the store's
`/api/docs/` and `docs/STOREFRONT_API_GUIDE.md`. The reset link is built on
`auth/config`'s `password.resetOrigin` — the store's configured public origin —
so `reset.html` must be served from THAT origin (a storefront hosted elsewhere
needs the store's `Storefront__PublicUrl` set to where the storefront lives). `GET /api/auth/config` tells you whether Google
is switched on and whether reset-by-email works for a given store (password
sign-in itself is always on). The store hashes passwords itself; your page never
stores one.

**The token travels with checkout.** `checkout`, `createPaymentOrder`,
`saveCart` and `order` send the token when one is stored (`auth: 'optional'`),
so a signed-in shopper's order lands on their account — and the order page's
paid downloads (`access`) are filled only for the account that owns it. A `401` on any request that
carried the token means the token is dead: `request()` forgets it either way.
When the store ENDED the session (a password change, a reset or a
sign-out-everywhere elsewhere) the body carries `sessionEnded: true` and the
`ApiError` reads `sessionEnded === true` — offer sign-in; a token that merely
expired is a plain `401` with no flag. Either way, continue as a guest on the
routes that allow it. Every `4xx`/`5xx` body is `{ error, …flags }`
(`exists`, `useForgotPassword`, `wrongCurrentPassword`, `samePassword`,
`weakPassword`, `invalidLink`, `storeUnavailable`, `needsSetup`, `sessionEnded`,
`permanent` (on `payment/verify`'s 502: captured money whose order will never be
created — say "contact the store", never "pay again"), `phoneRequired` (on
every `orders/lookup` 404: reveal the phone field and resend with the phone
typed at checkout — the flag is on every miss so it cannot reveal a handed-over
order; the order's own `id` as the reference needs no phone), plus the recovery data
some refusals carry: `giftCardAvailable`, `availableQty`,
`orderId` + `amountDue`, `subscriptionId` + `status`); branch on the flags, show
the `error` text.

Google, step by step:

1. Google's button hands your page a signed ID token.
2. You POST it to `/api/shopper/google`.
3. The store verifies it with Google, checks it was minted for **your** client
   id, and returns its own token.
4. That token goes on every later call as `Authorization: Bearer …`.

Step 3 is why the client id must match in **both** `config.js` and the store's
admin panel: without the audience check, a token issued to another app could be
replayed against your shop.

Accounts are optional. Browsing, cart, checkout and order tracking all work
without one, and `account.html` says so plainly when sign-in is switched off
rather than showing a button that cannot work.

---

## What was tested, and what wasn't

Worth being straight about, because it tells you where to be careful.

**Exercised end to end against a real store**, in a browser: catalogue with
filters and sorting, collections, product pages, cart with live re-pricing,
coupon and gift-card previews, shipping quotes, cash-on-delivery checkout,
order confirmation, and order tracking by email + reference. A real order was
placed and the totals shown matched the amount charged to the paisa.

**Written against the documented shapes but not run:** the online-payment path
(the store used for development had no gateway connected) and everything in
`account.html` (Google sign-in was switched off on the development store, and
the account surface was never driven end to end there). Demo mode refuses payment outright; it fakes
a signed-in shopper only after a register or reset on the demo password forms
(the token those mint is answered for), and any other token still gets the real
store's 401s — so which calls need a token is still exactly what you learn there.

That code is a well-informed starting point, not proven code. Nothing in it is
guesswork about shapes — every call and every field is documented — but expect
to spend a few minutes on it the first time.

---

## Conventions, if you want to keep them

- **Escape everything from the store before putting it in HTML.** Product names
  and review text are merchant- and shopper-supplied. `esc()` in `js/ui.js`
  escapes quotes as well as angle brackets, because half of these land inside
  attributes where a bare `"` is enough to inject a handler.
- **No inline `onclick` anywhere.** A Content-Security-Policy worth having blocks
  inline handlers, and you want to find that out now rather than later.
- **Filters live in the URL**, so a filtered view can be shared, bookmarked and
  reached with the back button.
- **The cart stores `itemId` and `qty` as truth.** Names and prices are cached
  only so it can paint instantly, and are refreshed from the store whenever the
  cart is shown.

---

## Licence

MIT. Do what you like with it.
