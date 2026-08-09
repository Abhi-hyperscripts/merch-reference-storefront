/* ---------------------------------------------------------------------------
   order.js — one order: confirmation, and afterwards, its status.

   Careful here: THE SAME ORDER COMES BACK IN THREE DIFFERENT SHAPES.

     GET  /api/orders/{id}      -> { order, events, access }   WRAPPED
     POST /api/orders/lookup    -> the order, bare
     GET  /api/shopper/orders   -> an array of orders

   This page uses the first, so everything below reads `data.order`, not
   `data`. Getting that wrong gives you a page of "undefined" with no error.
--------------------------------------------------------------------------- */

import { api } from './api.js';
import { $, esc, param, money, mountChrome, renderLoading, renderError } from './ui.js';

const host = $('#order');
const id = param('id');
const isNew = param('new') === '1';

const FULFILMENT = {
  unfulfilled: 'Not shipped yet',
  fulfilled: 'Shipped',
  partially_fulfilled: 'Partly shipped',
  cancelled: 'Cancelled',
};

function when(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/* The gift-card figures checkout stashed, if this IS the order just placed.
   Guarded by the id so a stale entry cannot decorate a different order. */
function justPaidFor(orderId) {
  try {
    const raw = JSON.parse(sessionStorage.getItem('merch.lastOrder') || 'null');
    return raw && raw.id === orderId ? raw : null;
  } catch {
    return null;
  }
}

function render({ order, events, access }) {
  const status = String(order.status || '').toLowerCase();
  const justPaid = justPaidFor(order.id);

  host.innerHTML = `
    ${
      isNew
        ? `<div class="panel" style="border-color:var(--c-ok)">
             <h1 style="margin-bottom:4px">Thank you — your order is in.</h1>
             <p style="margin:0">We have emailed the details to you. Keep the
             reference <strong>${esc(order.orderRef)}</strong> to track it.</p>
           </div>`
        : `<div class="page-head"><h1>Order ${esc(order.orderRef)}</h1></div>`
    }

    <div class="split" style="margin-top:18px">
      <div>
        <div class="panel">
          <h2>Details</h2>
          <ul class="kv">
            <li><span>Reference</span><span>${esc(order.orderRef)}</span></li>
            <li><span>Invoice</span><span>${esc(order.invoiceId)}</span></li>
            <li><span>Placed</span><span>${esc(when(order.createdAt))}</span></li>
            <li><span>Status</span><span><span class="status status--${esc(status)}">${esc(order.status)}</span></span></li>
            <li><span>Delivery</span><span>${esc(FULFILMENT[order.fulfillmentStatus] || order.fulfillmentStatus || '—')}</span></li>
            <li><span>Order total</span><span>${money(order.total)}</span></li>
            ${
              /* Only present just after checkout — see the note in checkout.js
                 about why these two fields cannot be re-fetched. */
              justPaid && justPaid.giftCardApplied > 0
                ? `<li><span>Gift card</span><span>&minus;${money(justPaid.giftCardApplied)}</span></li>
                   <li><span>You paid</span><span>${money(justPaid.amountDue)}</span></li>`
                : ''
            }
          </ul>

          ${
            order.trackingUrl || order.awb
              ? `<p style="margin-top:14px">
                   ${order.carrier ? `${esc(order.carrier)} — ` : ''}
                   ${
                     order.trackingUrl
                       ? `<a href="${esc(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track this shipment</a>`
                       : esc(order.awb || order.trackingNumber || '')
                   }
                 </p>`
              : ''
          }

          ${
            /* The invoice is a real GST invoice produced by the merchant's
               books, not something this storefront renders. It appears once
               the books have generated it, so it can legitimately be null on
               a brand-new order. */
            order.invoicePdfUrl
              ? `<p style="margin-top:14px">
                   <a class="btn btn--ghost" href="${esc(order.invoicePdfUrl)}" target="_blank" rel="noopener noreferrer">Download invoice</a>
                 </p>`
              : `<p class="crumb" style="margin-top:14px">Your invoice will be ready shortly.</p>`
          }
        </div>

        ${
          access && access.length
            ? `<div class="panel">
                 <h2>Your downloads</h2>
                 <ul class="lines">
                   ${access
                     .map(
                       (a) => `
                     <li class="line" style="grid-template-columns:1fr auto">
                       <div><p class="line__name">${esc(a.name)}</p></div>
                       <a class="btn btn--sm" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open</a>
                     </li>`,
                     )
                     .join('')}
                 </ul>
               </div>`
            : ''
        }
      </div>

      <aside>
        <div class="panel">
          <h2>Progress</h2>
          ${
            events && events.length
              ? `<ul class="timeline">
                   ${events
                     .map(
                       (e) => `<li>${esc(e.type)}<br><span class="when">${esc(when(e.at))}</span></li>`,
                     )
                     .join('')}
                 </ul>`
              : '<p class="crumb">Nothing to report yet.</p>'
          }
        </div>
        <div class="panel">
          <a class="btn btn--ghost btn--block" href="index.html">Continue shopping</a>
        </div>
      </aside>
    </div>`;
}

async function load() {
  if (!id) {
    host.innerHTML = `
      <div class="state state--empty">
        <p class="state__title">No order asked for.</p>
        <a class="btn btn--ghost" href="track.html">Track an order</a>
      </div>`;
    return;
  }
  renderLoading(host, 'Loading your order…');
  try {
    const data = await api.order(id);
    document.title = `Order ${data.order.orderRef}`;
    render(data);
  } catch (err) {
    if (err.status === 404) {
      host.innerHTML = `
        <div class="state state--empty">
          <p class="state__title">We could not find that order.</p>
          <p class="state__detail">Check the link, or look it up with your email and reference.</p>
          <a class="btn btn--ghost" href="track.html">Track an order</a>
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
