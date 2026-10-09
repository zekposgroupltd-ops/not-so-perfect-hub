// auth.js — login and registration forms. Client checks mirror the backend for fast feedback only;
// the backend re-validates everything.
(() => {
  const form = document.getElementById('auth-form');
  if (!form) return;
  const mode = form.dataset.mode; // "login" | "register"
  const errBox = document.getElementById('form-error');
  const btn = form.querySelector('button[type=submit]');

  function showFieldErrors(fields) {
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    Object.keys(fields || {}).forEach((name) => {
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (el) el.textContent = fields[name];
    });
  }
  function clientCheck(v) {
    const e = {};
    if (!/^[a-z0-9_]{3,20}$/.test(v.username.toLowerCase())) e.username = 'Use 3–20 letters, numbers or underscores.';
    if (v.display_name.trim().length < 2) e.display_name = 'Display name must be at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
    if (v.password.length < 10 || !/[A-Za-z]/.test(v.password) || !/[0-9]/.test(v.password)) e.password = 'Use at least 10 characters with a letter and a number.';
    if (v.password !== v.password_confirm) e.password_confirm = 'Passwords do not match.';
    if (!v.accept_rules || !v.accept_privacy) e.accept = 'Please accept the community rules and privacy notice.';
    return e;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errBox.classList.add('hidden'); showFieldErrors({});
    const f = new FormData(form);
    let action, payload;
    if (mode === 'login') {
      action = 'login';
      payload = { identifier: f.get('identifier').trim(), password: f.get('password'), remember: f.get('remember') === 'on' };
      if (!payload.identifier || !payload.password) { errBox.textContent = 'Enter your email or username and password.'; errBox.classList.remove('hidden'); return; }
    } else {
      action = 'register';
      payload = {
        username: f.get('username'), display_name: f.get('display_name'), email: f.get('email'),
        password: f.get('password'), password_confirm: f.get('password_confirm'),
        accept_rules: f.get('accept_rules') === 'on', accept_privacy: f.get('accept_privacy') === 'on'
      };
      const ce = clientCheck(payload);
      if (Object.keys(ce).length) { showFieldErrors(ce); return; }
    }
    NSP.setBusy(btn, true, mode === 'login' ? 'Logging in…' : 'Creating account…');
    try {
      const data = await Api.call(action, payload);
      Api.setToken(data.session.token, payload.remember === true);
      const next = new URLSearchParams(location.search).get('next');
      location.href = /^[a-z-]+\.html$/.test(next || '') ? next : 'community.html';
    } catch (e) {
      if (e.fields && Object.keys(e.fields).length) showFieldErrors(e.fields);
      errBox.textContent = e.message; errBox.classList.remove('hidden');
      NSP.setBusy(btn, false);
    }
  });
})();
