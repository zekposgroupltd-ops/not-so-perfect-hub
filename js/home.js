// home.js — header state, brand link, and hide signup CTA for logged-in fans.
(async () => {
  const user = await NSP.boot();
  if (user) document.getElementById('home-cta').innerHTML = '<a class="btn" href="community.html">Go to your dashboard</a>';
})();
