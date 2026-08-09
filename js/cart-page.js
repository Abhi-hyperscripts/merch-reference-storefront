/* ---------------------------------------------------------------------------
   cart-page.js — the basket, and every "what would this cost" question.

   The important idea: THE BROWSER NEVER DECIDES A PRICE. Coupons, automatic
   discounts and shipping are all previews computed by the store from its own
   live prices. This page sends lines and shows what comes back.

   That is not ceremony. If the browser could name a subtotal, anyone could
   name a cheaper one — so the store recomputes it every time, and the figure
   you display is a figure it has already agreed to.
--------------------------------------------------------------------------- */

import { api, mediaUrl } from './api.js';
import { cart } from './cart.js';
import {
  $, esc, money, mountChrome, toast, showError, renderEmpty,
} from './ui.js';

const panel = $('#cart-panel');
const summary = $('#summary');

/* What we have been told so far. Each is either null (not asked / not valid)
   or the store's own answer. */
let couponPreview = null;
let autoDiscount = null;
let giftCard = null;
let shipping = null;

/* --- Rendering ------------------------------------------------------------ */

function renderLines() {
  const lines = cart.lines();

  if (!lines.length) {
    renderEmpty(
      panel,
      'Your cart is empty',
      'Once you add something it will show up here.',
      '<a class="btn" href="index.html">Start shopping</a>',
    );
    summary.hidden = true;
    return;
  }

  summary.hidden = false;
  panel.innerHTML = `
    <ul class="lines">
      ${lines
        .map(
          (l) => `
        <li class="line" data-id="${esc(l.itemId)}">
          ${
            l.image
              ? `<img class="line__img" src="${esc(mediaUrl(l.image))}" alt="" loading="lazy">`
              : '<div class="line__img"></div>'
          }
          <div>
            <p class="line__name">
              <a href="product.html?id=${encodeURIComponent(l.itemId)}">${esc(l.name || l.itemId)}</a>
            </p>
            <p class="line__meta">${money(l.price)} each</p>
          </div>
          <div class="line__right">
            <div class="qty">
              <button type="button" data-step="-1" aria-label="Decrease quantity">&minus;</button>
              <input type="number" value="${l.qty}" min="1" max="99" data-qty aria-label="Quantity for ${esc(l.name || l.itemId)}">
              <button type="button" data-step="1" aria-label="Increase quantity">+</button>
            </div>
            <strong>${money(l.price * l.qty)}</strong>
            <button class="link-danger" type="button" data-remove>Remove</button>
          </div>
        </li>`,
        )
        .join('')}
    </ul>`;
  panel.setAttribute('aria-busy', 'false');
}

function renderTotals() {
  const lines = cart.lines();
  const subtotal = cart.localSubtotal();

  /* A coupon and an automatic discount are separate things and the store
     treats them separately, so show whichever applies rather than silently
     picking one. */
  const couponOff = couponPreview?.valid ? couponPreview.discountAmount : 0;
  const autoOff = autoDiscount?.applies ? autoDiscount.discountAmount : 0;

  const freeShipping = autoDiscount?.applies && autoDiscount.freeShipping;
  /* Again: `shipping.shipping` (the cheapest option), never `available`. */
  const ship = freeShipping ? 0 : Number(shipping?.shipping) || 0;

  const afterDiscounts = Math.max(0, subtotal - couponOff - autoOff) + ship;

  /* A gift card is not a discount — it is money already paid. So it comes off
     the total to give the amount still due, and it can only ever cover what is
     actually owed. */
  const giftUse = giftCard?.valid ? Math.min(giftCard.balance, afterDiscounts) : 0;
  const due = Math.max(0, afterDiscounts - giftUse);

  $('#totals').innerHTML = `
    <li><span>Subtotal (${cart.count()} item${cart.count() === 1 ? '' : 's'})</span><span>${money(subtotal)}</span></li>
    ${autoOff ? `<li class="save"><span>${esc(autoDiscount.title || 'Discount')}</span><span>&minus;${money(autoOff)}</span></li>` : ''}
    ${couponOff ? `<li class="save"><span>Coupon ${esc(couponPreview.code)}</span><span>&minus;${money(couponOff)}</span></li>` : ''}
    <li class="muted">
      <span>Shipping</span>
      <span>${
        freeShipping
          ? 'Free'
          : shipping
            ? ship === 0
              ? 'Free'
              : money(ship)
            : 'Enter a pincode'
      }</span>
    </li>
    ${giftUse ? `<li class="save"><span>Gift card</span><span>&minus;${money(giftUse)}</span></li>` : ''}
    <li class="grand"><span>Total</span><span>${money(due)}</span></li>`;
}

/* --- Store-computed previews ---------------------------------------------- */

/* The automatic discount needs no input from the shopper, so ask on every
   cart change — it is how they find out about "5% off over ₹2,000" at all. */
async function refreshAuto() {
  const lines = cart.apiLines();
  if (!lines.length) {
    autoDiscount = null;
    return;
  }
  try {
    autoDiscount = await api.autoDiscount(lines);
  } catch {
    /* Never block the cart on a discount lookup. */
    autoDiscount = null;
  }
  renderTotals();
}

/* Re-checking a coupon after the basket changes matters: "over ₹2,000" stops
   being true when a line is removed, and a stale "applied" would promise a
   discount checkout then refuses. */
async function recheckCoupon() {
  if (!couponPreview?.valid) return;
  try {
    const res = await api.validateCoupon(couponPreview.code, cart.apiLines());
    couponPreview = res;
    note('#coupon-note', res.valid
      ? { ok: `${res.code} applied — you save ${money(res.discountAmount)}.` }
      : { err: res.reason || 'That code no longer applies to this basket.' });
  } catch {
    /* Leave the last known answer alone rather than dropping a valid coupon
       because of one failed call. */
  }
  renderTotals();
}

function note(sel, { ok, err, info } = {}) {
  const el = $(sel);
  if (!el) return;
  if (ok) el.innerHTML = `<p class="note note--ok">${esc(ok)}</p>`;
  else if (err) el.innerHTML = `<p class="note note--err">${esc(err)}</p>`;
  else if (info) el.innerHTML = `<p class="note note--info">${esc(info)}</p>`;
  else el.innerHTML = '';
}

/* --- Events --------------------------------------------------------------- */

panel.addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]');
  if (!li) return;
  const id = li.getAttribute('data-id');

  if (e.target.closest('[data-remove]')) {
    cart.remove(id);
    return;
  }
  const step = e.target.closest('[data-step]');
  if (step) {
    const input = li.querySelector('[data-qty]');
    cart.setQty(id, Number(input.value) + Number(step.getAttribute('data-step')));
  }
});

panel.addEventListener('change', (e) => {
  const input = e.target.closest('[data-qty]');
  if (!input) return;
  const li = input.closest('[data-id]');
  cart.setQty(li.getAttribute('data-id'), input.value);
});

$('#apply-coupon').addEventListener('click', async () => {
  const code = $('#coupon').value.trim();
  if (!code) return note('#coupon-note', { info: 'Enter a code first.' });

  const btn = $('#apply-coupon');
  btn.disabled = true;
  try {
    const res = await api.validateCoupon(code, cart.apiLines());
    couponPreview = res;
    /* A refused coupon is a 200 with valid:false and a reason — not an error.
       Treating it as a failure would show the shopper a scary message for the
       ordinary case of a typo or an expired code. */
    note('#coupon-note', res.valid
      ? { ok: `${res.code} applied — you save ${money(res.discountAmount)}.` }
      : { err: res.reason || 'That code is not valid for this basket.' });
    renderTotals();
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
});

$('#apply-gift').addEventListener('click', async () => {
  const code = $('#giftcard').value.trim();
  if (!code) return note('#gift-note', { info: 'Enter a card code first.' });

  const btn = $('#apply-gift');
  btn.disabled = true;
  try {
    const res = await api.checkGiftCard(code);
    giftCard = res;
    note('#gift-note', res.valid
      ? { ok: `Balance ${money(res.balance)}. It will be applied at checkout.` }
      : { err: res.reason || 'That gift card could not be used.' });
    renderTotals();
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
});

$('#check-ship').addEventListener('click', async () => {
  const pincode = $('#pincode').value.trim();
  if (!pincode) return note('#ship-note', { info: 'Enter a pincode first.' });

  const btn = $('#check-ship');
  btn.disabled = true;
  try {
    /* 'cod' vs anything else changes the answer — some couriers price cash on
       delivery differently, or refuse it. This page quotes for COD; checkout
       re-quotes for the method actually chosen. */
    shipping = await api.shippingQuote(pincode, cart.apiLines(), 'cod');

    /* READ `options`, NOT `available`.

       `available` does not mean what its name suggests. It reports whether a
       LIVE COURIER RATE was found — so a store on flat-rate shipping, or one
       that has not connected a courier account, answers `available: false` on
       every single quote while still shipping perfectly happily. Wiring the
       obvious-looking flag to "we cannot deliver to that pincode" tells most
       shoppers of most stores that the shop does not serve them.

       `options` is the real answer and is always populated. `shipping` is the
       cheapest option's amount, which is what checkout will charge. */
    const options = shipping.options || [];
    if (!options.length) {
      note('#ship-note', { err: 'We cannot deliver to that pincode.' });
    } else {
      const cheapest = options.reduce((a, b) => (b.amount < a.amount ? b : a));
      const eta =
        cheapest.etaMin && cheapest.etaMax
          ? ` — ${cheapest.etaMin}–${cheapest.etaMax} days`
          : shipping.etaDays
            ? ` — about ${shipping.etaDays} days`
            : '';
      const price = cheapest.amount === 0 ? 'Free' : money(cheapest.amount);
      note('#ship-note', { ok: `${cheapest.name || 'Delivery'}: ${price}${eta}` });
      /* Keep the figure the totals use in step with the option shown. */
      shipping = { ...shipping, shipping: cheapest.amount };
    }
    /* Remember it so checkout can start from the same answer. */
    sessionStorage.setItem('merch.pincode', pincode);
    renderTotals();
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
});

/* Carry the coupon and gift card to checkout. Only the CODES travel — the
   amounts are recomputed there and again by the store when the order is
   placed, so nothing here can inflate a discount. */
$('#to-checkout').addEventListener('click', () => {
  const pending = {
    coupon: couponPreview?.valid ? couponPreview.code : '',
    giftCard: giftCard?.valid ? $('#giftcard').value.trim() : '',
  };
  sessionStorage.setItem('merch.pending', JSON.stringify(pending));
});

/* --- Boot ----------------------------------------------------------------- */

cart.onChange(() => {
  renderLines();
  renderTotals();
  refreshAuto();
  recheckCoupon();
});

async function boot() {
  mountChrome();
  renderLines();
  renderTotals();

  /* Re-price against the store before the shopper commits to anything. A cart
     can sit in localStorage for weeks. */
  try {
    const { removed } = await cart.refresh(api);
    if (removed.length) {
      toast(`No longer available: ${removed.join(', ')}`, 'error');
    }
  } catch {
    /* Show the cached cart rather than nothing. */
  }

  renderLines();
  await refreshAuto();
  renderTotals();

  const saved = sessionStorage.getItem('merch.pincode');
  if (saved) $('#pincode').value = saved;
}

boot();
