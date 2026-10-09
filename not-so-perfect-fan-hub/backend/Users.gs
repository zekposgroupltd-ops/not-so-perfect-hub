/** Users.gs — profile reads/updates, public user shape, level calculation. */

/** Shape returned to the browser. Never includes password_hash. Email only for the owner. */
function publicUser_(u, includePrivate) {
  const out = {
    user_id: u.user_id, username: u.username, display_name: u.display_name, profile_image: u.profile_image,
    bio: u.bio, role: u.role, created_at: u.created_at, level: levelInfo_(u.lifetime_points)
  };
  if (includePrivate) {
    out.email = u.email; out.total_points = u.total_points; out.lifetime_points = u.lifetime_points;
    out.total_checkins = u.total_checkins; out.last_checkin_date = u.last_checkin_date; out.is_verified = u.is_verified;
  }
  return out;
}

/** Level from LIFETIME points (configurable levels_json in Settings). */
function levelInfo_(lifetimePoints) {
  const levels = getSetting_('levels_json').slice().sort(function (a, b) { return a.min - b.min; });
  let idx = 0;
  levels.forEach(function (l, i) { if (lifetimePoints >= l.min) idx = i; });
  const cur = levels[idx], next = levels[idx + 1] || null;
  const span = next ? next.min - cur.min : 1;
  return {
    level: cur.level, name: cur.name, min: cur.min,
    next_level: next ? next.level : null, next_name: next ? next.name : null, next_at: next ? next.min : null,
    points_to_next: next ? Math.max(next.min - lifetimePoints, 0) : 0,
    progress_pct: next ? Math.min(100, Math.round(((lifetimePoints - cur.min) / span) * 100)) : 100
  };
}

function api_getPublicConfig() {
  return {
    app_name: APP.NAME, registration_open: getSetting_('registration_open'), rules_version: getSetting_('rules_version'),
    password_min_length: getSetting_('password_min_length'), timezone: APP.TIMEZONE
  };
}

function api_getCurrentUser(payload, ctx) { return { user: publicUser_(ctx.user, true) }; }

function api_getProfile(payload, ctx) {
  const username = normalizeUsername_(payload.username || ctx.user.username);
  const u = db_find('Users', 'username', username);
  if (!u || u.account_status !== 'active') throw new ApiError('NOT_FOUND', 'Profile not found.');
  const own = u.user_id === ctx.user.user_id;
  return { user: publicUser_(u, own || ctx.user.role === 'admin') };
}

function api_updateProfile(payload, ctx) {
  const patch = {}, errors = {};
  if (payload.display_name !== undefined) {
    const d = String(payload.display_name).trim();
    if (d.length < 2 || d.length > 40) errors.display_name = 'Display name must be 2–40 characters.'; else patch.display_name = d;
  }
  if (payload.bio !== undefined) {
    const b = String(payload.bio).trim();
    if (b.length > 300) errors.bio = 'Bio must be 300 characters or fewer.'; else patch.bio = b;
  }
  if (Object.keys(errors).length) { const e = new ApiError('VALIDATION_ERROR', 'Please check the highlighted fields.'); e.fields = errors; throw e; }
  if (!Object.keys(patch).length) throw new ApiError('VALIDATION_ERROR', 'Nothing to update.');
  // Only whitelisted fields are in `patch`: role, points and status can never be set here.
  const updated = db_update('Users', 'user_id', ctx.user.user_id, patch);
  return { user: publicUser_(updated, true) };
}
