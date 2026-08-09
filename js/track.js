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
    const order = await api.lookupOrder(email, reference);
    location.href = `order.html?id=${encodeURIComponent(order.id)}`;
  } catch (err) {
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
