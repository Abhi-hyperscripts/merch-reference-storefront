/* ---------------------------------------------------------------------------
   product.js — one product.

   Three calls, and only the first is required: the product itself, its variant
   siblings, and its reviews. The two extras are rendered as they arrive so a
   slow review query never holds up the Add to cart button.
--------------------------------------------------------------------------- */

import { api, mediaUrl } from './api.js';
import { cart } from './cart.js';
import {
  $, esc, param, money, mountChrome, toast,
  renderLoading, renderError, sessionId,
} from './ui.js';

const host = $('#pdp');
const id = param('id');

let product = null;

const STOCK_LABEL = {
  in_stock: ['In stock', 'in'],
  low: ['Only a few left', 'low'],
  out: ['Sold out', 'out'],
};

function render(p) {
  const images = (p.imageUrls || []).map(mediaUrl);
  const [stockText, stockMod] = STOCK_LABEL[p.availability] || ['', 'in'];
  const out = p.availability === 'out';
  const onSale = p.mrp && p.mrp > p.price;
  const off = onSale ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;

  host.innerHTML = `
    <div class="pdp">
      <div class="gallery">
        <div class="gallery__main">
          ${images[0] ? `<img id="hero-img" src="${esc(images[0])}" alt="${esc(p.name)}" width="700" height="700">` : ''}
        </div>
        ${
          images.length > 1
            ? `<div class="gallery__thumbs">${images
                .map(
                  (src, i) => `
                  <button type="button" data-img="${esc(src)}" aria-current="${i === 0}"
                          aria-label="View image ${i + 1}">
                    <img src="${esc(src)}" alt="" loading="lazy">
                  </button>`,
                )
                .join('')}</div>`
            : ''
        }
      </div>

      <div class="details">
        <h1>${esc(p.name)}</h1>
        ${p.category ? `<p class="crumb">${esc(p.category)}</p>` : ''}

        <p class="price-lg">
          <strong>${money(p.price)}</strong>
          ${onSale ? `<s>${money(p.mrp)}</s><span class="off">${off}% off</span>` : ''}
        </p>
        ${p.taxNote ? `<p class="crumb" style="margin-top:-6px">${esc(p.taxNote)}</p>` : ''}

        <p class="stock stock--${stockMod}">${esc(stockText)}</p>

        <div id="variants"></div>

        <div class="buybar">
          <div class="qty">
            <button type="button" data-step="-1" aria-label="Decrease quantity">&minus;</button>
            <input id="qty" type="number" value="1" min="1" max="99" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn" type="button" id="add" ${out ? 'disabled' : ''}>
            ${out ? 'Sold out' : 'Add to cart'}
          </button>
          <a class="btn btn--ghost" href="cart.html">View cart</a>
        </div>

        ${
          p.isDigital
            ? `<p class="note note--info">Delivered digitally &mdash; a download or access link,
               no shipping. Digital items must be paid for online, so cash on delivery is not
               offered for this one.</p>`
            : ''
        }

        ${p.description ? `<div class="prose"><p>${esc(p.description)}</p></div>` : ''}
      </div>
    </div>`;

  /* Gallery */
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-img]');
    if (!t) return;
    $('#hero-img').src = t.getAttribute('data-img');
    host.querySelectorAll('[data-img]').forEach((b) =>
      b.setAttribute('aria-current', String(b === t)),
    );
  });

  /* Quantity */
  const qtyInput = $('#qty');
  host.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    const next = Number(qtyInput.value) + Number(step.getAttribute('data-step'));
    qtyInput.value = Math.max(1, Math.min(99, next));
  });

  /* Add to cart */
  const addBtn = $('#add');
  if (addBtn && !out) {
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, Math.min(99, Number(qtyInput.value) || 1));
      cart.add(p, qty);
      toast(`${p.name} added to cart`);
      api.events(sessionId(), [{ type: 'add_to_cart', itemId: p.id }]).catch(() => {});
    });
  }

  api.events(sessionId(), [{ type: 'view_item', itemId: p.id }]).catch(() => {});
}

/* --- Variants --------------------------------------------------------------
   The catalogue folds a variant family down to one card, so this is how a
   shopper reaches the siblings. `current` marks the one being viewed. */
async function loadVariants(p) {
  if (!p.variantGroupId) return;
  try {
    const v = await api.variants(p.id);
    if (!v || !v.options || v.options.length < 2) return;
    $('#variants').innerHTML = `
      <p class="crumb" style="margin-bottom:6px">${esc(v.title || 'Options')}</p>
      <div class="variants">
        ${v.options
          .map(
            (o) => `
            <a href="product.html?id=${encodeURIComponent(o.id)}"
               class="${o.availability === 'out' ? 'is-out' : ''}"
               aria-current="${o.current === true}">
              ${esc(o.label || o.name)} &middot; ${money(o.price)}
            </a>`,
          )
          .join('')}
      </div>`;
  } catch {
    /* Variants are an enhancement; the product still sells without them. */
  }
}

/* --- Reviews -------------------------------------------------------------- */

function stars(n) {
  const full = Math.round(Number(n) || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

async function loadReviews(p) {
  try {
    const data = await api.reviews(p.id);
    const panel = $('#reviews-panel');
    const el = $('#reviews');

    if (!data.reviews.length) {
      el.innerHTML = `<p class="crumb">No reviews yet.</p>`;
      panel.hidden = false;
      return;
    }

    el.innerHTML = `
      <p class="stars" aria-label="${esc(data.summary.average)} out of 5">
        ${stars(data.summary.average)}
        <span class="crumb">${data.summary.average.toFixed(1)} &middot; ${data.summary.count} review${data.summary.count === 1 ? '' : 's'}</span>
      </p>
      ${data.reviews
        .map(
          (r) => `
        <article class="review">
          <div class="review__head">
            <span class="stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</span>
            <span class="review__who">${esc(r.author)}</span>
            ${r.verified ? '<span class="review__verified">Verified purchase</span>' : ''}
            <span class="review__date">${new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
          ${r.title ? `<p class="review__body"><strong>${esc(r.title)}</strong></p>` : ''}
          ${r.body ? `<p class="review__body">${esc(r.body)}</p>` : ''}
        </article>`,
        )
        .join('')}`;
    panel.hidden = false;
  } catch {
    /* Silent — a product page without reviews is fine. */
  }
}

/* --- Boot ----------------------------------------------------------------- */

async function load() {
  if (!id) {
    host.innerHTML = '<div class="state state--error"><p class="state__title">No product asked for.</p></div>';
    return;
  }
  renderLoading(host, 'Loading product…');
  try {
    product = await api.product(id);
    document.title = product.name;
    render(product);
    /* Not awaited: these paint themselves when ready. */
    loadVariants(product);
    loadReviews(product);
  } catch (err) {
    /* A 404 here is an ordinary outcome — a delisted or mistyped id — so say
       so plainly rather than showing a scary failure. */
    if (err.status === 404) {
      host.innerHTML = `
        <div class="state state--empty">
          <p class="state__title">This product is no longer available.</p>
          <a class="btn btn--ghost" href="index.html">Back to shop</a>
        </div>`;
    } else {
      renderError(host, err, load);
    }
  } finally {
    host.setAttribute('aria-busy', 'false');
  }
}

mountChrome();
load();
