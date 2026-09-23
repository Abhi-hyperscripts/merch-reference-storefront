/* ---------------------------------------------------------------------------
   catalog.js — the shop front page.

   Filters live in the URL rather than in a variable, so a filtered view can be
   shared, bookmarked and reached by the back button. That is nearly free to do
   and is the difference between a demo and something usable.
--------------------------------------------------------------------------- */

import { api, mediaUrl, ApiError } from './api.js';
import {
  $, esc, mountChrome, productCard, sessionId, wireAddButtons,
  renderLoading, renderEmpty, renderError,
} from './ui.js';

const grid = $('#products');
const form = $('#filters');

/* The last catalogue response, so an "add to cart" click has the full product
   without another round trip. */
let current = [];

/* Filters as they appear in the URL. Only these keys are read, so a junk query
   string cannot smuggle anything into the API call. */
function filtersFromUrl() {
  const p = new URLSearchParams(location.search);
  return {
    search: p.get('search') || '',
    category: p.get('category') || '',
    brand: p.get('brand') || '',   /* a brand SLUG from a home tile; the form has no field for it, the URL carries it */
    sort: p.get('sort') || '',
    inStock: p.get('inStock') === 'true',
  };
}

function filtersToUrl(f, { replace = false } = {}) {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.category) p.set('category', f.category);
  if (f.brand) p.set('brand', f.brand);
  if (f.sort) p.set('sort', f.sort);
  if (f.inStock) p.set('inStock', 'true');
  const url = p.toString() ? `?${p}` : location.pathname;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

function paintForm(f) {
  $('#f-search').value = f.search;
  $('#f-category').value = f.category;
  $('#f-sort').value = f.sort;
  $('#f-instock').checked = f.inStock;
  /* The form has no brand field, so an active brand (a home tile's `?brand=`)
     is shown as a chip with its own clear — otherwise nothing on screen said
     the grid was narrowed, and Apply dropped it silently. */
  const chip = $('#f-brand-note');
  chip.hidden = !f.brand;
  /* "clear" drops the BRAND, and keeps the search, category and sort the shopper also set. */
  const rest = new URLSearchParams();
  if (f.search) rest.set('search', f.search);
  if (f.category) rest.set('category', f.category);
  if (f.sort) rest.set('sort', f.sort);
  if (f.inStock) rest.set('inStock', 'true');
  const clearHref = rest.toString() ? `index.html?${rest}` : 'index.html';
  chip.innerHTML = f.brand ? `Brand: <b>${esc(f.brand)}</b> <a href="${esc(clearHref)}">clear</a>` : '';
}

async function loadCategories() {
  try {
    const cats = await api.categories();
    const sel = $('#f-category');
    for (const c of cats) {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    }
    /* Re-apply the URL's value: the option it names only exists now. */
    sel.value = filtersFromUrl().category;
  } catch {
    /* A missing category list is survivable — search and sort still work. */
  }
}

async function loadCollections() {
  try {
    const cols = await api.collections();
    if (!cols.length) return;
    const host = $('#collections');
    $('#collections-grid').innerHTML = cols
      .map(
        (c) => `
        <article class="card">
          <a class="card__link" href="collection.html?handle=${encodeURIComponent(c.handle)}">
            ${
              /* A collection with no image gets no empty square. An image box
                 held open by nothing reads as a broken image, not as a design. */
              c.imageUrl
                ? `<div class="card__media"><img src="${esc(mediaUrl(c.imageUrl))}" alt="" loading="lazy"></div>`
                : ''
            }
            <h3 class="card__name">${esc(c.title)}</h3>
          </a>
          ${c.description ? `<p class="card__variants">${esc(c.description)}</p>` : ''}
        </article>`,
      )
      .join('');
    host.hidden = false;
  } catch {
    /* Optional section. */
  }
}

async function loadProducts() {
  const f = filtersFromUrl();
  renderLoading(grid, 'Loading products…');
  grid.setAttribute('aria-busy', 'true');

  try {
    /* Filtering happens server-side. Sending only the keys that have a value
       matters: `sort=''` would be a value the store does not recognise, and
       unrecognised sorts are ignored silently rather than rejected — you would
       get catalogue order and no clue why. */
    const params = {};   /* no page/pageSize: with neither the store returns the WHOLE catalogue (paging applies only when asked for) */
    if (f.search) params.search = f.search;
    if (f.category) params.category = f.category;
    if (f.brand) params.brand = f.brand;
    if (f.sort) params.sort = f.sort;
    if (f.inStock) params.inStock = 'true';

    current = await api.catalog(params);

    if (!current.length) {
      /* No inline onclick anywhere in this project: a Content-Security-Policy
         worth having blocks inline handlers, and you want to find that out now
         rather than the day you add one. */
      renderEmpty(
        grid,
        'Nothing matched',
        'Try a different search, or clear the filters.',
        '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>',
      );
      $('[data-clear]', grid)?.addEventListener('click', () => $('#f-clear').click());
    } else {
      grid.innerHTML = current.map(productCard).join('');
    }
  } catch (err) {
    renderError(grid, err, loadProducts);
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

async function loadHero() {
  try {
    const theme = await api.theme();
    if (theme?.hero?.headline) $('#hero-title').textContent = theme.hero.headline;
    if (theme?.hero?.subtext) $('#hero-sub').textContent = theme.hero.subtext;
    else if (theme?.tagline) $('#hero-sub').textContent = theme.tagline;
  } catch {
    /* Keep the static heading. */
  }
}

/* --- The API-driven home ----------------------------------------------------
   One renderer, keyed by section type. Everything a section needs arrives
   already resolved, so this only draws; it composes nothing. A section the
   store does not know is skipped, a failed read leaves the block hidden. */
function rail(title, products, more) {
  if (!products?.length) return '';
  return `
    <section class="home-section">
      <div class="home-head"><h2>${esc(title)}</h2>${more ? `<a class="home-more" href="${esc(more)}" aria-label="View all: ${esc(title)}">View all</a>` : ''}</div>
      <div class="grid">${products.map(productCard).join('')}</div>
    </section>`;
}
function tiles(title, items, kind) {
  if (!items?.length) return '';
  return `
    <section class="home-section">
      <div class="home-head"><h2>${esc(title)}</h2></div>
      <div class="home-tiles">${items
        .map((t) => {
          const img = kind === 'brand' ? t.logoUrl : t.imageUrl;
          /* A brand is filtered by SLUG (`brand=`); `search=` matches names and
             descriptions only, so a brand tile linked that way landed on
             "Nothing matched". A category is filtered by its exact name. */
          const href = kind === 'brand' ? `index.html?brand=${encodeURIComponent(t.slug)}` : `index.html?category=${encodeURIComponent(t.name)}`;
          return `<a class="home-tile" href="${href}">
            <span class="home-tile__img">${img ? `<img src="${esc(mediaUrl(img))}" alt="" loading="lazy">` : `<span>${esc(t.name.slice(0, 2).toUpperCase())}</span>`}</span>
            <span class="home-tile__name">${esc(t.name)}</span>
            <span class="home-tile__count" aria-label="${esc(String(t.count))} products">${esc(String(t.count))}</span>
          </a>`;
        })
        .join('')}</div>
    </section>`;
}
/* What the store allows a banner to link to (ThemeConfig Banner.SafeUrl):
   http(s), mailto:, tel:, or a store-relative path. Anything else
   (javascript:, data:, vbscript:) is dropped. A store-relative path is the
   MERCHANT'S storefront's — this client is hosted on its own origin, so the
   paths it knows are mapped onto its own pages and the rest are left as-is. */
function safeHref(link) {
  const s = String(link || '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || /^(mailto|tel):/i.test(s)) return s;
  let m;
  if ((m = /^\/collections\/([^/?#]+)/i.exec(s))) return `collection.html?handle=${encodeURIComponent(decodeURIComponent(m[1]))}`;
  if ((m = /^\/product\/([^/?#]+)/i.exec(s))) return `product.html?id=${encodeURIComponent(decodeURIComponent(m[1]))}`;
  if (/^[./?#]/.test(s) || /^[a-z0-9_-]+(\/|\.html|\?|$)/i.test(s)) return s;
  return '';
}
function banners(items) {
  if (!items?.length) return '';
  return `<section class="home-banners">${items
    .map((b) => {
      /* Through mediaUrl like every other image: a store URL may be store-relative. */
      /* A link with only an image needs a name: alt, else title, else a plain word — never "link". */
      const pic = `<picture>${b.imageMobileUrl ? `<source media="(max-width: 640px)" srcset="${esc(mediaUrl(b.imageMobileUrl))}">` : ''}<img class="home-banner__img" src="${esc(mediaUrl(b.imageUrl))}" alt="${esc(b.alt || b.title || 'Promotion')}" loading="lazy"></picture>`;
      /* The store guards banner links (no javascript:/data:); this client does too. */
      const href = safeHref(b.link);
      return href ? `<a class="home-banner" href="${esc(href)}">${pic}</a>` : `<div class="home-banner">${pic}</div>`;
    })
    .join('')}</section>`;
}
/* Every product a home rail renders, for the Add buttons: the rails are not
   the catalogue grid, so `current` does not know them. */
const homeProducts = new Map();
const remember = (products) => { for (const p of products || []) homeProducts.set(p.id, p); return products; };
/* The home sections belong to the UNFILTERED page only. A tile's own link
   (`?category=`), a search or a brand narrows the grid — drawing the whole home
   above it again put the promised results below the fold and looked like
   nothing had happened. Rendered once per page life, re-shown on the way back. */
let homeHtml = null;
let homeRender = null;   /* the ONE in-flight render, shared by every caller that arrives during it */
/* ANY narrowing or re-ordering of the grid: a sort or "in stock only" is a
   choice about the grid as much as a search is, and an unchanged, unsorted
   Featured rail above "Price: low to high" looked like nothing had happened. */
const isFiltered = () => { const f = filtersFromUrl(); return !!(f.search || f.category || f.brand || f.sort || f.inStock); };
async function loadHome() {
  const host = $('#home');
  if (isFiltered()) { host.innerHTML = ''; host.hidden = true; host.removeAttribute('aria-busy'); return; }
  if (homeHtml === null) {
    /* Reserve the space while the render is in flight — also on a Clear after
       a filtered boot, where the boot's reservation was already released. */
    host.hidden = false; host.setAttribute('aria-busy', 'true');
    homeRender ??= renderHome(); await homeRender;
  }
  host.removeAttribute('aria-busy');   /* the reserved height goes with it, whatever landed */
  /* Re-read the URL AFTER the awaits. A search submitted while the home was
     in flight had already emptied the host; the first call then came back
     and painted the whole home over the results it was asked for. */
  if (isFiltered() || homeHtml === null) { host.innerHTML = ''; host.hidden = true; return; }
  host.innerHTML = homeHtml;
  host.hidden = !homeHtml;
}
async function renderHome() {
  try {
    const home = await api.homepage();
    const parts = [];
    for (const s of home.sections || []) {
      remember(s.products);
      for (const g of s.groups || []) remember(g.products);
      switch (s.type) {
        case 'banner': parts.push(banners(s.banners)); break;
        case 'browseCategories':
        case 'categoryCarousel': parts.push(tiles(s.title || 'Shop by category', s.categories, 'category')); break;
        case 'brandsCarousel': parts.push(tiles(s.title || 'Shop by brand', s.brands, 'brand')); break;
        case 'featuredProducts': parts.push(rail(s.title || 'Featured', s.products)); break;
        case 'newArrivals': parts.push(rail(s.title || 'New arrivals', s.products)); break;
        case 'bestSellers': parts.push(rail(s.title || 'Best sellers', s.products)); break;
        case 'homepageProducts': parts.push(rail(s.title || 'Our picks', s.products)); break;
        case 'categoryProducts':
          for (const g of s.groups || []) parts.push(rail(g.name, g.products, `index.html?category=${encodeURIComponent(g.name)}`));
          break;
        case 'recentlyViewed': {
          /* Per viewer, so it is fetched here rather than resolved by the
             server; nothing viewed yet (or a failed read) draws nothing.
             Fetched AFTER /api/homepage (one latency later) on purpose: only
             a layout that has this section spends the browse call. */
          try {
            const r = await api.recentlyViewed(sessionId(), s.limit || 8);
            parts.push(rail(s.title || 'Recently viewed', remember(r.products)));
          } catch {
            /* An absent rail, never an error on the home page. */
          }
          break;
        }
        default: break;   /* a type this client does not know yet */
      }
    }
    homeHtml = parts.join('');
  } catch (err) {
    /* Optional: the catalogue grid below is the page without it. A FAILED
       READ (ApiError) is not cached: the next Clear / back / Apply tries
       again, like `themeOnce` in api.js — caching '' lost the home for the
       whole page life after one 503 at first paint. Anything ELSE is a bug in
       this renderer or in the data (a null body, a tile without a name): it
       is deterministic, so retrying it only spent a browse call per action —
       cache the empty home and say so in the console, where a developer looks. */
    if (err instanceof ApiError) { homeHtml = null; homeRender = null; }
    else { console.warn('home: render failed', err); homeHtml = ''; }
  }
}

/* --- Wiring --------------------------------------------------------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  filtersToUrl({
    search: $('#f-search').value.trim(),
    category: $('#f-category').value,
    brand: filtersFromUrl().brand,   /* carried: the form has no field for it, the chip is how it is cleared */
    sort: $('#f-sort').value,
    inStock: $('#f-instock').checked,
  });
  paintForm(filtersFromUrl());
  loadHome();
  loadProducts();
});

$('#f-clear').addEventListener('click', () => {
  history.pushState({}, '', location.pathname);
  paintForm(filtersFromUrl());
  loadHome();
  loadProducts();
});

/* Back/forward must re-run the query, or the URL and the grid disagree. */
window.addEventListener('popstate', () => {
  paintForm(filtersFromUrl());
  loadHome();
  loadProducts();
});

wireAddButtons(grid, (id) => current.find((p) => p.id === id));
wireAddButtons($('#home'), (id) => homeProducts.get(id));   /* the rails are a sibling of the grid: their own delegate, their own lookup */

/* Chrome and content load in parallel — the header should not wait on the
   catalogue, and vice versa. Anything that fails is handled where it is used,
   so an unhandled rejection here would be a bug, not a normal outcome. */
mountChrome();
paintForm(filtersFromUrl());
loadHero();
loadHome();
loadCategories();
loadCollections();
loadProducts();
