/**
 * Setup.gs — run these from the Apps Script EDITOR (never exposed through the web API).
 *  1. initialSetup()        creates spreadsheet + sheets + headers + settings + Drive folders + pepper. Safe to re-run.
 *  2. verifySetup()         reports any missing sheet/column.
 *  3. bootstrapFirstAdmin() promotes the registered account whose email is in Script Property ADMIN_BOOTSTRAP_EMAIL.
 *  4. benchmarkPasswordHash() measures hash time so you can judge PBKDF2 iterations vs. quota.
 */
function initialSetup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PASSWORD_PEPPER')) props.setProperty('PASSWORD_PEPPER', randomHex_(32));

  let ss;
  const existingId = props.getProperty('SPREADSHEET_ID');
  if (existingId) { ss = SpreadsheetApp.openById(existingId); }
  else {
    ss = SpreadsheetApp.create('NSP Fan Hub — Database');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  const report = [];
  Object.keys(SCHEMA).forEach(function (name) { report.push(ensureSheet_(ss, name)); });
  const first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);

  _ss = null; _headerMaps = {};
  const seeded = seedSettings_();
  ensureFolder_('PUBLIC_MEDIA_FOLDER_ID', 'NSP Fan Hub — Public Media (approved only)');
  ensureFolder_('RESTRICTED_MEDIA_FOLDER_ID', 'NSP Fan Hub — Restricted Media (private)');

  Logger.log(report.join('\n'));
  Logger.log('Settings seeded: ' + seeded + '. Spreadsheet: ' + ss.getUrl());
  Logger.log('Next: register an account on the site, set ADMIN_BOOTSTRAP_EMAIL in Script Properties, run bootstrapFirstAdmin().');
}

/** Create the sheet if missing; otherwise append only missing columns. Never touches existing data. */
function ensureSheet_(ss, name) {
  const cols = columns_(name).map(function (c) { return c.name; });
  let sheet = ss.getSheetByName(name), note = 'created';
  if (!sheet) { sheet = ss.insertSheet(name); sheet.getRange(1, 1, 1, cols.length).setValues([cols]); }
  else {
    const have = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    const missing = cols.filter(function (c) { return have.indexOf(c) === -1; });
    if (missing.length) sheet.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    note = missing.length ? 'added columns: ' + missing.join(', ') : 'ok (unchanged)';
  }
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#2a2433').setFontColor('#f2ece0');
  sheet.setFrozenRows(1);
  return name + ': ' + note;
}

function seedSettings_() {
  const have = {};
  db_all('Settings').forEach(function (s) { have[s.setting_key] = true; });
  let added = 0;
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (have[k]) return;
    const v = DEFAULT_SETTINGS[k];
    db_insert('Settings', { setting_key: k, setting_value: typeof v === 'object' ? JSON.stringify(v) : String(v), updated_at: nowIso_(), updated_by: 'setup' });
    added++;
  });
  clearSettingsCache_();
  return added;
}

function ensureFolder_(propKey, name) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(propKey)) return;
  props.setProperty(propKey, DriveApp.createFolder(name).getId());
}

function verifySetup() {
  const problems = [];
  Object.keys(SCHEMA).forEach(function (name) {
    try { sheetInfo_(name); } catch (e) { problems.push(name + ': ' + e.message); }
  });
  ['SPREADSHEET_ID', 'PASSWORD_PEPPER', 'PUBLIC_MEDIA_FOLDER_ID', 'RESTRICTED_MEDIA_FOLDER_ID'].forEach(function (k) {
    if (!getProp_(k)) problems.push('Missing Script Property: ' + k);
  });
  Logger.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'Setup looks complete.');
}

/** One-time admin bootstrap. Works only from the editor, only while no active admin exists. */
function bootstrapFirstAdmin() {
  const props = PropertiesService.getScriptProperties();
  const email = normalizeEmail_(props.getProperty('ADMIN_BOOTSTRAP_EMAIL'));
  if (!email) throw new Error('Set Script Property ADMIN_BOOTSTRAP_EMAIL to the email of a registered account first.');
  if (db_all('Users', function (u) { return u.role === 'admin' && u.account_status === 'active'; }).length)
    throw new Error('An active administrator already exists. Use the admin dashboard to manage roles.');
  const user = db_find('Users', 'email', email);
  if (!user) throw new Error('No registered account with that email. Register on the site first.');
  db_update('Users', 'user_id', user.user_id, { role: 'admin' });
  audit_('setup', 'bootstrap_admin', 'user', user.user_id, {});
  props.deleteProperty('ADMIN_BOOTSTRAP_EMAIL');
  Logger.log('Promoted ' + user.username + ' to admin. ADMIN_BOOTSTRAP_EMAIL has been removed.');
}

function benchmarkPasswordHash() {
  const t0 = Date.now();
  const h = hashPassword_('Benchmark123');
  const t1 = Date.now();
  const ok = verifyPassword_('Benchmark123', h);
  Logger.log('Hash: ' + (t1 - t0) + ' ms, verify: ' + (Date.now() - t1) + ' ms, round-trip ok: ' + ok + ', iterations: ' + APP.PBKDF2_ITERATIONS);
}
