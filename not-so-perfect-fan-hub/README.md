# Not So Perfect: Beyond the Film — Fan Hub
Community platform by Zekpo Destiny Films. **Build status: Part 1 of 6 (Foundation).**

## Architecture
```
Browser (static HTML/CSS/vanilla JS, hosted on any static host)
   │  POST text/plain, JSON body {action, token, payload}
   ▼
Apps Script Web App (Code.gs router → module handlers)  ──►  Google Sheets (19 sheets)  ──►  Drive (media)
```
Layers: `Code.gs` (routing, auth level per route, error handling) → feature modules (`Authentication.gs`, `Users.gs`, later `Points.gs` …) → `Database.gs` (only module touching sheets) → `Config.gs` (schema + default settings).

## Deployment constraints (decided)
1. **Apps Script cannot serve a multi-file static folder.** Frontend is hosted separately (GitHub Pages, Netlify, Cloudflare Pages, or any static host) and calls the web app URL.
2. **CORS:** Apps Script cannot answer preflight requests or set CORS headers on custom requests. The client sends `POST` with `Content-Type: text/plain`, which browsers treat as a "simple" request, so no preflight is needed. The token therefore travels in the JSON body, not an `Authorization` header.
3. **Web app access must be "Anyone"** (execute as *Me*), otherwise browsers get a Google login redirect. Real access control is the app's own sessions and roles, enforced server-side per route.
4. **Token storage:** the session token is kept in `sessionStorage` (or `localStorage` if "keep me logged in" is ticked). Both are readable by any script on the site, so XSS would expose it. Mitigations: CSP meta tag, no inline scripts, all dynamic text escaped, expiring server-side sessions that can be revoked ("Log out of all devices").
5. **Password hashing:** PBKDF2-HMAC-SHA256 (verified against Node's reference implementation) with per-user salt and a secret pepper. Apps Script is slow, so iterations are 3,000 — far below modern guidance. Compensations: password policy, lockout after 5 failures, pepper outside the sheet. Run `benchmarkPasswordHash()` and raise `APP.PBKDF2_ITERATIONS` in `Config.gs` as far as your login time tolerates (existing hashes keep working).
6. **No client IP in Apps Script**, so rate limits are per identifier/global, not per IP. Counters use CacheService and are approximate under heavy concurrency.

## Setup (owner actions in bold)
1. **Create an Apps Script project** at script.google.com (standalone).
2. **Create one script file per `backend/*.gs`** (use the same names) and paste the code. Enable *Project Settings → Show appsscript.json* and set `"timeZone": "Africa/Lagos"` and `"runtimeVersion": "V8"`.
3. **Run `initialSetup()`** from the editor and approve the Sheets/Drive permissions. It creates the spreadsheet, all 19 sheets, default settings, two Drive folders and the password pepper. Safe to re-run: existing data is kept, only missing sheets/columns are added.
4. **Run `verifySetup()`**; the log should say "Setup looks complete."
5. **Deploy → New deployment → Web app**; Execute as: *Me*; Who has access: *Anyone*. Copy the `/exec` URL.
6. **Edit `frontend/js/config.js`**: paste the URL into `API_URL` and set `BRAND_URL`.
7. **Upload the `frontend/` folder** to your static host and open `index.html`.
8. **Register your own account** on the site, then in *Project Settings → Script Properties* add `ADMIN_BOOTSTRAP_EMAIL` = that email and **run `bootstrapFirstAdmin()`**. It only works while no active admin exists and deletes the property afterwards. There is no default admin password.
9. After any backend code change: **Deploy → Manage deployments → edit → New version** (the `/exec` URL stays the same).

## File manifest
| Status | File |
|---|---|
| Done (Part 1) | backend: `Config.gs`, `Database.gs`, `Authentication.gs`, `Users.gs`, `Code.gs`, `Setup.gs` |
| Done (Part 1) | frontend: `index.html`, `login.html`, `register.html`, `community.html`, `profile.html`, `css/global.css`, `css/auth.css`, `css/community.css`, `js/config.js`, `js/api.js`, `js/app.js`, `js/auth.js`, `js/home.js`, `js/community.js`, `js/profile.js` |
| Part 2 | `Points.gs`, `Activities.gs`, `Polls.gs`, `Notifications`, pages `activities.html`, `polls.html` (+ JS/CSS), dashboard + home sections, demo data |
| Part 3 | `Chat.gs`, `MemoryWall.gs`, media upload/Drive permissions, `Moderation.gs`, `chat.html`, `memory-wall.html` |
| Part 4 | `Achievements.gs`, leaderboard, `achievements.html` |
| Part 5 | `StoryGame.gs`, `story-game.html` |
| Part 6 | `Admin.gs`, `admin.html`, API reference, final consistency review, security review |

## Known limitations (Part 1)
- Google Sheets is not a transactional database; the points ledger (Part 2) will use `LockService` plus a reconciliation function, but cannot match database guarantees.
- Apps Script has daily execution quotas and ~6-minute runtime limits; very large communities will outgrow this backend.
- Email verification and password reset are not implemented yet (`is_verified` stays false). Password reset needs a mail flow and is scheduled with Part 6.
- Not yet executed against a live deployment; see `TESTING.md`.
