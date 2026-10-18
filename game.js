/* Quran Rush — fast-paced, tap-heavy Quran memorization. Plain JS, no build step. */
(() => {
'use strict';
const S = window.SURAHS || [];
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, Math.floor(s)); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

/* ---------- persistence ---------- */
const KEY = 'quranRush.v1';
const P = Object.assign({ xp: 0, sound: true, audio: false, best: {}, mast: {}, mode: 'rush', pace: 1, plays: 0 },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
const need = l => 80 + (l - 1) * 70;              // XP needed to go from level l to l+1
function levelInfo(xp) { let l = 1, x = xp; while (x >= need(l)) { x -= need(l); l++; } return { l, x, n: need(l) }; }
function masteredSet(sid) { return new Set(P.mast[sid] || []); }
function addMastered(sid, n) { const s = masteredSet(sid); s.add(n); P.mast[sid] = [...s]; }

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
function renderGrid() {
  const g = $('surahGrid'); g.innerHTML = '';
  S.forEach((s, i) => {
    const m = masteredSet(s.id).size, b = P.best[s.id] || {};
    const parts = [];
    if (b.rush) parts.push('Rush ' + b.rush.score + (b.rush.time ? ' · ' + fmt(b.rush.time) : ''));
    if (b.blitz) parts.push('Blitz ' + b.blitz.score);
    if (b.catch) parts.push('Catch ' + b.catch.score + (b.catch.time ? ' · ' + fmt(b.catch.time) : ''));
    const el = document.createElement('button');
    el.className = 'scard' + (m >= s.ayahs.length ? ' done' : '');
    el.dataset.sid = s.id;
    el.innerHTML = '<div class="sn">' + s.id + ' · ' + s.ayahs.length + ' ayahs</div><div class="sar">' + esc(s.arName.replace(/^سُورَةُ\s*/, '')) +
      '</div><div class="sen">' + esc(s.name) + '</div><div class="smean">' + esc(s.meaning) + '</div><div class="sbar"><i style="width:' +
      (100 * m / s.ayahs.length) + '%"></i></div><div class="sbest">' + esc(parts.join(' | ') || 'Not played yet') + '</div>';
    el.addEventListener('click', () => { ac(); startGame(P.mode, i); });
    g.appendChild(el);
  });
}
function renderHome() {
  renderProfile(); renderGrid();
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('sel', b.dataset.mode === P.mode));
  document.querySelectorAll('#pace button').forEach(b => b.classList.toggle('sel', +b.dataset.pace === P.pace));
}
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => { P.mode = b.dataset.mode; save(); renderHome(); sfx.tick(); }));
document.querySelectorAll('#pace button').forEach(b => b.addEventListener('click', () => { P.pace = +b.dataset.pace; save(); renderHome(); sfx.tick(); }));
$('togSound').addEventListener('click', () => { P.sound = !P.sound; save(); renderProfile(); sfx.tick(); });
$('togAudio').addEventListener('click', () => { P.audio = !P.audio; save(); renderProfile(); });

/* ---------- GAME STATE ---------- */
let G = null;
const objs = [];          // moving tiles / orbs / cards
const parts = [];         // particles
function show(screen) { [home, game].forEach(s => s.classList.toggle('active', s === screen)); }

function startGame(mode, si) {
  const s = S[si];
  G = { mode, si, s, lvl: P.pace || 1, startLvl: P.pace || 1, score: 0, combo: 0, maxCombo: 0, hearts: 3, right: 0, wrong: 0,
    taps: 0, elapsed: 0, qMax: 1, qLeft: 1, phase: 'count', paused: false, idx: 0, done: 0, lastTap: 0, cdT: 0, lastPrompt: -1, ayahsDone: 0 };
  clearObjs(); parts.length = 0;
  show(game); closeOv(); resize();
  $('hSurah').textContent = s.id + '. ' + s.name + ' · ' + ({ rush: 'Word Rush', blitz: 'Next Ayah Blitz', catch: 'Missing Word Catch' }[mode]);
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
    if (n === 0) { el.innerHTML = '<b>GO!</b>'; sfx.go(); const g = G; setTimeout(() => { el.classList.remove('on'); if (G === g) cb(); }, 450); return; }
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

/* --- Word Rush --- */
function qRush() {
  const a = G.s.ayahs[G.idx]; G.ayah = a; G.words = wordsOf(a); G.pos = 0; G.chunkStart = 0;
  G.chunk = fw < 600 ? 5 : 7;
  G.qMax = G.qLeft = (4 + 2.1 * G.words.length) * pf();
  $('pMeta').textContent = 'Ayah ' + a.n + ' / ' + G.s.ayahs.length + ' · tap words in order (right → left)';
  $('pEn').textContent = a.en;
  prompt.querySelector('.pstrip').className = 'pstrip ar';
  renderRushStrip(); layoutField(); spawnChunk();
}
function renderRushStrip() {
  strip.innerHTML = G.words.map((w, i) => i < G.pos ? '<span class="w got">' + esc(w.text) + '</span>'
    : '<span class="w slot' + (i === G.pos ? ' next' : '') + '">◌</span>').join(' ');
}
function spawnChunk() {
  objs.filter(o => o.state === 'live').forEach(o => { o.el.remove(); o.state = 'dead'; });
  const end = Math.min(G.words.length, G.chunkStart + G.chunk);
  G.chunkEnd = end;
  for (let i = G.chunkStart; i < end; i++) makeTile(G.words[i], { ok: true });
  const nd = G.lvl >= 3 ? Math.min(G.lvl - 2, fw < 600 ? 3 : 5) : 0;
  if (nd) {
    const own = new Set(G.words.map(w => w.key));
    let pool = [];
    G.s.ayahs.forEach(a => { if (a !== G.ayah) wordsOf(a).forEach(w => { if (!own.has(w.key)) pool.push(w); }); });
    if (pool.length < nd) S.slice(0, 6).forEach(s2 => s2.ayahs.forEach(a => wordsOf(a).forEach(w => { if (!own.has(w.key)) pool.push(w); })));
    const used = new Set();
    shuffle(pool);
    for (const w of pool) { if (used.size >= nd) break; if (used.has(w.key)) continue; used.add(w.key); makeTile(w, { ok: false }); }
  }
}

/* --- Next Ayah Blitz --- */
function preview(a) { const w = wordsOf(a); const k = fw < 600 ? 4 : 6; return w.slice(0, k).map(x => x.text).join(' ') + (w.length > k ? ' …' : ''); }
function qBlitz() {
  const s = G.s, n = s.ayahs.length;
  let i; do { i = (Math.random() * (n - 1)) | 0; } while (n > 2 && i === G.lastPrompt);
  G.lastPrompt = i;
  const cur = s.ayahs[i], ans = s.ayahs[i + 1]; G.ayah = ans;
  let pool = s.ayahs.filter((a, k) => k !== i && k !== i + 1);
  shuffle(pool);
  // prefer nearby ayahs from the same surah as decoys (harder), fill from neighbouring surahs if short
  pool.sort((a, b) => Math.abs(a.n - ans.n) - Math.abs(b.n - ans.n));
  pool = pool.slice(0, 6); shuffle(pool);
  const si = G.si; let k = 1;
  while (pool.length < 3) { const s2 = S[(si + k) % S.length]; k++; if (s2 !== s) pool.push(pick(s2.ayahs)); }
  const seen = new Set([preview(ans)]); const dec = [];
  for (const a of pool) { const p = preview(a); if (!seen.has(p)) { seen.add(p); dec.push(a); } if (dec.length === 3) break; }
  for (let t = 0; dec.length < 3 && t < 50; t++) { const a = pick(pick(S).ayahs); const p = preview(a); if (!seen.has(p)) { seen.add(p); dec.push(a); } }
  $('pMeta').textContent = 'Ayah ' + cur.n + ' of ' + s.name + ' · which ayah comes NEXT?';
  strip.className = 'pstrip ar blitzp';
  strip.textContent = cur.ar; $('pEn').textContent = cur.en;
  layoutField();
  const opts = shuffle([{ a: ans, ok: true }].concat(dec.map(a => ({ a, ok: false }))));
  const laneH = fh / 4, cw = Math.min(fw * 0.8, 560);
  opts.forEach((op, lane) => {
    const el = document.createElement('div'); el.className = 'opt';
    el.innerHTML = '<div class="oar">' + esc(preview(op.a)) + '</div>';
    el.style.width = cw + 'px';
    const o = addObj(el, { kind: 'opt', ok: op.ok, a: op.a, lane });
    o.x = rand(0, Math.max(1, fw - o.w)); o.ty = lane * laneH + Math.max(0, (laneH - o.h) / 2); o.y = o.ty;
    const v = Math.min(260, 40 + G.lvl * 16) * rand(0.75, 1.2);
    o.vx = Math.random() < 0.5 ? -v : v; o.vy = 0;
  });
  G.swapT = 2.6;
}

/* --- Missing Word Catch --- */
function qCatch() {
  const a = G.s.ayahs[G.idx]; G.ayah = a; const w = wordsOf(a);
  let cands = w.map((x, i) => i).filter(i => letters(w[i].key) >= 3);
  if (!cands.length) cands = w.map((x, i) => i);
  G.blank = pick(cands); G.answer = w[G.blank];
  G.qMax = G.qLeft = Math.max(5.5, 13 - G.lvl * 0.7);
  $('pMeta').textContent = 'Ayah ' + a.n + ' / ' + G.s.ayahs.length + ' · catch the missing word';
  strip.className = 'pstrip ar';
  strip.innerHTML = w.map((x, i) => i === G.blank ? '<span class="blank" id="blank">' + esc(x.text) + '</span>' : '<span class="w">' + esc(x.text) + '</span>').join(' ');
  $('pEn').textContent = a.en;
  layoutField();
  const nd = Math.min(7, 2 + G.lvl), used = new Set([G.answer.key]); const pool = [];
  G.s.ayahs.forEach(b => wordsOf(b).forEach(x => { if (!used.has(x.key) && letters(x.key) >= 2) pool.push(x); }));
  if (pool.length < nd) S.slice(0, 8).forEach(s2 => s2.ayahs.forEach(b => wordsOf(b).forEach(x => { if (!used.has(x.key)) pool.push(x); })));
  shuffle(pool);
  const list = [Object.assign({ ok: true }, G.answer)];
  for (const x of pool) { if (list.length > nd) break; if (used.has(x.key)) continue; used.add(x.key); list.push(Object.assign({ ok: false }, x)); }
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
    const slot = strip.children[G.pos]; let tx = fw / 2, ty = -40;
    if (slot) { const r = slot.getBoundingClientRect(); tx = r.left + r.width / 2 - o.w / 2; ty = r.top - ftop + r.height / 2 - o.h / 2; }
    collect(o, tx, ty);
    G.pos++; renderRushStrip();
    if (G.pos >= G.words.length) return ayahDone();
    if (G.pos >= G.chunkEnd) { G.chunkStart = G.pos; setTimeout(() => { if (G && G.phase === 'play') spawnChunk(); }, 160); }
  } else bad(o, x, y, 1.5);
}
function tapBlitz(o, x, y) {
  if (o.ok) {
    good(x, y, 100); collect(o, o.x, -o.h);
    objs.forEach(p => { if (p !== o) p.state = 'frozen'; });
    G.done++; if (G.done % 2 === 0) levelUp();
    sfx.win();
    const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, 'Next ayah: ' + g.ayah.n, 1500, () => nextQ()); }, 260);
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
function ayahDone() {
  G.phase = 'learnwait';
  const bonus = Math.ceil(G.qLeft) * (G.mode === 'rush' ? 5 : 8);
  G.score += bonus; G.ayahsDone++;
  if (bonus) floater(game.clientWidth / 2, ftop + 30, 'Time bonus +' + bonus);
  addMastered(G.s.id, G.ayah.n); save();
  G.done++; if (G.done % 2 === 0) levelUp();
  sfx.win(); sparkle(game.clientWidth / 2, ftop - 10, 30);
  objs.forEach(p => { if (p.state === 'live') p.state = 'frozen'; });
  hud();
  const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, pick(PRAISE), 2300, advance); }, 380);
}
function timeout() {
  G.phase = 'learnwait'; G.hearts--; G.combo = 0; setCombo(); sfx.miss(); shake();
  hud();
  const msg = G.hearts > 0 ? 'Time! Review this ayah' : 'Out of hearts — review the ayah';
  const g = G; setTimeout(() => { if (G === g) showLearn(g.ayah, msg, 2600, () => { if (G.hearts <= 0) finish(false); else advance(); }); }, 250);
}
function advance() {
  G.idx++;
  if (G.idx >= G.s.ayahs.length) return finish(true);
  nextQ();
}

/* ---------- learning card ---------- */
let learnCb = null, learnT = 0, learnDur = 0, learnAudioDone = true;
function showLearn(a, head, dur, cb) {
  if (!G) return;
  G.phase = 'learn'; learnCb = cb; learnT = 0; learnDur = dur / 1000;
  $('lHead').textContent = head;
  $('lRef').textContent = G.s.name + ' (' + G.s.id + ':' + a.n + ')';
  $('lAr').textContent = a.ar; $('lTr').textContent = a.tr; $('lEn').textContent = a.en;
  $('learn').classList.add('on');
  learnAudioDone = true;
  if (P.audio) { learnAudioDone = false; playRecitation(a, () => { learnAudioDone = true; }); }
}
function endLearn() {
  if (!learnCb) return;
  const cb = learnCb; learnCb = null; stopRecitation();
  $('learn').classList.remove('on');
  cb();
}
$('learn').addEventListener('pointerdown', e => { e.preventDefault(); if (learnT > 0.25) endLearn(); });

/* ---------- finish ---------- */
function finish(win) {
  if (!G) return;
  G.phase = 'over'; clearObjs(); stopRecitation();
  const sid = G.s.id; const b = P.best[sid] = P.best[sid] || {};
  const prev = b[G.mode]; const before = levelInfo(P.xp).l;
  let newBest = [];
  const rec = Object.assign({}, prev || {});
  if (!prev || G.score > (prev.score || 0)) { rec.score = G.score; newBest.push('score'); }
  if (win && G.mode !== 'blitz' && (!prev || !prev.time || G.elapsed < prev.time)) { rec.time = Math.round(G.elapsed); newBest.push('time'); }
  b[G.mode] = rec;
  const xpGain = Math.round(G.score / 10) + (win ? 40 : 0) + G.ayahsDone * 5;
  P.xp += xpGain; P.plays++; save();
  const after = levelInfo(P.xp).l;
  const acc = G.right + G.wrong ? Math.round(100 * G.right / (G.right + G.wrong)) : 0;
  $('rTitle').textContent = G.mode === 'blitz' ? "Time's up!" : (win ? 'Surah complete! 🌟' : 'Keep practising');
  $('rSub').textContent = G.s.name + ' · ' + ({ rush: 'Word Rush', blitz: 'Next Ayah Blitz', catch: 'Missing Word Catch' }[G.mode]);
  const st = [['Score', G.score.toLocaleString()], ['Time', fmt(G.elapsed)], ['Accuracy', acc + '%'], ['Best streak', G.maxCombo],
    [G.mode === 'blitz' ? 'Correct' : 'Ayahs', G.mode === 'blitz' ? G.right : G.ayahsDone + ' / ' + G.s.ayahs.length], ['XP', '+' + xpGain]];
  $('rStats').innerHTML = st.map(s => '<div><b>' + s[1] + '</b><small>' + s[0] + '</small></div>').join('');
  $('rBest').textContent = (newBest.length ? '★ New best ' + newBest.join(' & ') + '! ' : '') +
    'Best: ' + rec.score.toLocaleString() + (rec.time ? ' · fastest ' + fmt(rec.time) : '') + (after > before ? ' · Reached level ' + after + '!' : '');
  $('btnNext').style.display = G.si < S.length - 1 ? '' : 'none';
  $('resultOv').classList.add('on');
  if (win || G.mode === 'blitz') { sfx.win(); sparkle(game.clientWidth / 2, game.clientHeight / 3, 60); }
}
function closeOv() { $('resultOv').classList.remove('on'); $('pauseOv').classList.remove('on'); $('learn').classList.remove('on'); learnCb = null; }
function quit() { stopRecitation(); clearObjs(); G = null; closeOv(); $('countdown').classList.remove('on'); show(home); renderHome(); }
$('btnAgain').addEventListener('click', () => { const g = G; startGame(g.mode, g.si); });
$('btnNext').addEventListener('click', () => { const g = G; startGame(g.mode, Math.min(S.length - 1, g.si + 1)); });
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
  P, get G() { return G; },
  start: (mode, si) => startGame(mode, si),
  expectedKey: () => !G ? null : G.mode === 'rush' ? (G.words[G.pos] || {}).key : G.mode === 'catch' ? G.answer.key : null,
  liveObjs: () => objs.filter(o => o.state === 'live').map(o => ({ key: o.key, ok: !!o.ok, el: o.el })),
  skipLearn: () => endLearn()
};

renderHome();
requestAnimationFrame(loop);
})();
