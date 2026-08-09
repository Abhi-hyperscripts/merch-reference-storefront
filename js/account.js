/* ---------------------------------------------------------------------------
   account.js — signing in, and everything that needs an account.

   Sign-in is Google only. There is no password anywhere in this API, which
   means there is no password for you to store, leak or reset.

   How it works:
     1. Google's button hands your page a signed ID token ("credential").
     2. You POST that to /api/shopper/google.
     3. The store verifies it against Google, checks it was minted for YOUR
        client id, and hands back its own token.
     4. That token goes on every later call as `Authorization: Bearer …`.

   Step 3 is why the client id has to match on both sides: without the audience
   check, a token issued to some other app could be replayed against your shop.

   ---------------------------------------------------------------------------
   HONEST NOTE FROM THE AUTHOR

   The guest journey in this project — browse, cart, checkout, track — was
   exercised end to end against a real store. The signed-in half below was
   written against the documented shapes but NOT run, because the store it was
   built against had Google sign-in switched off and there is no way to mint a
   shopper token without real Google credentials.

   So treat this file as a well-informed starting point rather than as proven
   code, and expect to spend a few minutes on it the first time. Everything it
   calls is documented; none of it is guesswork about shapes.
   --------------------------------------------------------------------------- */

import { api, token, ApiError } from './api.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import {
  $, esc, money, mountChrome, toast, showError, renderLoading,
} from './ui.js';

const host = $('#account');

/* --- Signed out ----------------------------------------------------------- */

function renderSignedOut(googleEnabled) {
  if (!googleEnabled || !GOOGLE_CLIENT_ID) {
    /* Do not render a button that cannot work. Saying plainly why is more
       useful than a dead control, and this is the state most people will hit
       first. Note that nothing about the shop is blocked by it. */
    host.innerHTML = `
      <div class="panel">
        <h2>Accounts are switched off for this store</h2>
        <p>You can still browse, buy and track an order without one &mdash; use
           <a href="track.html">Track order</a> with your email and reference.</p>
        <p class="crumb" style="margin-top:14px">
          Developers: sign-in needs a Google client id in BOTH
          <code>config.js</code> and the store's admin panel. The store reports
          <code>${googleEnabled ? 'enabled' : 'disabled'}</code> and this
          storefront has <code>${GOOGLE_CLIENT_ID ? 'a client id set' : 'no client id set'}</code>.
        </p>
      </div>`;
    return;
  }

  host.innerHTML = `
    <div class="panel" style="max-width:460px">
      <h2>Sign in</h2>
      <p>Use your Google account. We never see or store a password.</p>
      <div id="gbtn" style="margin-top:16px"></div>
    </div>`;

  loadGoogle()
    .then(() => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const res = await api.signInWithGoogle(credential);
            token.set(res.token);
            toast(`Signed in as ${res.shopper.name || res.shopper.email}`);
            boot();
          } catch (err) {
            showError(err);
          }
        },
      });
      window.google.accounts.id.renderButton($('#gbtn'), {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    })
    .catch(() => {
      $('#gbtn').innerHTML =
        '<p class="note note--err">Could not load Google sign-in.</p>';
    });
}

function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* --- Signed in ------------------------------------------------------------ */

function renderSignedIn(me, orders, addresses, wishlist) {
  $('#signout').hidden = false;

  host.innerHTML = `
    <div class="split">
      <div>
        <div class="panel">
          <h2>Orders</h2>
          ${
            orders.length
              ? `<ul class="lines">
                  ${orders
                    .map(
                      (o) => `
                    <li class="line" style="grid-template-columns:1fr auto">
                      <div>
                        <p class="line__name">
                          <a href="order.html?id=${encodeURIComponent(o.id)}">${esc(o.orderRef)}</a>
                        </p>
                        <p class="line__meta">
                          ${esc(new Date(o.createdAt).toLocaleDateString())} &middot;
                          <span class="status status--${esc(String(o.status).toLowerCase())}">${esc(o.status)}</span>
                        </p>
                      </div>
                      <div class="line__right"><strong>${money(o.total)}</strong></div>
                    </li>`,
                    )
                    .join('')}
                 </ul>`
              : '<p class="crumb">No orders yet.</p>'
          }
        </div>

        <div class="panel">
          <h2>Saved addresses</h2>
          <div id="addresses">
            ${
              addresses.length
                ? `<ul class="lines">
                    ${addresses
                      .map(
                        (a) => `
                      <li class="line" style="grid-template-columns:1fr auto" data-addr="${esc(a.id)}">
                        <div>
                          <p class="line__name">${esc(a.name)} ${a.isDefault ? '<span class="review__verified">Default</span>' : ''}</p>
                          <p class="line__meta">${esc(a.line)}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</p>
                          <p class="line__meta">${esc(a.phone)}</p>
                        </div>
                        <div class="line__right">
                          ${!a.isDefault ? '<button class="btn btn--sm btn--ghost" type="button" data-default>Make default</button>' : ''}
                          <button class="link-danger" type="button" data-delete>Remove</button>
                        </div>
                      </li>`,
                      )
                      .join('')}
                   </ul>`
                : '<p class="crumb">No saved addresses.</p>'
            }
          </div>
        </div>
      </div>

      <aside>
        <div class="panel">
          <h2>Wishlist</h2>
          <div id="wishlist">
            ${
              wishlist.length
                ? `<ul class="lines">
                    ${wishlist
                      .map(
                        (id) => `
                      <li class="line" style="grid-template-columns:1fr auto" data-wish="${esc(id)}">
                        <div><p class="line__name">
                          <a href="product.html?id=${encodeURIComponent(id)}">${esc(id)}</a>
                        </p></div>
                        <button class="link-danger" type="button" data-unwish>Remove</button>
                      </li>`,
                      )
                      .join('')}
                   </ul>`
                : '<p class="crumb">Nothing saved yet.</p>'
            }
          </div>
          ${
            /* The wishlist endpoint returns IDs ONLY — no names, no prices. To
               show a proper card you have to fetch each product. Left as ids
               here so the shape is obvious rather than hidden by extra work. */
            wishlist.length
              ? '<p class="crumb" style="margin-top:10px">The API returns ids only; fetch each product to show names and prices.</p>'
              : ''
          }
        </div>

        <div class="panel">
          <h2>You</h2>
          <ul class="kv">
            <li><span>Name</span><span>${esc(me.name || '—')}</span></li>
            <li><span>Email</span><span>${esc(me.email)}</span></li>
            <li><span>Phone</span><span>${esc(me.phone || '—')}</span></li>
          </ul>
        </div>
      </aside>
    </div>`;

  wireAccountActions();
}

function wireAccountActions() {
  host.addEventListener('click', async (e) => {
    const addr = e.target.closest('[data-addr]');
    const wish = e.target.closest('[data-wish]');

    try {
      if (addr && e.target.closest('[data-default]')) {
        await api.makeAddressDefault(addr.getAttribute('data-addr'));
        toast('Default address updated');
        return boot();
      }
      if (addr && e.target.closest('[data-delete]')) {
        await api.deleteAddress(addr.getAttribute('data-addr'));
        toast('Address removed');
        return boot();
      }
      if (wish && e.target.closest('[data-unwish]')) {
        await api.removeFromWishlist(wish.getAttribute('data-wish'));
        toast('Removed from wishlist');
        return boot();
      }
    } catch (err) {
      showError(err);
    }
  });
}

/* --- Boot ----------------------------------------------------------------- */

$('#signout').addEventListener('click', () => {
  /* The token is stateless, so signing out really is just forgetting it. */
  token.clear();
  toast('Signed out');
  boot();
});

async function boot() {
  $('#signout').hidden = true;
  renderLoading(host, 'Loading…');

  const cfg = await api.authConfig().catch(() => null);
  const googleEnabled = cfg?.google?.enabled === true;

  if (!token.get()) {
    renderSignedOut(googleEnabled);
    host.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    /* Everything at once — they are independent. */
    const [me, orders, addresses, wishlist] = await Promise.all([
      api.me(),
      api.myOrders().catch(() => []),
      api.addresses().catch(() => []),
      api.wishlist().catch(() => []),
    ]);
    renderSignedIn(me, orders, addresses, wishlist);
  } catch (err) {
    /* An expired token is the ordinary case here, not a failure. Drop it and
       show the signed-out view rather than an error the shopper cannot act on. */
    if (err instanceof ApiError && err.isUnauthenticated) {
      token.clear();
      renderSignedOut(googleEnabled);
    } else {
      showError(err);
      renderSignedOut(googleEnabled);
    }
  } finally {
    host.setAttribute('aria-busy', 'false');
  }
}

mountChrome();
boot();
