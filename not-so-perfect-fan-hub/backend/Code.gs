/**
 * Code.gs — web app entry points and API router.
 *
 * Request:  POST (Content-Type: text/plain to avoid a CORS preflight) with JSON body
 *           { "action": "login", "token": "<session token or empty>", "payload": { ... } }
 * Response: { "success": bool, "data": {...}|null, "error": {code, message, fields?}|null }
 *
 * Every route declares its auth level here; the router enforces it before any handler runs:
 *   'none' (public) | 'optional' (user if token valid) | 'user' (any active account) | roles: [...] restriction.
 */
function getRoutes_() {
  return {
    // Public
    getPublicConfig: { auth: 'none', fn: api_getPublicConfig },
    register: { auth: 'none', fn: api_register },
    login: { auth: 'none', fn: api_login },
    // Authenticated
    logout: { auth: 'user', fn: api_logout },
    logoutAll: { auth: 'user', fn: api_logoutAll },
    getCurrentUser: { auth: 'user', fn: api_getCurrentUser },
    getProfile: { auth: 'user', fn: api_getProfile },
    updateProfile: { auth: 'user', fn: api_updateProfile }
    // Parts 2–6 add their routes here (points, activities, polls, chat, memory wall, story, admin ...).
  };
}

function doGet() {
  return json_({ success: true, data: { app: APP.NAME, version: APP.VERSION, status: 'ok' }, error: null });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const route = getRoutes_()[body.action];
    if (!route) throw new ApiError('UNKNOWN_ACTION', 'Unknown action.');
    const payload = (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) ? body.payload : {};
    let ctx = { user: null, session: null };
    if (route.auth === 'user') {
      const a = authenticate_(body.token);
      if (!a) throw new ApiError('UNAUTHENTICATED', 'Please log in to continue.');
      ctx = a;
      if (route.roles && route.roles.indexOf(ctx.user.role) === -1) throw new ApiError('FORBIDDEN', 'You do not have permission to do that.');
    } else if (route.auth === 'optional' && body.token) {
      try { ctx = authenticate_(body.token) || ctx; } catch (err) { ctx = { user: null, session: null }; }
    }
    const data = route.fn(payload, ctx);
    return json_({ success: true, data: data === undefined ? {} : data, error: null });
  } catch (err) {
    return json_(errorResponse_(err));
  }
}

function parseBody_(e) {
  const raw = e && e.postData && e.postData.contents;
  if (!raw || raw.length > 200000) throw new ApiError('BAD_REQUEST', 'Invalid request.');
  let body;
  try { body = JSON.parse(raw); } catch (x) { throw new ApiError('BAD_REQUEST', 'Invalid request.'); }
  if (!body || typeof body.action !== 'string') throw new ApiError('BAD_REQUEST', 'Invalid request.');
  return body;
}

/** Centralised error handling: known errors pass their message; unknown errors are logged, never exposed. */
function errorResponse_(err) {
  if (err instanceof ApiError) {
    const out = { code: err.code, message: err.message };
    if (err.fields) out.fields = err.fields;
    return { success: false, data: null, error: out };
  }
  console.error(err && err.stack ? err.stack : String(err));
  return { success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } };
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
