// community.js — member dashboard (Part 1 shows identity, points and level; later parts add modules).
(async () => {
  const user = await NSP.boot({ requireAuth: true });
  if (!user) return;
  const lv = user.level;
  document.getElementById('hello').textContent = `Welcome back, ${user.display_name}`;
  document.getElementById('points').textContent = user.total_points;
  document.getElementById('lifetime').textContent = user.lifetime_points;
  document.getElementById('level-name').textContent = `Level ${lv.level}: ${lv.name}`;
  document.getElementById('level-bar').style.width = lv.progress_pct + '%';
  document.getElementById('level-bar-wrap').setAttribute('aria-valuenow', lv.progress_pct);
  document.getElementById('next-level').textContent = lv.next_name
    ? `${lv.points_to_next} more points to reach ${lv.next_name}.` : 'You have reached the top level.';
  document.getElementById('dash').classList.remove('hidden');
  document.getElementById('dash-loading').classList.add('hidden');
})();
