/* ---------------------------------------------------------------------------
   cart-page.js — the basket, and every "what would this cost" question.

   The important idea: THE BROWSER NEVER DECIDES A PRICE. Coupons, automatic
   discounts and shipping are all previews computed by the store from its own
   live prices. This page sends lines and shows what comes back.

   That is not ceremony. If the browser could name a subtotal, anyone could
   name a cheaper one — so the store recomputes it every time, and the figure
   you display is a figure it has already agreed to.
--------------------------------------------------------------------------- */

import { api, ApiError, mediaUrl } from './api.js';
import { cart } from './cart.js';
import {
  $, esc, money, mountChrome, toast, showError, renderEmpty,
} from './ui.js';

const panel = $('#cart-panel');
const summary = $('#summary');

/* What we have been told so far. Each is either null (not asked / not valid)
   or the store's own answer. */
let couponPreview = null;
/* The code the store last ACCEPTED for this basket — what checkout re-prices.
   Kept apart from the preview: a failed re-check drops the FIGURE (its
   newSubtotal was computed for the previous lines) but must not drop the code,
   and savePending() used to derive the code from the preview, so the next
   gift-card apply wrote an empty coupon and the order went out at full price. */
let pendingCoupon = '';
let autoDiscount = null;
let giftCard = null;
/* The gift-card code the store last ACCEPTED — kept apart from the balance
   reply for the same reason as pendingCoupon (see above). */
let pendingGift = '';
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

  /* DO NOT STACK A COUPON ON TOP OF AN AUTOMATIC DISCOUNT.

     Whether the two combine is decided by the merchant's books, not by this
     storefront — the API forwards a coupon code and the books settle the
     final figure. Subtracting both here quietly promises a discount the store
     may never give: the cart said ₹1,624.15 and the order came to ₹2,249.10,
     because only one of the two was actually applied.

     So take the STORE'S OWN figure. Both previews return `newSubtotal`, which
     is the subtotal it computed after applying that one thing. Prefer the
     coupon when there is one, because that is the discount the shopper
     deliberately asked for and expects to see. Where the two really do stack,
     the order comes out cheaper than quoted, which is the safe direction to
     be wrong in. */
  const couponOff = couponPreview?.valid ? couponPreview.discountAmount : 0;
  const autoOff = autoDiscount?.applies ? autoDiscount.discountAmount : 0;

  const discountedSubtotal = couponPreview?.valid
    ? couponPreview.newSubtotal
    : autoDiscount?.applies
      ? autoDiscount.newSubtotal
      : subtotal;

  const freeShipping = autoDiscount?.applies && autoDiscount.freeShipping;
  /* Again: `shipping.shipping` (the cheapest option), never `available`. */
  const ship = freeShipping ? 0 : Number(shipping?.shipping) || 0;

  const afterDiscounts = Math.max(0, discountedSubtotal) + ship;

  /* A gift card is not a discount — it is money already paid. So it comes off
     the total to give the amount still due, and it can only ever cover what is
     actually owed. */
  const giftUse = giftCard?.valid ? Math.min(giftCard.balance, afterDiscounts) : 0;
  const due = Math.max(0, afterDiscounts - giftUse);

  /* Show only the one that is actually in the total, for the same reason. */
  const showCoupon = couponPreview?.valid;
  const showAuto = !showCoupon && autoDiscount?.applies;

  $('#totals').innerHTML = `
    <li><span>Subtotal (${cart.count()} item${cart.count() === 1 ? '' : 's'})</span><span>${money(subtotal)}</span></li>
    ${showAuto ? `<li class="save"><span>${esc(autoDiscount.title || 'Discount')}</span><span>&minus;${money(autoOff)}</span></li>` : ''}
    ${showCoupon ? `<li class="save"><span>Coupon ${esc(couponPreview.code)}</span><span>&minus;${money(couponOff)}</span></li>` : ''}
    ${
      showCoupon && autoDiscount?.applies
        ? `<li class="muted"><span>${esc(autoDiscount.title || 'Automatic discount')}</span><span>may also apply</span></li>`
        : ''
    }
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
    <li class="grand"><span>Estimated total</span><span>${money(due)}</span></li>`;
}

/* --- Store-computed previews ---------------------------------------------- */

/* The automatic discount needs no input from the shopper, so ask on every
   cart change — it is how they find out about "5% off over ₹2,000" at all. */
let autoRetry = null;
async function refreshAuto() {
  const lines = cart.apiLines();
  if (!lines.length) {
    autoDiscount = null;
    return;
  }
  try {
    autoDiscount = await api.autoDiscount(lines);
    note('#auto-note');   /* clear (NOT null: a default parameter fires on undefined only — null threw, the catch swallowed it, and every SUCCESSFUL lookup was discarded) */
  } catch (err) {
    /* Never block the cart on a discount lookup — but say when it was the
       rate limit, or the "5% off" line vanishes from the totals for no reason.
       Its OWN note: the coupon re-check writes #coupon-note in the same tick. */
    /* Whatever the failure, the previous basket's figure is NOT this basket's: a stale
       newSubtotal drove "Estimated total" for lines the store never priced. */
    autoDiscount = null;
    if (err instanceof ApiError && err.isRateLimited) {
      note('#auto-note', { err: 'Too many changes at once — the discount will be re-checked in a moment.' });
      clearTimeout(autoRetry); autoRetry = setTimeout(refreshAuto, 5000);   /* and actually re-check: the copy promised one */
    }
  }
  renderTotals();
}

/* Re-checking a coupon after the basket changes matters: "over ₹2,000" stops
   being true when a line is removed, and a stale "applied" would promise a
   discount checkout then refuses. */
async function recheckCoupon() {
  if (!pendingCoupon) return;
  /* An EMPTIED basket (last line removed): nothing to re-check against, and a
     refusal on ₹0 cleared pendingCoupon and erased the stored code with
     nothing shown (the summary is hidden for an empty cart). Drop the figure,
     keep the code — the next added line re-checks it. */
  if (!cart.apiLines().length) { couponPreview = null; return; }
  try {
    const res = await api.validateCoupon(pendingCoupon, cart.apiLines());
    couponPreview = res;
    pendingCoupon = res.valid ? res.code : '';
    note('#coupon-note', res.valid
      ? { ok: `${res.code} applied — you save ${money(res.discountAmount)}.` }
      : { err: res.reason || 'That code no longer applies to this basket.' });
    /* A basket edit can invalidate a coupon; the stored code must follow. */
    savePending();
  } catch {
    /* The CODE stays (pendingCoupon → merch.pending; checkout re-prices it) — the
       PREVIEW does not: its newSubtotal was computed for the previous lines and
       outranks every other figure in renderTotals, so a failed re-check after an
       edit quoted a total ₹2,000 above the basket's own subtotal. And the note
       must follow the figure: a green "applied — you save ₹200" above totals that
       carry no coupon row promised a discount this page could not show. */
    couponPreview = null;
    note('#coupon-note', { info: `We could not re-check ${pendingCoupon} just now — it will be applied at checkout if it still qualifies.` });
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
    pendingCoupon = res.valid ? res.code : '';
    /* A refused coupon is a 200 with valid:false and a reason — not an error.
       Treating it as a failure would show the shopper a scary message for the
       ordinary case of a typo or an expired code. */
    note('#coupon-note', res.valid
      ? { ok: `${res.code} applied — you save ${money(res.discountAmount)}.` }
      : { err: res.reason || 'That code is not valid for this basket.' });
    savePending();
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
    pendingGift = res.valid ? res.code || code : '';
    note('#gift-note', res.valid
      ? { ok: `Balance ${money(res.balance)}. It will be applied at checkout.` }
      : { err: res.reason || 'That gift card could not be used.' });
    savePending();
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
  /* The store quotes a flat rate for ANY string (it only skips the courier for a
     bad one); checkout refuses it later. Refuse it here, where it was typed. */
  if (!/^\d{6}$/.test(pincode)) return note('#ship-note', { err: 'Enter a valid 6-digit pincode.' });

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
      shipping = null;   /* the reply's flat amount is not a charge for a delivery that cannot happen: no shipping row */
    } else {
      const cheapest = options.reduce((a, b) => (b.amount < a.amount ? b : a));
      const eta =
        cheapest.etaMin && cheapest.etaMax
          ? ` — ${cheapest.etaMin}–${cheapest.etaMax} days`
          : shipping.etaDays
            ? ` — about ${shipping.etaDays} days`
            : '';
      /* Do not print "Free delivery: Free". When the option is free and its
         name already says so, the name is the whole message. */
      const free = cheapest.amount === 0;
      const label = cheapest.name || 'Delivery';
      const text = free
        ? /free/i.test(label)
          ? label
          : `${label}: Free`
        : `${label}: ${money(cheapest.amount)}`;
      note('#ship-note', { ok: `${text}${eta}` });
      /* Keep the figure the totals use in step with the option shown. */
      shipping = { ...shipping, shipping: cheapest.amount };
    }
    /* Remember it so checkout can start from the same answer — guarded: a
       private-mode/quota throw here landed in this catch and showed an ERROR
       for a quote that had just succeeded. */
    try { sessionStorage.setItem('merch.pincode', pincode); } catch { /* the quote is still in memory */ }
    renderTotals();
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
});

/* Carry the coupon and gift card to checkout. Only the CODES travel — the
   amounts are recomputed there and again by the store when the order is
   placed, so nothing here can inflate a discount.

   Saved the moment a code is accepted, NOT when the Checkout button is
   clicked. Hanging it off the click looks equivalent and is not: a shopper who
   refreshes, uses the back button, or opens checkout from a bookmark then
   arrives with no coupon and no idea it was dropped — they simply get charged
   more than the cart quoted. (Found exactly that way: the cart said ₹1,624.15
   and the order came to ₹2,374.05.) */
function savePending() {
  /* Guarded, like the order stash in checkout.js: a private-mode or quota
     throw here used to escape into recheckCoupon's catch and turn a
     SUCCESSFUL re-check into "could not re-check". */
  try {
    sessionStorage.setItem('merch.pending', JSON.stringify({ coupon: pendingCoupon, giftCard: pendingGift }));
  } catch { /* the codes are still in memory for this page; checkout re-prices anyway */ }
}

/* A coupon or gift card accepted on an EARLIER visit lives in merch.pending
   (checkout reads it). savePending() rewrites BOTH fields from memory, so
   without restoring them here the first apply after a reload wrote the other
   one back as "" — apply WELCOME10, reload, apply GIFT500: the order went out
   at full price. The codes are re-checked against the current basket; a
   failed re-check keeps the code (checkout re-prices it) and says so. */
async function restorePending() {
  /* An EMPTY basket: nothing to re-check against, and a refusal on a ₹0 basket
     would clear pendingCoupon and erase the stored code with nothing shown
     (the summary is hidden for an empty cart). The codes are still put into
     memory; only the re-checks are skipped. */
  let stored = {};
  try { stored = JSON.parse(sessionStorage.getItem('merch.pending') || '{}') || {}; } catch { stored = {}; }
  /* BOTH codes into memory before either re-check: the coupon's re-check calls
     savePending(), which serialises pendingGift — still "" if the gift branch
     had not run — so storage held no gift card for the whole gift round trip,
     and a Checkout click in that window placed the order at full price. And
     into memory even on an EMPTY basket (the return below): a second tab can
     fill the basket, and the first apply here then re-saved the other code as
     "" if memory never learned it. */
  pendingCoupon = stored.coupon ? String(stored.coupon) : '';
  pendingGift = stored.giftCard ? String(stored.giftCard) : '';
  if (!cart.apiLines().length) return;
  if (pendingCoupon) {
    $('#coupon').value = pendingCoupon;
    await recheckCoupon();
  }
  if (pendingGift) {
    $('#giftcard').value = pendingGift;
    try {
      const res = await api.checkGiftCard(pendingGift);
      giftCard = res;
      pendingGift = res.valid ? res.code || pendingGift : '';
      note('#gift-note', res.valid
        ? { ok: `Balance ${money(res.balance)}. It will be applied at checkout.` }
        : { err: res.reason || 'That gift card could not be used.' });
    } catch {
      note('#gift-note', { info: `We could not re-check gift card ${pendingGift} just now — it will be applied at checkout if it still has balance.` });
    }
    savePending();
    renderTotals();
  }
}

/* --- Boot ----------------------------------------------------------------- */

/* Two preview calls per +/− click, against a 90/min bucket the cart shares
   with the account pages: debounced, so a burst of clicks costs one round. */
let previewTimer = null;
cart.onChange(() => {
  renderLines();
  renderTotals();
  clearTimeout(previewTimer); clearTimeout(autoRetry);   /* an edit supersedes any pending re-check */
  previewTimer = setTimeout(() => { refreshAuto(); recheckCoupon(); }, 350);
});

async function boot() {
  mountChrome();
  renderLines();
  renderTotals();

  /* Re-price against the store before the shopper commits to anything. A cart
     can sit in localStorage for weeks. */
  try {
    const { removed, stale } = await cart.refresh(api);
    if (removed.length) {
      toast(`No longer available: ${removed.join(', ')}`, 'error');
    }
    if (stale) toast('Could not reach the store to re-check prices — showing your saved basket.', 'error');
  } catch {
    /* Show the cached cart rather than nothing. */
  }

  renderLines();
  await refreshAuto();
  renderTotals();

  /* Before the (network-bound) pending restore: a pincode typed and checked
     while that restore was in flight was overwritten by the saved one. */
  const saved = sessionStorage.getItem('merch.pincode');
  if (saved) $('#pincode').value = saved;
  await restorePending();
}

boot();
