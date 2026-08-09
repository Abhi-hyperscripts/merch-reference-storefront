/* ---------------------------------------------------------------------------
   catalog.js — the shop front page.

   Filters live in the URL rather than in a variable, so a filtered view can be
   shared, bookmarked and reached by the back button. That is nearly free to do
   and is the difference between a demo and something usable.
--------------------------------------------------------------------------- */

import { api, mediaUrl } from './api.js';
import {
  $, esc, mountChrome, productCard, wireAddButtons,
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
    sort: p.get('sort') || '',
    inStock: p.get('inStock') === 'true',
  };
}

function filtersToUrl(f, { replace = false } = {}) {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.category) p.set('category', f.category);
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
    const params = {};
    if (f.search) params.search = f.search;
    if (f.category) params.category = f.category;
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

/* --- Wiring --------------------------------------------------------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  filtersToUrl({
    search: $('#f-search').value.trim(),
    category: $('#f-category').value,
    sort: $('#f-sort').value,
    inStock: $('#f-instock').checked,
  });
  loadProducts();
});

$('#f-clear').addEventListener('click', () => {
  history.pushState({}, '', location.pathname);
  paintForm(filtersFromUrl());
  loadProducts();
});

/* Back/forward must re-run the query, or the URL and the grid disagree. */
window.addEventListener('popstate', () => {
  paintForm(filtersFromUrl());
  loadProducts();
});

wireAddButtons(grid, (id) => current.find((p) => p.id === id));

/* Chrome and content load in parallel — the header should not wait on the
   catalogue, and vice versa. Anything that fails is handled where it is used,
   so an unhandled rejection here would be a bug, not a normal outcome. */
mountChrome();
paintForm(filtersFromUrl());
loadHero();
loadCategories();
loadCollections();
loadProducts();
