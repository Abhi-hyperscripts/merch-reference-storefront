# merch.js — one file, every theme, the whole storefront API

`merch.js` wires the **Merch storefront API** into the bundled HTML themes
(`electronic/`, `fashion/`, `grocery/`, `jewellery/`) **without changing a
single line of their markup or CSS.**

It never authors HTML. Every list on the page is built by **cloning the card,
row or slide the theme already ships** and overwriting its text, images and
links. What ends up on screen is the theme's own DOM — its classes, hovers,
badges and animations, including the ones nobody documented.

---

## Wiring it up

One line per page, anywhere before `</body>`:

```html
<script type="module" src="../merch/merch.js"
        data-api="https://shop.mybrand.com"></script>
```

That is the whole integration. The theme and the page role are worked out from
the URL, so no page needs an attribute of its own.

| Attribute | Default | What it does |
|---|---|---|
| `data-api` | same origin | Your shop's origin. Your store **is** the API — there is no separate host. |
| `data-theme` | the folder name | `electronic` \| `fashion` \| `grocery` \| `jewellery`. Only needed if the folder was renamed. |
| `data-page` | the filename | Force a role (below). Only needed for a page whose name says nothing. |
| `data-google-client-id` | *(blank)* | Turns on Google sign-in. Must match the id in the store's admin. Blank = the button is hidden, not broken. |
| `data-debug` | `false` | Logs what it decided and what it rendered. |

Or set `window.MERCH_CONFIG = { api: '…' }` before the tag.

**It must be served over `http://`, not opened from `file://`** — it is an ES
module and browsers refuse those from the filesystem.

---

## What gets hydrated

Not just the product grids:

- **The hero.** `banner` sections carry the merchant's artwork, headline and
  link. Two of these themes paint theirs as a CSS background (one of them from
  `data-bg`, which its own script reads), so both are set. The slider is rebuilt
  from the theme's own slide, so one banner gives one slide and four give four.
- **"Browse categories".** Real categories, real images, and each tile links to
  `?category=…` on this theme's own listing page. A home page that carries the
  same strip twice gets both.
- **The header** basket and wishlist counts.
- **The category menus** in the header, repointed at real categories by matching
  the words the designer wrote.
- **Banner links.** A merchant writes `/shop` or `/cart` against their own
  storefront's routes; those are mapped onto this theme's pages, and anything
  else is left as they wrote it.
- **Stray strips.** Themes decorate almost every page with extra product
  carousels — "featured" beside a shop grid, "you may also like" under a cart.
  None belongs to the page's role, so nothing would otherwise touch them and
  each would go on offering demo stock at demo prices. They are filled with real
  stock, and hidden only if the store cannot answer.

The measure that matters: across 13 pages of the four themes, **zero demo
products remain visible** and every price on screen is the store's.

## Roles

The filename picks one. `index` → `home`, `shop-*` → `listing`,
`*-detail(s)` → `product`, `cart` / `view-cart` / `shopping-cart` → `cart`, and
so on through `checkout`, `order`, `track`, `account`, `orders`, `addresses`,
`auth`, `forgot`, `wishlist`, `compare`, `blog`, `post`.

A role that finds nothing to fill does nothing at all. That is what lets the
one product binder serve this theme's 39 product-page layouts.

---

## Theme JS: mark the theme's own scripts — this part is not optional

The themes initialise Swiper, Slick, tooltips and lazy images against whatever
DOM exists when their `main.js` runs, and anything added afterwards is
invisible to them.

**Give the theme's own script tags a type:**

```html
<script type="text/merch-deferred" src="js/jquery.min.js"></script>
<script type="text/merch-deferred" src="js/swiper-bundle.min.js"></script>
<script type="text/merch-deferred" src="js/main.js"></script>
```

`merch.js` runs them itself, in order, **after** the data is on the page, so
the theme initialises over real content. Nothing else about the page changes —
this edits an attribute on a `<script>` tag, not markup, not CSS, not design.
Three of the four themes already show a preloader across exactly that window,
so the shopper sees no extra wait.

**Measured, on `jewellery/` against a live store:**

| | products shown | demo products still visible | hero |
|---|---|---|---|
| without it | 6 of 99 | **70** | untouched |
| with it | 63 of 63 | **0** | merchant's banner |

That theme's `main.js` is a bare IIFE with no ready wrapper, so Slick has
already rebuilt every rail before our first answer arrives — and Slick rebuilds
the DOM, which detaches the containers. Nothing errors. It just quietly shows
the demo shop.

**Without the attribute** `merch.js` still runs: it hydrates and then re-runs
the plugins itself (`refreshSwipers()`, Slick's `refresh`, Bootstrap tooltips)
and drives the quantity steppers whose handlers no longer reach the page. That
is a real fallback and the money path is the same — but on a theme that
initialises at parse time it is a partial result, so mark the scripts.

Either way the theme's scripts always run. A store that is down leaves an
ordinary static page, never a dead one.

## Adding a fifth theme

Add one entry to `THEMES`. It is **data, not code** — which element holds the
grid, which one is the card, which one inside it is the price:

```js
THEMES.furniture = {
  name: 'furniture',
  pages: { home: 'index.html', listing: 'shop.html', product: 'product.html', … },
  qtyInput: '.qty input',
  listing: {
    container: '.product-grid',
    card: '.product-box',
    fields: {
      link:  { sel: 'a.thumb', attr: 'href', value: (p) => productHref(p) },
      image: cardImage('a.thumb img'),
      title: { sel: '.product-title', text: (p) => p.name },
      price: { sel: '.price', text: priceText },
      mrp:   { sel: '.old-price', text: mrpText, hideWhen: hasNoMrp },
      add:   { sel: '.add-to-cart', action: 'add' },
    },
  },
  cart: { … }, checkout: { … },
  reinit() { refreshSwipers(); },
};
```

Every selector may be a `|`-separated list; the first that matches wins, so one
entry can cover a grid page and a list page at once. A field that matches
nothing is skipped in silence. No logic is written.

Field options: `text`, `html`, `attr` + `value`, `value`, `bg` (paint a CSS
background, and `data-bg` with it), `each(el, data)`, `all` (every match, not
just the first), `hideWhen` (hide **and empty**), `dropWhen` (remove), `action`
(`add` / `buy` / `wishlist` / `compare` / `remove`), and `on: { click: fn }`.

A theme entry may also carry `banners` and `categories` specs — the hero and
the "browse categories" strip are lists like any other, and go through the same
engine. `container: null` means "find it from the cards", which is the right
answer whenever a selector would match some other carousel first.

`onThemeReady(fn)` queues work for after the theme's own scripts have run. It
exists because some themes BUILD text from the price on the page: the fashion
theme writes its own "Add To Cart - $79.99" label by parsing the price element,
and once that reads "₹468" its parser produces **"Add To Cart - $NaN"**. The
correction has to land after the theme's, not before it.

---

## The one thing to get right

There are two ways to place an order and they take an **identical** body:

```
Paying later (cash on delivery)
  POST /api/checkout                 <- this creates the order. Done.

Paying now (card / UPI / net banking)
  POST /api/payment/create-order     -> nothing is ordered yet
  open the gateway
  POST /api/payment/verify           <- THIS creates the order
```

Calling `/api/checkout` **as well** on the prepaid path places a second, unpaid
order for the same basket, and nothing in the request or response shapes will
warn you. `merch.js` keeps the two paths apart in `payLater()` and `payNow()`.

It also holds **one** idempotency key per checkout attempt-series (a fresh key
per press makes the guarantee impossible), releases the stock holds when the
shopper dismisses the gateway, and — when the payment succeeded but the order
could not be confirmed — says so and **never re-arms the button**, because
re-arming it invites a second capture.

---

## Endpoints covered

All of them, public: `theme`, `currencies`, `auth/config`, `payment/config`,
`homepage`, `catalog`, `catalog/facets`, `catalog/{id}`, `categories`,
`collections`, `collections/{handle}`, `products/{id}/variants`,
`products/{id}/reviews` (GET + POST), `blog`, `blog/{slug}`,
`recently-viewed` (GET + POST), `events`, `coupon/validate`, `discounts/auto`,
`discounts/bxgy`, `giftcard/check`, `shipping/quote`, `cart/save`, `checkout`,
`payment/create-order`, `payment/verify`, `payment/abandon`, `orders/{id}`,
`orders/lookup`, `orders/{id}/cancel`, `orders/{id}/invoice.pdf`, `returns`
(GET + POST), `subscriptions` (GET + POST + ops), `shopper/register`,
`shopper/login`, `shopper/google`, `shopper/me`, `shopper/orders`,
`shopper/sessions/revoke`, `shopper/password/{forgot,reset,change}`,
`shopper/addresses` (CRUD + default), `shopper/wishlist` (list, add, remove).

### Shapes that are easy to get wrong

These were all measured against a live store, and each one had been guessed
wrong first:

- `GET /api/catalog` answers a **bare array** and the search parameter is
  **`search`** — a `q=` is silently ignored, so a narrowing question comes back
  with the whole catalogue. Page with `page` + `pageSize`; the total lives in
  `/api/catalog/facets`.
- `GET /api/categories` answers an array of **plain strings**.
- `GET /api/shopper/wishlist` answers an array of **item-id strings**.
- `POST /api/coupon/validate` answers **200 with `valid:false`** for a coupon it
  will not honour. It does not throw. The amount is `discountAmount`.
- `POST /api/shipping/quote` answers `available:false` **together with a free
  shipping option** — it means "no live courier rate", not "we do not deliver".
  Reading it as a refusal blocks checkout on every flat-rate store.
- The customer's street is one field called **`address`**. A `line1`/`line2`
  pair — the shape most of these themes' forms are in — is dropped in full.
- A saved address uses **`line`**, singular.
- An order's human reference is **`orderRef`** and its status is
  **`orderStatus`**; the bare `status` is the invoice's, so a cancelled order
  still reads "confirmed" if you print that one.
- `theme.currency` is the ISO **code as a string**, with `currencySymbol` beside
  it — not an object.
- `auth/config` nests the client id at **`google.clientId`**.
- `/api/products/{id}/variants` answers `{ groupId, title, options }` where
  every option **is a product**: choosing one is a navigation.

---

## What the API has no concept of

- **Vendors.** `grocery/`'s `vendor-grid`, `vendor-list` and `vendor-details`
  pages cannot be wired; there is no multi-vendor model.
- **Compare.** Entirely local (`localStorage`), which is all the themes' compare
  pages ever were.
- **Returns and subscriptions** exist in the API and have no screen in any of
  the four themes. The client methods are there for when one is built.
