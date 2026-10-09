/**
 * Authentication.gs — password hashing, sessions, registration, login, logout.
 *
 * PASSWORD HASHING (honest summary)
 *  Apps Script has no bcrypt/scrypt/Argon2. We use PBKDF2-HMAC-SHA256 (RFC 8018, reviewed algorithm)
 *  built on Utilities.computeHmacSha256Signature, with a random 16-byte salt per user and a
 *  server-side "pepper" (Script Property) pre-mixed into the password. Each Apps Script HMAC call is slow,
 *  so the iteration count (APP.PBKDF2_ITERATIONS) is far below modern recommendations (hundreds of thousands).
 *  Compensating controls: password policy, login lockout, pepper kept outside the spreadsheet.
 *  Run benchmarkPasswordHash() in Setup.gs to measure and tune for your quota.
 *
 * SESSIONS
 *  A 256-bit random token is returned once to the browser. Only its SHA-256 hash is stored (token is
 *  high-entropy, so a fast hash is appropriate here). The token is sent in the request body because
 *  Apps Script web apps cannot read custom headers.
 */

// ---------- byte/hex helpers ----------
function toHex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
function fromHex_(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) { const v = parseInt(hex.substr(i, 2), 16); out.push(v > 127 ? v - 256 : v); }
  return out;
}
/** Random hex from Java's UUID generator (SecureRandom-backed; ~122 random bits per 32 hex chars). */
function randomHex_(byteCount) {
  let s = '';
  while (s.length < byteCount * 2) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, byteCount * 2);
}
function sha256Hex_(text) { return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- password hashing ----------
function pbkdf2Sha256_(keyBytes, saltBytes, iterations) {
  let u = Utilities.computeHmacSha256Signature(saltBytes.concat([0, 0, 0, 1]), keyBytes);
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, keyBytes);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

function derivePasswordHash_(password, saltHex, iterations) {
  const pepper = getProp_('PASSWORD_PEPPER');
  if (!pepper) throw new ApiError('SERVER_NOT_CONFIGURED', 'The service has not been set up yet.');
  const keyBytes = Utilities.computeHmacSha256Signature(Utilities.newBlob(password).getBytes(), fromHex_(pepper));
  return toHex_(pbkdf2Sha256_(keyBytes, fromHex_(saltHex), iterations));
}

function hashPassword_(password) {
  const salt = randomHex_(16);
  const n = APP.PBKDF2_ITERATIONS;
  return 'pbkdf2-sha256$' + n + '$' + salt + '$' + derivePasswordHash_(password, salt, n);
}

function verifyPassword_(password, stored) {
  const p = String(stored).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(p[1]);
  if (!(iterations > 0 && iterations <= 100000)) return false;
  return constantTimeEquals_(derivePasswordHash_(password, p[2], iterations), p[3]);
}

// ---------- validation ----------
function normalizeEmail_(email) { return String(email || '').trim().toLowerCase(); }
function normalizeUsername_(u) { return String(u || '').trim().toLowerCase(); }

function validateRegistration_(p) {
  const errors = {};
  const username = normalizeUsername_(p.username);
  const display = String(p.display_name || '').trim();
  const email = normalizeEmail_(p.email);
  const password = String(p.password || '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) errors.username = 'Use 3–20 letters, numbers or underscores.';
  else if (APP.RESERVED_USERNAMES.indexOf(username) !== -1) errors.username = 'That username is reserved.';
  if (display.length < 2 || display.length > 40) errors.display_name = 'Display name must be 2–40 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) errors.email = 'Enter a valid email address.';
  const min = getSetting_('password_min_length');
  if (password.length < min || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    errors.password = 'Password must be ' + min + '–128 characters and include a letter and a number.';
  if (password !== String(p.password_confirm || '')) errors.password_confirm = 'Passwords do not match.';
  if (p.accept_rules !== true || p.accept_privacy !== true) errors.accept = 'Please accept the community rules and privacy notice.';
  if (Object.keys(errors).length) {
    const e = new ApiError('VALIDATION_ERROR', 'Please check the highlighted fields.');
    e.fields = errors;
    throw e;
  }
  return { username: username, display_name: display, email: email, password: password };
}

// ---------- sessions ----------
function createSession_(userId, remember) {
  const token = randomHex_(32);
  const hours = remember ? getSetting_('session_ttl_remember_hours') : getSetting_('session_ttl_hours');
  const now = new Date();
  const expires = new Date(now.getTime() + hours * 3600 * 1000);
  db_insert('Sessions', {
    session_id: newId_('ses'), user_id: userId, token_hash: sha256Hex_(token),
    created_at: now.toISOString(), expires_at: expires.toISOString(), revoked_at: '', last_used_at: now.toISOString()
  });
  return { token: token, expires_at: expires.toISOString() };
}

/** Resolve a token to {user, session}. Returns null if missing/invalid/expired/revoked. Throws if suspended. */
function authenticate_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const session = db_find('Sessions', 'token_hash', sha256Hex_(token));
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  const user = db_find('Users', 'user_id', session.user_id);
  if (!user || user.account_status === 'deleted') return null;
  if (user.account_status !== 'active') throw new ApiError('ACCOUNT_SUSPENDED', 'This account is suspended. Contact the community team.');
  // Throttle bookkeeping writes to once per 5 minutes per session.
  if (Date.now() - new Date(session.last_used_at).getTime() > 300000) {
    const stamp = nowIso_();
    db_update('Sessions', 'session_id', session.session_id, { last_used_at: stamp });
    db_update('Users', 'user_id', user.user_id, { last_activity_at: stamp });
  }
  return { user: user, session: session };
}

// ---------- login throttling ----------
function loginKey_(identifier) { return 'lf_' + sha256Hex_(identifier).slice(0, 32); }
function assertLoginAllowed_(identifier) {
  const n = Number(CacheService.getScriptCache().get(loginKey_(identifier)) || 0);
  if (n >= getSetting_('login_max_failures'))
    throw new ApiError('RATE_LIMITED', 'Too many failed attempts. Try again in ' + getSetting_('login_lockout_minutes') + ' minutes.');
}
function recordLoginFailure_(identifier) {
  const cache = CacheService.getScriptCache(), k = loginKey_(identifier);
  cache.put(k, String(Number(cache.get(k) || 0) + 1), getSetting_('login_lockout_minutes') * 60);
}
function clearLoginFailures_(identifier) { CacheService.getScriptCache().remove(loginKey_(identifier)); }

// ---------- API actions ----------
function api_register(payload) {
  if (!getSetting_('registration_open')) throw new ApiError('REGISTRATION_CLOSED', 'Registration is currently closed.');
  rateLimit_('register_global', 40, 3600);        // Apps Script exposes no client IP, so throttle globally
  const v = validateRegistration_(payload);
  const passwordHash = hashPassword_(v.password);  // slow: done outside the lock
  const user = withLock_(function () {
    if (db_find('Users', 'username', v.username)) { const e = new ApiError('VALIDATION_ERROR', 'That username is taken.'); e.fields = { username: 'That username is taken.' }; throw e; }
    if (db_find('Users', 'email', v.email)) { const e = new ApiError('VALIDATION_ERROR', 'That email is already registered.'); e.fields = { email: 'That email is already registered.' }; throw e; }
    const now = nowIso_();
    return db_insert('Users', {
      user_id: newId_('usr'), username: v.username, display_name: v.display_name, email: v.email,
      password_hash: passwordHash, account_status: 'active', role: 'fan',   // role is ALWAYS server-assigned
      profile_image: '', bio: '', total_points: 0, lifetime_points: 0, level: 1,
      created_at: now, last_login: now, last_activity_at: now, last_message_date: '', daily_message_count: 0,
      last_checkin_date: '', total_checkins: 0, is_verified: false
    });
  });
  audit_(user.user_id, 'register', 'user', user.user_id, { rules_version: getSetting_('rules_version') });
  const session = createSession_(user.user_id, false);
  return { user: publicUser_(user, true), session: session };
}

function api_login(payload) {
  const identifier = String(payload.identifier || '').trim().toLowerCase();
  const password = String(payload.password || '');
  if (!identifier || !password || identifier.length > 120 || password.length > 128) throw new ApiError('INVALID_CREDENTIALS', 'Incorrect email/username or password.');
  assertLoginAllowed_(identifier);
  const user = db_find('Users', identifier.indexOf('@') !== -1 ? 'email' : 'username', identifier);
  // Always spend comparable time, so response time does not reveal whether the account exists.
  const ok = user ? verifyPassword_(password, user.password_hash)
                  : (derivePasswordHash_(password, '00000000000000000000000000000000', APP.PBKDF2_ITERATIONS), false);
  if (!ok || user.account_status === 'deleted') {
    recordLoginFailure_(identifier);
    audit_(user ? user.user_id : '', 'login_failed', 'user', user ? user.user_id : '', { identifier_hash: sha256Hex_(identifier).slice(0, 12) });
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect email/username or password.');
  }
  if (user.account_status !== 'active') throw new ApiError('ACCOUNT_SUSPENDED', 'This account is suspended. Contact the community team.');
  clearLoginFailures_(identifier);
  const now = nowIso_();
  const updated = db_update('Users', 'user_id', user.user_id, { last_login: now, last_activity_at: now });
  const session = createSession_(user.user_id, payload.remember === true);
  return { user: publicUser_(updated, true), session: session };
}

function api_logout(payload, ctx) {
  db_update('Sessions', 'session_id', ctx.session.session_id, { revoked_at: nowIso_() });
  return { logged_out: true };
}

function api_logoutAll(payload, ctx) {
  const now = nowIso_();
  db_all('Sessions', function (s) { return s.user_id === ctx.user.user_id && !s.revoked_at; })
    .forEach(function (s) { db_update('Sessions', 'session_id', s.session_id, { revoked_at: now }); });
  return { logged_out: true };
}
