/* Muru & Saral Planner — app logic (Supabase backend) */
'use strict';

/* ---------- helpers ---------- */
const PEOPLE = ['Muru', 'Saral'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS = MONTHS.map(m => m.slice(0, 3));
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = s => { const [a, b, c] = s.split('-').map(Number); return new Date(Date.UTC(a, b - 1, c)); };
const toIso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const isWeekend = s => { const w = parse(s).getUTCDay(); return w === 0 || w === 6; }; // UAE weekend: Sat & Sun
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = s => { const d = parse(s); return `${d.getUTCDate()} ${MS[d.getUTCMonth()]}`; };
function fr(a, b) {
  if (!b || a === b) return fd(a);
  const A = parse(a), B = parse(b);
  if (A.getUTCMonth() === B.getUTCMonth() && A.getUTCFullYear() === B.getUTCFullYear()) return `${A.getUTCDate()}–${B.getUTCDate()} ${MS[B.getUTCMonth()]}`;
  return `${fd(a)} – ${fd(b)}`;
}
function* days(a, b) { let n = 0; for (let s = a; s <= b && n < 400; s = addDays(s, 1), n++) yield s; }
const fmtN = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
const $ = s => document.querySelector(s);
// Readable text colour on a given background
function ink(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#15171C';
  const n = parseInt(m[1], 16), ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return (0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]) > 0.36 ? '#15171C' : '#FFFFFF';
}

/* ---------- defaults (used until the database answers) ---------- */
const DEFAULT_CATS = [
  { key: 'travel', label: 'Travel', color: '#F5D04A', deducts: null, everyone: false, sort: 10, system: true },
  { key: 'al', label: 'Annual leave', color: '#F0943A', deducts: 'al', everyone: false, sort: 20, system: true },
  { key: 'remote', label: 'Work remote', color: '#97CBA2', deducts: 'remote', everyone: false, sort: 30, system: true },
  { key: 'dubai', label: 'In Dubai', color: '#C8CBD2', deducts: null, everyone: false, sort: 40, system: false },
  { key: 'event', label: 'Event', color: '#D24BE8', deducts: null, everyone: false, sort: 50, system: false },
  { key: 'ph', label: 'Public holiday', color: '#5B8DB8', deducts: null, everyone: true, sort: 60, system: true }
];
const DEFAULT_COL = { Muru: '#F5D04A', Saral: '#F1B4C3', together: '#7DBBC3' };

/* ---------- data (Supabase) ---------- */
const SB_URL = 'https://letpyzescnhicrhmlgkv.supabase.co';
const SB_KEY = 'sb_publishable_SXLD7GItJBrPMQIvh6tW3A_OaeQf0f7'; // publishable key: safe in the browser; data is protected by row-level security
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
let MOCK = null, MY_PERSON = null, MY_EMAIL = '', lastSync = null;

let S = { entries: [], allow: {}, cats: DEFAULT_CATS.slice(), col: { ...DEFAULT_COL } };
let CAT = {}, IDX = {}, PH = new Set();

const fromRow = r => ({ id: r.id, type: r.type, people: r.people || [], start: r.start_date, end: r.end_date, location: r.location || '', note: r.note || '', daysOverride: r.days_override == null ? '' : String(+r.days_override) });

async function load() {
  if (MOCK) return MOCK.push();
  const [e, a, c, k] = await Promise.all([
    sb.from('entries').select('*').order('start_date'),
    sb.from('allowances').select('*'),
    sb.from('categories').select('*').order('sort'),
    sb.from('colours').select('*')
  ]);
  for (const r of [e, a, c, k]) if (r.error) throw r.error;
  const allow = {}; for (const r of a.data) allow[`${r.year}|${r.person}|${r.kind}`] = +r.days;
  const col = { ...DEFAULT_COL }; for (const r of k.data) col[r.key] = r.color;
  S = { entries: e.data.map(fromRow), allow, cats: c.data.length ? c.data : DEFAULT_CATS.slice(), col };
  lastSync = new Date();
  paint();
}

const api = {
  async saveEntry(e) {
    if (MOCK) return MOCK.save(e);
    const row = { type: e.type, people: e.people, start_date: e.start, end_date: e.end, location: e.location, note: e.note, days_override: e.daysOverride === '' ? null : Number(e.daysOverride) };
    const { error } = e.id ? await sb.from('entries').update(row).eq('id', e.id) : await sb.from('entries').insert(row);
    if (error) throw error; await load();
  },
  async deleteEntry(id) {
    if (MOCK) return MOCK.del(id);
    const { error } = await sb.from('entries').delete().eq('id', id); if (error) throw error; await load();
  },
  async saveSettings(p) {
    if (MOCK) return MOCK.settings(p);
    if (p.allow.length) { const { error } = await sb.from('allowances').upsert(p.allow); if (error) throw error; }
    for (const [key, color] of Object.entries(p.col)) { const { error } = await sb.from('colours').update({ color }).eq('key', key); if (error) throw error; }
    if (p.cats.length) { const { error } = await sb.from('categories').upsert(p.cats); if (error) throw error; }
    for (const key of p.removed) { const { error } = await sb.from('categories').delete().eq('key', key); if (error) throw error; }
    await load();
  }
};

/* ---------- derived state ---------- */
const t0 = parse(TODAY);
let view = 'month', cur = { y: t0.getUTCFullYear(), m: t0.getUTCMonth() }, who = 'All', showPast = false, draft = null;

const cat = k => CAT[k] || { key: k, label: k, color: '#C8CBD2', deducts: null, everyone: false, sort: 999 };
// Higher wins when one person has several entries on a day
const pri = e => { const c = cat(e.type); return c.deducts ? 1000 - c.sort : e.type === 'dubai' ? 0 : 500 - c.sort; };

function reindex() {
  CAT = {}; for (const c of S.cats) CAT[c.key] = c;
  IDX = {}; PH = new Set();
  for (const e of S.entries) {
    if (!e.start) continue; e.end = e.end || e.start;
    const every = cat(e.type).everyone;
    for (const d of days(e.start, e.end)) {
      const o = IDX[d] || (IDX[d] = { all: null, list: [] });
      if (every) { o.all = o.all || e; if (e.type === 'ph') PH.add(d); }
      o.list.push(e);
    }
  }
  const r = document.documentElement.style;
  r.setProperty('--muru', S.col.Muru); r.setProperty('--saral', S.col.Saral); r.setProperty('--together', S.col.together);
  r.setProperty('--muru-ink', ink(S.col.Muru)); r.setProperty('--saral-ink', ink(S.col.Saral));
}
const workDays = (a, b) => { let n = 0; for (const d of days(a, b)) if (!isWeekend(d) && !PH.has(d)) n++; return n; };
const entryDays = e => (e.daysOverride !== '' && e.daysOverride != null && !isNaN(+e.daysOverride)) ? +e.daysOverride : workDays(e.start, e.end);
const topFor = (d, p) => { const o = IDX[d]; if (!o) return null; let best = null; for (const e of o.list) if (!cat(e.type).everyone && e.people.includes(p) && (!best || pri(e) > pri(best))) best = e; return best; };
const colorFor = (e, p) => e.type === 'travel' ? (e.people.length > 1 ? S.col.together : S.col[p] || S.col.Muru) : cat(e.type).color;
const entryColor = e => e.type === 'travel' ? (e.people.length > 1 ? S.col.together : S.col[e.people[0]] || S.col.Muru) : cat(e.type).color;

function cell(d) {
  const o = IDX[d]; if (!o) return { style: '', cls: '', who: '', dot: '' };
  const m = topFor(d, 'Muru'), s = topFor(d, 'Saral');
  const cm = m && colorFor(m, 'Muru'), cs = s && colorFor(s, 'Saral');
  let bg = '', fg = '';
  if (cm && cs) { if (m.id === s.id || cm === cs) { bg = cm; } else { bg = `linear-gradient(135deg,${cm} 50%,${cs} 50%)`; } fg = ink(cm); }
  else if (cm || cs) { bg = cm || cs; fg = ink(bg); }
  else if (o.all) { bg = cat(o.all.type).color; fg = ink(bg); }
  const dot = o.all && (cm || cs) ? cat(o.all.type).color : '';
  return { style: bg ? `background:${bg};color:${fg}` : '', cls: bg ? 'c' : '', who: (m && s) ? 'M·S' : m ? 'M' : s ? 'S' : '', dot };
}

const allow = (y, p, k) => { const v = S.allow[`${y}|${p}|${k}`]; return v === undefined ? 24 : v; };
function balance(y, p, k) {
  let booked = 0, taken = 0;
  for (const e of S.entries) {
    if (cat(e.type).deducts !== k || !e.people.includes(p) || +e.start.slice(0, 4) !== y) continue;
    const n = entryDays(e); booked += n;
    if (e.end < TODAY) taken += n;
    else if (e.start <= TODAY) { const tot = workDays(e.start, e.end) || 1; taken += n * workDays(e.start, TODAY) / tot; }
  }
  const a = allow(y, p, k); return { a, booked, taken, left: a - booked };
}
function label(e) {
  const c = cat(e.type);
  if (c.everyone || e.type === 'event') return e.location || c.label;
  const loc = e.location && !(e.type === 'dubai' && /^dubai$/i.test(e.location)) ? ' · ' + e.location : '';
  return c.label + loc;
}
const av = p => `<span class="av ${p === 'Muru' ? 'm' : 's'}">${p[0]}</span>`;

/* ---------- render ---------- */
let gotData = false;
function paint() { gotData = true; reindex(); render(); }

function render() {
  const y = cur.y;
  $('#app').innerHTML = `
  <div class="layout">
    <section class="col-main">
      <div class="seg">${['month', 'year', 'list'].map(v => `<button data-view="${v}" class="${view === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
      <div id="view">${view === 'month' ? monthView() : view === 'year' ? yearView() : listView()}</div>
      ${legend()}
    </section>
    <aside class="side">
      <div class="label">Right now</div>
      <div class="now">${PEOPLE.map(nowCard).join('')}</div>
      <div class="label">Coming up</div>
      <div class="up">${upcoming()}</div>
    </aside>
  </div>
  <section class="bottom">
    <div class="label">${y} balances</div>
    <div class="bal">${PEOPLE.map(p => `<button class="card" data-act="settings" style="text-align:left"><div class="who">${av(p)}${p}</div>${['al', 'remote'].map(k => balRow(y, p, k)).join('')}</button>`).join('')}</div>
    <div class="sync">${lastSync ? 'Synced ' + lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
  </section>`;
}
function legend() {
  const items = [[S.col.Muru, 'Muru travel'], [S.col.Saral, 'Saral travel'], [S.col.together, 'Together']]
    .concat(S.cats.filter(c => c.key !== 'travel').map(c => [c.color, c.label]));
  return `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
}
function nowCard(p) {
  const o = IDX[TODAY]; let e = null;
  if (o) for (const x of o.list) if (!cat(x.type).everyone && x.people.includes(p) && (!e || pri(x) > pri(e))) e = x;
  const st = e ? label(e) : (o && o.all ? label(o.all) : 'In Dubai');
  const sub = e && e.end > TODAY ? `until ${fd(e.end)}` : '';
  return `<div class="card nowrow">${av(p)}<div class="t"><div class="sub">${p}</div><div class="status">${esc(st)}</div></div>${sub ? `<span class="pill">${sub}</span>` : ''}</div>`;
}
function upcoming() {
  const list = S.entries.filter(x => x.start > TODAY && x.type !== 'dubai').sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0).slice(0, 8);
  if (!list.length) return '<div class="card muted">Nothing planned yet</div>';
  return list.map(e => itemRow(e, diff(TODAY, e.start))).join('');
}
function balRow(y, p, k) {
  const b = balance(y, p, k), pct = x => Math.max(0, Math.min(100, x / (b.a || 1) * 100));
  const c = S.cats.find(x => x.key === k) || cat(k);
  return `<div class="brow"><div class="top"><span class="k">${esc(c.label)}</span><span class="v ${b.left < 0 ? 'neg' : ''}">${fmtN(b.left)} <small>left</small></span></div>
  <div class="bar"><i style="width:${pct(b.taken)}%;background:${c.color}"></i><i style="width:${pct(b.booked - b.taken)}%;background:${c.color};opacity:.4"></i></div>
  <div class="d">${fmtN(+b.taken.toFixed(2))} taken · ${fmtN(+(b.booked - b.taken).toFixed(2))} planned · of ${fmtN(b.a)}</div></div>`;
}
function grid(y, m, mini) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let h = `<div class="wk">${'SMTWTFS'.split('').map(x => `<span>${x}</span>`).join('')}</div><div class="grid">`;
  for (let i = 0; i < first; i++) h += `<span class="day empty"></span>`;
  for (let d = 1; d <= dim; d++) {
    const s = iso(y, m, d), c = cell(s);
    h += `<button class="day ${c.cls} ${isWeekend(s) ? 'we' : ''} ${s === TODAY ? 'today' : ''}" data-day="${s}" ${c.style ? `style="${c.style}"` : ''}><b>${d}</b>${mini ? '' : `<small>${c.who}</small>`}${c.dot ? `<i class="phdot" style="background:${c.dot}"></i>` : ''}</button>`;
  }
  return h + '</div>';
}
function monthView() {
  const { y, m } = cur, a = iso(y, m, 1), b = iso(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  const items = S.entries.filter(e => e.start <= b && e.end >= a).sort((x, z) => x.start < z.start ? -1 : x.start > z.start ? 1 : pri(z) - pri(x));
  return `<div class="card"><div class="mhead"><button class="ic" data-act="prev" aria-label="Previous month">‹</button><h2>${MONTHS[m]} <span>${y}</span></h2><button class="ic" data-act="next" aria-label="Next month">›</button></div>${grid(y, m, false)}
  <div class="mlist">${items.length ? items.map(e => itemRow(e)).join('') : '<div class="muted">Nothing planned this month</div>'}</div></div>`;
}
function yearView() {
  return `<div class="mhead"><button class="ic" data-act="prevY" aria-label="Previous year">‹</button><h2>${cur.y}</h2><button class="ic" data-act="nextY" aria-label="Next year">›</button></div>
  <div class="year">${MONTHS.map((n, m) => `<div class="card mini"><button data-month="${m}"><h4>${n}</h4></button>${grid(cur.y, m, true)}</div>`).join('')}</div>`;
}
function listView() {
  let es = S.entries.filter(e => +e.start.slice(0, 4) === cur.y || +e.end.slice(0, 4) === cur.y);
  if (who !== 'All') es = es.filter(e => cat(e.type).everyone || e.people.includes(who));
  if (!showPast) es = es.filter(e => e.end >= TODAY);
  es.sort((a, b) => a.start < b.start ? -1 : 1);
  let h = `<div class="filters">${['All', 'Muru', 'Saral'].map(x => `<button class="chip ${who === x ? 'on' : ''}" data-who="${x}">${x}</button>`).join('')}<button class="chip ${showPast ? 'on' : ''}" data-act="past">Show past</button></div>`;
  if (!es.length) return h + '<div class="muted">Nothing to show</div>';
  let g = '';
  for (const e of es) { const k = e.start.slice(0, 7); if (k !== g) { g = k; h += `<div class="grp">${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}</div>`; } h += itemRow(e); }
  return h;
}
function itemRow(e, inDays) {
  const n = cat(e.type).deducts && inDays === undefined ? entryDays(e) : null;
  const when = inDays === undefined ? '' : `<span class="pill ${inDays <= 7 ? 'soon' : ''}">${inDays === 1 ? 'tomorrow' : 'in ' + inDays + 'd'}</span>`;
  return `<button class="item ${e.end < TODAY ? 'past' : ''}" data-edit="${e.id}"><span class="sw" style="background:${entryColor(e)}"></span>
  <span class="t"><b>${esc(label(e))}</b><span>${fr(e.start, e.end)}${e.note ? ' · ' + esc(e.note) : ''}</span></span>
  <span class="r">${n !== null ? `<span class="pill">${fmtN(n)}d</span>` : ''}${when}${e.people.map(av).join('')}</span></button>`;
}

/* ---------- sheets ---------- */
function openSheet(h) { const sh = $('#sheet'), sc = $('#scrim'); sh.innerHTML = '<div class="grab"></div>' + h; sh.hidden = sc.hidden = false; requestAnimationFrame(() => { sh.classList.add('on'); sc.classList.add('on'); }); }
function closeSheet() { const sh = $('#sheet'), sc = $('#scrim'); sh.classList.remove('on'); sc.classList.remove('on'); setTimeout(() => { sh.hidden = sc.hidden = true; }, 260); draft = null; setDraft = null; }
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); }

function daySheet(d) {
  const o = IDX[d], list = o ? o.list : [];
  openSheet(`<div class="sh"><h3>${parse(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h3><button class="ic" data-act="close" aria-label="Close">✕</button></div>
  <div class="mlist" style="margin-top:12px">${list.length ? list.map(e => itemRow(e)).join('') : '<div class="muted">Nothing on this day</div>'}</div>
  <div class="acts"><button class="btn pri" data-act="addOn" data-d="${d}">Add on this day</button></div>`);
}

function entrySheet(e) {
  draft = e ? { ...e, people: [...e.people] } : { type: 'travel', people: [MY_PERSON || 'Muru'], start: TODAY, end: TODAY, location: '', note: '', daysOverride: '' };
  openSheet(`<div class="sh"><h3>${e ? 'Edit entry' : 'New entry'}</h3><button class="ic" data-act="close" aria-label="Close">✕</button></div>
  <div class="f"><label>What</label><div class="opts" id="fType">${S.cats.map(c => `<button class="opt" data-type="${esc(c.key)}"><i style="background:${c.key === 'travel' ? S.col[MY_PERSON || 'Muru'] : c.color}"></i>${esc(c.label)}</button>`).join('')}</div></div>
  <div class="f" id="fWhoWrap"><label>Who</label><div class="opts" id="fWho">${PEOPLE.map(p => `<button class="opt" data-p="${p}">${av(p)}${p}</button>`).join('')}<button class="opt" data-p="both">Both of us</button></div></div>
  <div class="f two"><div><label for="fStart">From</label><input type="date" id="fStart"></div><div><label for="fEnd">To</label><input type="date" id="fEnd"></div></div>
  <div class="f"><label id="fLocL" for="fLoc">Where</label><input id="fLoc" maxlength="200" placeholder="e.g. Singapore, Dublin, Bali"></div>
  <div class="f" id="fDaysWrap"><label>Days used</label><div class="daysbox"><span class="n" id="fN">0</span><span class="tx" id="fTx">working days</span><input id="fOv" inputmode="decimal" placeholder="Adjust" aria-label="Override days"></div>
    <div class="hint">Counts Mon–Fri, skipping public holidays. Type a number to override (e.g. 0.5).</div></div>
  <div class="f"><label for="fNote">Note</label><textarea id="fNote" rows="2" maxlength="500" placeholder="Optional"></textarea></div>
  <div class="acts">${e ? '<button class="btn del" data-act="del">Delete</button>' : ''}<button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="save">Save</button></div>`);
  $('#fStart').value = draft.start; $('#fEnd').value = draft.end; $('#fLoc').value = draft.location || ''; $('#fNote').value = draft.note || ''; $('#fOv').value = draft.daysOverride ?? '';
  syncForm();
}
function syncForm() {
  if (!draft) return; const d = draft, c = cat(d.type);
  document.querySelectorAll('#fType .opt').forEach(b => b.classList.toggle('on', b.dataset.type === d.type));
  document.querySelectorAll('#fWho .opt').forEach(b => { const p = b.dataset.p; b.classList.toggle('on', p === 'both' ? d.people.length === 2 : d.people.length === 1 && d.people[0] === p); });
  $('#fWhoWrap').hidden = !!c.everyone;
  $('#fDaysWrap').hidden = !c.deducts;
  const named = c.everyone || d.type === 'event';
  $('#fLocL').textContent = named ? 'Name' : 'Where';
  $('#fLoc').placeholder = d.type === 'ph' ? 'e.g. Eid al-Fitr' : named ? 'e.g. Anniversary' : 'e.g. Singapore, Dublin, Bali';
  const s = $('#fStart').value, e = $('#fEnd').value;
  if (s && e && e >= s) { const n = workDays(s, e), ov = $('#fOv').value; $('#fN').textContent = ov !== '' ? ov : n; $('#fTx').textContent = ov !== '' ? `days (adjusted · auto ${n})` : `working day${n === 1 ? '' : 's'}`; }
}

/* settings: allowances, colours, categories */
let setDraft = null;
function settingsSheet() {
  setDraft = { cats: S.cats.map(c => ({ ...c })), removed: [] };
  renderSettings();
}
function usedCount(key) { return S.entries.filter(e => e.type === key).length; }
function renderSettings() {
  const y = cur.y, D = setDraft;
  const catRows = D.cats.map((c, i) => {
    const used = usedCount(c.key);
    const travelNote = c.key === 'travel' ? '<span>Coloured by who is travelling (see Colours)</span>' : '';
    const deducts = c.system
      ? (c.key === 'travel' ? '' : `<span>${c.deducts === 'al' ? 'Counts against annual leave' : c.deducts === 'remote' ? 'Counts against remote days' : 'Applies to both of you'}</span>`)
      : `<select data-ci="${i}" data-f="deducts" aria-label="Counts against"><option value="">Doesn't count against a balance</option><option value="al" ${c.deducts === 'al' ? 'selected' : ''}>Counts against annual leave</option><option value="remote" ${c.deducts === 'remote' ? 'selected' : ''}>Counts against remote days</option></select>
         <label class="tog" style="margin:0;font-size:12.5px"><input type="checkbox" data-ci="${i}" data-f="everyone" ${c.everyone ? 'checked' : ''}> Applies to both of us</label>`;
    const del = c.system ? '' : `<button class="x" data-act="delCat" data-ci="${i}" ${used ? `disabled title="Used by ${used} entr${used === 1 ? 'y' : 'ies'}"` : ''} aria-label="Delete ${esc(c.label)}">✕</button>`;
    return `<div class="crow"><input type="color" class="swatch" data-ci="${i}" data-f="color" value="${c.color}" aria-label="${esc(c.label)} colour" ${c.key === 'travel' ? 'disabled' : ''}>
      <input data-ci="${i}" data-f="label" maxlength="40" value="${esc(c.label)}" aria-label="Category name">${del || '<span></span>'}
      <div class="meta">${travelNote}${deducts}${used && !c.system ? `<span>Used by ${used} entr${used === 1 ? 'y' : 'ies'}</span>` : ''}</div></div>`;
  }).join('');
  openSheet(`<div class="sh"><h3>Settings</h3><button class="ic" data-act="close" aria-label="Close">✕</button></div>
  <div class="sect"><h4>${y} allowances</h4><div class="hint">Days per year. Switch year in the Year view to set other years.</div>
    <div class="sgrid"><span></span><span class="h">${esc(cat('al').label)}</span><span class="h">${esc(cat('remote').label)}</span>
    ${PEOPLE.map(p => `<div class="who">${av(p)}${p}</div>${['al', 'remote'].map(k => `<input inputmode="decimal" data-allow="${y}|${p}|${k}" value="${allow(y, p, k)}" aria-label="${p} ${k}">`).join('')}`).join('')}</div></div>
  <div class="sect"><h4>Colours</h4><div class="hint">Travel is coloured by who's going.</div>
    <div class="pgrid">${[['Muru', 'Muru'], ['Saral', 'Saral'], ['together', 'Together']].map(([k, l]) => `<label class="prow"><input type="color" class="swatch" data-col="${k}" value="${S.col[k]}">${l}</label>`).join('')}</div></div>
  <div class="sect"><h4>Categories</h4><div class="hint">Rename, recolour or add your own. A category in use can't be deleted.</div>
    <div id="catList">${catRows}</div>
    <button class="addcat" data-act="addCat">+ Add category</button></div>
  <div class="acts"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="saveSettings">Save</button></div>
  <div class="sect"><h4>Account</h4><div class="sub">Signed in as <b>${esc(MY_PERSON || '')}</b> · ${esc(MY_EMAIL)}</div>
    <button class="linkbtn" data-act="signout">Sign out</button></div>`);
}
function readSettingsInputs() {
  document.querySelectorAll('#sheet [data-ci]').forEach(el => {
    const c = setDraft.cats[+el.dataset.ci]; if (!c || !el.dataset.f) return;
    if (el.dataset.f === 'everyone') c.everyone = el.checked;
    else if (el.dataset.f === 'deducts') c.deducts = el.value || null;
    else c[el.dataset.f] = el.value;
  });
}
function newKey(lbl) {
  const base = (lbl || 'category').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'category';
  let k = /^[a-z]/.test(base) ? base : 'c_' + base, i = 2;
  while (setDraft.cats.some(c => c.key === k) || S.cats.some(c => c.key === k)) k = (base + '_' + i++).slice(0, 30);
  return k;
}

/* ---------- events ---------- */
async function run(fn, arg, msg) {
  const btn = document.querySelector('[data-act="save"],[data-act="saveSettings"]'); if (btn) btn.disabled = true;
  try { await api[fn](arg); closeSheet(); toast(msg); }
  catch (err) {
    const m = (err && (err.message || err.code)) || '';
    toast(/JWT|auth|42501|row-level/i.test(m) ? 'Your session ended. Sign in again.' : /foreign key|23503/i.test(m) ? 'That category is still in use.' : /check constraint|23514/i.test(m) ? 'Check the values and try again.' : 'Couldn\'t save. Check your connection and try again.');
    if (btn) btn.disabled = false;
  }
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-view],[data-day],[data-edit],[data-month],[data-who],[data-type],[data-p]'); if (!t) return;
  const a = t.dataset;
  if (a.view) { view = a.view; render(); return; }
  if (a.day) { daySheet(a.day); return; }
  if (a.edit) { const e = S.entries.find(x => x.id === a.edit); if (e) entrySheet(e); return; }
  if (a.month !== undefined) { cur.m = +a.month; view = 'month'; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (a.who) { who = a.who; render(); return; }
  if (a.type && draft) { draft.type = a.type; if (cat(a.type).everyone) draft.people = []; else if (!draft.people.length) draft.people = [MY_PERSON || 'Muru']; syncForm(); return; }
  if (a.p && draft) { draft.people = a.p === 'both' ? [...PEOPLE] : [a.p]; syncForm(); return; }
  switch (a.act) {
    case 'prev': cur.m--; if (cur.m < 0) { cur.m = 11; cur.y--; } render(); break;
    case 'next': cur.m++; if (cur.m > 11) { cur.m = 0; cur.y++; } render(); break;
    case 'prevY': cur.y--; render(); break;
    case 'nextY': cur.y++; render(); break;
    case 'today': cur = { y: t0.getUTCFullYear(), m: t0.getUTCMonth() }; view = 'month'; render(); scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'past': showPast = !showPast; render(); break;
    case 'add': entrySheet(null); break;
    case 'addOn': { const d = a.d; closeSheet(); setTimeout(() => { entrySheet(null); draft.start = draft.end = d; $('#fStart').value = $('#fEnd').value = d; syncForm(); }, 280); break; }
    case 'close': closeSheet(); break;
    case 'settings': settingsSheet(); break;
    case 'signout': closeSheet(); if (sb) sb.auth.signOut(); break;
    case 'addCat': readSettingsInputs(); setDraft.cats.push({ key: '', label: 'New category', color: '#8E7CC3', deducts: null, everyone: false, sort: Math.max(0, ...setDraft.cats.map(c => c.sort)) + 10, system: false, isNew: true }); renderSettings(); { const ins = document.querySelectorAll('#catList input[data-f="label"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } } break;
    case 'delCat': { readSettingsInputs(); const i = +a.ci, c = setDraft.cats[i]; if (!c || c.system || usedCount(c.key)) break; if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = '?'; t.title = 'Tap again to delete'; break; } if (!c.isNew) setDraft.removed.push(c.key); setDraft.cats.splice(i, 1); renderSettings(); break; }
    case 'del': if (!draft) break; if (t.dataset.armed) run('deleteEntry', draft.id, 'Deleted'); else { t.dataset.armed = '1'; t.textContent = 'Tap again to delete'; } break;
    case 'save': {
      const s = $('#fStart').value, e = $('#fEnd').value || s, c = cat(draft.type);
      if (!s) return toast('Pick a start date'); if (e < s) return toast('End date is before start');
      if (!c.everyone && !draft.people.length) return toast('Choose who');
      run('saveEntry', { id: draft.id || '', type: draft.type, people: c.everyone ? [] : draft.people, start: s, end: e, location: $('#fLoc').value.trim(), note: $('#fNote').value.trim(), daysOverride: c.deducts ? $('#fOv').value.trim() : '' }, 'Saved');
      break;
    }
    case 'saveSettings': {
      readSettingsInputs();
      const allowRows = [...document.querySelectorAll('#sheet [data-allow]')].map(i => { const [y, p, k] = i.dataset.allow.split('|'); return { year: +y, person: p, kind: k, days: Number(i.value) }; });
      if (allowRows.some(r => isNaN(r.days) || r.days < 0 || r.days > 366)) return toast('Allowances must be between 0 and 366');
      const col = {}; document.querySelectorAll('#sheet [data-col]').forEach(i => { if (i.value !== S.col[i.dataset.col]) col[i.dataset.col] = i.value.toUpperCase(); });
      const cats = [];
      for (const c of setDraft.cats) {
        const lbl = (c.label || '').trim(); if (!lbl) return toast('Every category needs a name');
        const key = c.key || newKey(lbl); c.key = key;
        const row = { key, label: lbl, color: (c.color || '#C8CBD2').toUpperCase(), deducts: c.deducts || null, everyone: !!c.everyone, sort: c.sort };
        const old = S.cats.find(x => x.key === key);
        if (!old || old.label !== row.label || old.color.toUpperCase() !== row.color || (old.deducts || null) !== row.deducts || !!old.everyone !== row.everyone) cats.push(row);
      }
      const allowChanged = allowRows.filter(r => allow(r.year, r.person, r.kind) !== r.days || S.allow[`${r.year}|${r.person}|${r.kind}`] === undefined);
      run('saveSettings', { allow: allowChanged, col, cats, removed: setDraft.removed }, 'Settings saved');
      break;
    }
  }
});
document.addEventListener('input', ev => {
  if (!draft) return; const id = ev.target.id;
  if (id === 'fStart' && ($('#fEnd').value < ev.target.value || !$('#fEnd').value)) $('#fEnd').value = ev.target.value;
  if (['fStart', 'fEnd', 'fOv'].includes(id)) syncForm();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });

/* ---------- sign-in ---------- */
let pendingEmail = '';
function signInScreen(msg) {
  $('.fab').hidden = true;
  $('#app').innerHTML = `<form class="auth card" id="authForm" novalidate><div class="status">Sign in</div>
  <p class="sub" style="font-size:14px;line-height:1.5;margin:0">Enter your email and we'll send you a 6-digit code.</p>
  <input type="email" id="authEmail" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(pendingEmail)}" required aria-label="Email">
  <div class="err" id="authErr">${esc(msg || '')}</div>
  <button class="btn pri" type="submit">Send code</button></form>`;
  $('#authForm').addEventListener('submit', ev => { ev.preventDefault(); sendCode(); });
}
async function sendCode() {
  const em = ($('#authEmail').value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { $('#authErr').textContent = 'Enter a valid email address.'; return; }
  const btn = $('#authForm button'); btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true, emailRedirectTo: location.origin } });
  if (error) {
    btn.disabled = false; btn.textContent = 'Send code';
    $('#authErr').textContent = /not allowed|Database error/i.test(error.message) ? 'This email isn\'t set up for the planner.' : /rate|seconds/i.test(error.message) ? 'Too many attempts. Wait a minute and try again.' : 'Couldn\'t send the code. Try again.';
    return;
  }
  pendingEmail = em;
  $('#app').innerHTML = `<form class="auth card" id="codeForm" novalidate><div class="status">Check your email</div>
  <p class="sub" style="font-size:14px;line-height:1.5;margin:0">We sent a code to <b>${esc(em)}</b>. Enter it below, or tap the link in the email.</p>
  <input id="authCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••" aria-label="Code">
  <div class="err" id="authErr"></div>
  <button class="btn pri" type="submit">Sign in</button><button class="linkbtn" type="button" data-act="restart">Use a different email</button></form>`;
  $('#codeForm').addEventListener('submit', ev => { ev.preventDefault(); verifyCode(); });
  $('#authCode').focus();
}
async function verifyCode() {
  const token = ($('#authCode').value || '').replace(/\D/g, '');
  if (token.length < 6) { $('#authErr').textContent = 'Enter the code from the email.'; return; }
  const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
  if (error) $('#authErr').textContent = 'That code didn\'t work or has expired. Request a new one.';
}
document.addEventListener('click', ev => { if (ev.target.closest('[data-act="restart"]')) signInScreen(); });

/* ---------- boot ---------- */
let channel = null, started = false;
async function startApp(session) {
  if (started) return; started = true; MY_EMAIL = (session.user.email || '').toLowerCase();
  $('#app').innerHTML = '<div class="load">Loading planner…</div>';
  const m = await sb.from('members').select('person,email');
  MY_PERSON = (m.data || []).find(r => r.email === MY_EMAIL)?.person || null;
  if (!MY_PERSON) { started = false; await sb.auth.signOut(); return; }
  $('.fab').hidden = false;
  try { await load(); } catch (e) { $('#app').innerHTML = '<div class="load">Can\'t reach the planner. Check your connection and reload.</div>'; }
  let t = null; const soon = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 250); };
  channel = sb.channel('planner');
  for (const table of ['entries', 'allowances', 'categories', 'colours']) channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
  channel.subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && started) soon(); });
}
async function boot() {
  if (window.__SEED) { // local preview with sample data
    let st = { entries: window.__SEED.map(x => ({ ...x })), allow: {}, cats: DEFAULT_CATS.map(c => ({ ...c })), col: { ...DEFAULT_COL } };
    MY_PERSON = 'Muru'; MY_EMAIL = 'preview';
    MOCK = {
      push() { S = JSON.parse(JSON.stringify(st)); lastSync = new Date(); paint(); },
      save(e) { e = { ...e, id: e.id || Math.random().toString(36).slice(2, 10) }; st.entries = st.entries.filter(x => x.id !== e.id).concat([e]); this.push(); },
      del(id) { st.entries = st.entries.filter(x => x.id !== id); this.push(); },
      settings(p) {
        for (const r of p.allow) st.allow[`${r.year}|${r.person}|${r.kind}`] = r.days;
        Object.assign(st.col, p.col);
        for (const r of p.cats) { const i = st.cats.findIndex(c => c.key === r.key); if (i >= 0) st.cats[i] = { ...st.cats[i], ...r, ...(st.cats[i].system ? { deducts: st.cats[i].deducts, everyone: st.cats[i].everyone } : {}) }; else st.cats.push({ ...r, system: false }); }
        st.cats = st.cats.filter(c => !p.removed.includes(c.key)).sort((a, b) => a.sort - b.sort);
        this.push();
      }
    };
    return MOCK.push();
  }
  if (!sb) { $('#app').innerHTML = '<div class="load">Couldn\'t load. Check your connection and reload.</div>'; return; }
  sb.auth.onAuthStateChange((ev, session) => {
    if (session) setTimeout(() => startApp(session), 0);
    else { started = false; MY_PERSON = null; if (channel) { sb.removeChannel(channel); channel = null; } signInScreen(); }
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) signInScreen();
}
boot();
