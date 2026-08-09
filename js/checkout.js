/* ---------------------------------------------------------------------------
   checkout.js — placing the order.

   ===========================================================================
   READ THIS BEFORE CHANGING ANYTHING HERE.

   There are TWO ways to place an order and you must pick exactly one. They
   take an IDENTICAL request body, so nothing about their shapes will warn you
   if you choose wrong.

     A. Paying later (cash on delivery)
          POST /api/checkout          <- this creates the order. Done.

     B. Paying now (card / UPI / net banking)
          POST /api/payment/create-order   -> nothing ordered yet
          open the gateway with what it returned
          POST /api/payment/verify         <- THIS creates the order

   On path B, calling /api/checkout as well places a SECOND, UNPAID order for
   the same basket. That is the one mistake here that costs real money.

   Two things you do not have to build:
     - verify is idempotent. Calling it twice returns the order already
       created, never a second one, so a retry after a dropped connection
       needs no guard of your own.
     - if the shopper pays and closes the tab before verify runs, the store
       still gets the gateway's server-to-server notification and creates the
       order anyway. That basket is not lost.
   ===========================================================================
--------------------------------------------------------------------------- */

import { api, mediaUrl } from './api.js';
import { cart } from './cart.js';
import { $, $$, esc, money, mountChrome, showError, toast } from './ui.js';

const form = $('#checkout-form');
const placeBtn = $('#place');

let payment = null;      // GET /api/payment/config
let autoDiscount = null;
let hasDigital = false;

/* Codes carried over from the cart. Only the CODES — the amounts are the
   store's to decide, every time. */
const pending = (() => {
  try {
    return JSON.parse(sessionStorage.getItem('merch.pending') || '{}');
  } catch {
    return {};
  }
})();

/* --- Summary -------------------------------------------------------------- */

function renderSummary() {
  const lines = cart.lines();

  $('#mini-lines').innerHTML = lines
    .map(
      (l) => `
      <li class="line">
        ${l.image ? `<img class="line__img" src="${esc(mediaUrl(l.image))}" alt="" loading="lazy">` : '<div class="line__img"></div>'}
        <div>
          <p class="line__name">${esc(l.name || l.itemId)}</p>
          <p class="line__meta">Qty ${l.qty}</p>
        </div>
        <div class="line__right"><strong>${money(l.price * l.qty)}</strong></div>
      </li>`,
    )
    .join('');

  const subtotal = cart.localSubtotal();
  const off = autoDiscount?.applies ? autoDiscount.discountAmount : 0;

  /* Deliberately an ESTIMATE. Coupon, gift card and shipping are all settled
     by the store when the order is placed, and the response tells you the
     figure that was actually charged. Never present this as final. */
  $('#totals').innerHTML = `
    <li><span>Subtotal</span><span>${money(subtotal)}</span></li>
    ${off ? `<li class="save"><span>${esc(autoDiscount.title || 'Discount')}</span><span>&minus;${money(off)}</span></li>` : ''}
    ${pending.coupon ? `<li class="muted"><span>Coupon ${esc(pending.coupon)}</span><span>applied at checkout</span></li>` : ''}
    ${pending.giftCard ? `<li class="muted"><span>Gift card</span><span>applied at checkout</span></li>` : ''}
    <li class="grand"><span>Estimated total</span><span>${money(Math.max(0, subtotal - off))}</span></li>`;
}

/* --- Payment options ------------------------------------------------------
   Which methods to offer is decided by the store, not by this page:
     - online payment appears only if the merchant has connected a gateway
     - cash on delivery disappears if anything in the basket is digital, since
       there is nothing to hand over on a doorstep. The store enforces that;
       showing it and letting the shopper be refused would be worse. */
function renderPaymentOptions() {
  const online = payment?.enabled === true;
  const cod = !hasDigital;

  const opts = [];
  if (cod) {
    opts.push(`
      <label class="check" style="margin-bottom:10px">
        <input type="radio" name="pay" value="cod" ${!online ? 'checked' : ''}>
        Cash on delivery
      </label>`);
  }
  if (online) {
    opts.push(`
      <label class="check" style="margin-bottom:10px">
        <input type="radio" name="pay" value="online" ${!cod ? 'checked' : ''}>
        Pay now — card, UPI or net banking
      </label>`);
  }

  $('#pay-options').innerHTML = opts.join('') || '';

  if (!opts.length) {
    $('#pay-note').innerHTML = `<p class="note note--err">
      This basket cannot be paid for right now: it needs online payment, and
      this store has not connected a payment gateway yet.</p>`;
    placeBtn.disabled = true;
    return;
  }

  /* Make sure exactly one is chosen even if the "checked" logic above left
     none — a form that silently posts nothing is worse than a default. */
  if (!$$('input[name="pay"]').some((r) => r.checked)) {
    $$('input[name="pay"]')[0].checked = true;
  }

  if (hasDigital && !online) {
    $('#pay-note').innerHTML = `<p class="note note--info">
      Your basket includes a digital item, which has to be paid for online.</p>`;
  } else if (hasDigital) {
    $('#pay-note').innerHTML = `<p class="note note--info">
      Includes a digital item — your access link appears as soon as payment
      clears.</p>`;
  }
}

/* --- Validation -----------------------------------------------------------
   Client-side checks are for speed of feedback only. The store validates
   everything again, and its refusal is the one that counts. */

const RULES = {
  name: (v) => (v.trim().length >= 2 ? '' : 'Please enter your name.'),
  email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? '' : 'Please enter a valid email.'),
  phone: (v) => (v.replace(/\D/g, '').length >= 10 ? '' : 'Please enter a valid phone number.'),
  address: (v) => (v.trim().length >= 5 ? '' : 'Please enter your address.'),
  city: (v) => (v.trim() ? '' : 'Please enter your city.'),
  state: (v) => (v.trim() ? '' : 'Please enter your state.'),
  pincode: (v) => (/^\d{6}$/.test(v.trim()) ? '' : 'Please enter a 6-digit pincode.'),
};

function setFieldError(input, message) {
  const p = input.parentElement.querySelector('.field__error');
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (p) {
    p.textContent = message;
    p.hidden = !message;
  }
}

function validate() {
  let firstBad = null;
  for (const [field, rule] of Object.entries(RULES)) {
    const input = $(`#${field}`);
    const message = rule(input.value);
    setFieldError(input, message);
    if (message && !firstBad) firstBad = input;
  }
  if (firstBad) firstBad.focus();
  return !firstBad;
}

/* Clear a field's error as soon as it is fixed, rather than making the shopper
   press the button again to find out. */
for (const field of Object.keys(RULES)) {
  $(`#${field}`).addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') {
      setFieldError(e.target, RULES[field](e.target.value));
    }
  });
}

function customer() {
  return {
    name: $('#name').value.trim(),
    email: $('#email').value.trim(),
    phone: $('#phone').value.trim(),
    address: $('#address').value.trim(),
    city: $('#city').value.trim(),
    state: $('#state').value.trim(),
    pincode: $('#pincode').value.trim(),
  };
}

/* The SAME body for both paths. Building it once is the honest way to show
   that the shapes really are identical. */
function orderPayload(method) {
  return {
    lines: cart.apiLines(),
    customer: customer(),
    paymentMethod: method,
    couponCode: pending.coupon || null,
    giftCardCode: pending.giftCard || null,
    /* An idempotency key makes a double-submit safe: the same key returns the
       same order instead of creating a second one. Regenerated per attempt so
       a genuine retry after a *failure* is not mistaken for a duplicate. */
    idempotencyKey: newKey(),
  };
}

function newKey() {
  /* crypto.randomUUID needs a secure context (https, or localhost). Fall back
     so the page still works when someone opens it over plain http on a LAN. */
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function busy(on) {
  placeBtn.disabled = on;
  placeBtn.setAttribute('aria-busy', String(on));
  placeBtn.textContent = on ? 'Placing your order…' : 'Place order';
}

/* --- Path A: pay later ---------------------------------------------------- */

async function payLater() {
  const result = await api.checkout(orderPayload('cod'));
  done(result);
}

/* --- Path B: pay now ------------------------------------------------------ */

async function payNow() {
  /* Step 1. Nothing is ordered by this call. */
  const intent = await api.createPaymentOrder(orderPayload('online'));

  await loadRazorpay();

  /* Step 2. Hand off to the gateway. It collects the card details; they never
     reach this storefront, which is most of why using a gateway is worth it. */
  await new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: intent.keyId,
      /* Already in the currency's MINOR unit (paise for INR). Do NOT multiply
         by 100 again — the store has done it. */
      amount: intent.amount,
      currency: intent.currency,
      name: intent.name,
      order_id: intent.razorpayOrderId,
      prefill: intent.prefill,
      handler: async (response) => {
        try {
          /* Step 3. THIS is what creates the order. */
          const order = await api.verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          done(order);
          resolve();
        } catch (err) {
          /* Money may well have been taken. Never tell them the order failed
             and invite them to pay again — say it is being sorted, and send
             them somewhere they can check. */
          reject(
            new Error(
              err?.message ||
                'Your payment went through but we could not confirm the order. ' +
                  'Please check "Track order" in a minute before paying again.',
            ),
          );
        }
      },
      modal: {
        ondismiss: () =>
          reject(new Error('Payment cancelled — your cart is still here.')),
      },
    });
    rz.open();
  });
}

/* The gateway's widget is the one external script in this project, and it is
   loaded only when someone actually chooses to pay online. */
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () =>
      reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  });
}

/* --- After either path ---------------------------------------------------- */

function done(order) {
  /* Stash `giftCardApplied` and `amountDue` before navigating.

     They exist ONLY on this checkout response. GET /api/orders/{id} returns
     the order shape, which has `total` and no notion of what a gift card
     covered — so a confirmation page that only re-fetches shows the full
     total to someone who paid ₹500 less than that, and it looks like they
     were overcharged. */
  try {
    sessionStorage.setItem(
      'merch.lastOrder',
      JSON.stringify({
        id: order.id,
        giftCardApplied: order.giftCardApplied || 0,
        amountDue: order.amountDue,
      }),
    );
  } catch {
    /* Private-mode storage failures must not lose the order. */
  }

  /* Clear only now — if anything above threw, the basket is still intact. */
  cart.clear();
  sessionStorage.removeItem('merch.pending');
  location.href = `order.html?id=${encodeURIComponent(order.id)}&new=1`;
}

/* --- Submit --------------------------------------------------------------- */

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!cart.lines().length) {
    toast('Your cart is empty.', 'error');
    return;
  }
  if (!validate()) return;

  const method = $$('input[name="pay"]').find((r) => r.checked)?.value || 'cod';

  busy(true);
  try {
    /* Exactly one of these. Never both. */
    if (method === 'online') await payNow();
    else await payLater();
  } catch (err) {
    showError(err);
  } finally {
    busy(false);
  }
});

/* --- Boot ----------------------------------------------------------------- */

async function boot() {
  mountChrome();

  if (!cart.lines().length) {
    form.innerHTML = `
      <div class="state state--empty">
        <p class="state__title">Your cart is empty</p>
        <a class="btn" href="index.html">Start shopping</a>
      </div>`;
    $('#mini-lines').innerHTML = '';
    return;
  }

  renderSummary();

  const pin = sessionStorage.getItem('merch.pincode');
  if (pin) $('#pincode').value = pin;

  /* Re-price before showing anything: this is the last screen before money. */
  try {
    const { removed } = await cart.refresh(api);
    if (removed.length) toast(`No longer available: ${removed.join(', ')}`, 'error');
  } catch {
    /* Fall through with the cached basket. */
  }

  const [cfg, auto, products] = await Promise.all([
    api.paymentConfig().catch(() => null),
    api.autoDiscount(cart.apiLines()).catch(() => null),
    Promise.all(cart.lines().map((l) => api.product(l.itemId).catch(() => null))),
  ]);

  payment = cfg;
  autoDiscount = auto;
  hasDigital = products.some((p) => p && p.isDigital);

  renderSummary();
  renderPaymentOptions();
}

boot();
