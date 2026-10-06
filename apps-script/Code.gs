/**
 * Muru & Saral Planner — data API (Google Apps Script)
 *
 * Paste this into the Apps Script editor of the "Muru & Saral Planner" Google Sheet
 * (Extensions → Apps Script), run `initialise` once, then deploy as a web app:
 *   Execute as: Me    ·    Who has access: Anyone
 *
 * The website (GitHub Pages) talks to this script. Every call must carry the
 * access key that `initialise` generates, so the URL alone gives no access.
 * No personal data lives in this file: it all stays in the sheet.
 */

const ENTRIES = 'Entries';
const SETTINGS = 'Settings';
const HEAD = ['id', 'type', 'people', 'start', 'end', 'location', 'note', 'daysOverride', 'updatedBy', 'updatedAt'];
const TYPES = ['travel', 'al', 'remote', 'dubai', 'ph', 'event'];
const LABELS = { travel: 'Travel', al: 'Annual leave', remote: 'Work remote', dubai: 'In Dubai', ph: 'Public holiday', event: 'Event' };
const SITE = 'https://mindmurugan.github.io/Planner/';

/* ---------------- one-time setup ---------------- */

/** Run once from the editor. Creates missing tabs and prints your private link. */
function initialise() {
  setup_();
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('KEY', key);
  }
  Logger.log('Access key: ' + key);
  Logger.log('After deploying, run `showLink` to get the link to open on each phone.');
}

/** Run after deploying: prints the one-time link that connects a phone to this sheet. */
function showLink() {
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  const url = ScriptApp.getService().getUrl();
  if (!key) throw new Error('Run initialise first.');
  if (!url) throw new Error('Deploy as a web app first (Deploy → New deployment → Web app).');
  const token = Utilities.base64EncodeWebSafe(url + '|' + key);
  Logger.log('Open this link once on each phone:\n' + SITE + '#connect=' + token);
}

/** Run if the link ever leaks: old links stop working; then run showLink again. */
function rotateKey() {
  PropertiesService.getScriptProperties().setProperty('KEY', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Key rotated. Run showLink and reconnect both phones.');
}

function ss_() { return SpreadsheetApp.getActive(); }

function setup_() {
  const ss = ss_();
  let sh = ss.getSheetByName(ENTRIES);
  if (!sh) {
    // Use the first tab if it already holds imported entries; otherwise create one.
    const first = ss.getSheets()[0];
    const hdr = first.getRange(1, 1, 1, HEAD.length).getDisplayValues()[0];
    if (hdr[0] === 'id' && hdr[1] === 'type') { first.setName(ENTRIES); sh = first; }
    else {
      sh = ss.insertSheet(ENTRIES);
      sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    }
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SETTINGS)) {
    const st = ss.insertSheet(SETTINGS);
    st.getRange('A:B').setNumberFormat('@');
    st.getRange(1, 1, 7, 2).setValues([
      ['key', 'value'],
      ['allow|2026|Muru|al', '24'],
      ['allow|2026|Muru|remote', '24'],
      ['allow|2026|Saral|al', '24'],
      ['allow|2026|Saral|remote', '24'],
      ['email|Muru', ''],
      ['email|Saral', '']
    ]);
    st.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
}

/* ---------------- web API ---------------- */

function doGet(e) { return handle_(e && e.parameter || {}); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  return handle_(body);
}

function handle_(req) {
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || req.key !== key) return out_({ ok: false, error: 'unauthorised' });
  try {
    setup_();
    switch (req.action || 'get') {
      case 'get': return out_({ ok: true, data: getData_() });
      case 'save': saveEntry_(req.entry || {}, req.by); return out_({ ok: true, data: getData_() });
      case 'delete': deleteEntry_(String(req.id || '')); return out_({ ok: true, data: getData_() });
      case 'settings': saveSettings_(req.settings || {}); return out_({ ok: true, data: getData_() });
      default: return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- data ---------------- */

const TZ_ = () => ss_().getSpreadsheetTimeZone();
function cellStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ_(), 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

function readSettings_() {
  const st = ss_().getSheetByName(SETTINGS);
  const n = st.getLastRow();
  const out = {};
  if (n > 1) st.getRange(2, 1, n - 1, 2).getValues().forEach(r => { if (r[0]) out[String(r[0])] = cellStr_(r[1]); });
  return out;
}

function getData_() {
  const sh = ss_().getSheetByName(ENTRIES);
  const n = sh.getLastRow();
  const rows = n > 1 ? sh.getRange(2, 1, n - 1, HEAD.length).getValues() : [];
  const entries = rows.filter(r => r[0] !== '' && r[0] != null).map(r => {
    const o = {};
    HEAD.forEach((h, i) => { o[h] = cellStr_(r[i]); });
    o.people = o.people ? o.people.split(',').map(s => s.trim()).filter(String) : [];
    return o;
  });
  const s = readSettings_();
  // Never send email addresses to the browser beyond what Settings shows.
  return { entries: entries, settings: s };
}

function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (cellStr_(ids[i][0]) === id) return i + 2;
  return 0;
}

function saveEntry_(e, by) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (TYPES.indexOf(e.type) < 0) throw new Error('Unknown type');
  e.end = e.end || e.start;
  if (!iso.test(e.start) || !iso.test(e.end)) throw new Error('Invalid date');
  if (e.end < e.start) throw new Error('End date is before start date');
  const people = (e.people || []).filter(p => p === 'Muru' || p === 'Saral');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const isNew = !e.id;
  try {
    const sh = ss_().getSheetByName(ENTRIES);
    if (isNew) e.id = Utilities.getUuid().slice(0, 8);
    const ov = (e.daysOverride === '' || e.daysOverride == null || isNaN(Number(e.daysOverride))) ? '' : String(Number(e.daysOverride));
    const row = [e.id, e.type, people.join(','), e.start, e.end, String(e.location || '').slice(0, 200),
      String(e.note || '').slice(0, 500), ov, String(by || ''), new Date().toISOString()];
    const idx = isNew ? 0 : findRow_(sh, e.id);
    const r = idx || sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, HEAD.length).setNumberFormat('@').setValues([row]);
  } finally {
    lock.releaseLock();
  }
  try { notify_(e, people, by, isNew ? 'added' : 'updated'); } catch (err) { /* email is best-effort */ }
}

function deleteEntry_(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(ENTRIES);
    const idx = findRow_(sh, id);
    if (idx) sh.deleteRow(idx);
  } finally {
    lock.releaseLock();
  }
}

function saveSettings_(map) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const st = ss_().getSheetByName(SETTINGS);
    const n = st.getLastRow();
    const keys = n > 1 ? st.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0])) : [];
    Object.keys(map).forEach(k => {
      if (!/^(allow\|\d{4}\|(Muru|Saral)\|(al|remote)|email\|(Muru|Saral))$/.test(k)) return;
      const v = String(map[k] == null ? '' : map[k]).trim().slice(0, 200);
      const i = keys.indexOf(k);
      if (i >= 0) st.getRange(i + 2, 2).setNumberFormat('@').setValue(v);
      else { st.appendRow([k, v]); keys.push(k); }
    });
  } finally {
    lock.releaseLock();
  }
}

function notify_(e, people, by, verb) {
  if (by !== 'Muru' && by !== 'Saral') return;
  const other = by === 'Muru' ? 'Saral' : 'Muru';
  const to = (readSettings_()['email|' + other] || '').trim();
  if (!to) return;
  const label = LABELS[e.type] || e.type;
  const when = e.start === e.end ? e.start : e.start + ' → ' + e.end;
  MailApp.sendEmail({
    to: to,
    subject: by + ' ' + verb + ': ' + label + (e.location ? ' · ' + e.location : '') + ' (' + when + ')',
    body: (people.join(' & ') || 'Everyone') + '\n' + label + (e.location ? ' — ' + e.location : '') + '\n' + when +
      (e.note ? '\n\n' + e.note : '') + '\n\nOpen the planner: ' + SITE
  });
}
