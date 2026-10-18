/* Quran Rush — fast-paced, tap-heavy Quran memorization. Plain JS, no build step.
   Full Quran: metadata in data/meta.js, ayah text lazy-loaded per surah from data/s/NNN.json. */
(() => {
'use strict';
const M = window.QMETA, SUR = M.surahs;          // SUR[i] = {id,name,meaning,arName,count,type}
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, Math.floor(s)); const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s % 60).padStart(2, '0'); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sm = sid => SUR[sid - 1];
const MODE_NAME = { rush: 'Word Rush', blitz: 'Next Ayah Blitz', catch: 'Missing Word Catch' };

/* ---------- Quran index: global numbers, Juz, hizb quarters ---------- */
const START = [0]; { let g = 1; SUR.forEach(s => { START[s.id] = g; g += s.count; }); }
const TOTAL = 6236;
const glob = (sid, n) => START[sid] + n - 1;
function refOf(g) { let lo = 1, hi = 114; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (START[mid] <= g) lo = mid; else hi = mid - 1; } return [lo, g - START[lo] + 1]; }
const JUZG = M.juz.map(r => glob(r[0], r[1])).concat([TOTAL + 1]);   // 31 entries
const HQG = M.hq.map(r => glob(r[0], r[1])).concat([TOTAL + 1]);     // 241 entries
const juzOf = (sid, n) => { const g = glob(sid, n); let j = 0; while (JUZG[j + 1] <= g) j++; return j + 1; };
const rangeRefs = (g1, g2) => { const out = []; for (let g = g1; g <= g2; g++) out.push(refOf(g)); return out; };
const juzRefs = j => rangeRefs(JUZG[j - 1], JUZG[j] - 1);
const refStr = r => r[0] + ':' + r[1];

/* ---------- lazy text loading ---------- */
const TXT = {}, LOADING = {};
function loadSurah(sid) {
  if (TXT[sid]) return Promise.resolve(TXT[sid]);
  if (!LOADING[sid]) LOADING[sid] = fetch('data/s/' + String(sid).padStart(3, '0') + '.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(rows => (TXT[sid] = rows)).catch(e => { delete LOADING[sid]; throw e; });
  return LOADING[sid];
}
function ensure(sids) { return Promise.all([...new Set(sids)].filter(x => x >= 1 && x <= 114).map(loadSurah)); }
const AY = new Map();
function ayah(sid, n) {
  const k = sid * 1000 + n; let a = AY.get(k);
  if (!a) { const r = TXT[sid][n - 1]; a = { sid, n, ar: r[0], tr: r[1], en: r[2], g: glob(sid, n), s: sm(sid) }; AY.set(k, a); }
  return a;
}

/* ---------- Arabic word handling ---------- */
const MARKS = /[\u06D6-\u06ED]/g;           // Quranic annotation / pause marks
const ONLY_MARKS = /^[\u06D6-\u06ED]+$/;
const DIAC = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
function splitWords(ar) {
  const out = [];
  for (const w of ar.split(/\s+/).filter(Boolean)) {
    if (ONLY_MARKS.test(w)) {
      if (w === '\u06DE') continue;               // rub al-hizb section sign: not part of a word
      if (out.length) out[out.length - 1].text += ' ' + w; // pause / sajda mark sticks to its word
      continue;
    }
    out.push({ text: w, key: w.replace(MARKS, '') });
  }
  return out;
}
const letters = k => k.replace(DIAC, '').length;
const wordCache = new Map();
const wordsOf = a => { if (!wordCache.has(a)) wordCache.set(a, splitWords(a.ar)); return wordCache.get(a); };

/* ---------- persistence (v1 saves remain valid; new fields are added) ---------- */
const KEY = 'quranRush.v1';
const P = Object.assign({ xp: 0, sound: true, audio: false, best: {}, mast: {}, mode: 'rush', pace: 1, plays: 0, cont: {}, sec: 10, tab: 'surah', jcN: 10, wirdPlayed: {} },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
['cont', 'wirdPlayed', 'best', 'mast'].forEach(k => { if (!P[k] || typeof P[k] !== 'object') P[k] = {}; });
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
const need = l => 80 + (l - 1) * 70;              // XP needed to go from level l to l+1
function levelInfo(xp) { let l = 1, x = xp; while (x >= need(l)) { x -= need(l); l++; } return { l, x, n: need(l) }; }
const MS = {};                                     // cached Sets of mastered ayahs per surah
function masteredSet(sid) { if (!MS[sid]) MS[sid] = new Set(P.mast[sid] || []); return MS[sid]; }
function addMastered(sid, n) { const s = masteredSet(sid); if (!s.has(n)) { s.add(n); P.mast[sid] = [...s]; } }
const isMast = r => masteredSet(r[0]).has(r[1]);
function fracMast(refs) { if (!refs.length) return 0; let k = 0; for (const r of refs) if (isMast(r)) k++; return k / refs.length; }
function starsOf(f) { return f >= 1 ? 3 : f >= 2 / 3 ? 2 : f >= 1 / 3 ? 1 : 0; }
function starsHtml(f) { const n = starsOf(f); return '<span class="stars">' + '★'.repeat(n) + '<span class="off">' + '★'.repeat(3 - n) + '</span></span>'; }
/* ---------- sound (generated chimes, no files) ---------- */
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568, 1760];
function tone(f, dur, type, vol, delay) {
  if (!P.sound) return; const c = ac(); if (!c) return;
  const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  hit(n) { const f = PENTA[Math.min(n, PENTA.length - 1)]; tone(f, 0.28, 'sine', 0.13); tone(f * 2, 0.18, 'sine', 0.03); },
  miss() { tone(165, 0.22, 'triangle', 0.12); tone(130, 0.25, 'sine', 0.08, 0.05); },
  win() { [0, 2, 4, 5, 7].forEach((i, k) => tone(PENTA[i], 0.4, 'sine', 0.1, k * 0.07)); },
  tick() { tone(1200, 0.05, 'square', 0.02); },
  go() { tone(784, 0.2, 'sine', 0.1); tone(1568, 0.25, 'sine', 0.05, 0.05); }
};

/* ---------- recitation (optional, streamed) ---------- */
let recAudio = null;
function playRecitation(ayah, onEnd) {
  stopRecitation();
  try {
    recAudio = new Audio('https://cdn.islamic.network/quran/audio/128/ar.alafasy/' + ayah.g + '.mp3');
    recAudio.addEventListener('ended', onEnd); recAudio.addEventListener('error', onEnd);
    const p = recAudio.play(); if (p && p.catch) p.catch(onEnd);
  } catch (e) { onEnd(); }
}
function stopRecitation() { if (recAudio) { try { recAudio.pause(); } catch (e) {} recAudio = null; } }

/* ---------- DOM refs ---------- */
const home = $('home'), game = $('game'), field = $('field'), prompt = $('prompt'), strip = $('pStrip');
const cv = $('fx'), cx = cv.getContext('2d');
let fw = 0, fh = 0, ftop = 0, DPR = 1;

/* ---------- HOME ---------- */
function renderProfile() {
  const li = levelInfo(P.xp);
  $('pLevel').textContent = li.l; $('pXpFill').style.width = (100 * li.x / li.n) + '%';
  $('pXpText').textContent = li.x + ' / ' + li.n + ' XP · total ' + P.xp;
  setTog($('togSound'), P.sound, '🔔 Chimes'); setTog($('togAudio'), P.audio, '🎧 Recitation');
}
function setTog(b, on, label) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = label + ': ' + (on ? 'On' : 'Off'); }
const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1').replace(/h$/, '');
const normAr = s => String(s).replace(DIAC, '').replace(/[ٱأإآ]/g, 'ا').replace(/^سورة\s*/, '').replace(/\s/g, '').replace(/^ال/, '');
const SURREFS = {}; const surRefs = sid => SURREFS[sid] || (SURREFS[sid] = rangeRefs(START[sid], START[sid] + sm(sid).count - 1));
function bestLine(key) {
  const b = P.best[key] || {}, parts = [];
  if (b.rush) parts.push('Rush ' + b.rush.score + (b.rush.time ? ' · ' + fmt(b.rush.time) : ''));
  if (b.blitz) parts.push('Blitz ' + b.blitz.score);
  if (b.catch) parts.push('Catch ' + b.catch.score + (b.catch.time ? ' · ' + fmt(b.catch.time) : ''));
  return parts.join(' | ');
}
function renderGrid() {
  const g = $('surahGrid'); g.innerHTML = '';
  const q = $('search').value.trim();
  let list = SUR, jump = null;
  const mref = q.match(/^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/);
  if (mref && +mref[1] >= 1 && +mref[1] <= 114) { jump = [+mref[1], Math.min(+mref[2] || 1, sm(+mref[1]).count)]; list = [sm(jump[0])]; }
  else if (q) {
    const nq = norm(q), aq = normAr(q), num = /^\d+$/.test(q) ? +q : 0;
    list = SUR.filter(s => num ? String(s.id).startsWith(q) : ((nq && (norm(s.name).includes(nq) || norm(s.meaning).includes(nq))) || (aq && normAr(s.arName).includes(aq))));
  }
  if (jump) {
    const el = document.createElement('button'); el.className = 'scard'; el.dataset.jump = refStr(jump);
    el.innerHTML = '<div class="sn">Jump to ayah</div><div class="sen">▶ Start at ' + refStr(jump) + '</div><div class="smean">' + esc(sm(jump[0]).name) + ', ' + P.sec + ' ayahs from ayah ' + jump[1] + '</div>';
    el.addEventListener('click', () => { const s = sm(jump[0]); const to = Math.min(s.count, jump[1] + P.sec - 1); playSurahRange(jump[0], jump[1], to); });
    g.appendChild(el);
  }
  if (!list.length) { g.innerHTML = '<p class="hintp">No surah matches “' + esc(q) + '”.</p>'; return; }
  const frag = document.createDocumentFragment();
  list.forEach(s => {
    const m = masteredSet(s.id).size, f = m / s.count, line = bestLine(s.id), c = P.cont[s.id];
    const el = document.createElement('button');
    el.className = 'scard'; el.dataset.sid = s.id;
    el.innerHTML = (c && c > 1 && c <= s.count ? '<span class="cont">↻ ' + s.id + ':' + c + '</span>' : '') +
      '<div class="sn">' + s.id + ' · ' + s.count + ' ayahs · Juz ' + juzOf(s.id, 1) + '</div><div class="sar">' + esc(s.arName.replace(/^سُورَةُ\s*/, '')) +
      '</div><div class="sen">' + esc(s.name) + ' ' + starsHtml(f) + '</div><div class="smean">' + esc(s.meaning) + '</div><div class="sbar"><i style="width:' +
      (100 * f) + '%"></i></div><div class="sbest">' + esc(line || (m ? m + ' / ' + s.count + ' mastered' : 'Not played yet')) + '</div>';
    el.addEventListener('click', () => { ac(); openSurah(s.id); });
    frag.appendChild(el);
  });
  g.appendChild(frag);
}
function juzCard(j, extra) {
  const r = M.juz[j - 1], f = fracMast(juzRefs(j)), el = document.createElement('button');
  el.className = 'scard jcard'; el.dataset.juz = j;
  el.innerHTML = '<div class="sn">Juz</div><div class="jn">' + j + ' ' + starsHtml(f) + '</div><div class="smean">from ' + esc(sm(r[0]).name) + ' ' + refStr(r) +
    '</div><div class="sbar"><i style="width:' + (100 * f) + '%"></i></div><div class="sbest">' + esc(extra || '') + '</div>';
  return el;
}
function renderJuz() {
  const g = $('juzGrid'); g.innerHTML = '';
  for (let j = 1; j <= 30; j++) { const el = juzCard(j, bestLine('j' + j)); el.addEventListener('click', () => { ac(); openJuz(j); }); g.appendChild(el); }
  const c = $('jcGrid'); c.innerHTML = '';
  document.querySelectorAll('#jcCount button').forEach(b => b.classList.toggle('sel', +b.dataset.n === P.jcN));
  for (let j = 1; j <= 30; j++) { const el = juzCard(j, bestLine('jc' + j) || '🎲 random ' + P.jcN); el.addEventListener('click', () => { ac(); playJuzChallenge(j); }); c.appendChild(el); }
}
function setTab(t) {
  P.tab = t; save();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === t));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'tab-' + t));
  if (t === 'wird') renderWird(); if (t === 'juz' || t === 'jc') renderJuz();
}
function renderHome() {
  renderProfile(); renderGrid();
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('sel', b.dataset.mode === P.mode));
  document.querySelectorAll('#pace button').forEach(b => b.classList.toggle('sel', +b.dataset.pace === P.pace));
  setTab(P.tab || 'surah');
}
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => { P.mode = b.dataset.mode; save(); document.querySelectorAll('.mode').forEach(x => x.classList.toggle('sel', x === b)); sfx.tick(); }));
document.querySelectorAll('#pace button').forEach(b => b.addEventListener('click', () => { P.pace = +b.dataset.pace; save(); document.querySelectorAll('#pace button').forEach(x => x.classList.toggle('sel', x === b)); sfx.tick(); }));
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { setTab(b.dataset.tab); sfx.tick(); }));
document.querySelectorAll('#jcCount button').forEach(b => b.addEventListener('click', () => { P.jcN = +b.dataset.n; save(); renderJuz(); }));
$('search').addEventListener('input', renderGrid);
$('togSound').addEventListener('click', () => { P.sound = !P.sound; save(); renderProfile(); sfx.tick(); });
$('togAudio').addEventListener('click', () => { P.audio = !P.audio; save(); renderProfile(); });

/* ---------- section picker sheet ---------- */
function openSheet(title, sub, html) { $('shTitle').textContent = title; $('shSub').textContent = sub; $('shBody').innerHTML = html; $('sheetOv').classList.add('on'); }
const closeSheet = () => $('sheetOv').classList.remove('on');
$('sheetX').addEventListener('click', closeSheet);
$('sheetOv').addEventListener('click', e => { if (e.target === $('sheetOv')) closeSheet(); });
function chunk(refs, size) { const out = []; for (let i = 0; i < refs.length; i += size) out.push(refs.slice(i, i + size)); return out; }
function secLabel(sec) { const a = sec[0], b = sec[sec.length - 1]; return a[0] === b[0] ? (a[1] === b[1] ? refStr(a) : a[0] + ':' + a[1] + '–' + b[1]) : refStr(a) + '–' + refStr(b); }
function sizeChips() { return '<div class="shrow chips" id="shSize"><span class="lbl">Section size:</span>' + [5, 10, 20].map(n => '<button data-n="' + n + '"' + (P.sec === n ? ' class="sel"' : '') + '>' + n + '</button>').join('') + '</div>'; }
function secGridHtml(secs, curRef) {
  return '<div class="secgrid">' + secs.map((sec, i) => '<button class="sec' + (curRef && sec.some(r => r[0] === curRef[0] && r[1] === curRef[1]) ? ' cur' : '') + '" data-i="' + i + '"><b>' + esc(secLabel(sec)) + '</b>' + starsHtml(fracMast(sec)) + '</button>').join('') + '</div>';
}
function bindSecs(secs, mk) {
  document.querySelectorAll('#shBody .sec').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.i; closeSheet(); mk(secs, i); }));
}
function openSurah(sid, keepSheet) {
  const s = sm(sid), refs = surRefs(sid);
  if (s.count <= 10 && !keepSheet) return startGame(P.mode, { kind: 'surah', sid, refs, whole: true, label: s.name });
  const secs = chunk(refs, P.sec), c = P.cont[sid];
  let html = '<div class="shrow">';
  if (c && c > 1 && c <= s.count) html += '<button class="big" id="shCont">↻ Continue from ' + sid + ':' + c + '</button>';
  html += '<button class="' + (c > 1 ? 'ghost' : 'big') + '" id="shWhole">Whole surah · ' + s.count + ' ayahs</button></div>';
  html += sizeChips() + '<div class="h3">Sections</div>' + secGridHtml(secs, c ? [sid, c] : null);
  html += '<div class="h3">Custom range</div><div class="shrow custom">Ayah <input type="number" id="shFrom" min="1" max="' + s.count + '" value="' + (c || 1) + '"> to <input type="number" id="shTo" min="1" max="' + s.count + '" value="' + Math.min(s.count, (c || 1) + P.sec - 1) + '"><button class="ghost" id="shGo">▶ Start</button></div>';
  openSheet(s.id + '. ' + s.name, s.meaning + ' · ' + s.count + ' ayahs · ' + Math.round(100 * fracMast(refs)) + '% mastered · ' + MODE_NAME[P.mode], html);
  if ($('shCont')) $('shCont').addEventListener('click', () => { closeSheet(); playSurahRange(sid, c, Math.min(s.count, c + P.sec - 1)); });
  $('shWhole').addEventListener('click', () => { closeSheet(); startGame(P.mode, { kind: 'surah', sid, refs, whole: true, label: s.name }); });
  $('shGo').addEventListener('click', () => {
    let a = Math.max(1, Math.min(s.count, +$('shFrom').value || 1)), b = Math.max(1, Math.min(s.count, +$('shTo').value || a)); if (b < a) [a, b] = [b, a];
    closeSheet(); playSurahRange(sid, a, b);
  });
  document.querySelectorAll('#shSize button').forEach(b => b.addEventListener('click', () => { P.sec = +b.dataset.n; save(); openSurah(sid, true); }));
  bindSecs(secs, (secs2, i) => startGame(P.mode, { kind: 'surah', sid, refs: secs2[i], secs: secs2, si: i, label: s.name + ' ' + secLabel(secs2[i]) }));
}
function playSurahRange(sid, a, b) {
  const s = sm(sid), refs = surRefs(sid).slice(a - 1, b), secs = chunk(surRefs(sid).slice(b), P.sec);
  // "next section" continues after this custom range in chunks of the chosen size
  startGame(P.mode, { kind: 'surah', sid, refs, whole: a === 1 && b === s.count, label: s.name + ' ' + sid + ':' + a + (b > a ? '–' + b : ''), secs: [refs].concat(secs), si: 0 });
}
function openJuz(j) {
  const secs = [];
  for (let q = (j - 1) * 8; q < j * 8; q++) secs.push(rangeRefs(HQG[q], HQG[q + 1] - 1));
  const refs = juzRefs(j);
  let html = '<div class="shrow"><button class="ghost" id="shWhole">Whole Juz · ' + refs.length + ' ayahs</button></div><div class="h3">Hizb quarters (rubʿ)</div>' +
    '<div class="secgrid">' + secs.map((sec, i) => '<button class="sec" data-i="' + i + '"><small>Hizb ' + (2 * j - 1 + (i >> 2)) + ' · ' + ['¼', '½', '¾', '1'][i & 3] + '</small><b>' + esc(secLabel(sec)) + '</b>' + starsHtml(fracMast(sec)) + ' <small>' + sec.length + '</small></button>').join('') + '</div>';
  openSheet('Juz ' + j, 'From ' + sm(M.juz[j - 1][0]).name + ' ' + refStr(M.juz[j - 1]) + ' · ' + refs.length + ' ayahs · ' + Math.round(100 * fracMast(refs)) + '% mastered · ' + MODE_NAME[P.mode], html);
  $('shWhole').addEventListener('click', () => { closeSheet(); startGame(P.mode, { kind: 'juz', juz: j, refs, label: 'Juz ' + j }); });
  bindSecs(secs, (s2, i) => startGame(P.mode, { kind: 'juz', juz: j, refs: s2[i], secs: s2, si: i, label: 'Juz ' + j + ' · ' + secLabel(s2[i]) }));
}
function playJuzChallenge(j) {
  const refs = shuffle(juzRefs(j).slice()).slice(0, P.jcN);
  startGame(P.mode, { kind: 'jc', juz: j, refs, label: '🎲 Juz ' + j + ' Challenge', random: true });
}
/* ---------- My Daily Wird: ayahs logged in Quran Recorder ---------- */
const REC_KEY = 'quranRecorder.logs.v1';                 // Quran Recorder's localStorage key (same github.io origin)
const REC_REPO = 'mrbugimposter3-ship-it/quran-recorder';
const REC_URL = 'https://mrbugimposter3-ship-it.github.io/quran-recorder/';
const WCACHE = 'quranRush.wirdCache.v1';
const W = { loaded: false, loading: null, days: {}, src: { local: 0, repo: 0, cache: 0 }, err: '' };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function addEntries(date, entries, srcName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(entries)) return;
  const day = W.days[date] || (W.days[date] = new Map());
  let added = 0;
  for (const e of entries) {
    if (!e || (e.type !== 'ayah-stamp' && e.type !== 'recitation')) continue;   // kalima stamps have no ayah
    const sid = +e.surah, n = +e.ayah;
    if (!(sid >= 1 && sid <= 114 && n >= 1 && n <= sm(sid).count)) continue;
    const id = e.id || (e.ts + ':' + sid + ':' + n);
    if (!day.has(id)) { day.set(id, { sid, n, ts: e.ts || '' }); added++; }
  }
  W.src[srcName] += added;
}
async function fetchRepoLogs() {
  const r = await fetch('https://api.github.com/repos/' + REC_REPO + '/contents/logs', { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub API ' + r.status);
  const files = (await r.json()).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f.name));
  const out = {};
  await Promise.all(files.map(async f => {
    const url = f.download_url || ('https://raw.githubusercontent.com/' + REC_REPO + '/main/logs/' + f.name);
    const x = await fetch(url, { cache: 'no-cache' }); if (!x.ok) return;
    const j = await x.json(); out[j.date || f.name.slice(0, 10)] = j.entries || [];
  }));
  return out;
}
function loadWird(force) {
  if (W.loading && !force) return W.loading;
  W.days = {}; W.src = { local: 0, repo: 0, cache: 0 }; W.err = '';
  W.loading = (async () => {
    try { const L = JSON.parse(localStorage.getItem(REC_KEY) || '{}'); for (const d in L) addEntries(d, L[d], 'local'); } catch (e) {}
    try {
      const repo = await fetchRepoLogs();
      for (const d in repo) addEntries(d, repo[d], 'repo');
      try { localStorage.setItem(WCACHE, JSON.stringify({ at: Date.now(), days: repo })); } catch (e) {}
    } catch (e) {
      W.err = String(e.message || e);
      try { const C = JSON.parse(localStorage.getItem(WCACHE) || 'null'); if (C) for (const d in C.days) addEntries(d, C.days[d], 'cache'); } catch (e2) {}
    }
    W.loaded = true;
  })();
  return W.loading;
}
function wirdRefs(dates) {
  const seen = new Set(), out = [];
  for (const d of dates) for (const e of (W.days[d] || new Map()).values()) { const k = e.sid * 1000 + e.n; if (!seen.has(k)) { seen.add(k); out.push([e.sid, e.n]); } }
  return out.sort((a, b) => glob(a[0], a[1]) - glob(b[0], b[1]));
}
const loggedDates = () => Object.keys(W.days).filter(d => W.days[d].size).sort();
function lastNDates(n) { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { out.push(dayKey(d)); d.setDate(d.getDate() - 1); } return out; }
function streakInfo() {
  const has = d => W.days[d] && W.days[d].size;
  const d = new Date(); if (!has(dayKey(d))) d.setDate(d.getDate() - 1);
  let cur = 0; while (has(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
  const ds = loggedDates(); let best = 0, run = 0, prev = null;
  for (const k of ds) { const t = new Date(k + 'T12:00:00'); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return { cur, best };
}
async function renderWird() {
  const box = $('wirdBox');
  if (!W.loaded) { box.innerHTML = '<p class="hintp">Loading your Quran Recorder logs…</p>'; await loadWird(); if (P.tab !== 'wird') return; }
  const dates = loggedDates();
  const srcTxt = 'Sources: this browser ' + (W.src.local ? '✓ ' + W.src.local + ' entries' : '— none') + ' · GitHub logs ' +
    (W.src.repo ? '✓ ' + W.src.repo + ' new entries' : W.err ? '✗ (' + esc(W.err) + ')' + (W.src.cache ? ' · cached copy ' + W.src.cache : '') : '— none') +
    ' · <a href="#" id="wReload" style="color:var(--gold)">reload</a>';
  if (!dates.length) {
    box.innerHTML = '<div class="wsrc">' + srcTxt + '</div><div class="panel" style="max-width:none;text-align:left"><h2>No wird logged yet</h2><p class="hintp">Log the ayahs you recite each day in <a href="' + REC_URL + '" target="_blank" rel="noopener" style="color:var(--gold)">Quran Recorder</a> (⏱ timestamp or record an ayah). They will appear here so you can drill exactly those ayahs.</p><a class="big" style="text-decoration:none" href="' + REC_URL + '" target="_blank" rel="noopener">Open Quran Recorder ↗</a></div>';
    $('wReload').addEventListener('click', e => { e.preventDefault(); W.loaded = false; loadWird(true).then(renderWird); });
    return;
  }
  const today = dayKey(), tRefs = wirdRefs([today]), w7 = wirdRefs(lastNDates(7)), all = wirdRefs(dates), st = streakInfo();
  const opt = (id, title, refs, sub) => '<button class="wopt" id="' + id + '"' + (refs.length ? '' : ' disabled style="opacity:.5"') + '><b>' + title + ' ' + (refs.length ? starsHtml(fracMast(refs)) : '') + '</b><span>' + (refs.length ? refs.length + ' ayahs · ' + Math.round(100 * fracMast(refs)) + '% mastered' : sub) + '</span></button>';
  let html = '<div class="wsrc">' + srcTxt + '</div>';
  html += '<div class="streak"><div>🔥 Logging streak <b>' + st.cur + '</b> day' + (st.cur === 1 ? '' : 's') + '</div><div>Best <b>' + st.best + '</b></div><div>Days logged <b>' + dates.length + '</b></div><div>Unique ayahs <b>' + all.length + '</b></div></div>';
  html += '<div class="wopts">' + opt('wToday', '☀️ Today', tRefs, 'Nothing logged today yet') + opt('w7', '📅 Last 7 days', w7, 'Nothing in the last 7 days') + opt('wAll', '📚 All logged', all, '') +
    '<div class="wopt"><b>🗓 A specific date</b><select id="wDate">' + dates.slice().reverse().map(d => '<option value="' + d + '">' + d + ' · ' + wirdRefs([d]).length + ' ayahs</option>').join('') + '</select><button class="ghost" id="wDateGo" style="width:100%;margin-top:6px">▶ Practise this day</button></div></div>';
  // calendar: last 5 weeks, Monday-first
  const end = new Date(); const startD = new Date(end); startD.setDate(end.getDate() - 34);
  while ((startD.getDay() + 6) % 7 !== 0) startD.setDate(startD.getDate() - 1);
  html += '<div class="h3">Streak calendar · green = ayahs logged · gold ring = practised here · ★ = day mastery</div><div class="cal">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => '<div class="dow">' + x + '</div>').join('');
  for (const d = new Date(startD); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d), refs = wirdRefs([k]), n = refs.length, lv = n ? (n >= 100 ? 3 : n >= 30 ? 2 : 1) : 0, s = n ? starsOf(fracMast(refs)) : 0;
    html += '<div class="d' + (lv ? ' l' + lv : '') + (P.wirdPlayed[k] ? ' played' : '') + (k === today ? ' today' : '') + '"' + (n ? ' data-date="' + k + '" title="' + k + ': ' + n + ' ayahs"' : ' title="' + k + '"') + '>' + (d.getDate() === 1 ? d.toLocaleString('en', { month: 'short' }) + ' 1' : d.getDate()) + (n ? '<span class="st">' + '★'.repeat(s) + (s ? '' : n) + '</span>' : '') + '</div>';
  }
  html += '</div><div class="h3">Per-day mastery</div><div class="daylist">' + dates.slice().reverse().map(d => { const r = wirdRefs([d]); return '<button class="wopt" data-date="' + d + '"><b>' + d + ' ' + starsHtml(fracMast(r)) + '</b><span>' + r.length + ' ayahs · ' + Math.round(100 * fracMast(r)) + '% mastered' + (P.wirdPlayed[d] ? ' · practised' : '') + '</span></button>'; }).join('') + '</div>';
  box.innerHTML = html;
  $('wReload').addEventListener('click', e => { e.preventDefault(); W.loaded = false; loadWird(true).then(renderWird); });
  $('wToday').addEventListener('click', () => tRefs.length && openWird('Today (' + today + ')', tRefs, [today]));
  $('w7').addEventListener('click', () => w7.length && openWird('Last 7 days', w7, lastNDates(7)));
  $('wAll').addEventListener('click', () => openWird('All logged ayahs', all, dates));
  $('wDateGo').addEventListener('click', () => { const d = $('wDate').value; openWird(d, wirdRefs([d]), [d]); });
  box.querySelectorAll('[data-date]').forEach(el => el.addEventListener('click', () => { const d = el.dataset.date; openWird(d, wirdRefs([d]), [d]); }));
}
function openWird(title, refs, dates, keep) {
  if (!refs.length) return;
  const mk = (secs, i) => startGame(P.mode, { kind: 'wird', dates, refs: secs[i], secs, si: i, label: '📿 Wird ' + title + (secs.length > 1 ? ' · set ' + (i + 1) + '/' + secs.length : '') });
  if (refs.length <= P.sec && !keep) return mk([refs], 0);
  const secs = chunk(refs, P.sec);
  openSheet('📿 ' + title, refs.length + ' logged ayahs · ' + Math.round(100 * fracMast(refs)) + '% mastered · ' + MODE_NAME[P.mode],
    '<div class="shrow"><button class="big" id="shAllW">▶ Play all ' + refs.length + ' in sets of ' + P.sec + '</button></div>' + sizeChips() + '<div class="h3">Sets (mushaf order)</div>' + secGridHtml(secs));
  $('shAllW').addEventListener('click', () => { closeSheet(); const firstOpen = Math.max(0, secs.findIndex(s => fracMast(s) < 1)); mk(secs, firstOpen); });
  document.querySelectorAll('#shSize button').forEach(b => b.addEventListener('click', () => { P.sec = +b.dataset.n; save(); openWird(title, refs, dates, true); }));
  bindSecs(secs, mk);
}
/* ---------- GAME STATE ---------- */
let G = null;
const objs = [];          // moving tiles / orbs / cards
const parts = [];         // particles
function show(screen) { [home, game].forEach(s => s.classList.toggle('active', s === screen)); }
const srcKey = src => src.kind === 'surah' ? String(src.sid) : src.kind === 'juz' ? 'j' + src.juz : src.kind === 'jc' ? 'jc' + src.juz : 'wird';
let startToken = 0;
async function startGame(mode, src) {
  const tok = ++startToken;
  if (src.random && src.kind === 'jc' && src.redraw) src.refs = shuffle(juzRefs(src.juz).slice()).slice(0, P.jcN);
  const need = src.refs.map(r => r[0]);
  if (mode === 'blitz') src.refs.forEach(r => { need.push(r[0] - 1, r[0] + 1); });
  need.push(1);
  const lo = $('loadOv'); const t = setTimeout(() => lo.classList.add('on'), 120);
  try { await ensure(need); }
  catch (e) { clearTimeout(t); $('loadTxt').textContent = 'Could not load ayahs (' + e.message + '). Check your connection and try again.'; lo.classList.add('on'); setTimeout(() => { lo.classList.remove('on'); $('loadTxt').textContent = 'Loading ayahs…'; }, 2600); return; }
  clearTimeout(t); lo.classList.remove('on');
  if (tok !== startToken) return;
  const items = src.refs.map(r => ayah(r[0], r[1]));
  G = { mode, src, items, lvl: P.pace || 1, score: 0, combo: 0, maxCombo: 0, hearts: 3, right: 0, wrong: 0,
    taps: 0, elapsed: 0, qMax: 1, qLeft: 1, phase: 'count', paused: false, idx: 0, done: 0, lastTap: 0, lastPrompt: -1, ayahsDone: 0 };
  G.ayah = items[0]; G.s = G.ayah.s;
  clearObjs(); parts.length = 0;
  show(game); closeOv(); resize();
  $('hSurah').textContent = src.label + ' · ' + MODE_NAME[mode];
  if (mode === 'blitz') { G.qMax = G.qLeft = 60; }
  hud(); setCombo();
  strip.innerHTML = ''; $('pEn').textContent = ''; $('pMeta').textContent = 'Get ready…';
  countdown(() => nextQ());
}
function countdown(cb) {
  const el = $('countdown'); el.classList.add('on'); let n = 3;
  const g0 = G;
  const step = () => {
    if (G !== g0) return;
    if (n === 0) { el.innerHTML = '<b>GO!</b>'; sfx.go(); setTimeout(() => { el.classList.remove('on'); if (G === g0) cb(); }, 450); return; }
    el.innerHTML = '<b>' + n + '</b>'; sfx.tick(); n--; setTimeout(step, 520);
  };
  step();
}
function hud() {
  $('hScore').textContent = G.score.toLocaleString();
  $('hLvl').textContent = G.lvl;
  $('hClock').textContent = fmt(G.elapsed);
  $('hHearts').textContent = G.mode === 'blitz' ? '' : '💚'.repeat(G.hearts) + '🤍'.repeat(Math.max(0, 3 - G.hearts));
  const f = Math.max(0, G.qLeft / G.qMax);
  $('hTime').style.transform = 'scaleX(' + f + ')';
  $('hTime').parentNode.classList.toggle('low', f < 0.25 && G.phase === 'play');
}
const mult = () => G.mode === 'blitz' ? 1 + Math.floor(G.combo / 3) : Math.min(8, 1 + Math.floor(G.combo / 5));
function setCombo(bump) {
  const c = $('combo'); c.classList.toggle('on', G.combo >= 3);
  $('comboN').textContent = '×' + mult(); $('comboTxt').textContent = G.combo + ' STREAK';
  if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}
function layoutField() {
  const r = prompt.getBoundingClientRect();
  ftop = Math.ceil(r.bottom + 4);
  field.style.top = ftop + 'px';
  fw = field.clientWidth; fh = Math.max(120, game.clientHeight - ftop);
  if (innerWidth > 600) $('combo').style.top = (ftop + 6) + 'px'; else $('combo').style.top = '';
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = game.clientWidth * DPR; cv.height = game.clientHeight * DPR;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G) layoutField();
}
addEventListener('resize', resize);
/* ---------- objects ---------- */
function clearObjs() { objs.forEach(o => o.el.remove()); objs.length = 0; field.innerHTML = ''; }
function addObj(el, o) {
  field.appendChild(el);
  o.el = el; o.w = el.offsetWidth; o.h = el.offsetHeight; o.state = 'live';
  el.addEventListener('pointerdown', e => { e.preventDefault(); onTap(o, e); });
  objs.push(o); return o;
}
function place(o) {
  // choose a spot that overlaps the fewest existing objects
  let best = null, bestScore = 1e9;
  for (let k = 0; k < 24; k++) {
    const x = rand(4, Math.max(5, fw - o.w - 4)), y = rand(4, Math.max(5, fh - o.h - 4));
    let sc = 0;
    for (const p of objs) if (p !== o && p.state === 'live') {
      const ox = Math.max(0, Math.min(x + o.w, p.x + p.w) - Math.max(x, p.x)), oy = Math.max(0, Math.min(y + o.h, p.y + p.h) - Math.max(y, p.y));
      sc += ox * oy;
    }
    if (sc < bestScore) { bestScore = sc; best = [x, y]; if (sc === 0) break; }
  }
  o.x = best[0]; o.y = best[1];
}
const speed = () => Math.min(170, 16 + G.lvl * 10);
function makeTile(w, extra) {
  const el = document.createElement('div'); el.className = 'tile ar'; el.textContent = w.text; el.dataset.key = w.key;
  const o = addObj(el, Object.assign({ kind: 'tile', key: w.key, text: w.text }, extra || {}));
  place(o); const a = rand(0, Math.PI * 2), v = speed() * rand(0.6, 1.15);
  o.vx = Math.cos(a) * v; o.vy = Math.sin(a) * v; o.spawn = 0;
  return o;
}
function collect(o, tx, ty) { o.state = 'got'; o.gt = 0; o.sx = o.x; o.sy = o.y; o.tx = tx; o.ty = ty; o.el.classList.add('got'); }

/* ---------- particles (soft glow sparkles, no explosions) ---------- */
function sparkle(x, y, n, gold) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(30, 170);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0, max: rand(0.5, 1.0), r: rand(2, 5),
      c: gold === false ? '255,140,140' : (Math.random() < 0.6 ? '255,226,150' : '120,255,200') });
  }
}
function ring(x, y) { parts.push({ ring: true, x, y, life: 0, max: 0.5, r: 10, c: '255,226,150' }); }
function floater(x, y, txt, bad) {
  const f = document.createElement('div'); f.className = 'floater' + (bad ? ' bad' : ''); f.textContent = txt;
  f.style.left = x + 'px'; f.style.top = (y - 20) + 'px'; game.appendChild(f); setTimeout(() => f.remove(), 950);
}
function shake() { game.classList.remove('shake'); void game.offsetWidth; game.classList.add('shake'); }

/* ---------- question flow ---------- */
function nextQ() {
  if (!G) return;
  clearObjs(); G.phase = 'play'; G.lastTap = G.elapsed;
  ({ rush: qRush, blitz: qBlitz, catch: qCatch })[G.mode]();
  hud();
}
function pf() { return Math.max(0.42, 1 - 0.055 * (G.lvl - 1)); }   // time pressure factor
const LONG = 16;                                                    // ayahs longer than this get a windowed prompt
const trunc = (t, n) => t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + ' …' : t;
function metaLine(a, what) { return a.s.name + ' ' + a.sid + ':' + a.n + (G.items.length > 1 ? ' · ' + (G.idx + 1) + ' / ' + G.items.length : '') + ' · ' + what; }
// neighbouring ayahs of the same surah (for decoys), always loaded with the surah
function neighbours(a, span) { const out = []; for (let n = Math.max(1, a.n - span); n <= Math.min(a.s.count, a.n + span); n++) if (n !== a.n) out.push(ayah(a.sid, n)); return out; }
function decoyWords(a, exclude, nd) {
  const pool = [];
  neighbours(a, 15).forEach(b => wordsOf(b).forEach(w => { if (!exclude.has(w.key) && letters(w.key) >= 2) pool.push(w); }));
  if (pool.length < nd * 3) for (let n = 1; n <= 7; n++) wordsOf(ayah(1, n)).forEach(w => { if (!exclude.has(w.key)) pool.push(w); });
  shuffle(pool); const used = new Set(), out = [];
  for (const w of pool) { if (out.length >= nd) break; if (used.has(w.key)) continue; used.add(w.key); out.push(w); }
  return out;
}

/* --- Word Rush --- */
function qRush() {
  const a = G.items[G.idx]; G.ayah = a; G.s = a.s; G.words = wordsOf(a); G.pos = 0; G.chunkStart = 0;
  G.chunk = fw < 600 ? 5 : 7;
  const waves = Math.ceil(G.words.length / G.chunk);
  $('pMeta').textContent = metaLine(a, waves > 1 ? 'long ayah · ' + waves + ' waves · tap in order (right → left)' : 'tap words in order (right → left)');
  $('pEn').textContent = trunc(a.en, G.words.length > LONG ? 160 : 400);
  strip.className = 'pstrip ar';
  renderRushStrip(); layoutField(); spawnChunk();
}
function renderRushStrip() {
  const W = G.words, n = W.length;
  let from = 0, to = n;
  if (n > LONG) { from = Math.max(0, G.chunkStart - 4); to = Math.min(n, Math.max(G.chunkEnd || 0, G.chunkStart + G.chunk)); }
  let h = from > 0 ? '<span class="w slot">…</span> ' : '';
  for (let i = from; i < to; i++) h += (i < G.pos ? '<span class="w got" data-i="' + i + '">' + esc(W[i].text) + '</span>' : '<span class="w slot' + (i === G.pos ? ' next' : '') + '" data-i="' + i + '">◌</span>') + ' ';
  if (to < n) h += '<span class="w slot">…</span>';
  strip.innerHTML = h;
}
function spawnChunk() {
  objs.filter(o => o.state === 'live').forEach(o => { o.el.remove(); o.state = 'dead'; });
  const end = Math.min(G.words.length, G.chunkStart + G.chunk);
  G.chunkEnd = end;
  // timer is per wave, so very long ayahs (e.g. 2:282) stay playable
  G.qMax = G.qLeft = (3.5 + 2.1 * (end - G.chunkStart)) * pf();
  const waves = Math.ceil(G.words.length / G.chunk);
  if (waves > 1) $('pMeta').textContent = metaLine(G.ayah, 'long ayah · wave ' + (Math.floor(G.chunkStart / G.chunk) + 1) + ' / ' + waves + ' · words ' + (G.chunkStart + 1) + '–' + end + ' of ' + G.words.length);
  renderRushStrip();
  for (let i = G.chunkStart; i < end; i++) makeTile(G.words[i], { ok: true });
  const nd = G.lvl >= 3 ? Math.min(G.lvl - 2, fw < 600 ? 3 : 5) : 0;
  if (nd) decoyWords(G.ayah, new Set(G.words.map(w => w.key)), nd).forEach(w => makeTile(w, { ok: false }));
}

/* --- Next Ayah Blitz --- */
function blitzPairs() {
  if (G.bpairs) return G.bpairs;
  const pr = [];
  G.items.forEach(a => { if (a.n < a.s.count) pr.push([a, ayah(a.sid, a.n + 1)]); else if (a.n > 1) pr.push([ayah(a.sid, a.n - 1), a]); });
  if (!pr.length) pr.push([ayah(1, 1), ayah(1, 2)]);
  return (G.bpairs = pr);
}
function preview(a, k) { const w = wordsOf(a); return w.slice(0, k).map(x => x.text).join(' ') + (w.length > k ? ' …' : ''); }
function qBlitz() {
  const pairs = blitzPairs();
  let i; do { i = (Math.random() * pairs.length) | 0; } while (pairs.length > 1 && i === G.lastPrompt);
  G.lastPrompt = i;
  const [cur, ans] = pairs[i]; G.ayah = ans; G.s = ans.s;
  let pool = neighbours(ans, 8).filter(b => b !== cur);
  shuffle(pool); pool.sort((a, b) => Math.abs(a.n - ans.n) - Math.abs(b.n - ans.n)); pool = shuffle(pool.slice(0, 6));
  [ans.sid + 1, ans.sid - 1, 1].forEach(sid => { if (pool.length < 6 && TXT[sid]) for (let n = 1; n <= Math.min(4, sm(sid).count); n++) { const b = ayah(sid, n); if (b !== ans && b !== cur) pool.push(b); } });
  // show enough words that every option is distinguishable
  const base = fw < 600 ? 4 : 6; let k = base, dec = [];
  for (; k <= 14; k++) {
    const seen = new Set([preview(ans, k)]); dec = [];
    for (const b of pool) { const p = preview(b, k); if (!seen.has(p)) { seen.add(p); dec.push(b); } if (dec.length === 3) break; }
    if (dec.length === 3 && pool.slice(0, 3).every(b => dec.includes(b))) break;
    if (k === 14) break;
  }
  const cw = wordsOf(cur);
  $('pMeta').textContent = cur.s.name + ' ' + cur.sid + ':' + cur.n + ' · which ayah comes NEXT?';
  strip.className = 'pstrip ar blitzp';
  strip.textContent = cw.length > 18 ? '… ' + cw.slice(-16).map(w => w.text).join(' ') : cur.ar;
  $('pEn').textContent = cw.length > 18 ? '…' + cur.en.slice(-150).replace(/^\S*\s/, ' ') : cur.en;
  layoutField();
  const opts = shuffle([{ a: ans, ok: true }].concat(dec.map(a => ({ a, ok: false }))));
  const laneH = fh / opts.length, cwid = Math.min(fw * (k > 8 ? 0.94 : 0.8), k > 8 ? 760 : 560);
  opts.forEach((op, lane) => {
    const el = document.createElement('div'); el.className = 'opt';
    el.innerHTML = '<div class="oar">' + esc(preview(op.a, k)) + '</div>';
    el.style.width = cwid + 'px';
    const o = addObj(el, { kind: 'opt', ok: op.ok, a: op.a, lane });
    o.x = rand(0, Math.max(1, fw - o.w)); o.ty = lane * laneH + Math.max(0, (laneH - o.h) / 2); o.y = o.ty;
    const v = Math.min(260, 40 + G.lvl * 16) * rand(0.75, 1.2) * (k > 8 ? 0.6 : 1);
    o.vx = Math.random() < 0.5 ? -v : v; o.vy = 0;
  });
  G.swapT = 2.6;
}

/* --- Missing Word Catch --- */
function qCatch() {
  const a = G.items[G.idx]; G.ayah = a; G.s = a.s; const w = wordsOf(a);
  let cands = w.map((x, i) => i).filter(i => letters(w[i].key) >= 3);
  if (!cands.length) cands = w.map((x, i) => i);
  G.blank = pick(cands); G.answer = w[G.blank];
  G.qMax = G.qLeft = Math.max(5.5, 13 - G.lvl * 0.7);
  $('pMeta').textContent = metaLine(a, 'catch the missing word');
  strip.className = 'pstrip ar';
  let from = 0, to = w.length;
  if (w.length > LONG) { from = Math.max(0, G.blank - 7); to = Math.min(w.length, G.blank + 8); }
  strip.innerHTML = (from ? '<span class="w slot">…</span> ' : '') + w.slice(from, to).map((x, j) => from + j === G.blank ? '<span class="blank" id="blank">' + esc(x.text) + '</span>' : '<span class="w">' + esc(x.text) + '</span>').join(' ') + (to < w.length ? ' <span class="w slot">…</span>' : '');
  $('pEn').textContent = trunc(a.en, w.length > LONG ? 160 : 400);
  layoutField();
  const nd = Math.min(7, 2 + G.lvl);
  const list = [Object.assign({ ok: true }, G.answer)].concat(decoyWords(a, new Set([G.answer.key]), nd).map(x => Object.assign({ ok: false }, x)));
  shuffle(list).forEach((x, k) => {
    const el = document.createElement('div'); el.className = 'tile orb ar'; el.textContent = x.text; el.dataset.key = x.key;
    const o = addObj(el, { kind: 'orb', ok: x.ok, key: x.key, text: x.text });
    launchOrb(o, k * rand(0.25, 0.55));
  });
}
function launchOrb(o, delay) {
  const left = Math.random() < 0.5, v = Math.min(300, 70 + G.lvl * 17) * rand(0.8, 1.25);
  o.x = left ? -o.w - 10 : fw + 10; o.y = rand(6, Math.max(8, fh - o.h - 6)); o.baseY = o.y;
  o.vx = left ? v : -v; o.vy = 0; o.wob = rand(0, 6.28); o.amp = rand(6, 26); o.wait = delay || 0;
  o.el.style.visibility = o.wait > 0 ? 'hidden' : 'visible';
}

/* ---------- taps ---------- */
function onTap(o, e) {
  if (!G || G.phase !== 'play' || G.paused || o.state !== 'live') return;
  ac(); G.taps++; G.lastTap = G.elapsed;
  const x = e.clientX, y = e.clientY;
  if (G.mode === 'rush') tapRush(o, x, y); else if (G.mode === 'blitz') tapBlitz(o, x, y); else tapCatch(o, x, y);
  hud();
}
function good(x, y, pts) {
  G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.right++;
  const m = mult(), gain = pts * m; G.score += gain;
  sparkle(x, y, 14 + Math.min(20, G.combo)); ring(x, y);
  floater(x, y, '+' + gain + (m > 1 ? ' ×' + m : ''));
  sfx.hit(Math.min(9, G.combo % 10));
  setCombo(true);
  if (G.combo > 0 && G.combo % 10 === 0) { toast('🔥 ' + G.combo + ' streak!'); shake(); }
}
function bad(o, x, y, pen) {
  G.combo = 0; G.wrong++; setCombo();
  if (pen) { G.qLeft = Math.max(0, G.qLeft - pen); floater(x, y, '−' + pen + 's', true); }
  sparkle(x, y, 6, false); sfx.miss(); shake();
  o.el.classList.remove('wrong'); void o.el.offsetWidth; o.el.classList.add('wrong');
  setTimeout(() => o.el && o.el.classList.remove('wrong'), 500);
}
function tapRush(o, x, y) {
  const exp = G.words[G.pos];
  if (o.key === exp.key) {
    good(x, y, 10);
    const slot = strip.querySelector('[data-i="' + G.pos + '"]'); let tx = fw / 2, ty = -40;
    if (slot) { const r = slot.getBoundingClientRect(); tx = r.left + r.width / 2 - o.w / 2; ty = r.top - ftop + r.height / 2 - o.h / 2; }
    collect(o, tx, ty);
    G.pos++; renderRushStrip();
    if (G.pos >= G.words.length) return ayahDone();
    if (G.pos >= G.chunkEnd) {
      G.chunkStart = G.pos; G.score += Math.ceil(G.qLeft) * 3;
      const g = G; setTimeout(() => { if (G === g && G.phase === 'play') spawnChunk(); }, 160);
    }
  } else bad(o, x, y, 1.5);
}
function tapBlitz(o, x, y) {
  if (o.ok) {
    good(x, y, 100); collect(o, o.x, -o.h);
    objs.forEach(p => { if (p !== o) p.state = 'frozen'; });
    G.done++; if (G.done % 2 === 0) levelUp();
    addMastered(G.ayah.sid, G.ayah.n); save();
    sfx.win();
    const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, 'Next ayah: ' + g.ayah.sid + ':' + g.ayah.n, 1500, () => nextQ()); }, 260);
    G.phase = 'learnwait';
  } else { bad(o, x, y, 3); o.state = 'dim'; o.el.style.opacity = '.45'; }
}
function tapCatch(o, x, y) {
  if (o.ok) {
    good(x, y, 25);
    const b = $('blank'); if (b) b.classList.add('filled');
    let tx = o.x, ty = -40; if (b) { const r = b.getBoundingClientRect(); tx = r.left + r.width / 2 - o.w / 2; ty = r.top - ftop; }
    collect(o, tx, ty);
    ayahDone();
  } else bad(o, x, y, 1.5);
}
function levelUp() { G.lvl++; toast('Level ' + G.lvl + ' · faster!'); }
const PRAISE = ['MashaAllah!', 'Excellent!', 'Beautiful recall!', 'Well done!', 'BarakAllahu feek!', 'Perfect order!'];
function markProgress(a) {
  addMastered(a.sid, a.n);
  if (G.src.kind === 'surah' || G.src.kind === 'juz') P.cont[a.sid] = a.n < a.s.count ? a.n + 1 : 1;   // "Continue from s:n"
  save();
}
function ayahDone() {
  G.phase = 'learnwait';
  const bonus = Math.ceil(G.qLeft) * (G.mode === 'rush' ? 5 : 8);
  G.score += bonus; G.ayahsDone++;
  if (bonus) floater(game.clientWidth / 2, ftop + 30, 'Time bonus +' + bonus);
  markProgress(G.ayah);
  G.done++; if (G.done % 2 === 0) levelUp();
  sfx.win(); sparkle(game.clientWidth / 2, ftop - 10, 30);
  objs.forEach(p => { if (p.state === 'live') p.state = 'frozen'; });
  hud();
  const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, pick(PRAISE), 2300, advance); }, 380);
}
function timeout() {
  G.combo = 0; setCombo(); sfx.miss(); shake();
  G.hearts--;
  // long ayah in Word Rush: lose a heart but keep going with the same wave
  if (G.mode === 'rush' && G.words.length > G.chunk && G.hearts > 0) { toast('Time! 💔 −1 heart'); spawnChunk(); hud(); return; }
  G.phase = 'learnwait'; hud();
  const msg = G.hearts > 0 ? 'Time! Review this ayah' : 'Out of hearts — review the ayah';
  const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, msg, 2600, () => { if (G.hearts <= 0) finish(false); else advance(); }); }, 250);
}
function advance() {
  G.idx++;
  if (G.idx >= G.items.length) return finish(true);
  nextQ();
}

/* ---------- learning card ---------- */
let learnCb = null, learnT = 0, learnDur = 0, learnAudioDone = true;
function showLearn(a, head, dur, cb) {
  if (!G) return;
  const nw = wordsOf(a).length;
  G.phase = 'learn'; learnCb = cb; learnT = 0; learnDur = Math.min(9, dur / 1000 + Math.max(0, nw - 12) * 0.06);
  $('lHead').textContent = head;
  $('lRef').textContent = a.s.name + ' (' + a.sid + ':' + a.n + ') · Juz ' + juzOf(a.sid, a.n);
  $('lAr').textContent = a.ar; $('lTr').textContent = a.tr; $('lEn').textContent = a.en;
  document.querySelector('.lcard').classList.toggle('long', nw > 40);
  $('learn').classList.add('on'); document.querySelector('.lcard').scrollTop = 0;
  learnAudioDone = true;
  if (P.audio) { learnAudioDone = false; playRecitation(a, () => { learnAudioDone = true; }); }
}
function endLearn() {
  if (!learnCb) return;
  const cb = learnCb; learnCb = null; stopRecitation();
  $('learn').classList.remove('on');
  cb();
}
$('learn').addEventListener('pointerdown', e => { if (e.target.closest('.lcard') && e.target.closest('.lcard').scrollHeight > e.target.closest('.lcard').clientHeight + 4 && learnT < 1) return; e.preventDefault(); if (learnT > 0.25) endLearn(); });

/* ---------- finish ---------- */
function nextSrc(src) {
  if (src.kind === 'jc') return Object.assign({}, src, { redraw: true });
  if (!src.secs || src.si >= src.secs.length - 1) return null;
  const si = src.si + 1, refs = src.secs[si];
  const label = src.kind === 'surah' ? sm(src.sid).name + ' ' + secLabel(refs) : src.kind === 'juz' ? 'Juz ' + src.juz + ' · ' + secLabel(refs) : src.label.replace(/set \d+\/\d+/, 'set ' + (si + 1) + '/' + src.secs.length);
  return Object.assign({}, src, { refs, si, label, whole: false });
}
function finish(win) {
  if (!G) return;
  G.phase = 'over'; clearObjs(); stopRecitation();
  const key = srcKey(G.src); const b = P.best[key] = P.best[key] || {};
  const prev = b[G.mode]; const before = levelInfo(P.xp).l;
  const newBest = [];
  const rec = Object.assign({}, prev || {});
  if (!prev || G.score > (prev.score || 0)) { rec.score = G.score; newBest.push('score'); }
  if (win && G.mode !== 'blitz' && G.src.whole && (!prev || !prev.time || G.elapsed < prev.time)) { rec.time = Math.round(G.elapsed); newBest.push('time'); }
  b[G.mode] = rec;
  if (G.src.kind === 'wird') G.src.dates.forEach(d => { P.wirdPlayed[d] = true; });
  const xpGain = Math.round(G.score / 10) + (win ? 40 : 0) + G.ayahsDone * 5;
  P.xp += xpGain; P.plays++; save();
  const after = levelInfo(P.xp).l;
  const acc = G.right + G.wrong ? Math.round(100 * G.right / (G.right + G.wrong)) : 0;
  $('rTitle').textContent = G.mode === 'blitz' ? "Time's up!" : (win ? (G.src.whole ? 'Surah complete! 🌟' : 'Section complete! 🌟') : 'Keep practising');
  $('rSub').textContent = G.src.label + ' · ' + MODE_NAME[G.mode];
  const st = [['Score', G.score.toLocaleString()], ['Time', fmt(G.elapsed)], ['Accuracy', acc + '%'], ['Best streak', G.maxCombo],
    [G.mode === 'blitz' ? 'Correct' : 'Ayahs', G.mode === 'blitz' ? G.right : G.ayahsDone + ' / ' + G.items.length], ['XP', '+' + xpGain]];
  $('rStats').innerHTML = st.map(s => '<div><b>' + s[1] + '</b><small>' + s[0] + '</small></div>').join('');
  $('rBest').textContent = (newBest.length ? '★ New best ' + newBest.join(' & ') + '! ' : '') +
    'Best: ' + rec.score.toLocaleString() + (rec.time ? ' · fastest ' + fmt(rec.time) : '') + (after > before ? ' · Reached level ' + after + '!' : '') +
    (G.src.kind === 'surah' && P.cont[G.src.sid] > 1 ? ' · Continue from ' + G.src.sid + ':' + P.cont[G.src.sid] : '');
  const nx = nextSrc(G.src); G.next = nx;
  $('btnNext').style.display = nx ? '' : 'none';
  $('btnNext').textContent = G.src.kind === 'jc' ? '🎲 New draw ›' : 'Next section ›';
  $('resultOv').classList.add('on');
  if (win || G.mode === 'blitz') { sfx.win(); sparkle(game.clientWidth / 2, game.clientHeight / 3, 60); }
}
function closeOv() { $('resultOv').classList.remove('on'); $('pauseOv').classList.remove('on'); $('learn').classList.remove('on'); learnCb = null; }
function quit() { startToken++; stopRecitation(); clearObjs(); G = null; closeOv(); $('countdown').classList.remove('on'); show(home); renderHome(); }
$('btnAgain').addEventListener('click', () => { const g = G; startGame(g.mode, g.src.kind === 'jc' ? Object.assign({}, g.src, { redraw: true }) : g.src); });
$('btnNext').addEventListener('click', () => { const g = G; if (g.next) startGame(g.mode, g.next); });
$('btnMenu').addEventListener('click', quit);
function pause(on) {
  if (!G || G.phase === 'over') return;
  G.paused = on; $('pauseOv').classList.toggle('on', on);
  if (on && recAudio) recAudio.pause(); else if (!on && recAudio) recAudio.play().catch(() => {});
}
$('btnPause').addEventListener('click', () => pause(true));
$('btnResume').addEventListener('click', () => pause(false));
$('btnQuit').addEventListener('click', quit);
document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.phase !== 'over') pause(true); });
addEventListener('keydown', e => { if (!G) return; if (e.key === 'Escape' || e.key === 'p') pause(!G.paused); else if ((e.key === ' ' || e.key === 'Enter') && G.phase === 'learn') endLearn(); });
let toastT = 0;
function toast(t) { const el = $('levelToast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1100); }

/* ---------- main loop ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && !G.paused) {
    if (G.phase === 'play' || G.phase === 'learnwait') {
      if (G.phase === 'play') {
        G.elapsed += dt; G.qLeft -= dt;
        if (G.qLeft <= 0) { G.qLeft = 0; if (G.mode === 'blitz') finish(false); else timeout(); }
        // gentle hint for beginners in Word Rush
        if (G && G.mode === 'rush' && G.lvl <= 2 && G.elapsed - G.lastTap > 3.5) {
          const exp = G.words[G.pos]; const t = exp && objs.find(o => o.state === 'live' && o.key === exp.key);
          if (t) t.el.classList.add('hint');
        }
      }
      if (G) { step(dt); hud(); }
    } else if (G.phase === 'learn') {
      learnT += dt; $('lProg').style.width = Math.min(100, 100 * learnT / learnDur) + '%';
      if (learnT >= learnDur && learnAudioDone) endLearn();
      else if (learnT > 25) endLearn();
    }
  }
  drawFx(dt);
  requestAnimationFrame(loop);
}
function step(dt) {
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.state === 'dead') { objs.splice(i, 1); continue; }
    if (o.state === 'got') {
      o.gt += dt / 0.45; const k = Math.min(1, o.gt), e = 1 - Math.pow(1 - k, 3);
      o.x = o.sx + (o.tx - o.sx) * e; o.y = o.sy + (o.ty - o.sy) * e;
      o.el.style.transform = 'translate(' + o.x + 'px,' + o.y + 'px) scale(' + (1 + 0.25 * Math.sin(k * Math.PI) - 0.4 * k) + ')';
      o.el.style.opacity = String(1 - k * k);
      if (k >= 1) { o.el.remove(); objs.splice(i, 1); }
      continue;
    }
    if (o.state === 'frozen') { o.el.style.opacity = String(Math.max(0, (parseFloat(o.el.style.opacity || '1')) - dt * 3)); continue; }
    if (o.kind === 'tile') {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < 0) { o.x = 0; o.vx = Math.abs(o.vx); } if (o.x > fw - o.w) { o.x = Math.max(0, fw - o.w); o.vx = -Math.abs(o.vx); }
      if (o.y < 0) { o.y = 0; o.vy = Math.abs(o.vy); } if (o.y > fh - o.h) { o.y = Math.max(0, fh - o.h); o.vy = -Math.abs(o.vy); }
      o.spawn = Math.min(1, (o.spawn || 0) + dt * 5);
      o.el.style.transform = 'translate(' + o.x + 'px,' + o.y + 'px) scale(' + (0.5 + 0.5 * o.spawn) + ')';
    } else if (o.kind === 'opt') {
      o.x += o.vx * dt;
      if (o.x < 0) { o.x = 0; o.vx = Math.abs(o.vx); } if (o.x > fw - o.w) { o.x = Math.max(0, fw - o.w); o.vx = -Math.abs(o.vx); }
      o.y += (o.ty - o.y) * Math.min(1, dt * 6);
      o.el.style.transform = 'translate(' + o.x + 'px,' + o.y + 'px)';
    } else if (o.kind === 'orb') {
      if (o.wait > 0) { o.wait -= dt; if (o.wait <= 0) o.el.style.visibility = 'visible'; else continue; }
      o.x += o.vx * dt; o.wob += dt * 3; o.y = o.baseY + Math.sin(o.wob) * o.amp;
      o.y = Math.max(0, Math.min(fh - o.h, o.y));
      if ((o.vx > 0 && o.x > fw + 20) || (o.vx < 0 && o.x < -o.w - 20)) launchOrb(o, o.ok ? rand(0, 0.3) : rand(0.1, 0.9));
      o.el.style.transform = 'translate(' + o.x + 'px,' + o.y + 'px)';
    }
  }
  // blitz: lanes swap at higher levels
  if (G && G.mode === 'blitz' && G.phase === 'play' && G.lvl >= 4) {
    G.swapT -= dt;
    if (G.swapT <= 0) {
      G.swapT = Math.max(1.1, 3 - G.lvl * 0.15);
      const live = objs.filter(o => o.kind === 'opt' && o.state !== 'got');
      if (live.length >= 2) { const a = pick(live); let b = pick(live); if (a === b) b = live[(live.indexOf(a) + 1) % live.length]; const t = a.ty; a.ty = b.ty; b.ty = t; }
    }
  }
}
function drawFx(dt) {
  cx.clearRect(0, 0, cv.width, cv.height);
  if (!parts.length) return;
  cx.globalCompositeOperation = 'lighter';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt;
    if (p.life >= p.max) { parts.splice(i, 1); continue; }
    const k = 1 - p.life / p.max;
    if (p.ring) {
      cx.strokeStyle = 'rgba(' + p.c + ',' + k + ')'; cx.lineWidth = 3 * k;
      cx.beginPath(); cx.arc(p.x, p.y, p.r + (1 - k) * 60, 0, Math.PI * 2); cx.stroke(); continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
    const r = p.r * (0.6 + k);
    const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    g.addColorStop(0, 'rgba(' + p.c + ',' + (0.95 * k) + ')'); g.addColorStop(1, 'rgba(' + p.c + ',0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, r * 3, 0, Math.PI * 2); cx.fill();
  }
  cx.globalCompositeOperation = 'source-over';
}

/* ---------- test hooks (used by automated tests; harmless for players) ---------- */
window.__qr = {
  P, W, get G() { return G; },
  start: (mode, src) => startGame(mode, src),
  surRefs, juzRefs, wirdRefs, loggedDates, loadWird,
  expectedKey: () => !G ? null : G.mode === 'rush' ? (G.words[G.pos] || {}).key : G.mode === 'catch' ? G.answer.key : null,
  liveObjs: () => objs.filter(o => o.state === 'live').map(o => ({ key: o.key, ok: !!o.ok, el: o.el })),
  skipLearn: () => endLearn()
};

renderHome();
loadWird();
requestAnimationFrame(loop);
})();
