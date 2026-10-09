// app.js — shared UI helpers: escaping, toasts, nav, page guard.
const NSP = (() => {
  // Only pages that exist are listed; later parts flip `ready` to true as modules ship.
  const NAV = [
    { href: 'index.html', label: 'Home', ready: true },
    { href: 'community.html', label: 'Community', ready: true, auth: true },
    { href: 'activities.html', label: 'Activities', ready: false },
    { href: 'polls.html', label: 'Polls', ready: false },
    { href: 'memory-wall.html', label: 'Memory Wall', ready: false },
    { href: 'achievements.html', label: 'Achievements', ready: false },
    { href: 'story-game.html', label: 'Story Game', ready: false },
    { href: 'profile.html', label: 'Profile', ready: true, auth: true }
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(message, type = 'info') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = message; box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function setBusy(btn, busy, busyText) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText || 'Working…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function renderHeader(user) {
    const here = location.pathname.split('/').pop() || 'index.html';
    const links = NAV.filter((n) => n.ready && (!n.auth || user)).map((n) =>
      `<a href="${n.href}"${n.href === here ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
    const right = user
      ? `<button type="button" id="logout-btn">Log out</button>`
      : `<a href="login.html">Log in</a><a class="btn" href="register.html">Join the hub</a>`;
    const brand = document.querySelector('.site-footer a');
    if (brand) brand.href = (window.NSP_CONFIG || {}).BRAND_URL || '#';
    const el = document.getElementById('site-header');
    if (!el) return;
    el.innerHTML = `<div class="wrap bar"><a class="brand" href="index.html">Not So Perfect<small>Beyond the Film — Fan Hub</small></a>
      <nav class="nav" aria-label="Main">${links}${right}</nav></div>`;
    const out = document.getElementById('logout-btn');
    if (out) out.addEventListener('click', logout);
  }

  async function logout() {
    try { await Api.call('logout'); } catch (e) { /* token may already be invalid; clear locally regardless */ }
    Api.clearToken(); location.href = 'index.html';
  }

  /** Load the current user. If `requireAuth` and not logged in, redirect to login. */
  async function boot({ requireAuth = false } = {}) {
    let user = null;
    if (Api.getToken()) {
      try { user = (await Api.call('getCurrentUser')).user; }
      catch (e) { if (e.code !== 'UNAUTHENTICATED' && e.code !== 'ACCOUNT_SUSPENDED') toast(e.message, 'error'); if (e.code === 'ACCOUNT_SUSPENDED') Api.clearToken(); }
    }
    if (requireAuth && !user) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()); return null; }
    renderHeader(user);
    return user;
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  return { esc, toast, setBusy, boot, fmtDate };
})();
