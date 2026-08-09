/* ---------------------------------------------------------------------------
   ui.js — the bits every page needs: money, escaping, the header, messages.
--------------------------------------------------------------------------- */

import { api, ApiError, mediaUrl } from './api.js';
import { cart } from './cart.js';
import { FALLBACK_CURRENCY, API_BASE } from '../config.js';

/* --- Escaping -------------------------------------------------------------
   Product names, review text and blog excerpts are merchant- and shopper-
   supplied. Anything from the store that ends up inside an HTML string has to
   go through here first, or a product named `<img onerror=...>` runs as code.

   Note it escapes quotes as well as angle brackets — half of the uses below
   are inside attributes, where a bare " ends the attribute early and lets an
   event handler be injected without a single < being involved. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* --- Money ----------------------------------------------------------------
   The store tells you its currency; do not hardcode one. */

let currency = { ...FALLBACK_CURRENCY };

export function setCurrency(c) {
  if (c && c.code) currency = c;
}

export function money(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  /* Whole rupees read better on a shop front, but keep the paise when they
     are actually there — a ₹1,519.05 total shown as ₹1,519 is wrong. */
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${currency.symbol}${formatted}`;
}

/* --- Small helpers -------------------------------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/* A stable id for one visit, for the events endpoint. sessionStorage, so a new
   tab is a new session, which is what "session" is supposed to mean. */
export function sessionId() {
  let id = sessionStorage.getItem('merch.sid');
  if (!id) {
    id = 'sid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('merch.sid', id);
  }
  return id;
}

/* --- Messages -------------------------------------------------------------
   One place to show a failure. Because the store's error text is written for
   shoppers, this can print err.message directly. */

export function toast(message, kind = 'info') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

/* First-run help. A status of 0 means the request never completed at all —
   wrong API_BASE, store not running, or CORS. For someone who has just cloned
   this and not edited config.js yet, that is THE failure they will hit, and a
   quiet toast saying "could not reach the store" does not tell them what to do
   about it. Say it once, loudly, with the value actually in use.

   Delete this whole block once your storefront is live; it is scaffolding. */
let banneredOnce = false;
function maybeShowSetupBanner(err) {
  if (banneredOnce || !(err instanceof ApiError) || err.status !== 0) return;
  banneredOnce = true;

  const bar = document.createElement('div');
  bar.setAttribute('role', 'alert');
  /* Static, and inserted FIRST, so it pushes the page down. Fixed positioning
     would sit on top of the sticky header and hide the navigation. */
  bar.style.cssText =
    'background:#B42318;color:#fff;padding:14px 18px;' +
    'font:400 14.5px/1.5 Inter,system-ui,sans-serif';
  bar.innerHTML = `
    <strong>Cannot reach the store.</strong>
    This storefront is pointed at <code>${esc(API_BASE)}</code>.
    Edit <code>config.js</code> and set <code>API_BASE</code> to your own shop,
    e.g. <code>https://shop.mybrand.com</code>.`;
  document.body.insertBefore(bar, document.body.firstChild);
}

/* Turn any thrown error into something worth showing. Everything the store
   refuses already carries a shopper-safe sentence; the extras here are for
   the cases where it never answered at all. */
export function showError(err) {
  maybeShowSetupBanner(err);
  if (err instanceof ApiError) {
    if (err.isStoreDown) {
      toast('The store is briefly unavailable. Please try again in a moment.', 'error');
    } else if (err.isRateLimited) {
      toast('That was a bit quick — give it a few seconds and try again.', 'error');
    } else {
      toast(err.message, 'error');
    }
  } else {
    console.error(err);
    toast('Something went wrong. Please try again.', 'error');
  }
}

/* --- Inline state for a region -------------------------------------------- */

export function renderLoading(el, label = 'Loading…') {
  el.innerHTML = `<div class="state" role="status">${esc(label)}</div>`;
}

export function renderEmpty(el, title, detail = '', actionHtml = '') {
  el.innerHTML = `
    <div class="state state--empty">
      <p class="state__title">${esc(title)}</p>
      ${detail ? `<p class="state__detail">${esc(detail)}</p>` : ''}
      ${actionHtml}
    </div>`;
}

/* An error state that offers a retry, because most failures here are
   transient and re-running the same page load is the correct fix. */
export function renderError(el, err, onRetry) {
  /* The catalogue reports failure through here rather than showError, and it is
     the first page anyone opens — so the setup banner has to hang off both or
     a misconfigured clone shows a bare "could not reach the store" and no clue. */
  maybeShowSetupBanner(err);
  const msg = err instanceof ApiError ? err.message : 'Could not load this.';
  el.innerHTML = `
    <div class="state state--error">
      <p class="state__title">${esc(msg)}</p>
      <button class="btn btn--ghost" type="button" data-retry>Try again</button>
    </div>`;
  const btn = $('[data-retry]', el);
  if (btn && onRetry) btn.addEventListener('click', onRetry);
}

/* --- Chrome ---------------------------------------------------------------
   Header and footer are built here rather than copied into seven HTML files,
   so the cart badge and brand name only have to be right once. */

export async function mountChrome() {
  const header = $('#site-header');
  const footer = $('#site-footer');

  const paint = () => {
    const badge = $('#cart-count');
    if (badge) {
      const n = cart.count();
      badge.textContent = n;
      badge.hidden = n === 0;
    }
  };

  if (header) {
    header.innerHTML = `
      <a class="skip" href="#main">Skip to content</a>
      <div class="wrap header__bar">
        <a class="brand" href="index.html">
          <span class="brand__name" id="brand-name">Store</span>
        </a>
        <nav class="nav" aria-label="Main">
          <a href="index.html">Shop</a>
          <a href="track.html">Track order</a>
          <a href="account.html">Account</a>
          <a class="nav__cart" href="cart.html">
            Cart <span class="badge" id="cart-count" hidden>0</span>
          </a>
        </nav>
      </div>`;
    paint();
    cart.onChange(paint);
  }

  if (footer) {
    footer.innerHTML = `
      <div class="wrap footer__bar">
        <p>Built on the Merch storefront API. This is a reference
        implementation — plain HTML, CSS and JavaScript, no build step.</p>
      </div>`;
  }

  /* Brand name, colours and currency all come from the store, so one shop can
     be re-skinned without touching this code. Deliberately not awaited by the
     caller: a slow theme call should not hold up the catalogue. */
  try {
    const [theme, currencies] = await Promise.all([
      api.theme().catch(() => null),
      api.currencies().catch(() => null),
    ]);

    if (theme) {
      const nameEl = $('#brand-name');
      if (nameEl && theme.brandName) nameEl.textContent = theme.brandName;
      if (theme.brandName) document.title = `${theme.brandName} — ${document.title}`;
      applyTheme(theme);
    }
    if (currencies && currencies.base) setCurrency(currencies.base);
  } catch {
    /* Chrome is decoration. If it fails the shop must still work. */
  }
}

/* The merchant picks their colours in the admin panel; this maps them onto the
   CSS custom properties the stylesheet already uses. */
function applyTheme(theme) {
  const c = theme.colors || {};
  const root = document.documentElement;
  const map = {
    '--c-primary': c.primary,
    '--c-primary-hover': c.primaryHover,
    '--c-accent': c.accent,
    '--c-bg': c.bg,
    '--c-surface': c.surface,
    '--c-text': c.text,
    '--c-muted': c.muted,
    '--c-border': c.border,
  };
  for (const [prop, value] of Object.entries(map)) {
    if (value) root.style.setProperty(prop, value);
  }
  if (theme.radius) root.style.setProperty('--radius', theme.radius);
}

/* --- Product card ---------------------------------------------------------
   Shared by the catalogue and collection pages. */

export function productCard(p) {
  const img = mediaUrl((p.imageUrls && p.imageUrls[0]) || '');
  const out = p.availability === 'out';
  const onSale = p.mrp && p.mrp > p.price;

  return `
    <article class="card${out ? ' card--out' : ''}">
      <a class="card__link" href="product.html?id=${encodeURIComponent(p.id)}">
        <div class="card__media">
          ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400">` : ''}
          ${out ? '<span class="chip chip--out">Sold out</span>' : ''}
          ${p.availability === 'low' && !out ? '<span class="chip chip--low">Low stock</span>' : ''}
        </div>
        <h3 class="card__name">${esc(p.name)}</h3>
      </a>
      <p class="card__price">
        <strong>${money(p.price)}</strong>
        ${onSale ? `<s>${money(p.mrp)}</s>` : ''}
        ${p.taxNote ? `<span class="card__tax">${esc(p.taxNote)}</span>` : ''}
      </p>
      ${
        p.variantCount > 1
          ? `<p class="card__variants">${p.variantCount} options</p>`
          : `<button class="btn btn--sm" type="button" data-add="${esc(p.id)}" ${out ? 'disabled' : ''}>
               ${out ? 'Sold out' : 'Add to cart'}
             </button>`
      }
    </article>`;
}

/* Wire every [data-add] inside a container. The full product is looked up
   before adding so the cart caches a real name and price rather than whatever
   the card happened to be rendering. */
export function wireAddButtons(root, lookup) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const id = btn.getAttribute('data-add');
    const product = lookup(id);
    if (!product) return;
    cart.add(product, 1);
    toast(`${product.name} added to cart`);

    /* Analytics is best-effort and must never break adding to a cart. */
    api.events(sessionId(), [{ type: 'add_to_cart', itemId: id }]).catch(() => {});
  });
}
