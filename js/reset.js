/* ---------------------------------------------------------------------------
   reset.js — the page a forgot-password email links to.

   The email link is `<resetUrl>?token=…` (resetUrl is what account.js sent,
   built on the store's configured origin). POST the token with the new password
   to /api/shopper/password/reset; the reply signs the shopper in on THIS
   device and ends every other session on the account.
   --------------------------------------------------------------------------- */

import { api, token, ApiError } from './api.js';
import { $, mountChrome, toast, showError } from './ui.js';

mountChrome();
const host = $('#reset');

/* Off the URL once read: it would otherwise ride the Referer of every later
   call into a proxy log. Stashed for this tab first so a reload keeps it. */
const STASH = 'rzc-reset-token';
const fromUrl = new URLSearchParams(location.search).get('token');
let resetToken = fromUrl;
try {
  if (fromUrl) sessionStorage.setItem(STASH, fromUrl);
  resetToken = fromUrl || sessionStorage.getItem(STASH);
} catch { /* storage refused: the URL value still serves this load */ }
if (location.search) history.replaceState(null, '', location.pathname);

if (!resetToken) {
  host.innerHTML = `
    <div class="panel">
      <p class="note note--err">This link is missing its token. Open the link from the email again, or
         <a href="account.html">request a new link</a>.</p>
    </div>`;
} else {
  host.innerHTML = `
    <form id="pw-reset" class="panel stack" style="max-width:460px">
      <div class="field"><label for="pw-new">New password (8–128 characters)</label>
        <input id="pw-new" class="input" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></div>
      <button class="btn" type="submit">Set password and sign in</button>
    </form>`;
  $('#pw-reset').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const res = await api.resetPassword(resetToken, form.password.value);
      token.set(res.token);
      try { sessionStorage.removeItem(STASH); } catch { /* nothing to clear */ }
      toast('Your password is set and you are signed in');
      location.href = 'account.html';
    } catch (err) {
      /* invalidLink: unknown, used or expired — retrying cannot help; ask for a new one. */
      if (err instanceof ApiError && err.body.invalidLink) {
        try { sessionStorage.removeItem(STASH); } catch { /* nothing to clear */ }   // a token the store refused must not resurrect the form on the next visit
        host.innerHTML = `<div class="panel"><p class="note note--err">This link has expired or was already used.
          <a href="account.html">Request a new link</a>.</p></div>`;
        return;
      }
      if (err instanceof ApiError && err.body.weakPassword) form.password.focus();
      showError(err);
      button.disabled = false;
    }
  });
}
host.setAttribute('aria-busy', 'false');
