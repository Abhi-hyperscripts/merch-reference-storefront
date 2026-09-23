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

import { api, ApiError, mediaUrl } from './api.js';   // ApiError: the session-ended branch below tests it — without the import that `instanceof` threw inside the catch
import { cart } from './cart.js';
import { $, $$, esc, money, mountChrome, showError, toast } from './ui.js';

const form = $('#checkout-form');
const placeBtn = $('#place');

let payment = null;      // GET /api/payment/config
let autoDiscount = null;
let hasDigital = false;
let codEnabled = true;

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
  /* COD is also a store setting (`theme.payment.codEnabled`); offering it when
     the store refuses it means a 400 after the whole form is filled in. */
  const cod = !hasDigital && codEnabled;

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
    /* Two reasons, two sentences: a digital basket with no gateway, or a store
       with COD switched off and no gateway either. */
    $('#pay-note').innerHTML = hasDigital
      ? `<p class="note note--err">This basket cannot be paid for right now: it needs online payment, and
         this store has not connected a payment gateway yet.</p>`
      : `<p class="note note--err">This store has no payment method enabled yet. Please contact the store.</p>`;
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
       same order instead of creating a second one. ONE key per checkout
       attempt-series — a fresh key on every press (what the first version did)
       made the guarantee impossible. It is replaced only after a REFUSAL the
       store answered (a retry after a fix is a new order), and cleared by done(). */
    idempotencyKey: (currentKey ??= newKey()),
  };
}
let currentKey = null;

function newKey() {
  /* crypto.randomUUID needs a secure context (https, or localhost). Fall back
     so the page still works when someone opens it over plain http on a LAN. */
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

let moneyCaptured = false;   /* once a payment was captured and the order could not be confirmed, Place order never re-arms */
function busy(on) {
  placeBtn.disabled = on || moneyCaptured;
  placeBtn.setAttribute('aria-busy', String(on));
  placeBtn.textContent = on ? 'Placing your order…' : 'Place order';
}

/* --- Path A: pay later ---------------------------------------------------- */

async function payLater() {
  const result = await api.checkout(orderPayload('cod'));
  /* The checkout reply (CheckoutResult) carries no paymentMethod: say which this was, or the
     order page reads "You paid" for money the courier has yet to collect until its re-fetch lands. */
  done({ ...result, paymentMethod: 'cod' });
}

/* create-order's 409s carry recovery data; each needs its own exit, not a toast.
   Returns true when handled. */
function handleRefusal(err) {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const b = err.body || {};
  if (b.orderId) {
    /* An order ALREADY exists (and gift-card value was spent) — take them to it. */
    toast(err.message, 'error');
    currentKey = null;
    done({ id: b.orderId, giftCardApplied: null, amountDue: b.amountDue, paymentMethod: 'online' });
    return true;
  }
  if (typeof b.giftCardAvailable === 'number') {
    toast(`${err.message} This card currently has ${money(b.giftCardAvailable)} left.`, 'error');
    currentKey = null;
    return true;
  }
  if (typeof b.availableQty === 'number') {
    toast(`${err.message} Only ${b.availableQty} left — reduce the quantity in your cart.`, 'error');
    currentKey = null;
    return true;
  }
  return false;
}

/* --- Path B: pay now ------------------------------------------------------ */

async function payNow() {
  /* Step 1. Nothing is ordered by this call. */
  const intent = await api.createPaymentOrder(orderPayload('online'));

  /* …unless nothing is owed: a gift card (or a 100% coupon with waived
     shipping) covering the total makes create-order PLACE the order and answer
     `{ freeOrder: true, orderId, replayed }` — no gateway fields at all. The
     first version fed those undefineds to the payment widget. */
  if (intent.freeOrder) {
    done({ id: intent.orderId, giftCardApplied: null, amountDue: 0, paymentMethod: 'online' });
    return;
  }

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
             and invite them to pay again. The 502 says which kind this is:
             `permanent: true` — the order will never be created and a refund
             is owed, so the exit is "contact the store"; otherwise the
             webhook finishes it and "check Track order in a minute" is true. */
          const permanent = err instanceof ApiError && err.body?.permanent === true;
          const captured = new Error(
            permanent
              ? (err.message || 'Your payment went through but the order could not be created.') +
                  ' Please contact the store with your payment reference — do not pay again.'
              : err?.message ||
                  'Your payment went through but we could not confirm the order. ' +
                    'Please check "Track order" in a minute before paying again.',
          );
          /* Money WAS taken: this sentence must reach the shopper verbatim (showError toasts a generic line for a
             plain Error), and Place order must stay disabled — re-arming it invites a second capture. */
          captured.moneyCaptured = true;
          reject(captured);
        }
      },
      modal: {
        ondismiss: () => {
          /* Release the holds create-order took, or the shopper's own retry is
             refused as "sold out" until they expire. */
          api.abandonPayment(intent.razorpayOrderId).catch(() => {});
          reject(new Error('Payment cancelled — your cart is still here.'));
        },
      },
    });
    rz.open();
  });
}

/* The gateway's widget is the one external script in this project, and it is
   loaded only when someone actually chooses to pay online. */
let razorpayOnce = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return (razorpayOnce ??= new Promise((resolve, reject) => {   // one tag per page; a failed load is retried, a pending one is shared
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () =>
      reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  }).catch((e) => { razorpayOnce = null; throw e; }));
}

/* --- After either path ---------------------------------------------------- */

function done(order) {
  /* Stash `giftCardApplied` and `amountDue` before navigating.

     Every order shape carries them (GET /api/orders/{id} included); the
     stash only fills the gap until the confirmation page's first re-fetch
     lands, so the total never flashes as the full amount to someone who paid
     ₹500 less than that. */
  try {
    sessionStorage.setItem(
      'merch.lastOrder',
      JSON.stringify({
        id: order.id,
        giftCardApplied: order.giftCardApplied ?? null,   // unknown stays unknown: the order page's re-fetch has the real figure
        amountDue: order.amountDue,
        paymentMethod: order.paymentMethod || null,   // the order page reads it for "to pay on delivery" vs "you paid" until its re-fetch lands
      }),
    );
  } catch {
    /* Private-mode storage failures must not lose the order. */
  }

  /* Clear only now — if anything above threw, the basket is still intact. */
  currentKey = null;
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
    if (err?.moneyCaptured) {
      moneyCaptured = true;        /* latched through busy(): the finally below would otherwise re-arm the button */
      toast(err.message, 'error');
      return;
    }
    if (handleRefusal(err)) return;
    if (err instanceof ApiError && err.status === 400) currentKey = null;   // a refusal the store answered: the next press is a new attempt
    if (err instanceof ApiError && err.sessionEnded) {
      /* The token was dead and is now gone: a second press places a GUEST order. Say so before it happens. */
      toast('You have been signed out because this account’s sign-in changed. Press Place order again to check out as a guest, or sign in first to keep this order on your account.', 'error');
    } else {
      showError(err);
    }
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
    const { removed, stale } = await cart.refresh(api);
    if (removed.length) toast(`No longer available: ${removed.join(', ')}`, 'error');
    if (stale) toast('Could not re-check prices with the store — the summary shows your saved basket.', 'error');   // the last screen before money must not hide a stale price silently
  } catch {
    /* Fall through with the cached basket. */
  }

  const [cfg, auto, products, theme] = await Promise.all([
    api.paymentConfig().catch(() => null),
    api.autoDiscount(cart.apiLines()).catch(() => null),
    api.products(cart.lines().map((l) => l.itemId)).catch(() => []),   // one call, not one per line
    api.theme().catch(() => null),
  ]);

  payment = cfg;
  autoDiscount = auto;
  hasDigital = products.some((p) => p && p.isDigital);
  codEnabled = theme?.payment?.codEnabled !== false;

  renderSummary();
  renderPaymentOptions();
}

boot();
