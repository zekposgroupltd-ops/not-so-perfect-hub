/**
 * Database.gs — the ONLY module that touches SpreadsheetApp for data.
 * Business modules call db_* helpers and never deal with row/column numbers.
 *
 * Design notes
 *  - Lookups by a single column use TextFinder on that column, so a login does not read whole sheets.
 *  - Full-sheet reads (db_all) are for admin lists/reports and small sheets only.
 *  - Writes that must be unique or must not race are wrapped by the caller in withLock_().
 *  - Text values that could be read as spreadsheet formulas are neutralised on write (formula injection).
 */
var _ss = null;
var _headerMaps = {};

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function getProp_(key) { return PropertiesService.getScriptProperties().getProperty(key); }

function getSpreadsheet_() {
  if (_ss) return _ss;
  const id = getProp_('SPREADSHEET_ID');
  if (!id) throw new ApiError('SERVER_NOT_CONFIGURED', 'The service has not been set up yet.');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function columns_(sheetName) {
  const cols = SCHEMA[sheetName];
  if (!cols) throw new Error('Unknown sheet: ' + sheetName);
  return cols.map(function (c) { const p = c.split(':'); return { name: p[0], type: p[1] || 's' }; });
}

/** Returns the sheet and a {column: index} map, validating that every required column exists. */
function sheetInfo_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new ApiError('SERVER_NOT_CONFIGURED', 'The database is missing a required sheet.');
  if (!_headerMaps[sheetName]) {
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const map = {};
    headers.forEach(function (h, i) { if (h) map[String(h)] = i; });
    columns_(sheetName).forEach(function (c) {
      if (map[c.name] === undefined) {
        console.error('Missing column ' + c.name + ' in ' + sheetName);
        throw new ApiError('SERVER_NOT_CONFIGURED', 'The database structure is out of date.');
      }
    });
    _headerMaps[sheetName] = map;
  }
  return { sheet: sheet, map: _headerMaps[sheetName] };
}

function coerceIn_(value, type) {
  if (type === 'n') { if (value === '' || value === null) return 0; const n = Number(value); return isNaN(n) ? 0 : n; }
  if (type === 'b') return value === true || String(value).toLowerCase() === 'true';
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString();
  const s = String(value);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;   // undo formula guard
}

function coerceOut_(value, type) {
  if (type === 'n') return Number(value) || 0;
  if (type === 'b') return value === true;
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;   // formula-injection guard
}

function rowToRecord_(sheetName, map, row, rowNumber) {
  const rec = { _row: rowNumber };
  columns_(sheetName).forEach(function (c) { rec[c.name] = coerceIn_(row[map[c.name]], c.type); });
  return rec;
}

function recordToRow_(sheetName, map, width, record, base) {
  const row = base ? base.slice() : new Array(width).fill('');
  columns_(sheetName).forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(record, c.name)) row[map[c.name]] = coerceOut_(record[c.name], c.type);
  });
  return row;
}

/** Find one record by exact match on one column. Returns null if none. */
function db_find(sheetName, column, value) {
  const info = sheetInfo_(sheetName);
  const last = info.sheet.getLastRow();
  if (last < 2 || value === '' || value === null || value === undefined) return null;
  const range = info.sheet.getRange(2, info.map[column] + 1, last - 1, 1);
  const hit = range.createTextFinder(String(value)).matchCase(true).matchEntireCell(true).findNext();
  if (!hit) return null;
  const rowNumber = hit.getRow();
  const row = info.sheet.getRange(rowNumber, 1, 1, info.sheet.getLastColumn()).getValues()[0];
  return rowToRecord_(sheetName, info.map, row, rowNumber);
}

function db_insert(sheetName, record) {
  const info = sheetInfo_(sheetName);
  const width = info.sheet.getLastColumn();
  const row = recordToRow_(sheetName, info.map, width, record, null);
  info.sheet.appendRow(row);
  SpreadsheetApp.flush();
  return rowToRecord_(sheetName, info.map, row, info.sheet.getLastRow());
}

/** Merge `patch` into the record found by column=value. Throws NOT_FOUND if absent. */
function db_update(sheetName, column, value, patch) {
  const existing = db_find(sheetName, column, value);
  if (!existing) throw new ApiError('NOT_FOUND', 'The requested item was not found.');
  const info = sheetInfo_(sheetName);
  const width = info.sheet.getLastColumn();
  const current = info.sheet.getRange(existing._row, 1, 1, width).getValues()[0];
  const row = recordToRow_(sheetName, info.map, width, patch, current);
  info.sheet.getRange(existing._row, 1, 1, width).setValues([row]);
  SpreadsheetApp.flush();
  return rowToRecord_(sheetName, info.map, row, existing._row);
}

/** All records, optionally filtered. Use sparingly: reads the whole sheet. */
function db_all(sheetName, filterFn) {
  const info = sheetInfo_(sheetName);
  const last = info.sheet.getLastRow();
  if (last < 2) return [];
  const rows = info.sheet.getRange(2, 1, last - 1, info.sheet.getLastColumn()).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const rec = rowToRecord_(sheetName, info.map, rows[i], i + 2);
    if (!filterFn || filterFn(rec)) out.push(rec);
  }
  return out;
}

function db_count(sheetName) { return Math.max(sheetInfo_(sheetName).sheet.getLastRow() - 1, 0); }

// ---------- Shared utilities ----------

function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
function nowIso_() { return new Date().toISOString(); }
function todayLocal_() { return Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd'); }

/** Serialise sensitive sections. Waits up to 10s, then fails cleanly rather than risk a race. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new ApiError('BUSY', 'The service is busy. Please try again in a moment.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Approximate counter-based rate limit using CacheService (not exact under heavy concurrency). */
function rateLimit_(key, max, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + key;
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), windowSeconds);
  if (n > max) throw new ApiError('RATE_LIMITED', 'Too many requests. Please wait a little and try again.');
}

// ---------- Settings ----------

function loadSettings_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('settings_v1');
  if (hit) return JSON.parse(hit);
  const map = {};
  db_all('Settings').forEach(function (s) { map[s.setting_key] = s.setting_value; });
  cache.put('settings_v1', JSON.stringify(map), 300);
  return map;
}

function clearSettingsCache_() { CacheService.getScriptCache().remove('settings_v1'); }

function getSetting_(key) {
  const def = DEFAULT_SETTINGS[key];
  const all = loadSettings_();
  const raw = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : def;
  if (typeof def === 'number') { const n = Number(raw); return isNaN(n) ? def : n; }
  if (typeof def === 'boolean') return raw === true || String(raw).toLowerCase() === 'true';
  if (typeof def === 'object') {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }
  return String(raw);
}

// ---------- Audit ----------

/** Append an audit entry. Secrets are stripped by key name as a safety net. */
function audit_(actorId, action, targetType, targetId, details) {
  const safe = {};
  Object.keys(details || {}).forEach(function (k) { if (!/pass|token|secret|hash|pepper/i.test(k)) safe[k] = details[k]; });
  db_insert('AuditLogs', {
    audit_id: newId_('aud'), actor_id: actorId || '', action: action, target_type: targetType || '',
    target_id: targetId || '', details_json: JSON.stringify(safe), created_at: nowIso_()
  });
}
