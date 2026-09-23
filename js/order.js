/* ---------------------------------------------------------------------------
   order.js — one order: confirmation, and afterwards, its status.

   Careful here: THE SAME ORDER COMES BACK IN THREE DIFFERENT SHAPES.

     GET  /api/orders/{id}      -> { order, events, access, items }   WRAPPED
                                   (items: the lines with name/qty/price/imageUrl — rendered below)
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
/* The timeline's `type` is a machine word (the store's allow-list); label it. */
const EVENT_LABEL = {
  placed: 'Order placed',
  fulfilled: 'Shipped',
  cancelled: 'Cancelled',
  access_granted: 'Downloads unlocked',
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

function render({ order, events, access, items }) {
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
            <li><span>Placed</span><span>${esc(when(order.placedAt ?? order.createdAt))}</span></li>   <!-- when the basket was placed; createdAt is when the money cleared -->
            <li><span>Status</span><span><span class="status status--${order.amountUncollected ? 'pending' : esc(status)}">${order.amountUncollected ? 'Not collected' : esc(order.status)}</span></span></li>
            ${status === 'failed' ? '<li><span></span><span>This order was never completed, so there is nothing to do here. Please contact us if you were charged.</span></li>' : ''}
            <li><span>Delivery</span><span>${esc(FULFILMENT[order.fulfillmentStatus] || order.fulfillmentStatus || '—')}</span></li>
            <li><span>Order total</span><span>${money(order.total)}</span></li>
            ${
              /* giftCardApplied / amountDue are on the order itself (every order
                 shape carries them); the checkout reply only fills the gap until
                 the first re-fetch. */
              /* The settlement row is NOT a gift-card detail: amountUncollected
                 is reachable with no card at all (a drained card, a 100%-off
                 coupon), and nested under the card test the shopper who owes
                 the most was told nothing. */
              order.amountUncollected || (order.giftCardApplied ?? justPaid?.giftCardApplied ?? 0) > 0
                ? `${(order.giftCardApplied ?? justPaid?.giftCardApplied ?? 0) > 0
                     ? `<li><span>Gift card</span><span>&minus;${money(order.giftCardApplied ?? justPaid?.giftCardApplied)}</span></li>`
                     : ''}
                   <li><span>${
                     /* amountUncollected: the store says this balance has NOT been
                        collected (a COD order the courier has not settled, an
                        online order whose payment never landed) — never "You paid". */
                     order.amountUncollected
                       ? 'Not collected'                                                         /* the store says this money was never collected — a settled COD order is not this */
                       : (order.paymentMethod || justPaid?.paymentMethod) === 'cod' ? 'To pay on delivery' : 'You paid'
                   }</span><span>${money(order.amountDue ?? justPaid?.amountDue ?? ((Number(order.total) || 0) - (order.giftCardApplied ?? justPaid?.giftCardApplied ?? 0)))   /* amountDue is NULL on rows from before the column: derive, never fabricate ₹0 or a blank cell */}</span></li>`
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
          items && items.length
            ? `<div class="panel">
                 <h2>Items</h2>
                 <ul class="lines">
                   ${items
                     .map(
                       (l) => `
                     <li class="line" style="grid-template-columns:1fr auto auto">
                       <div><p class="line__name">${esc(l.name)}${l.isDigital ? ' <span class="crumb">(digital)</span>' : ''}</p></div>
                       <span>${money(l.price)} &times; ${Number(l.qty) || 0}</span>
                       <span>${money((Number(l.price) || 0) * (Number(l.qty) || 0))}</span>
                     </li>`,
                     )
                     .join('')}
                 </ul>
               </div>`
            : ''
        }

        ${
          access && access.length
            ? `<div class="panel">
                 <h2>Your downloads</h2>
                 <ul class="lines">
                   ${access
                     .map(
                       (a) => `
                     <li class="line" style="grid-template-columns:1fr auto">
                       <div><p class="line__name">${esc(a.name)}</p>${
                         /* Both nullable: a blank url is instructions-only delivery
                            (manual enrolment) — the text IS the delivery, and an
                            "Open" button with no href only reloads this page. */
                         a.instructions ? `<p class="line__meta">${esc(a.instructions)}</p>` : ''
                       }${!a.url && !a.instructions ? '<p class="line__meta">Access details will follow by email.</p>' : ''}</div>
                       ${a.url ? `<a class="btn btn--sm" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
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
                       (e) => `<li>${esc(EVENT_LABEL[e.type] || e.type)}<br><span class="when">${esc(when(e.at))}</span></li>`,
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
