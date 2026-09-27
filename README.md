# Merch storefront templates

Four e-commerce templates, each one a folder of static files that talks to the
**Merch storefront API**. Upload a folder to any static host and it is a shop.

| Folder | The look | Pages |
|---|---|---|
| `grocery/` | Supermarket / daily needs | 26 |
| `jewellery/` | Jewellery, boutique | 38 |
| `electronic/` | Electronics, multipurpose | 93 |
| `fashion/` | Fashion, apparel | 53 |

Every one of them is driven by the same file, `merch.js`, which each folder
carries its own copy of. There is no build step and nothing to install.

---

## Deploy one

```bash
# 1. point the template at your shop: edit the first line of its merch.js
#    export const STOREFRONT_URL = 'https://shop.mybrand.com';

# 2. upload the folder. That is the whole deployment.
rsync -a grocery/ user@server:/var/www/shop/
```

Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 or nginx all work — it is
static files. Drag the folder into Netlify and you have a shop.

**Serve it over `http(s)://`, not `file://`.** `merch.js` is an ES module and
browsers refuse to load those from the filesystem. To try one locally:

```bash
python3 -m http.server 5610     # then open http://localhost:5610/grocery/
```

With `STOREFRONT_URL` left empty the template shows its own demo content and
fetches nothing, so you can look at the design before you have a store.

You do **not** need to host on the same domain as your shop. The store answers
any origin on purpose, and the credential is an `Authorization` header rather
than a cookie.

---

## What is in a template folder

```
grocery/
  index.html, shop-*.html, cart.html, checkout.html, …   the theme's pages
  merch.js                     the integration — the only file you edit
  assets/                      the theme's own css, js, fonts and images
```

`merch.js` is the same file in all four. It reads the theme's own markup,
fills it with your shop's data, and never changes the design — which is why
the four folders look completely different and behave identically.

Read **[`merch/README.md`](merch/README.md)** before changing it: what it
hydrates, which settings the admin panel owns, how to add a fifth theme, and
the traps that cost real debugging.

### merch.js lives in five places on purpose

`merch/merch.js` is the source of truth. Each template carries a copy so that
a folder can be deployed on its own. Four copies drift, so:

```bash
./merch/sync.sh            # push the source of truth into all four templates
./merch/sync.sh --check    # fail if any template's copy has drifted
```

Run `--check` in CI. Edit `merch/merch.js`, never a template's copy.

---

## The state of each template

- **`grocery/` is missing images.** Its vendor download arrived incomplete:
  106 of its pages were empty files and 39 images referenced by its own markup
  were never in the archive. The empty files have been removed, so those links
  now 404 rather than opening a blank page. **Re-download this theme from the
  vendor** before shipping it to a customer; nothing else here can fix it.
- `electronic/` and `fashion/` load two scripts the archive did not include
  (`photoswipe*.esm.min.js`) and one external stylesheet from `sibforms.com`.
  Both are the theme's own lightbox extras and neither blocks the shop.
- **The newsletter box posts to the theme author, not to you.** `electronic/`
  ships 91 pages whose signup form has `action="https://…sibforms.com/serve/…"`
  — the theme vendor's own Brevo account. Repoint or remove it before launch,
  or your customers' addresses go to them. (`merch.js` never touches that form;
  it belongs to the theme.)
- **`electronic/` shipped no way to place an order.** Its only "Check Out"
  button lives inside the mini-cart drawer, so the checkout page itself had
  nothing a shopper could press. `merch.js` now requires a VISIBLE control and
  builds one from the theme's own button when there is none. Worth knowing
  because an automated test that dispatches a click will not notice this — only
  clicking does.
- **Copy the themes wrote about themselves is still theirs.** Seen on screen:
  `fashion/` pops a fabricated "Nathan Collins has purchased! High neck midi
  wool coat — 12 mins ago" notice and a topbar claiming "20% Off – Auto Applied
  at Checkout"; `jewellery/` greets shoppers with "Welcome to Corano Jewelry
  online store". None of it is true of your shop. `merch.js` does not rewrite
  marketing copy — edit or remove these per theme before launch.
- Every template's product, cart, checkout, order, account, returns,
  subscriptions and collections pages are driven end to end against a real
  store. What is measured, per template, is in
  [`merch/README.md`](merch/README.md).

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

See `payOnline()` and `placeOrder()` in `merch.js`.

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

All of it is handled once, in the `request()` helper at the top of `merch.js`.

---

## A few smaller traps

- **Product images are store-relative** (`/api/media/ph/ITM-001-a.svg`). Prefix
  them with your API base or they 404 against your own domain. `mediaUrl()` in
  `merch.js` does it.
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
  the 120 (a template's home page spends seven: theme, currencies, home page, categories,
  collections, catalogue, recently viewed); an address book edit spends one of the 90.
- **Do not stack a coupon on top of an automatic discount in your own maths.**
  Whether they combine is decided by the merchant's books, not by the
  storefront, so subtracting both quietly promises a discount that may never
  arrive. Use the `newSubtotal` each preview returns — that is the store's own
  figure. (Found the hard way: the cart said ₹1,624.15 and the order came to
  ₹2,249.10.) `pages.cart` in `merch.js` shows the conservative version.
- **`giftCardApplied`, `amountDue`, `paymentMethod` and `amountUncollected` are
  on every order shape** — `GET /api/orders/{id}`, the account list and
  `POST /api/orders/lookup` — so a confirmation page can re-fetch them. Read
  `paymentMethod` before labelling `amountDue`: on `online` it is money already
  taken; on `cod` it is what the courier has yet to collect. `merch.js`
  still stashes the checkout reply so the page renders before the re-fetch.
- **Whatever carries a coupon to checkout must survive a refresh.** Hanging it
  off the Checkout button looks equivalent and is not: a bookmark, a reload or
  the back button then arrives with no coupon and the shopper is charged more
  than the cart quoted, silently.

---

## Sign-in

The sign-in page implements both methods the store offers: Google, and email +
password (one form with sign-in / create-account / forgot-password modes; the
reset email lands on the template's forgot-password page). The account page implements **change
password** and **sign out everywhere**, and shows the recycled-address state
(`emailDetached`). `merch.js` exposes the whole password surface (`register`,
`login`, `forgotPassword`, `resetPassword`, `changePassword`) — see the store's
`/api/docs/` and `docs/STOREFRONT_API_GUIDE.md`. The reset link is built on
`auth/config`'s `password.resetOrigin` — the store's configured public origin —
so the reset page must be served from THAT origin (a storefront hosted elsewhere
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

Step 3 is why the client id must match in **both** `MERCH_CONFIG` and the store's
admin panel: without the audience check, a token issued to another app could be
replayed against your shop.

Accounts are optional. Browsing, cart, checkout and order tracking all work
without one, and the account page says so plainly when sign-in is switched off
rather than showing a button that cannot work.

---

---

## Conventions, if you want to keep them

- **Escape everything from the store before putting it in HTML.** Product names
  and review text are merchant- and shopper-supplied. `escapeHtml()` in
  `merch.js` escapes quotes as well as angle brackets, because half of these
  land inside attributes where a bare `"` is enough to inject a handler.
- **No inline `onclick` anywhere.** A Content-Security-Policy worth having
  blocks inline handlers, and you want to find that out now rather than later.
- **Filters live in the URL**, so a filtered view can be shared, bookmarked and
  reached with the back button.
- **The cart stores `itemId` and `qty` as truth.** Names and prices are cached
  only so it can paint instantly, and are refreshed from the store whenever the
  cart is shown.

---

## Licence

MIT. Do what you like with it.
