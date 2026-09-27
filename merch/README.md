# merch.js — one file, every theme, the whole storefront API

`merch.js` wires the **Merch storefront API** into the bundled HTML themes
(`electronic/`, `fashion/`, `grocery/`, `jewellery/`) **without changing a
single line of their markup or CSS.**

It never authors HTML. Every list on the page is built by **cloning the card,
row or slide the theme already ships** and overwriting its text, images and
links. What ends up on screen is the theme's own DOM — its classes, hovers,
badges and animations, including the ones nobody documented.

---

## One line turns the shop on

Open `merch/merch.js`. The first thing in it is:

```js
export const STOREFRONT_URL = '';
```

**Leave it empty** and nothing is fetched and nothing on the page is touched.
Every theme keeps its own demo products, prices, images and blog posts, exactly
as its designer shipped them — a storefront with no store behind it should look
like the template, not like a broken shop.

**Put your shop's address in it** and the same pages show your real catalogue:
products, prices, images, categories, banners and posts, all from the API.

```js
export const STOREFRONT_URL = 'https://shop.mybrand.com';
```

It is the same address your admin panel is on, and pasting the admin URL itself
works — only the host is kept, so all of these mean the same thing:

```
shop.mybrand.com
https://shop.mybrand.com
https://shop.mybrand.com/admin
https://shop.mybrand.com/admin/products?page=2
```

Nothing else to edit. The four bundled themes are already wired: 184 pages
carry the include and their own 1,998 script tags are marked (grocery on 14 of
its 38 — the other 24 are **0 bytes** in the download; see the end of this
file). A page may still override the address for itself with `data-api`, which
is how one build can serve two shops.

## Wiring it up yourself

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

## Who owns the look

The second thing in `merch.js` is a switch per Appearance setting, so a client
can take the shop's catalogue while keeping the template's identity, hand over
everything, or anything in between.

```js
export const USE_STORE_APPEARANCE = {
  brandName: true,      // the shop's name, in the page title and any name slot
  logo: true,           // the shop's logo, wherever the template shows one
  favicon: true,        // the tab icon
  tagline: true,        // the one-liner under the name
  menuLinks: true,      // where the header and footer menu items point
  footerContact: true,  // the phone, email and address in the footer
  banners: true,        // the hero — artwork, headline and button
  writtenPages: true,   // Privacy, Terms, Refunds and Shipping
  aboutPage: false,     // About — off by default
};
```

Write `true` or `false` in place of the whole object to turn all of them on or
off at once. A key you leave out is treated as on.

Whatever you choose, **the shop still works**: products, prices, images,
categories, the cart, the coupon and the checkout always come from the store.
This decides who owns the *look*, never whether the shop is real.

**`aboutPage` is off** because in all four templates About is a *designed*
page — hero image, vision panel, counters, team strip — and the merchant's
About is a couple of hundred words. Measured across the four: prose is 35–70%
of a policy page's text and only 4–21% of an About page's. Dropping paragraphs
into that layout doesn't replace the page, it dents it. There is a guard for
this in general: any written page whose text is under 30% prose is left whole,
with the reason in the console.

**Two settings are deliberately not in the list**, because they are not
appearance: whether cash on delivery is offered (the merchant's money — a shop
that switched COD off must never be shown taking COD orders), and the currency
(or every price on the page would be wrong). Both always follow the store.

### What is deliberately ignored

`colors`, `fontHeading`, `fontBody`, `radius` and `customCss` are read from the
store and **not applied**. Each of these templates hardcodes its palette in CSS
rules rather than in variables — only grocery exposes a usable
`--color-primary` — so forcing a brand colour over one means guessing at a
hundred rules and changing exactly the look the template was chosen for. Those
settings are for the merchant's own storefront; here the template is the
design.

`shipping.freeAbove` now drives the "add ₹X more and get free delivery" line
and its progress bar, which every template ships quoting a figure its designer
invented. A merchant who has set no threshold gets the line hidden — the
promise is not theirs to make.

`theme.hero` is used for the hero when the merchant has configured no banner
sections: it is the same thing wearing different field names, and ignoring it
left the template's artwork claiming to be theirs.

Still not wired: `shipping.flatRate` and `shipping.zones` (checkout quotes live
from `/api/shipping/quote` instead), `hiddenItemIds` and `featuredItemIds` (the
catalogue endpoint already honours them server-side), and `priceListId`.

### Blog

`/api/blog` and `/api/blog/{slug}` are wired per theme (electronic, fashion and
jewellery ship blog pages; grocery's are 0 bytes). The post body is the
merchant's Markdown, through the same escape-then-render path as the policy
pages.

The demo store has **zero posts**, so this was verified against an intercepted
payload of the documented shape rather than against live content — titles,
dates, cover images and `?slug=` links all land, and the post page renders
headings, bold, lists and links. A store with no posts **hides** the blog strip
rather than leaving the template's invented articles under the shop's name.

### Quick view

Every template puts a "Quick view" eye on each card, and every one of them
opened the SAME hard-coded modal — "Handmade Golden Necklace, $70.00" on a shop
that sells groceries, one click from every product on every listing page. It is
now filled from the product whose card was clicked, using the theme's own
product field map scoped to the panel, and its Add to cart adds that product.
Fashion has two of these (a Quick View offcanvas and a Quick Add modal); both
are filled, because either can be the one that opens.

### Contact details

A phone, email or address the merchant has **not** set is removed from the
footer rather than falling back to the template's. These read as facts about
the shop — the jewellery template ships `4710-4890 Breckinridge USA` and
`demo@yourdomain.com`, and an Indian grocer publishing those is telling
customers where to write and where to turn up. The "about us" blurb is
marketing copy rather than something a customer acts on, so an unset one keeps
the template's.

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
`auth`, `forgot`, `wishlist`, `compare`, `blog`, `post`, `collections`,
`returns`, `subscriptions`.

A role that finds nothing to fill does nothing at all. That is what lets the
one product binder serve this theme's 39 product-page layouts.

### Pages added to the templates

Some endpoints had no page to live on. Those pages are grown from a donor page
in the SAME theme, so they inherit its head, header, footer and script tags,
and their content is written in that theme's own classes — nothing is styled
here and no palette, font or radius is touched.

| Theme | Added |
|---|---|
| grocery | `login`, `register`, `forgot-password`, `order-received`, `blog`, `blog-details`, `addresses`, `returns`, `subscriptions`, `collections` |
| jewellery | `order-received`, `track-order`, `addresses`, `returns`, `subscriptions`, `collections` |
| electronic | `order-received`, `returns`, `subscriptions`, `collections` |
| fashion | `returns`, `subscriptions`, `collections` |

`electronic/payment-confirmation.html` is NOT the order page: it is that
theme's *pre*-payment screen, with demo card digits and a "Confirm Payment"
button. A paid shopper is sent to `order-received.html` instead.

---

## Theme JS: mark the theme's own scripts — this part is not optional

*(Already done for the four bundled themes; this is what it is and why.)*

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

### What is measured, per template

Every endpoint is driven on each of the four templates and recorded as it is
reached. The last run:

| | grocery | jewellery | electronic | fashion |
|---|---|---|---|---|
| through the template's own controls | 45 | 45 | 45 | 46 |
| through the page's own merch.js client | 9 | 9 | 9 | 9 |
| not reachable on the demo store | 3 | 3 | 3 | 2 |

The nine called through the client are the ones with no control to press:
Google sign-in (needs Google's own flow), password reset (needs the token from
the email), create-order / verify / abandon (the gateway's modal), address
update / delete / set-default (no theme ships those buttons), and variants.

Not reachable on the demo store, and why — none of these is a wiring fault:

- `GET /api/products/{id}/variants` — all 7,832 products have `variantCount: 0`,
  and the page only asks when a product has more than one variant.
- `GET /api/blog/{slug}` — the store has no posts, so the strip is hidden and
  there is nothing to link to. Verified separately by serving real-shaped
  posts: all four list them, link with `?slug=`, and fetch the right one.
- `GET /api/currencies` — only one of the four ships a plain currency label for
  us to adopt; the others put a flag or a country name in it and keep their own.
- `GET /api/auth/config` — read only when a theme ships somewhere to put a
  Google button. Only one of the four does, so Google sign-in is unavailable on
  the other three until a holder is added to their sign-in pages.

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

---

## Bugs in the templates themselves

- **grocery** — the promo countdown in `assets/js/main.js` targets a date that
  has passed, so the topbar reads "Sorry, your session has expired." on every
  page. It is the theme's own timer, nothing to do with sign-in.
- **grocery** — `.single-input` is styled only under `.rts-billing-details-area
  form`. A form using it anywhere else gets input boxes with no border at all,
  which is why the pages added here wrap their forms in that div.
- **fashion** — the header, topbar and footer live INSIDE `<main id="wrapper">`,
  unlike every other theme, so a page grown by replacing main's contents loses
  all three.


Found while testing, present in the **pristine** theme files with no merch.js
anywhere near them. Left alone — they are the vendor's to fix:

- `fashion/product-detail.html` (and its variants): `ReferenceError:
  PhotoSwipeLightbox is not defined` — `zoom.js` runs before the lightbox
  finishes loading.
- `fashion/index.html`: `$(...).modal is not a function` — the theme calls the
  jQuery Bootstrap plugin, which Bootstrap 5 removed.
- `jewellery/blog-*`: a SoundCloud embed that throws `writeEmbed is not
  defined` and trips a Trusted Types policy.
- `grocery/`: 24 of its 38 pages are **0 bytes**, and ~90 of its images were
  saved as 0-byte `.html` files. The theme was scraped rather than extracted —
  `jewellery`'s own footer still carries the `HTTrack Website Copier` banner.
  It needs re-downloading.
