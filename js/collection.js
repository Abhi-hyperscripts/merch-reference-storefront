/* ---------------------------------------------------------------------------
   collection.js — a curated group of products.

   One call returns both the collection and its products, so there is nothing
   to stitch together here:  { collection, products }
--------------------------------------------------------------------------- */

import { api } from './api.js';
import {
  $, param, mountChrome, productCard, wireAddButtons,
  renderLoading, renderEmpty, renderError,
} from './ui.js';

const grid = $('#products');
const handle = param('handle');
let products = [];

async function load() {
  if (!handle) {
    renderEmpty(grid, 'No collection asked for.', '', '<a class="btn btn--ghost" href="index.html">Back to shop</a>');
    return;
  }
  renderLoading(grid, 'Loading…');
  try {
    const data = await api.collection(handle);
    products = data.products || [];

    $('#col-title').textContent = data.collection.title;
    document.title = data.collection.title;
    if (data.collection.description) $('#col-desc').textContent = data.collection.description;

    if (!products.length) {
      renderEmpty(grid, 'Nothing in here yet', 'This collection has no products at the moment.');
    } else {
      grid.innerHTML = products.map(productCard).join('');
    }
  } catch (err) {
    if (err.status === 404) {
      renderEmpty(grid, 'No such collection', '', '<a class="btn btn--ghost" href="index.html">Back to shop</a>');
    } else {
      renderError(grid, err, load);
    }
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

wireAddButtons(grid, (id) => products.find((p) => p.id === id));
mountChrome();
load();
