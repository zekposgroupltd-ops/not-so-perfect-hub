// api.js — the only module that talks to the backend.
// Requests are POSTed as text/plain so the browser treats them as "simple" CORS requests
// (Apps Script cannot answer preflight/OPTIONS). The token is sent in the body for the same reason.
class ApiClientError extends Error {
  constructor(code, message, fields) { super(message); this.code = code; this.fields = fields || {}; }
}

const Api = (() => {
  const KEY = 'nsp_token';
  const getToken = () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '';
  const clearToken = () => { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); };
  // localStorage/sessionStorage are readable by any script on this origin, so XSS would expose the token.
  // Mitigations: strict CSP meta tag, no inline scripts, all dynamic text escaped, 72h default expiry.
  const setToken = (token, remember) => { clearToken(); (remember ? localStorage : sessionStorage).setItem(KEY, token); };

  async function call(action, payload = {}, { timeoutMs = 30000 } = {}) {
    const url = (window.NSP_CONFIG || {}).API_URL;
    if (!url || url.indexOf('PASTE_') === 0) throw new ApiClientError('NOT_CONFIGURED', 'The site is not connected to its backend yet (see js/config.js).');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST', redirect: 'follow', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: getToken(), payload })
      });
    } catch (e) {
      throw new ApiClientError('NETWORK_ERROR', e.name === 'AbortError' ? 'The request timed out. Please try again.' : 'Could not reach the server. Check your connection and try again.');
    } finally { clearTimeout(timer); }
    let json;
    try { json = await res.json(); } catch (e) { throw new ApiClientError('BAD_RESPONSE', 'The server sent an unexpected response.'); }
    if (!json.success) {
      if (json.error.code === 'UNAUTHENTICATED') clearToken();
      throw new ApiClientError(json.error.code, json.error.message, json.error.fields);
    }
    return json.data;
  }
  return { call, getToken, setToken, clearToken };
})();
