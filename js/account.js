/* ---------------------------------------------------------------------------
   account.js — signing in, and everything that needs an account.

   This page implements BOTH sign-in methods the API offers — Google, and
   email + password (POST /api/shopper/register, /api/shopper/login and
   /api/shopper/password/forgot|reset|change — see /api/docs/). GET
   /api/auth/config says which is switched on; the reset link lands on
   reset.html. The store hashes passwords itself.

   How Google sign-in works:
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
  $, esc, money, mountChrome, toast, showError, renderLoading, renderError,
} from './ui.js';

const host = $('#account');

/* --- Signed out ----------------------------------------------------------- */

function renderSignedOut(cfg) {
  const googleEnabled = cfg?.google?.enabled === true && !!GOOGLE_CLIENT_ID;
  const passwordEnabled = cfg?.password?.enabled !== false;   /* password sign-in is always on at the store; only an explicit false (the demo mock) hides it */

  if (!googleEnabled && !passwordEnabled) {
    /* Do not render a form that cannot work. Saying plainly why is more
       useful than a dead control, and this is the state demo mode shows.
       Note that nothing about the shop is blocked by it. */
    host.innerHTML = `
      <div class="panel">
        <h2>Accounts are switched off for this store</h2>
        <p>You can still browse, buy and track an order without one &mdash; use
           <a href="track.html">Track order</a> with your email and reference.</p>
        <p class="crumb" style="margin-top:14px">
          Developers: <code>GET /api/auth/config</code> reports Google
          <code>${cfg?.google?.enabled ? 'enabled' : 'disabled'}</code> (this storefront has
          <code>${GOOGLE_CLIENT_ID ? 'a client id set' : 'no client id set'}</code>) and password accounts
          <code>${passwordEnabled ? 'enabled' : 'disabled'}</code>. Against a real store password accounts are always on.
        </p>
      </div>`;
    return;
  }

  host.innerHTML = `
    <div class="panel" style="max-width:460px">
      <h2>Sign in</h2>
      ${googleEnabled ? '<div id="gbtn" style="margin-top:16px"></div>' : ''}
      ${passwordEnabled ? renderPasswordForms() : '<p>Use your Google account. This page never sees or stores a password.</p>'}
    </div>`;

  if (googleEnabled) mountGoogleButton();
}

/* Email + password. One form, three modes; every reply that signs the shopper
   in is { token, shopper, passwordDropped } — the same shape Google answers. */
function renderPasswordForms() {
  /* Forgot password is always offered: the REPLY says sent / paused / off
     (auth/config deliberately does not say whether the store's mail is failing). */
  return `
    <form id="pw-auth" class="stack" data-mode="login" style="margin-top:16px" novalidate>
      <div class="field" data-only="register" hidden><label for="pw-name">Name</label><input id="pw-name" class="input" name="name" autocomplete="name"></div>
      <div class="field"><label for="pw-email">Email</label><input id="pw-email" class="input" name="email" type="email" autocomplete="email" required></div>
      <div class="field" data-not="forgot"><label for="pw-pass">Password <span data-only="register" hidden>(8–128 characters)</span></label>
        <input id="pw-pass" class="input" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"></div>
      <button class="btn" type="submit" data-label>Sign in</button>
      <p class="crumb" style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:10px">
        <button class="btn btn--ghost btn--sm" type="button" data-mode-to="login" hidden>Sign in</button>
        <button class="btn btn--ghost btn--sm" type="button" data-mode-to="register">Create account</button>
        <button class="btn btn--ghost btn--sm" type="button" data-mode-to="forgot">Forgot password</button>
      </p>
    </form>`;
}

const PW_LABEL = { login: 'Sign in', register: 'Create account', forgot: 'Send reset link' };

function setPasswordMode(form, mode) {
  form.dataset.mode = mode;
  form.querySelector('[data-label]').textContent = PW_LABEL[mode];
  for (const el of form.querySelectorAll('[data-only]')) el.hidden = el.dataset.only !== mode;
  for (const el of form.querySelectorAll('[data-not]')) el.hidden = el.dataset.not === mode;
  for (const el of form.querySelectorAll('[data-mode-to]')) el.hidden = el.dataset.modeTo === mode;
  form.elements.password.required = mode !== 'forgot';
  form.elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  form.elements.password.value = '';   // (`form.elements.x`, never `form.x`: an input named "name" shadows the form's own `name` only by a legacy quirk) — never carry a password between modes — a register's invented one must not be sent as a login
  form.elements.email.focus();
}

host.addEventListener('click', (ev) => {
  const to = ev.target.closest('[data-mode-to]');
  if (to) setPasswordMode(to.closest('form'), to.dataset.modeTo);
});

host.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'pw-auth') return;
  ev.preventDefault();
  const form = ev.target;
  const mode = form.dataset.mode;
  const button = form.querySelector('[data-label]');
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true;
  try {
    if (mode === 'forgot') {
      /* The reset page must sit on the origin the STORE is configured with (see api.js). */
      const cfg = await api.authConfig();
      const origin = cfg?.password?.resetOrigin || location.origin;
      const dir = location.pathname.replace(/[^/]*$/, '');
      const res = await api.forgotPassword(form.elements.email.value, `${origin}${dir}reset.html`);
      /* `emailed` is whether the shop CAN send — never whether this address has an account. */
      toast(res.emailed ? 'If that address has an account, a reset link is on its way.'
        : res.sendingPaused ? 'The store’s outgoing mail is paused for a few minutes — try again shortly.'
        : 'This store cannot send email — contact the store to reset your password.');
      return;
    }
    const res = mode === 'register'
      ? await api.register(form.elements.email.value, form.elements.password.value, form.elements.name.value)
      : await api.login(form.elements.email.value, form.elements.password.value);
    token.set(res.token);
    toast(`Signed in as ${res.shopper.name || res.shopper.email}`);
    boot();
  } catch (err) {
    /* Branch on the flags, not the prose. */
    if (err instanceof ApiError && err.body.exists) { setPasswordMode(form, 'login'); toast('That address already has an account — sign in, or use Forgot password.'); return; }
    if (err instanceof ApiError && err.body.weakPassword) form.elements.password.focus();
    showError(err);
  } finally {
    button.disabled = false;
  }
});

function mountGoogleButton() {
  loadGoogle()
    .then(() => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const res = await api.signInWithGoogle(credential);
            token.set(res.token);
            /* passwordDropped: this sign-in removed a password someone had set on
               the address. Say so now — their next password login answers a blank 401. */
            toast(res.passwordDropped
              ? 'Signed in with Google. The password on this address was removed — set a new one with "Forgot password" if you want one.'
              : `Signed in as ${res.shopper.name || res.shopper.email}`);
            boot();
          } catch (err) {
            showError(err);
          }
        },
      });
      const el = $('#gbtn');
      if (!el) return;   // the panel was re-rendered (a password sign-in completed) while Google's script was still loading
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    })
    .catch(() => {
      const el = $('#gbtn');
      if (el) el.innerHTML = '<p class="note note--err">Could not load Google sign-in.</p>';
    });
}

let gsiOnce = null;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  /* One script tag per page, however many times boot() runs while it loads —
     a retry appended a second tag and initialised the button twice. */
  return (gsiOnce ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  }).catch((e) => { gsiOnce = null; throw e; }));
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
                          ${esc(new Date(o.placedAt ?? o.createdAt).toLocaleDateString())} &middot;
                          <span class="status status--${o.amountUncollected ? 'pending' : esc(String(o.status).toLowerCase())}">${o.amountUncollected ? 'Not collected' : esc(o.status)}</span>
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
            <li><span>Email</span><span>${
              me.emailDetached
                ? '<em>This address now belongs to another account. Contact the store about the orders under it.</em>'
                : esc(me.email)
            }</span></li>
            <li><span>Phone</span><span>${esc(me.phone || '—')}</span></li>
          </ul>
          ${
            me.emailDetached
              ? ''
              : `<form id="change-password" class="stack" style="margin-top:14px">
                   <h3>Change password</h3>
                   <input type="email" name="username" value="${esc(me.email)}" autocomplete="username" hidden aria-hidden="true">
                   <div class="field"><label for="pw-current">Current password</label><input id="pw-current" class="input" name="current" type="password" autocomplete="current-password" required></div>
                   <div class="field"><label for="pw-next">New password (8–128 characters)</label><input id="pw-next" class="input" name="next" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></div>
                   <button class="btn btn--sm" type="submit">Change password</button>
                 </form>`
          }
          <!-- Always offered — even for a recycled-address account, which has no password path left: this is the one
               control that needs no password, exactly so a token copied from a lost phone can still be ended. -->
          <p class="crumb" style="margin-top:14px">
            Lost a phone? <button class="btn btn--ghost btn--sm" type="button" id="signout-everywhere">Sign out everywhere</button>
            — every other device is signed out; this one stays.
          </p>
        </div>
      </aside>
    </div>`;

}

/* --- Boot ----------------------------------------------------------------- */

$('#signout').addEventListener('click', () => {
  /* Signing out of THIS device is just forgetting the token; the server keeps
     nothing per device. "Sign out everywhere" below is the server-side one. */
  token.clear();
  toast('Signed out');
  boot();
});

/* Delegated, registered ONCE: the account panel is re-rendered on every boot(),
   and a listener added inside the render doubled every write after each boot. */
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

/* Delegated: the account panel is re-rendered on every boot(). */
host.addEventListener('click', async (ev) => {
  if (ev.target.id !== 'signout-everywhere') return;
  ev.target.disabled = true;
  try {
    const { token: fresh } = await api.signOutEverywhere();
    token.set(fresh);   // the token we sent is dead too; this is the replacement
    toast('Every other device has been signed out');
    ev.target.disabled = false;
  } catch (err) {
    showError(err);
    ev.target.disabled = false;
  }
});
host.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'change-password') return;
  ev.preventDefault();
  const form = ev.target;
  const button = form.querySelector('button[type=submit]');
  if (button.disabled) return;   // a second Enter while the first change is in flight would race the fresh token with the old one and sign the shopper out
  button.disabled = true;
  try {
    const { token: fresh } = await api.changePassword(form.current.value, form.next.value);
    token.set(fresh);   // every other session ended; this one continues on the new token
    form.reset();
    toast('Password changed');
  } catch (err) {
    /* Branch on the flags, not the prose: the store tells you which field is wrong. */
    if (err instanceof ApiError && err.body.useForgotPassword) { toast('This account has no password yet — use "Forgot password" on the sign-in page.'); return; }
    if (err instanceof ApiError && err.body.wrongCurrentPassword) form.current.focus();
    else if (err instanceof ApiError && (err.body.weakPassword || err.body.samePassword)) form.next.focus();
    showError(err);
  } finally {
    button.disabled = false;
  }
});

async function boot() {
  $('#signout').hidden = true;
  renderLoading(host, 'Loading…');

  /* A store that cannot answer right now is not a store with accounts switched
     off: keep the failure and offer a retry instead of the "switched off" panel. */
  const cfg = await api.authConfig().catch((err) => err);

  if (!token.get()) {
    /* Only the signed-out panel needs the config; a signed-in shopper's page
       reads none of it, so a config blip must not cost them their orders. */
    if (cfg instanceof Error) {
      renderError(host, cfg, boot);
      host.setAttribute('aria-busy', 'false');
      return;
    }
    renderSignedOut(cfg);
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
    if (err instanceof ApiError && err.isUnauthenticated) token.clear();
    else showError(err);
    /* The signed-out panel needs the config; if THAT failed too, retry, never
       "accounts are switched off" to someone who was just signed out. */
    if (cfg instanceof Error) renderError(host, cfg, boot);
    else renderSignedOut(cfg);
  } finally {
    host.setAttribute('aria-busy', 'false');
  }
}

mountChrome();
boot();
