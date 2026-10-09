# Testing — Part 1 (Foundation)
**Status key: NOT RUN means the check has not been executed against a live deployment.**

Executed so far: JavaScript syntax check of every `.gs` and `.js` file (passed); PBKDF2 implementation compared with Node's `crypto.pbkdf2Sync` for the same inputs (output matched).

| # | Scenario | Expected | Status |
|---|---|---|---|
| A1 | Register a valid account | Account created, logged in, redirected to community.html | NOT RUN |
| A2 | Register with an existing username (any letter case) | "That username is taken." | NOT RUN |
| A3 | Register with an existing email (different case) | "That email is already registered." | NOT RUN |
| A4 | Weak password, mismatched confirm, bad email, unticked rules | Field-level errors; no account | NOT RUN |
| A5 | Send `role:"admin"` in the register payload | Ignored; account role is `fan` | NOT RUN |
| A6 | Login with wrong password | Generic "Incorrect email/username or password."; `login_failed` in AuditLogs | NOT RUN |
| A7 | Five wrong passwords, then correct one | Rate-limited message for 15 minutes | NOT RUN |
| A8 | Set `account_status` to `suspended` in the sheet, then call any action | `ACCOUNT_SUSPENDED` | NOT RUN |
| A9 | Logout, then reuse the old token | `UNAUTHENTICATED` | NOT RUN |
| A10 | Set a session's `expires_at` in the past | `UNAUTHENTICATED` | NOT RUN |
| A11 | "Log out of all devices" | All sessions have `revoked_at` | NOT RUN |
| A12 | Inspect Users sheet | `password_hash` is `pbkdf2-sha256$…`; Sessions holds only token hashes | NOT RUN |
| A13 | `updateProfile` with `role`, `total_points` | Fields ignored; only display_name/bio change | NOT RUN |
| A14 | Open `getProfile` for another user | No email or points in response | NOT RUN |
| S1 | Run `initialSetup()` twice | No duplicate sheets or settings; existing rows untouched | NOT RUN |
| S2 | Delete a column header, run `verifySetup()` | Problem reported; re-run `initialSetup()` restores it | NOT RUN |
| S3 | Run `bootstrapFirstAdmin()` twice | Second run refuses (admin exists) | NOT RUN |
| U1 | Open site at 360px width | No horizontal scroll; nav wraps | NOT RUN |
| U2 | Keyboard-only login | Visible focus, skip link works | NOT RUN |
| U3 | Browser console | No errors on all five pages | NOT RUN |
