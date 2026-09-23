/* ---------------------------------------------------------------------------
   track.js — find an order without an account.

   Note the shape difference from order.js: lookup answers with the order
   DIRECTLY, where GET /api/orders/{id} wraps it under `order`. Same data,
   different envelope, depending which door you came through.
--------------------------------------------------------------------------- */

import { api } from './api.js';
import { $, esc, mountChrome, showError } from './ui.js';

const form = $('#track-form');
const note = $('#track-note');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = $('#email').value.trim();
  const reference = $('#reference').value.trim();
  if (!email || !reference) {
    note.innerHTML = '<p class="note note--err">Both fields are needed.</p>';
    return;
  }

  const btn = $('#find');
  btn.disabled = true;
  btn.textContent = 'Looking…';
  note.innerHTML = '';

  try {
    /* Bare order here — NOT { order: … }. */
    const order = await api.lookupOrder(email, reference, $('#phone').value.trim());
    location.href = `order.html?id=${encodeURIComponent(order.id)}`;
  } catch (err) {
    /* Every miss carries phoneRequired (on every miss, so it cannot reveal
       whether an order sits under a since-transferred address). With no phone
       sent yet: reveal the field and let them resend. Once a phone was sent, a
       miss is a miss — the generic copy below, not another prompt. */
    if (err.status === 404 && err.body?.phoneRequired && !$('#phone').value.trim()) {
      $('#phone-field').hidden = false;
      $('#phone').focus();
      note.innerHTML = `<p class="note note--err">We could not find an order with
        that email and reference. If you entered a phone number at checkout, add
        it and search again.</p>`;
      return;
    }
    /* A wrong pair is an ordinary 404, not a failure worth alarming anyone
       about. Deliberately vague: confirming that a reference exists but the
       email is wrong would let someone probe for other people's orders. */
    if (err.status === 404 || err.status === 400) {
      note.innerHTML = `<p class="note note--err">
        We could not find an order with that email and reference. Check both
        and try again.</p>`;
    } else {
      showError(err);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Find my order';
  }
});

mountChrome();
