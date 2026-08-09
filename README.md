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
# 1. Get the code
git clone <this-repo-url> my-storefront
cd my-storefront

# 2. Point it at your store — edit ONE line in config.js
#    export const API_BASE = 'https://shop.mybrand.com';

# 3. Serve it. Any static server will do; here are three.
python3 -m http.server 5610
#   npx serve -l 5610
#   php -S localhost:5610
```

Then open <http://localhost:5610>.

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
| `index.html` / `js/catalog.js` | Catalogue: search, category, sort, in-stock, collections |
| `product.html` / `js/product.js` | One product: gallery, variants, stock, reviews |
| `collection.html` / `js/collection.js` | A curated group of products |
| `cart.html` / `js/cart-page.js` | Basket, coupon, gift card, shipping quote |
| `checkout.html` / `js/checkout.js` | **Both payment paths.** Read this one carefully. |
| `order.html` / `js/order.js` | Confirmation, status, timeline, downloads |
| `track.html` / `js/track.js` | Find an order with email + reference, no account |
| `account.html` / `js/account.js` | Sign-in, orders, addresses, wishlist |
| `js/api.js` | Every network call. One error shape, handled once. |
| `js/cart.js` | Basket state in `localStorage` |
| `js/ui.js` | Money, escaping, header/footer, toasts, product card |
| `css/base.css` | Reset, design tokens, layout |
| `css/components.css` | Cards, buttons, forms, everything else |

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
GET  /api/orders/{id}      ->  { order, events, access }    WRAPPED
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
`404` unknown id, `429` rate limited, `503` store briefly unreachable (this one
also carries `"storeUnavailable": true`, so you can offer a retry instead of
blaming input that was already fine).

All of it is handled once, in `js/api.js`.

---

## A few smaller traps

- **Product images are store-relative** (`/api/media/ph/ITM-001-a.svg`). Prefix
  them with your API base or they 404 against your own domain. `mediaUrl()` in
  `js/api.js` does it.
- **`/api/catalog` has no pagination** and returns a bare array. Filter
  server-side with `search` and `category` rather than pulling everything.
- **`sort` accepts exactly `price_asc`, `price_desc`, `name`.** Anything else is
  ignored rather than rejected, so a typo silently returns catalogue order.
- **`amount` from `create-order` is in paise**, not rupees. Do not multiply by
  100 again — the store already has.
- **Digital items cannot be cash on delivery.** The store refuses it; show the
  right options rather than letting the shopper be turned away at the end.
- **Rate limits** are per IP per minute: 15 sign-in, 25 checkout/payment, 90 cart
  previews, 120 product-by-id. Browsing is not limited.

---

## Sign-in

Google only. There is no password anywhere in this API, which means there is no
password for you to store, leak or reset.

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
`account.html` (sign-in was switched off, and a shopper token cannot be minted
without real Google credentials).

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
