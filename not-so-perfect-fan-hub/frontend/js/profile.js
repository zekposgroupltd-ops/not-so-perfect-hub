// profile.js — view and edit own profile.
(async () => {
  const user = await NSP.boot({ requireAuth: true });
  if (!user) return;
  const form = document.getElementById('profile-form'), btn = form.querySelector('button');
  const fill = (u) => {
    document.getElementById('avatar').textContent = u.display_name.charAt(0).toUpperCase();
    document.getElementById('p-name').textContent = u.display_name;
    document.getElementById('p-meta').textContent = `@${u.username} · ${u.level.name} · member since ${NSP.fmtDate(u.created_at)}`;
    form.display_name.value = u.display_name; form.bio.value = u.bio;
  };
  fill(user);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    NSP.setBusy(btn, true, 'Saving…');
    try {
      const d = await Api.call('updateProfile', { display_name: form.display_name.value, bio: form.bio.value });
      fill(d.user); NSP.toast('Profile saved', 'success');
    } catch (e) {
      Object.keys(e.fields || {}).forEach((k) => { const el = form.querySelector(`[data-error-for="${k}"]`); if (el) el.textContent = e.fields[k]; });
      NSP.toast(e.message, 'error');
    } finally { NSP.setBusy(btn, false); }
  });
  document.getElementById('logout-all').addEventListener('click', async () => {
    try { await Api.call('logoutAll'); Api.clearToken(); location.href = 'login.html'; } catch (e) { NSP.toast(e.message, 'error'); }
  });
})();
