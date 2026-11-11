import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import mark from './mark.svg?raw';
import type { Pack } from './library';
import { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSquare, makeUci, parseUci, makeSquare } from 'chessops/util';
import { attacks } from 'chessops/attacks';
import { makeSan, parseSan } from 'chessops/san';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { chessgroundDests } from 'chessops/compat';
import { fsrs, createEmptyCard, Rating } from 'ts-fsrs';
import { engine } from './engine';
import { initFile, readFile, writeSoon, writeNow, fileState, linkFile, unlinkFile, filePicking, fileNative } from './localfile';
import { toEngine, fenOf, fromFen, fromEngine } from './uci';
import { PuzzleRun, parseCsvLine, humanTheme, sanLine, type Puzzle } from './puzzle';
import { DrillRun, type DrillDef, type DrillEnd } from './drill';
import { DRILLS } from './endgames';
import { explain, fmtScore } from './explain';
import { ArenaRun, type ArenaEnd } from './arena';
import STARTER from './tactics/starter.json';
import TRAPS from './tactics/traps.json';

type Rep = { id: string; name: string; color: 'white' | 'black'; moves: Record<string, Record<string, string>>; cards: Record<string, any>; notes?: Record<string, string>; bad?: Record<string, number>; tags?: Record<string, string>; lineNames?: Record<string, string>; hist?: Record<string, number>; src?: string; best?: { drill?: number; time?: number }; arena?: { rating: number; games: number }; walk?: number; seen?: Record<string, true> };
type Mode = 'build' | 'learn' | 'review' | 'tactics' | 'endgames';
type LMode = 'walk' | 'drill' | 'time' | 'arena';
type Settings = { san: boolean; welcomed: boolean; lmode: LMode; explain: boolean; appearance: string; pieces: string; sound: boolean; newCap: number; retention: number; theme: string; coords: boolean; anim: boolean; haptics: boolean; learnDelay: number; engineMs: number; newPuzzles: number; window: number; importMin: number; importMax: number; importCount: number; ptheme: string };
const DEF: Settings = { san: false, welcomed: false, lmode: 'walk', explain: true, appearance: 'auto', pieces: 'cburnett', sound: true, newCap: 15, retention: 0.9, theme: 'sage', coords: true, anim: true, haptics: true, learnDelay: 600, engineMs: 500, newPuzzles: 10, window: 400, importMin: 800, importMax: 2200, importCount: 3000, ptheme: 'all' };
const opening = (m: Mode) => m === 'build' || m === 'learn' || m === 'review';

const $ = (s: string) => document.querySelector(s) as any;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

/* ---------- Storage: IndexedDB with localStorage fallback ---------- */
let dbp: Promise<IDBDatabase> | undefined;
const idb = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open('jan20', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
async function kvGet(k: string): Promise<any> {
  try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
  catch { const v = localStorage.getItem('jan20:' + k); return v ? JSON.parse(v) : undefined; }
}
async function kvSet(k: string, v: any) {
  try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  catch { try { localStorage.setItem('jan20:' + k, JSON.stringify(v)); } catch { storageFail(); } }
}

/* ---------- State ---------- */
let reps: Rep[] = [];
let cur: Rep | undefined;
let S: Settings = { ...DEF };
let f = fsrs({ request_retention: S.retention });
const NATIVE = (window as any).Capacitor?.isNativePlatform?.() === true || location.protocol === 'capacitor:';
const EDIT_TABS: Mode[] = NATIVE ? ['learn', 'review', 'tactics', 'endgames'] : ['build', 'learn', 'review', 'tactics', 'endgames'];
/** Where the app can be edited: the phone build trains, it does not edit. */
const addHint = () => NATIVE ? 'Add lines in the desktop version of Jan20.' : 'Add moves in the Editor.';
let mode: Mode = NATIVE ? 'learn' : 'build';
let pos = Chess.default();
let line: string[] = [];
let last: string | undefined, lastKey: string | undefined, lastSan = '';
let queue: string[] = [];
let total = 0, hinted = false, locked = false, flipped = false, session = 0;
let fileMode: 'merge' | 'replace' | 'pgn' | 'csv' = 'merge';
let imported: Puzzle[] = []; let pcards: Record<string, any> = {};
let pstats: { rating: number; solved: number; failed: number; streak: number; best: number; hist?: Record<string, { ok: number; n: number }> } = { rating: 1200, solved: 0, failed: 0, streak: 0, best: 0 };
let ecards: Record<string, any> = {}; let egCustom: DrillDef[] = [];
let tRun: PuzzleRun | undefined, tColor: 'white' | 'black' | undefined, tGraded = false, tHinted = false, tQueue: string[] = [], tTotal = 0;
const tRequeued = new Set<string>(); let tFailed = false;
let eRun: DrillRun | undefined, eColor: 'white' | 'black' | undefined, eBusy = false, eEnded = false;
let promo: { m: any; prev: string } | undefined;
const parent = new Map<string, { from: string; uci: string }>();
let dScore = 0, dLines = 0, dActive = false, ttEnd = 0, ttTimer: any;
let wLines: string[][] = [], wIdx = 0, wBack = 0, wNotes = false;
let aRun: ArenaRun | undefined, aBusy = false;

let timer: any;
const flush = () => {
  kvSet('reps', reps); kvSet('cur', cur?.id); kvSet('settings', S); kvSet('pcards', pcards); kvSet('pstats', pstats); kvSet('ecards', ecards); kvSet('egcustom', egCustom);
  if (fileNative() || fileState().kind === 'browser') writeSoon(stateJson(), 150);
};
const live = () => fileNative() || fileState().kind === 'browser';
/** Write the file straight away: a debounced write would be cancelled when the window closes. */
const writeFileNow = () => { if (live()) void writeNow(stateJson()); };
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 120); };
addEventListener('pagehide', () => { flush(); writeFileNow(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flush(); writeFileNow(); } });

/* ---------- Helpers ---------- */
const key = (p: Chess) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const fromKey = (k: string) => Chess.fromSetup(parseFen(k + ' 0 1').unwrap()).unwrap();
const START = key(Chess.default());
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => a.map(v => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const msg = (t: string, c = '') => { const m = $('#msg'); m.textContent = t; m.className = c; };
let storageWarned = false;
function storageFail() { if (storageWarned) return; storageWarned = true; toast('This browser cannot save your progress. Export a backup from Settings.', { kind: 'bad', ms: 12000 }); }

/** A friendly replacement for confirm() and prompt(). Resolves true/false, or the typed text / null when `input` is set. */
function ask(o: { title: string; text?: string; ok?: string; cancel?: string; danger?: boolean; input?: boolean; placeholder?: string; value?: string }): Promise<string | boolean | null> {
  return new Promise(res => {
    const d = $('#ask') as HTMLDialogElement, inp = $('#ask-in'), ok = $('#ask-ok');
    $('#ask-t').textContent = o.title; $('#ask-p').textContent = o.text ?? ''; $('#ask-p').hidden = !o.text;
    inp.hidden = !o.input; inp.value = o.value ?? ''; inp.placeholder = o.placeholder ?? '';
    ok.textContent = o.ok ?? 'OK'; ok.className = o.danger ? 'danger-solid' : 'primary'; $('#ask-no').textContent = o.cancel ?? 'Cancel';
    d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok' ? (o.input ? inp.value : true) : (o.input ? null : false)), { once: true });
    d.showModal(); (o.input ? inp : ok).focus();
  });
}
let toastTimer: any;
function toast(text: string, o: { action?: string; onAction?: () => void; ms?: number; kind?: 'bad' } = {}) {
  const t = $('#toast'), a = $('#toast-a'); $('#toast-t').textContent = text; t.className = o.kind ?? ''; t.hidden = false;
  a.hidden = !o.action; if (o.action) { a.textContent = o.action; a.onclick = () => { t.hidden = true; o.onAction?.(); }; }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, o.ms ?? 5000);
}
let canNow = false;
const arrow = (u: string) => {
  const m: any = parseUci(u)!; let to = m.to; const pc = pos.board.get(m.from);
  if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = m.to > m.from ? m.from + 2 : m.from - 2;
  return { orig: makeSquare(m.from), dest: makeSquare(to), brush: 'hint' };
};
function lastPair(u: string) {
  const m: any = parseUci(u)!; let to = m.to;
  if ((m.from === 4 || m.from === 60) && [0, 7, 56, 63].includes(m.to) && !pos.board.get(m.to)) to = m.to > m.from ? m.from + 2 : m.from - 2;
  return [makeSquare(m.from), makeSquare(to)] as any;
}
const buzz = () => {
  if (!S.haptics) return;
  import('@capacitor/core').then(async ({ Capacitor }) => {
    if (Capacitor.isNativePlatform()) { const { Haptics, NotificationType } = await import('@capacitor/haptics'); Haptics.notification({ type: NotificationType.Warning }); }
    else navigator.vibrate?.(60);
  }).catch(() => navigator.vibrate?.(60));
};
const rel = (d: Date) => { const m = Math.round((+d - Date.now()) / 60000); return m < 60 ? `in ${Math.max(m, 1)} min` : m < 2880 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} days`; };
const orient = () => (mode === 'tactics' && tColor ? tColor : mode === 'endgames' && eColor ? eColor : (cur?.color === 'black') !== flipped ? 'black' : 'white');
const mine = () => (cur!.color === 'white' ? 'w' : 'b');
const noteOf = (k?: string, u?: string) => (k && u ? cur?.notes?.[k + '|' + u] : undefined) || '';
/** Move annotations, the way a scoresheet carries them. `trap` is our own. */
const TAGS: [string, string, string][] = [['!', '!', 'good move'], ['!?', '!?', 'interesting'], ['?!', '?!', 'dubious'], ['?', '?', 'mistake'], ['??', '??', 'blunder'], ['trap', '⚑', 'a trap to remember']];
const TAG_NAG: Record<string, number> = { '!': 1, '?': 2, '??': 4, '!?': 5, '?!': 6 };
const tagOf = (k?: string, u?: string) => (k && u ? cur?.tags?.[k + '|' + u] : undefined) || '';
const tagHtml = (k?: string, u?: string) => {
  const t = tagOf(k, u); if (!t) return '';
  const meta = TAGS.find(x => x[0] === t);
  const glyph = meta ? meta[1] : t;
  return `<b class="tag t-${t === 'trap' ? 'trap' : 'nag'}" title="${esc(meta ? meta[2] : t)}">${esc(glyph)}</b>`;
};
const showNote = (t: string) => { const n = $('#note'); n.textContent = t; n.hidden = !t; };

let actx: AudioContext | undefined;
function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const c = actx!; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(kind: 'move' | 'ok' | 'bad' | 'done') {
  if (!S.sound) return;
  try {
    actx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    if (kind === 'move') tone(190, t, 0.07, 'triangle', 0.14);
    else if (kind === 'ok') { tone(660, t, 0.12); tone(880, t + 0.08, 0.16); }
    else if (kind === 'bad') tone(150, t, 0.2, 'sawtooth', 0.05);
    else { tone(523, t, 0.14); tone(659, t + 0.1, 0.14); tone(784, t + 0.2, 0.28); }
  } catch { /* audio unavailable */ }
}
const flash = (k: 'ok' | 'bad') => { const b = $('#board'); b.classList.remove('flash-ok', 'flash-bad'); void b.offsetWidth; b.classList.add('flash-' + k); };
/** The move you just played, marked on its squares: green tick for a book move, red cross for a wrong one.
 *  Replaces the board shake. `uci` gives the from/to squares; without it nothing is drawn. */
let tileTimer: any;
const clearMark = () => { const l = $('#mmarks'); if (l) l.textContent = ''; };
const markMove = (san: string, ok: boolean, uci?: string) => {
  const layer = $('#mmarks'); if (!layer) return;
  clearMark();
  const m = (uci ? parseUci(uci) : undefined) as any;
  if (!m) return;
  const black = orient() === 'black';
  const cell = (sq: number, cls: string) => {
    const f = sq & 7, r = sq >> 3;
    const d = document.createElement('div');
    d.className = 'mm ' + cls;
    d.style.left = `${(black ? 7 - f : f) * 12.5}%`;
    d.style.top = `${(black ? r : 7 - r) * 12.5}%`;
    return d;
  };
  layer.appendChild(cell(m.from, ok ? 'ok' : 'bad'));
  const dest = cell(m.to, (ok ? 'ok' : 'bad') + ' dest');
  dest.innerHTML = `<span class="g" aria-hidden="true">${ok ? '✓' : '✕'}</span>`;
  dest.title = san;
  layer.appendChild(dest);
  clearTimeout(tileTimer); tileTimer = setTimeout(clearMark, ok ? 1100 : 2400);
};
const sanAt = (k: string, u: string) => { try { return makeSan(fromKey(k), parseUci(u)!); } catch { return u; } };

const cg: any = Chessground($('#board'), {
  animation: { duration: 200 },
  premovable: { enabled: false, showDests: true, castle: true },
  draggable: { distance: 4 },
  drawable: { brushes: { green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 }, red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 }, blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 }, yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 }, hint: { key: 'h', color: '#e3b653', opacity: 0.92, lineWidth: 11 },
        move: { key: 'm', color: '#2f8f5b', opacity: 0.85, lineWidth: 10 },
        reply: { key: 'p', color: '#5b6472', opacity: 0.8, lineWidth: 9 },
        gap: { key: 'x', color: '#c0392b', opacity: 0.8, lineWidth: 9 },
        fork: { key: 'f', color: '#7c5cff', opacity: 0.9, lineWidth: 10 } } } as any,
  movable: { free: false, events: { after: (o: string, d: string) => onMove(o, d) } },
});

let piecesLoaded = false;
async function nativeStyle(light: boolean) {
  try {
    const { Capacitor } = await import('@capacitor/core'); if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: light ? '#f3efe6' : '#0e161c' });
  } catch { /* not running in the native app */ }
}
async function nativeInit() {
  try {
    const { Capacitor } = await import('@capacitor/core'); if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      const d = document.querySelector('dialog[open]') as HTMLDialogElement | null;
      if (d) { d.close('cancel'); return; }
      if (mode !== 'build') { enter('build'); return; }
      App.minimizeApp();
    });
  } catch { /* not running in the native app */ }
}
function applySettings() {
  f = fsrs({ request_retention: S.retention });
  const de = document.documentElement; de.dataset.theme = S.theme; de.dataset.appearance = S.appearance; de.dataset.pieces = S.pieces;
  if (prevCg) renderPreview();
  const light = S.appearance === 'light' || (S.appearance === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  $('#themecolor')?.setAttribute('content', light ? '#f3efe6' : '#0e161c');
  if (S.pieces !== 'cburnett' && !piecesLoaded) { piecesLoaded = true; import('./pieces.css'); }
  nativeStyle(light);
  cg.set({ coordinates: S.coords, animation: { enabled: S.anim, duration: 200 } });
}

/* ---------- Premove ----------
   Chess.com-style: while the opponent is thinking you may drag or tap out your next move.
   chessground holds the pending move (it allows any square the piece could reach on an empty
   board), and `consumePremove` plays it the moment your turn comes back — or drops it if the
   opponent's move made it illegal. */
function premoveColor(): Color | undefined {
  if (mode === 'tactics') return tColor;
  if (mode === 'endgames') return eColor;
  if (mode === 'learn') return cur?.color;
  return undefined;                       // Build, Review: no opponent to pre-move against
}
function premoveAllowed(): boolean {
  const me = premoveColor();
  if (!me || pos.turn === me || locked || promo) return false;
  if (mode === 'endgames') return !!eRun && !eEnded;
  if (mode === 'tactics') return !!tRun && !tGraded;
  return S.lmode === 'arena' ? !!aRun && !aRun.ended : !!cur;
}
function takePremove(): any | undefined {
  const at: [string, string] | undefined = cg.state.premovable.current;
  if (!at) return undefined;
  cg.cancelPremove();
  if (!pos.board.get(parseSquare(at[0]) ?? 64)) return undefined;
  return toMove(at[0], at[1]);            // same normalisation as a real move (castling, promotion)
}
function consumePremove(): boolean {
  const m = takePremove(); if (!m) return false;
  if (!pos.isLegal(m)) return false;      // the opponent's move blocked it: drop it silently
  commit(m);
  return true;
}

function show(shapes: any[] = [], can = true) {
  canNow = can;
  const pm = !can && premoveAllowed();
  if (!pm && cg.state.premovable.current) cg.cancelPremove();
  cg.set({
    fen: makeFen(pos.toSetup()), orientation: orient(), turnColor: pos.turn,
    check: pos.isCheck() ? pos.turn : false,
    lastMove: last ? lastPair(last) : undefined,
    premovable: { enabled: pm },
    movable: { color: can ? pos.turn : pm ? premoveColor() : undefined, dests: can ? chessgroundDests(pos) : new Map() },
  });
  cg.setAutoShapes(shapes);
}

function pathText(us: string[]) {
  const p = Chess.default(); let s = '';
  us.forEach((u, i) => { const m = parseUci(u)!; s += (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + makeSan(p, m) + ' '; p.play(m); });
  return s.trim();
}
function play(u: string) { lastKey = key(pos); pos.play(parseUci(u)!); last = u; line.push(u); }
function toMove(o: string, d: string) {
  const from = parseSquare(o)!; let to = parseSquare(d)!;
  const pc = pos.board.get(from);
  if (pc?.role === 'king' && Math.abs((from & 7) - (to & 7)) === 2) to = (to & 7) > (from & 7) ? (from & 56) | 7 : from & 56;
  const promotion = pc?.role === 'pawn' && ((to >> 3) === 0 || (to >> 3) === 7) ? 'queen' : undefined;
  return { from, to, promotion } as any;
}

function sched(store: Record<string, any>, id: string, rating: any): Date {
  const c = store[id];
  const card = c ? { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined } : createEmptyCard();
  const r = f.next(card, new Date(), rating).card; store[id] = r; save(); return r.due;
}
const isDue = (c: any) => !c || new Date(c.due) <= new Date();
const queueKeys = () => {
  if (!cur) return [];
  const all = Object.keys(cur.moves).filter(k => Object.keys(cur!.moves[k]).length && k.split(' ')[1] === mine());
  const now = new Date();
  const due = all.filter(k => cur!.cards[k] && new Date(cur!.cards[k].due) <= now);
  const fresh = shuffle(all.filter(k => !cur!.cards[k])).slice(0, S.newCap);
  return shuffle([...due, ...fresh]);
};
const dueCount = (store: Record<string, any>) => Object.keys(store).filter(k => isDue(store[k])).length;
/** Three facts about where you are, pinned to the foot of the panel so a short mode is not a blank column. */
function renderStrip() {
  const el = $('#strip') as HTMLElement | null; if (!el) return;
  const bits: [string, string][] = [];
  if (mode === 'build' && cur) {
    bits.push([String(Object.keys(cur.moves).length), 'positions'], [String(Object.keys(cur.moves).filter(k => k.split(' ')[1] === mine()).length), 'yours'], [String(walkLines().length), 'lines'], [String(cur.bad ? Object.keys(cur.bad).length : 0), 'flagged']);
  } else if (mode === 'learn' && cur) {
    const ls = wLines.length ? wLines : walkLines();
    bits.push([String(ls.filter(seenLine).length), 'discovered'], [String(ls.length), 'lines'], [String(bestOf('drill')), 'best streak']);
  } else if (mode === 'review' && cur) {
    const h = cur.hist ?? {}, days = Object.keys(h).sort().slice(-7);
    const week = days.reduce((a, d) => a + h[d], 0);
    bits.push([String(dueCount(cur.cards)), 'due today'], [String(Object.keys(cur.cards).length), 'seen before'], [String(week), 'reviews this week']);
  } else if (mode === 'tactics') {
    const w = weekAccuracy();
    bits.push([String(Math.round(pstats.rating)), 'rating'], [w.n ? `${w.pct}%` : '—', `7-day (${w.n})`], [String(pstats.streak), 'streak']);
  } else if (mode === 'endgames') {
    const defs = allDrills();
    bits.push([String(defs.filter(d => ecards[d.id]).length), 'practised'], [String(defs.length), 'drills'], [String(defs.filter(d => ecards[d.id] && isDue(ecards[d.id])).length), 'due']);
  }
  el.hidden = !bits.length;
  el.innerHTML = bits.map(([v, l]) => `<span><b>${esc(v)}</b>${esc(l)}</span>`).join('');
}
const updateDue = () => {
  $('#due').textContent = cur ? queueKeys().length || '' : '';
  $('#tdue').textContent = dueCount(pcards) || ''; $('#edue').textContent = dueCount(ecards) || '';
  renderStrip();
};

function buildIndex() {
  parent.clear(); const seen = new Set([START]); const q = [START];
  while (q.length) {
    const k = q.shift()!;
    for (const u of Object.keys(cur!.moves[k] || {})) {
      const p = fromKey(k); p.play(parseUci(u)!); const nk = key(p);
      if (!seen.has(nk)) { seen.add(nk); parent.set(nk, { from: k, uci: u }); q.push(nk); }
    }
  }
}
function pathTo(k: string) {
  const us: string[] = [];
  while (k !== START && parent.has(k)) { const e = parent.get(k)!; us.unshift(e.uci); k = e.from; }
  return us;
}

/* ---------- Moves ---------- */
function onMove(o: string, d: string) {
  if (opening(mode) && !cur) return;
  if (mode === 'endgames' && eBusy) return void show();
  if (mode === 'learn' && S.lmode === 'arena' && aBusy) return void show();
  if (locked) return;
  const m = toMove(o, d);
  if (m.promotion) return askPromo(m);
  commit(m);
}
function askPromo(m: any) {
  locked = true; promo = { m, prev: $('#act').innerHTML };
  msg('Promote to:');
  $('#act').innerHTML = `<div class="row">${['queen', 'rook', 'bishop', 'knight'].map(r => `<button data-act="promo" data-u="${r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}<button data-act="promocancel">Cancel</button></div>`;
}
function commit(m: any) {
  if (mode === 'tactics') return tacticsAnswer(m);
  if (mode === 'endgames') return void endgameAnswer(m);
  if (mode === 'learn' && S.lmode === 'arena') return void arenaAnswer(m);
  const u = makeUci(m), s = makeSan(pos, m), k = key(pos);
  if (mode === 'build') {
    const snap = snapRep();
    markMove(s, true, u); (cur!.moves[k] ??= {})[u] = s;
    save(); line.push(u); sfx('move'); renderBuild();
    if (uStack[uStack.length - 1] !== snap) { uStack.push(snap); if (uStack.length > 80) uStack.shift(); rStack.length = 0; }
    void checkBlunder(k, u);
  }
  else if (mode === 'learn') learnAnswer(u, k);
  else reviewAnswer(u, k);
}

/* ---------- Notes, import and export ---------- */
function importInto(rep: Rep, text: string) {
  let n = 0; rep.notes ??= {};
  const walk = (node: any, p: Chess) => {
    for (const c of node.children) {
      const m = parseSan(p, c.data.san); if (!m) continue;
      const k = key(p), u = makeUci(m);
      (rep.moves[k] ??= {})[u] = makeSan(p, m); n++;
      const txt = [...(c.data.startingComments ?? []), ...(c.data.comments ?? [])].join(' ').replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      if (txt) rep.notes[k + '|' + u] = txt;
      const q = p.clone(); q.play(m); walk(c, q);
    }
  };
  for (const g of parsePgn(text)) { const p = startingPosition(g.headers); if (p.isOk) walk(g.moves, p.unwrap() as Chess); }
  return n;
}
function pgnLine(k: string, ply: number, force: boolean, seen: Set<string>): string {
  const ent = Object.entries(cur!.moves[k] || {});
  if (!ent.length || seen.has(k) || ply > 120) return '';
  seen.add(k);
  const n = Math.floor(ply / 2) + 1;
  const label = (s: string, fo: boolean) => (ply % 2 === 0 ? `${n}. ` : fo ? `${n}... ` : '') + s;
  const nt = (u: string) => {
    const t = cur!.notes?.[k + '|' + u];
    const tag = cur!.tags?.[k + '|' + u];
    const nag = tag && TAG_NAG[tag] ? ` $${TAG_NAG[tag]}` : '';
    return (t ? ` {${t.replace(/[{}]/g, '')}}` : '') + nag;
  };
  const next = (u: string) => { const p = fromKey(k); p.play(parseUci(u)!); return key(p); };
  const [[u0, s0], ...rest] = ent;
  let out = label(s0, force) + nt(u0);
  for (const [u, s] of rest) { const sub = pgnLine(next(u), ply + 1, false, new Set(seen)); out += ` (${label(s, true)}${nt(u)}${sub ? ' ' + sub : ''})`; }
  return (out + ' ' + pgnLine(next(u0), ply + 1, rest.length > 0, seen)).trim();
}
function mergeReps(imp: Rep[]) {
  const t = (x: any) => (x?.last_review ? +new Date(x.last_review) : 0);
  for (const r of imp) {
    r.notes ??= {};
    const ex = reps.find(x => x.id === r.id);
    if (!ex) { reps.push(r); continue; }
    ex.notes ??= {};
    for (const [k, v] of Object.entries(r.moves)) ex.moves[k] = { ...v, ...(ex.moves[k] || {}) };
    for (const [k, v] of Object.entries(r.notes)) ex.notes[k] ??= v;
    ex.best = { drill: Math.max(ex.best?.drill ?? 0, r.best?.drill ?? 0), time: Math.max(ex.best?.time ?? 0, r.best?.time ?? 0) };
    if ((r.arena?.games ?? 0) > (ex.arena?.games ?? 0)) ex.arena = r.arena;
    for (const [k, c] of Object.entries(r.cards)) if (!ex.cards[k] || t(c) > t(ex.cards[k])) ex.cards[k] = c;
  }
}
async function download(name: string, text: string, type = 'application/json') {
  name = name.replace(/[\\/:*?"<>|]/g, '-');
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const { save: pick } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await pick({ defaultPath: name });
      if (path) { await writeTextFile(path, text); msg('Saved.', 'ok'); }
      return;
    }
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, url: r.uri });
      return;
    }
  } catch { msg('Could not save the file.', 'bad'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const exportPgn = () => cur && download(`${cur.name}.pgn`, `[Event "${cur.name.replace(/"/g, '')}"]\n[Orientation "${cur.color}"]\n\n${pgnLine(START, 0, false, new Set())} *\n`, 'application/x-chess-pgn');
const stateJson = () => JSON.stringify({ app: 'jan20', v: 3, exported: new Date().toISOString(), settings: S, reps, tactics: { cards: pcards, stats: pstats, imported }, endgames: { cards: ecards, custom: egCustom } });
const exportAll = () => download(`jan20-backup-${new Date().toISOString().slice(0, 10)}.json`, stateJson());

/* ---------- Build ---------- */
const snapRep = () => ({ moves: structuredClone(cur!.moves), notes: structuredClone(cur!.notes ?? {}), bad: structuredClone(cur!.bad ?? {}), tags: structuredClone(cur!.tags ?? {}) });
type RepSnap = { moves: any; notes: any; bad: any; tags: any };
const uStack: RepSnap[] = [], rStack: RepSnap[] = [];
function snapNow(): RepSnap { const s = snapRep(); uStack.push(s); if (uStack.length > 80) uStack.shift(); rStack.length = 0; return s; }
function applySnap(s: RepSnap) {
  if (!cur) return;
  cur.moves = s.moves; cur.notes = s.notes; cur.bad = s.bad; cur.tags = s.tags;
  save();
  if (mode === 'build') { line = line.filter(Boolean); if (line.length) { const p = Chess.default(); for (const u of line) { const m = parseUci(u); if (!m) break; p.play(m); } } renderBuild(); }
}
/** Keep an edit reversible: snapshot first, tell the user afterwards. */
function undoable(text: string, snap?: RepSnap) {
  if (snap && uStack[uStack.length - 1] !== snap) { uStack.push(snap); if (uStack.length > 80) uStack.shift(); rStack.length = 0; }
  if (uStack.length) toast(text, { ms: 4200, action: 'Undo', onAction: doUndo });   // the button does what Ctrl+Z does
  else toast(text, { ms: 3000 });
}
function doUndo() {
  if (!uStack.length) return void toast('Nothing left to undo.', { ms: 1400 });
  rStack.push(snapRep()); applySnap(uStack.pop()!); toast('Undone. Ctrl+Shift+Z to redo.', { ms: 1800 });
}
function doRedo() {
  if (!rStack.length) return void toast('Nothing to redo.', { ms: 1400 });
  uStack.push(snapRep()); applySnap(rStack.pop()!); toast('Redone.', { ms: 1500 });
}
/** Every move of yours the engine flagged, worst first. */
function weakSpots() {
  if (!cur?.bad) return [] as { nk: string; k: string; san: string; delta: number; line: string[] }[];
  return Object.entries(cur.bad).map(([nk, delta]) => {
    const [k, u] = nk.split('|');
    return { nk, k, san: sanOfUci(k, u), delta, line: pathTo(k) };
  }).sort((a, b) => b.delta - a.delta);
}
/** How many line-ends sit below this position: the size of the branch you would cut. */
function leavesUnder(k: string): number {
  const us = Object.keys(cur?.moves[k] || {});
  if (!us.length) return 1;
  let n = 0;
  for (const u of us) { const p = fromKey(k); const m = parseUci(u); if (!m) continue; p.play(m); n += leavesUnder(key(p)); }
  return n;
}
const sanOfUci = (k: string, u: string): string => { const p = fromKey(k); const m = parseUci(u); return m ? makeSan(p, m) : u; };
/** Stockfish can report castling as king-takes-rook; bring any engine move back into our own UCI space. */
const engNorm = (k: string, uci: string): string => {
  try { const m = fromEngine(fromKey(k), uci); return m ? makeUci(m as any) : uci; } catch { return uci; }
};
async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast('Copied to the clipboard.', { ms: 1600 }); }
  catch { toast('Could not reach the clipboard.', { ms: 2000 }); }
}
/** One line as PGN, so it can be copied out or moved into another pack. */
function pgnOfLine(l: string[]): string {
  const p = Chess.default(); let out = '';
  l.forEach((u, i) => { const m = parseUci(u)!; out += (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + makeSan(p, m) + ' '; p.play(m); });
  return out + '*';
}
/** Append a pasted SAN/PGN line to the position you are standing on. */
function pasteLine(text: string): number {
  if (!cur) return 0;
  const clean = text
    .replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ')
    .replace(/\d+\s*\.(\s*\.\.)?/g, ' ').replace(/\b(1-0|0-1|1\/2-1\/2)\b/g, ' ').replace(/\*/g, ' ').trim();
  const toks = clean.split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  // read the paste from the start position, so a whole line can be pasted while standing at its end
  const scratch = Chess.default(); const seq: { u: string; san: string }[] = [];
  for (const t of toks) {
    const m = parseSan(scratch, t);
    if (!m) break;
    seq.push({ u: makeUci(m), san: makeSan(scratch, m) }); scratch.play(m);
  }
  if (!seq.length) { toast('No legal moves in that text.', { ms: 3000 }); return 0; }
  const skip = line.length && seq.length >= line.length && line.every((u, i) => seq[i].u === u) ? line.length : 0;
  const rest = seq.slice(skip);
  if (!rest.length) { toast('That line is already saved here.', { ms: 2600 }); return 0; }
  const p = Chess.default(); for (const u of line) p.play(parseUci(u)!);
  const snap = snapRep(); const played: string[] = [];
  for (const mv of rest) {
    const m = parseSan(p, mv.san);
    if (!m || makeUci(m) !== mv.u) { toast(`Stopped at ${mv.san} — it does not follow from this position.`, { ms: 4200 }); break; }
    const k = key(p);
    (cur.moves[k] ??= {})[mv.u] = mv.san;
    p.play(m); played.push(mv.u);
  }
  if (!played.length) return 0;
  line.push(...played); save(); renderBuild();
  undoable(`Added ${played.length} move${played.length === 1 ? '' : 's'} from the pasted line.`, snap);
  return played.length;
}

/** Engine guard: flag a move of yours that is a mistake you would not want to memorise. */
/** Update the warning mark on one chip without rebuilding the panel. */
function paintWarn(u: string, delta?: number) {
  if (mode !== 'build') return;
  const chip = document.querySelector(`.chip[data-chip="${u}"]`) as HTMLElement | null;
  if (!chip) return;
  const old = chip.querySelector('.warn') as HTMLElement | null;
  if (!delta) { old?.remove(); return; }
  if (old) { old.title = `About ${(delta / 100).toFixed(1)} worse than the best move here`; return; }
  const b = document.createElement('b');
  b.className = 'warn'; b.textContent = '⚠';
  b.title = `About ${(delta / 100).toFixed(1)} worse than the best move here`;
  chip.insertBefore(b, chip.querySelector('[data-act=del]'));
}
/** Say why the repertoire move is the repertoire move: the engine's view, compared with the move's own note. */
async function whyBook(k: string, u: string) {
  if (!cur || !S.explain) return;
  const base = noteOf(k, u);
  if (base) return;                                  // the author already explained it
  const tok = session, fen = fenOf(fromKey(k)), p = fromKey(k);
  try {
    const r = await engine.search(fen, { ms: Math.min(600, Math.max(300, S.engineMs)), multipv: 3 });
    if (tok !== session || mode !== 'review') return;
    const mine = r.lines.find(l => engNorm(k, l.pv[0]) === u) ?? (engNorm(k, r.best) === u ? { score: r.score, pv: [u] } : undefined);
    const san = sanAt(k, u);
    const bestSan = r.best ? sanOfUci(k, engNorm(k, r.best)) : '';
    const cp = (x?: number) => (x == null ? '—' : (x >= 0 ? '+' : '') + (x / 100).toFixed(1));
    const text = !mine
      ? `Book move: ${san}. The engine did not rank it in its top three here (it likes ${bestSan}).`
      : bestSan && bestSan !== san
        ? `Book move: ${san} (${cp(mine.score)}). The engine's first choice is ${bestSan} (${cp(r.score)}) — the book keeps to its plan.`
        : `Book move: ${san} — the engine's first choice too (${cp(r.score)}).`;
    showNote(text);
  } catch { /* no engine, no explanation */ }
}
async function checkBlunder(k: string, u: string, quiet = false) {
  if (!cur || !S.explain) return;
  if (fromKey(k).turn !== cur.color) return;      // a mistake by the opponent is a trap you want, not a warning
  try {
    const fen = fenOf(fromKey(k));
    const ms = Math.min(700, Math.max(300, S.engineMs));
    const r = await engine.search(fen, { ms, multipv: 4 });
    let mine = r.lines.find(l => engNorm(k, l.pv[0]) === u);
    if (!mine) { const s = await engine.search(fen, { ms: 350, searchmoves: [toEngine(fromKey(k), parseUci(u) as any)] }); mine = { score: s.score, mate: s.mate, pv: [u] }; }
    const delta = r.score - (mine.score ?? 0), nk = k + '|' + u;
    if (delta >= 150) {
      (cur.bad ??= {})[nk] = delta; save(); paintWarn(u, delta);
      if (!quiet) toast(`⚠ ${sanOfUci(k, u)} is about ${(delta / 100).toFixed(1)} worse than ${sanOfUci(k, engNorm(k, r.best))} here. Saved anyway — Ctrl+Z to drop it.`, { ms: 6000 });
    } else if (cur.bad?.[nk]) { delete cur.bad[nk]; save(); paintWarn(u, undefined); }
  } catch { /* no engine available: stay quiet */ }
}
/** Check every move of yours in the line you are looking at. */
async function checkLine() {
  if (!cur || !line.length) return void toast('Open a line first.', { ms: 1800 });
  msg('Checking this line with the engine…');
  const p = Chess.default(); let flagged = 0;
  for (const u of line) {
    const k = key(p), m = parseUci(u)!;
    if (p.turn === cur.color) { await checkBlunder(k, u, true); if (cur.bad?.[k + '|' + u]) flagged++; }
    p.play(m);
  }
  if (mode === 'build') renderBuild();
  msg(flagged ? `${flagged} move${flagged === 1 ? '' : 's'} of yours in this line look${flagged === 1 ? 's' : ''} wrong (marked ⚠).` : 'The engine likes every move of yours in this line.', flagged ? 'bad' : 'ok');
}
/** Opponent moves the engine rates that you have no reply prepared for. */
async function findGaps() {
  if (!cur) return;
  const k = key(pos);
  if (pos.turn === cur.color) return void toast('Gaps are opponent moves with no answer prepared — stand on a position where the opponent is to move.', { ms: 4600 });
  const out = $('#gapout'); if (out) out.innerHTML = '<p class="dim">Asking the engine which moves are worth preparing for…</p>';
  msg('Looking for opponent moves you have no answer for…');
  try {
    const r = await engine.search(fenOf(pos), { ms: Math.max(600, S.engineMs), multipv: 6 });
    const seen = new Set<string>(); const rows: { u: string; san: string; open: boolean }[] = [];
    for (const l of r.lines) {
      const u = l.pv[0]; if (seen.has(u)) continue; seen.add(u);
      const p = fromKey(k), m = parseUci(u); if (!m) continue;
      const san = makeSan(p, m); p.play(m);
      rows.push({ u, san, open: !Object.keys(cur!.moves[key(p)] || {}).length });
    }
    const gaps = rows.filter(x => x.open);
    if (gaps.length) show(gaps.map(x => ({ ...arrow(x.u), brush: 'gap' })));
    if (out) out.innerHTML = gaps.length
      ? `<div class="row mini">${gaps.map(x => `<button data-act="gapadd" data-u="${x.u}">${esc(x.san)}</button>`).join('')}</div>`
      : '<p class="dim">Every move the engine likes here already has an answer prepared.</p>';
    msg(gaps.length ? `${gaps.length} gap${gaps.length === 1 ? '' : 's'} here.` : 'No gaps here.');
  } catch { msg('The engine did not answer.', 'bad'); }
}
/** Delete several lines at once, by the numbers they had when you picked them. */
function deleteMany(idxs: number[]) {
  if (!cur || !idxs.length) return;
  const snap = snapRep();
  const wanted = new Set(idxs.map(i => lineKey(walkLines()[i] || [])).filter(Boolean));
  let guard = 0, removed = 0;
  while (wanted.size && guard++ < 400) {
    const lines = walkLines(); const hit = lines.findIndex(l => wanted.has(lineKey(l)));
    if (hit < 0) break;
    if (!deleteLine(hit, true)) wanted.delete(lineKey(lines[hit])); else removed++;
  }
  save(); renderBuild();
  undoable(`Removed ${removed} line${removed === 1 ? '' : 's'}.`, snap);
}
/** Drop every position that can no longer be reached from the start (deleting a move used to leave them behind). */
function pruneUnreachable(): number {
  if (!cur) return 0;
  const seen = new Set([START]); const q = [START];
  while (q.length) {
    const k = q.shift()!;
    for (const u of Object.keys(cur.moves[k] || {})) {
      const p = fromKey(k); p.play(parseUci(u)!); const nk = key(p);
      if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
    }
  }
  let gone = 0;
  for (const k of Object.keys(cur.moves)) if (!seen.has(k)) { delete cur.moves[k]; gone++; }
  for (const nk of Object.keys(cur.notes || {})) if (!seen.has(nk.split('|')[0])) delete cur.notes![nk];
  return gone;
}
/** Remove a whole numbered line: cut the move where it leaves every other line, then prune. */
function deleteLine(i: number, quiet = false): boolean {
  const lines = walkLines(); const l = lines[i]; if (!cur || !l) return false;
  let common = 0;
  lines.forEach((o, j) => {
    if (j === i) return; let k = 0;
    while (k < l.length && k < o.length && l[k] === o[k]) k++;
    if (k > common) common = k;
  });
  if (common >= l.length) return false;                 // a duplicate of another line: nothing unique to cut
  const p = Chess.default(); for (const u of l.slice(0, common)) p.play(parseUci(u)!);
  const k = key(p), u = l[common], san = cur.moves[k]?.[u]; if (!san) return false;
  const snap = snapRep();
  delete cur.moves[k][u]; if (!Object.keys(cur.moves[k]).length) delete cur.moves[k];
  const gone = pruneUnreachable();
  if (quiet) return true;
  save(); renderBuild();
  undoable(`Removed line ${i + 1} (${san})${gone ? ` and ${gone} position${gone === 1 ? '' : 's'} below it` : ''}`, snap);
  return true;
}

function renderBuild() {
  const wasOpen = [...document.querySelectorAll('#act details')].map(d => (d as HTMLDetailsElement).open);
  pos = Chess.default(); last = undefined; lastKey = undefined; lastSan = '';
  for (const u of line) { const m = parseUci(u)!; lastKey = key(pos); lastSan = makeSan(pos, m); pos.play(m); last = u; }
  show(); showNote('');
  const keys = Object.keys(cur!.moves);
  const mv = cur!.moves[key(pos)] || {};
  msg(pos.turn === cur!.color ? 'Play a move to save it.' : 'Prepare a reply.');
  $('#path').textContent = pathText(line);
  const here = key(pos), isMine = pos.turn === cur!.color;
  // the saved moves at this position are drawn on the board, not just written under it
  const saved = Object.keys(mv);
  if (saved.length) show(saved.map(u => ({ ...arrow(u), brush: isMine ? 'move' : 'reply' })));
  const chips = Object.entries(mv).map(([u, s], i) => {
    const dot = noteOf(here, u) ? '<b class="dot" title="This move has a note">•</b>' : '';
    const bad = cur!.bad?.[here + '|' + u];
    const warn = bad ? `<b class="warn" title="About ${(bad / 100).toFixed(1)} worse than the best move here">⚠</b>` : '';
    const main = i ? `<button data-act="main" data-u="${u}" aria-label="Make ${esc(s)} the first move here" title="Make ${esc(s)} the first move here">↑</button>` : '';
    return `<span class="chip ${isMine ? 'mine' : 'opp'}" draggable="true" data-chip="${u}"><button data-act="go" data-u="${u}">${esc(s)}${tagHtml(here, u)}</button>${dot}${warn}${main}<button data-act="del" data-u="${u}" aria-label="Delete ${esc(s)}">✕</button></span>`;
  }).join('');
  const editor = last ? `<label class="field">Note for ${esc(lastSan)}<textarea id="note-ed" maxlength="800" placeholder="Why this move? Plans, traps, what to remember.">${esc(noteOf(lastKey, last))}</textarea></label>
    <div class="row mini annots" role="group" aria-label="Annotation for ${esc(lastSan)}">${TAGS.map(([v, g, t]) => `<button class="tagbtn ${tagOf(lastKey, last) === v ? 'on' : ''}" data-act="tag" data-u="${v}" title="${esc(t)}" aria-pressed="${tagOf(lastKey, last) === v}">${esc(g)}</button>`).join('')}</div>` : '';
  const lines = walkLines(); const lhtml = lines.map((l, i) => lineHtml(l, lines[i - 1]));
  const through = lines.filter(l => line.every((u, i) => l[i] === u)).length;
  const below = leavesUnder(here);
  const others = reps.filter(r => r.id !== cur!.id);
  const bad = weakSpots();
  const plain = lhtml.map(h => h.replace(/<[^>]*>/g, ''));
  const rows = lines.map((l, i) =>
    `<div class="rowline ${i === 0 ? 'first' : ''}" data-line="${esc((plain[i] + ' ' + lineName(l)).toLowerCase())}"><input type="checkbox" class="pick" data-u="${i}" ${picked.has(i) ? 'checked' : ''} aria-label="Select line ${i + 1}"><span>${i + 1}.</span><button class="walk" data-act="goline" data-u="${i}" title="Open this line to edit it">${lineName(l) ? `<b class="lname">${esc(lineName(l))}</b> ` : ''}${lhtml[i]}</button><button data-act="nameline" data-u="${i}" title="Name this line" aria-label="Name line ${i + 1}">✎</button><button data-act="dline" data-u="${i}" aria-label="Delete line ${i + 1}">✕</button></div>`).join('');
  const lineList = `<div class="linehead"><div class="seg viewseg" role="tablist"><button data-act="viewtree" class="${treeView ? 'on' : ''}">Tree</button><button data-act="viewlines" class="${treeView ? '' : 'on'}">Lines (${lines.length})</button></div><span class="mini"><button data-act="bprev" aria-label="Previous line" title="Previous line">‹</button><button data-act="bnext" aria-label="Next line" title="Next line">›</button></span></div>
    ${treeView
      ? `<div class="tree">${treeMarkup()}</div>`
      : `${lines.length > 6 ? `<input id="linefilter" placeholder="Filter lines — a move, like Bb5" aria-label="Filter lines by move"><span class="hintline" id="linecount"></span>` : ''}<div class="list">${lines.length ? rows : '<p class="dim">No lines yet. Play a move to start one.</p>'}</div>
    ${lines.length ? `<div class="row mini"><button data-act="selall">${picked.size ? 'Clear selection' : 'Select all'}</button><button data-act="delpick" class="danger" ${picked.size ? '' : 'disabled'}>Delete selected</button>${others.length ? `<select id="copytarget" aria-label="Copy the selected lines into another pack"><option value="">Copy to…</option>${others.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button data-act="copypick" ${picked.size ? '' : 'disabled'}>Copy</button>` : ''}</div>` : ''}`}`;
  $('#act').innerHTML = `<div class="chips">${chips || '<span class="chip slot" title="Play a move to save it here" aria-label="No moves saved here yet">＋</span>'}</div>
    ${editor}
    <div class="row"><button data-act="mprev" aria-label="Previous move" title="Previous move (←)">‹ Move</button><button data-act="mnext" aria-label="Next move" title="Next move (→)">Move ›</button><button data-act="undo2" aria-label="Undo" title="Undo (Ctrl+Z)">↶</button><button data-act="redo2" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</button><button data-act="reset">Start</button><button data-act="flip">Flip board</button></div>
    <p class="stats">here: ${Object.keys(mv).length} saved move${Object.keys(mv).length === 1 ? '' : 's'} · ${through} line${through === 1 ? '' : 's'} through · ${below} ends below</p>
    <details><summary>Lines and tree</summary>${lineList}</details>
    <details><summary>Paste or copy a line</summary>
      <textarea id="paste" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4 — pasted from anywhere, variations and comments ignored"></textarea>
      <div class="row mini"><button data-act="paste" class="primary">Add from here</button><button data-act="copyline">Copy this line</button></div>
    </details>
    ${bad && bad.length ? `<details class="weak"><summary>Weak spots (${bad.length})</summary>
      
      <div class="list">${bad.map(w => `<div class="rowline weakrow"><span class="delta">−${(w.delta / 100).toFixed(1)}</span><button class="walk" data-act="wjump" data-u="${esc(w.k)}" title="Go to this move">${esc(w.san)}</button><span class="dim">${esc(pathText(w.line).slice(-28))}</span><button data-act="unflag" data-u="${esc(w.nk)}" aria-label="Clear this flag">✕</button></div>`).join('')}</div>
      <div class="row mini"><button data-act="checkline">Re-check the line you are on</button></div></details>` : ''}
    <details><summary>Gaps and engine</summary>
      <div id="gapout"><p class="dim">Find opponent moves here that you have no answer prepared for.</p></div>
      <div class="row mini"><button data-act="gaps">Find gaps here</button><button data-act="checkline">Check this line</button></div>
    </details>
    <details><summary>More</summary>
      <textarea id="pgn" placeholder="Paste a PGN with variations and comments"></textarea>
      <div class="row"><button data-act="pgn">Import PGN</button><button data-act="exportpgn">Export PGN</button><button data-act="rename">Rename</button><button data-act="delrep" class="danger">Delete</button></div>
    </details>`;
  [...document.querySelectorAll('#act details')].forEach((d, i) => { if (wasOpen[i] !== undefined) (d as HTMLDetailsElement).open = wasOpen[i]; });
  updateDue();
}

function importPgn(text: string) {
  const n = importInto(cur!, text);
  save(); renderBuild(); msg(n ? `Imported ${n} moves.` : 'No moves found in that PGN.', n ? 'ok' : 'bad');
}

/* ---------- Learn: walk, drill, time trial, arena ---------- */
const LMODES: [LMode, string][] = [['walk', 'Walk'], ['drill', 'Drill'], ['time', 'Time'], ['arena', 'Arena']];
const lmodeBar = () => `<div class="seg" role="tablist">${LMODES.map(([m, l]) => `<button data-act="lmode" data-u="${m}" class="${S.lmode === m ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const bestOf = (k: 'drill' | 'time') => cur?.best?.[k] ?? 0;
const setBest = (k: 'drill' | 'time', v: number) => { cur!.best ??= {}; if (v > (cur!.best[k] ?? 0)) { cur!.best[k] = v; save(); return true; } return false; };
const ownKeys = () => Object.keys(cur!.moves).filter(k => k.split(' ')[1] === mine() && Object.keys(cur!.moves[k]).length);
const fast = () => S.lmode === 'drill' || S.lmode === 'time';

async function explainWrong(k: string, u: string, base = '') {
  if (!S.explain) return;
  const tok = session; const prepared = Object.keys(cur!.moves[k] || {}); if (!prepared.length) return;
  const fen = fenOf(pos), join = (t: string) => (base ? base + '\n\n' : '') + t;
  showNote(join('Checking with the engine…'));
  try { const text = await explain(engine, fen, u, prepared, Math.min(400, S.engineMs)); if (tok === session) showNote(join(text)); }
  catch { if (tok === session) showNote(base); }
}

/* Walk: a numbered walkthrough of every line in the repertoire, one after another. */
function walkLines(rep: Rep | undefined = cur): string[][] {
  const out: string[][] = [];
  if (!rep) return out;
  const walk = (k: string, path: string[]) => {
    if (out.length >= 400) return;
    const us = Object.keys(rep!.moves[k] || {});
    if (!us.length) { if (path.length) out.push(path); return; }
    for (const u of us) {
      const p = fromKey(k); p.play(parseUci(u)!);
      walk(key(p), [...path, u]);
    }
  };
  walk(START, []);
  return out;
}
/** Which numbered line does this played prefix belong to? Stays on the current line while it still matches,
 *  and only re-homes when the player deviates. Without that check every line starting 1.e4 snapped back to line 1. */
function lineOf(prefix: string[]) {
  const here = wLines[wIdx];
  if (here && prefix.every((u, i) => here[i] === u)) return wIdx;
  const hit = wLines.findIndex(l => prefix.every((u, i) => l[i] === u));
  return hit < 0 ? wIdx : hit;
}
/** SAN text of one line, with the first move that differs from the previous line emphasised. */
function lineHtml(l: string[], prev?: string[]): string {
  let diff = 0;
  if (prev) { diff = l.findIndex((u, i) => prev[i] !== u); if (diff < 0) diff = l.length - 1; }
  const p = Chess.default(); let out = '';
  l.forEach((u, i) => {
    const m = parseUci(u)!; const san = makeSan(p, m); p.play(m);
    out += (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + (i === diff ? `<b class="diff">${esc(san)}</b>` : esc(san)) + (i < l.length - 1 ? ' ' : '');
  });
  return out;
}
let wHtml: string[] | undefined;
let bIdx = 0;                                   // which numbered line Build is showing
const picked = new Set<number>();               // lines ticked for bulk delete / copy
/** In Walk, look back through the moves of the line you are learning (-1 back, +1 forward). */
function walkStep(d: number) {
  if (!line.length && d < 0) return;
  const was = wBack;
  wBack = Math.max(0, Math.min(line.length, wBack - d));
  if (wBack === was) return;
  if (wBack > 0) {
    session++;                                   // stop any pending opponent reply
    const shown = line.slice(0, line.length - wBack);
    pos = Chess.default(); for (const u of shown) pos.play(parseUci(u)!);
    last = shown[shown.length - 1]; lastKey = undefined;
    show([], false);
    $('#path').textContent = `Line ${wIdx + 1} of ${wLines.length} · ${pathText(shown)}`;
    msg(`Looking back: ply ${shown.length} of ${line.length}. → to go forward.`);
    return;
  }
  learnStep();                                   // back at the live position
}

/** Load a numbered line into Build so it can be read and edited. */
function buildLine(i: number) {
  const lines = walkLines(); if (!lines.length) return;
  bIdx = (i + lines.length) % lines.length;
  line = [...lines[bIdx]];
  renderBuild();
  msg(`Line ${bIdx + 1} of ${lines.length}. Play a move to extend it, or ✕ to cut it.`);
}
/** Step through the moves of the line you are looking at: -1 back, +1 forward (like a chess viewer). */
function buildStep(d: number) {
  if (!cur) return;
  if (d < 0) { if (line.length) { line.pop(); renderBuild(); } return; }
  const here = Object.keys(cur.moves[key(pos)] || {});
  const want = wLines[bIdx]?.[line.length];
  const next = want && here.includes(want) ? want : here[0];
  if (next) { line.push(next); renderBuild(); }
}
/** Every note along one line, in order, so the ideas can be read before they are played. */
function lineNotes(path: string[]): string {
  const p = Chess.default(); const out: string[] = [];
  for (const u of path) {
    const k = key(p), m = parseUci(u); if (!m) break;
    const san = makeSan(p, m), n = noteOf(k, u);
    if (n) out.push(`${san} — ${n}`);
    p.play(m);
  }
  return out.join('\n');
}
/** The repertoire as a tree: every saved move is an edge, every position a node. */
type TNode = { k: string; pk?: string; u?: string; san?: string; ply: number; kids: TNode[]; leaves: number; plies: number };
function repertoireTree(): TNode {
  const mk = (k: string, ply: number, pk?: string, u?: string, san?: string): TNode => {
    const node: TNode = { k, pk, u, san, ply, kids: [], leaves: 0, plies: 0 };
    for (const [cu, cs] of Object.entries(cur?.moves[k] || {})) {
      const p = fromKey(k); const m = parseUci(cu); if (!m) continue; p.play(m);
      node.kids.push(mk(key(p), ply + 1, k, cu, cs));
    }
    node.leaves = node.kids.length ? node.kids.reduce((a, c) => a + c.leaves, 0) : 1;
    node.plies = 1 + (node.kids.length ? Math.max(...node.kids.map(c => c.plies)) : 0);
    return node;
  };
  return mk(START, 0);
}
let treeView = true;                     // tree is the default view of the repertoire
let noteEditId: string | undefined;      // which tree row has its note editor open
const collapsed = new Set<string>();     // nodes folded away, by path
/** A run of moves with no branch in it, rendered as one row. Indentation happens only where the repertoire
 *  actually splits — a 20-move line should not look like a 20-level staircase. */
type TSeg = { id: string; path: string[]; moves: { u: string; san: string; pk: string; ply: number }[]; kids: TSeg[]; leaf?: number; leaves: number };
function segmentTree(): TSeg {
  let lineNo = 0;
  const build = (k: string, ply: number, path: string[], edge?: { u: string; san: string; pk: string }): TSeg => {
    const seg: TSeg = { id: path.join(' '), path: [...path], moves: [], kids: [], leaves: 0 };
    if (edge) seg.moves.push({ ...edge, ply });          // the move that opened this branch belongs to this row
    let nodeKey = k, nodePly = ply;
    for (;;) {
      const kids = Object.entries(cur?.moves[nodeKey] || {});
      if (kids.length > 1) break;                                  // a real branch: stop and recurse below
      if (!kids.length) { if (seg.moves.length) seg.leaf = ++lineNo; break; }
      const [u, san] = kids[0];
      const p = fromKey(nodeKey), m = parseUci(u); if (!m) break;
      p.play(m);
      seg.moves.push({ u, san, pk: nodeKey, ply: nodePly + 1 });
      nodeKey = key(p); nodePly++;
    }
    const branch = Object.entries(cur?.moves[nodeKey] || {});
    if (branch.length > 1) {
      for (const [u, san] of branch) {
        const p = fromKey(nodeKey), m = parseUci(u); if (!m) continue;
        p.play(m);
        seg.kids.push(build(key(p), nodePly + 1, [...seg.path, ...seg.moves.map(x => x.u)], { u, san, pk: nodeKey }));
      }
    }
    seg.leaves = seg.kids.length ? seg.kids.reduce((a, c) => a + c.leaves, 0) : seg.leaf ? 1 : 0;
    return seg;
  };
  return build(START, 0, []);
}
/** Render the tree: one row per unbroken run, indented only at branch points. */
function treeMarkup(): string {
  const root = segmentTree();
  if (!root.moves.length && !root.kids.length) return '<p class="dim">No moves yet. Play a move to start one.</p>';
  const out: string[] = [];
  const draw = (seg: TSeg, depth: number) => {
    const folded = collapsed.has(seg.id);
    const onPath = seg.path.length > 0 && seg.moves.length > 0 && seg.path.every((u, i) => line[i] === u);
    const isNow = onPath && seg.moves.length > 0 && (seg.moves[seg.moves.length - 1].ply === line.length);
    const run = seg.moves.map((m, i) => {
      const num = m.ply % 2 === 1 ? `<span class="n">${Math.floor(m.ply / 2) + 1}.</span>` : '';
      const here = [...seg.path, ...seg.moves.slice(0, i + 1).map(x => x.u)];
      const note = cur?.notes?.[m.pk + '|' + m.u] ? '<b class="dot" title="Has a note">•</b>' : '';
      const bad = cur?.bad?.[m.pk + '|' + m.u];
      const warn = bad ? `<b class="warn" title="About ${(bad / 100).toFixed(1)} worse than the best move here">⚠</b>` : '';
      return `<span class="mvwrap"><button class="tsan ${m.ply % 2 === 1 ? 'mine' : 'opp'}" data-act="tnode" data-u="${here.join(' ')}" title="Go to ${esc(m.san)}">${num}${esc(m.san)}${tagHtml(m.pk, m.u)}</button>${note}${warn}<button class="x" data-act="tcutm" data-u="${here.join(' ')}" title="Delete ${esc(m.san)} and everything only it reached" aria-label="Delete ${esc(m.san)}">✕</button></span>`;
    }).join(' ');
    const caret = seg.kids.length ? `<button class="caret" data-act="tfold" data-u="${seg.id}" aria-label="${folded ? 'Expand' : 'Collapse'} this branch">${folded ? '▸' : '▾'}</button>` : '<span class="caret"></span>';
    const cnt = seg.kids.length
      ? `<span class="cnt">${seg.kids.length} branches${seg.leaves === seg.kids.length ? '' : ` · ${seg.leaves} lines`}</span>`
      : `<span class="ln">line ${seg.leaf}${lineName([...seg.path, ...seg.moves.map(m => m.u)]) ? ` · ${esc(lineName([...seg.path, ...seg.moves.map(m => m.u)]))}` : ''}</span>`;
    const promo = seg.kids.length ? `<button data-act="tpromo" data-u="${[...seg.path, seg.moves[0]?.u].filter(Boolean).join(' ')}" title="Make this the first branch here" aria-label="Make this the first branch here">↑</button>` : '';
    const lastMove = seg.moves[seg.moves.length - 1];
    const penId = seg.moves.length ? [...seg.path, ...seg.moves.map(m => m.u)].join(' ') : '';
    const pen = lastMove ? `<button data-act="tnote" data-u="${penId}" title="Note for ${esc(lastMove.san)}" aria-label="Edit the note for ${esc(lastMove.san)}">✎</button>` : '';
    out.push(`<div class="tseg ${onPath ? 'on' : ''} ${isNow ? 'now' : ''}" draggable="true" data-seg="${penId}" data-par="${seg.path.join(' ')}" data-first="${seg.moves[0]?.u ?? ''}" style="--d:${Math.min(depth, 10)}">
      ${caret}<span class="run">${run}</span>${cnt}
      <span class="tacts">${promo}${pen}</span></div>`);
    if (noteEditId === penId && lastMove) {
      out.push(`<div class="tnote"><textarea id="tn-ed" data-k="${lastMove.pk}|${lastMove.u}" maxlength="800" placeholder="Note for ${esc(lastMove.san)} — why this move, what to remember">${esc(noteOf(lastMove.pk, lastMove.u))}</textarea></div>`);
    }
    if (!folded) for (const kid of seg.kids) draw(kid, depth + 1);
  };
  draw(root, 0);
  return out.join('');
}
/** Move the board to an arbitrary point in the tree. */
function openNode(path: string[]) {
  const lines = walkLines(); if (!lines.length) return;
  line = [...path];
  const hit = lines.findIndex(l => path.every((u, i) => l[i] === u));
  if (hit >= 0) bIdx = hit;
  renderBuild();
}
/** Delete one move anywhere in the tree, then prune what only it reached. */
function cutAt(path: string[]) {
  if (!cur || !path.length) return;
  const parent = path.slice(0, -1), u = path[path.length - 1];
  const p = Chess.default(); for (const x of parent) p.play(parseUci(x)!);
  const k = key(p), san = cur.moves[k]?.[u]; if (!san) return;
  const snap = snapRep();
  delete cur.moves[k][u]; if (!Object.keys(cur.moves[k]).length) delete cur.moves[k];
  const gone = pruneUnreachable();
  line = parent; save(); renderBuild();
  undoable(`Removed ${san}${gone ? ` and ${gone} position${gone === 1 ? '' : 's'} below it` : ''}`, snap);
}
/** Make one branch the first among its siblings (that ordering numbers the learned lines). */
function promoteAt(path: string[]) {
  if (!cur || !path.length) return;
  const parent = path.slice(0, -1), u = path[path.length - 1];
  const p = Chess.default(); for (const x of parent) p.play(parseUci(x)!);
  const k = key(p), mv = cur.moves[k]; if (!mv || !mv[u] || Object.keys(mv)[0] === u) return;
  const snap = snapRep();
  const rest = Object.entries(mv).filter(([x]) => x !== u);
  cur.moves[k] = { [u]: mv[u], ...Object.fromEntries(rest) };
  save(); renderBuild(); undoable(`“${mv[u]}” is now the first branch here.`, snap);
}
const lineKey = (l: string[]) => l.join(' ');
const today = () => new Date().toISOString().slice(0, 10);
const lineName = (l: string[]) => cur?.lineNames?.[lineKey(l)] ?? '';
/** A line's own name (or comment): "Fried Liver — the knight sac comes here". */
async function nameLine(l: string[]) {
  if (!cur || !l.length) return;
  const got = await ask({ title: 'Name this line', text: 'Shown in the line list, in the tree and when Walk starts this line. Leave it empty to remove the name.', input: true, ok: 'Save', value: lineName(l), placeholder: 'For example: Fried Liver' });
  if (got === null) return;
  cur.lineNames ??= {};
  const k = lineKey(l), v = String(got).trim();
  if (v) cur.lineNames[k] = v; else delete cur.lineNames[k];
  save(); renderBuild(); toast(v ? `Line named “${v}”.` : 'Name removed.', { ms: 2200 });
}
/** Tactics accuracy over the last week, straight from the daily history. */
function weekAccuracy() {
  const h = pstats.hist ?? {}; const days = Object.keys(h).sort().slice(-7);
  const ok = days.reduce((a, d) => a + h[d].ok, 0), n = days.reduce((a, d) => a + h[d].n, 0);
  return { ok, n, pct: n ? Math.round((ok / n) * 100) : 0 };
}
const seenLine = (l: string[]) => !!(cur?.seen ?? {})[lineKey(l)];
function walkPanel() {
  wHtml ??= wLines.map((l, i) => lineHtml(l, wLines[i - 1]));
  const seen = cur?.seen ?? {};
  const done = wLines.filter(seenLine).length;
  const bar = $('#bar'), bi = $('#bar i');
  if (bar && bi) { bar.hidden = !wLines.length; bi.style.width = wLines.length ? `${(done / wLines.length) * 100}%` : '0'; }
  const rows = wLines.map((l, i) => {
    const ok = !!seen[lineKey(l)];
    const plain = wHtml![i].replace(/<[^>]*>/g, '').toLowerCase();
    return `<button class="item ${i === wIdx ? 'on' : ''} ${ok ? 'done' : ''}" data-act="wline" data-u="${i}" data-line="${esc(plain)}"><span>${i + 1}.${ok ? ' <b class="tick">✓</b>' : ''}</span><span class="walk">${wHtml![i]}</span></button>`;
  }).join('');
  $('#act').innerHTML = `${lmodeBar()}
    <div class="row"><button data-act="wback" aria-label="Previous move" title="Previous move (←)">‹</button><button data-act="wfwd" aria-label="Next move" title="Next move (→)">›</button><button data-act="hint">Hint</button><button data-act="wsolve">Solve</button><button data-act="wnotes" class="${wNotes ? 'on' : ''}" title="Show every note in this line">Notes</button><span class="grow"></span><button data-act="lprev" aria-label="Previous line">‹ Line</button><button data-act="wnext" aria-label="Next line">Next line ›</button><button data-act="restart">Start over</button></div>
    
    <h3>All lines (${wLines.length})</h3>
    ${wLines.length > 8 ? '<input id="linefilter" placeholder="Filter lines — a move, like Bb5" aria-label="Filter lines by move"><span class="hintline" id="linecount"></span>' : ''}
    <div class="list">${rows || '<p class="dim">No moves yet. Add lines in the Editor.</p>'}</div>`;
}
function startWalkLine(i: number) {
  if (!wLines.length) return;
  wBack = 0;
  wIdx = ((i % wLines.length) + wLines.length) % wLines.length;
  cur!.walk = wIdx; save();
  session++; line = []; last = undefined; lastKey = undefined; pos = Chess.default(); locked = false;
  walkPanel();
  { const nm = lineName(wLines[wIdx] ?? []); if (nm) showNote(`${nm}`); }
  if (wNotes) showNote(lineNotes(wLines[wIdx] ?? []) || 'No notes in this line yet.');
  learnStep();
}
function walkDone() {
  const last = wIdx >= wLines.length - 1;
  const l = wLines[wIdx];
  if (l) { (cur!.seen ??= {})[lineKey(l)] = true; save(); walkPanel(); }
  locked = true; sfx('ok'); flash('ok'); show([], false);
  const notes = lineNotes(l ?? []);
  if (notes) showNote(notes);
  msg(last ? `Line ${wIdx + 1} of ${wLines.length} done. All lines walked.` : `Line ${wIdx + 1} of ${wLines.length} done. Next line…`, 'ok');
  const tok = session;
  setTimeout(() => { if (tok === session && S.lmode === 'walk' && mode === 'learn') startWalkLine(last ? 0 : wIdx + 1); }, last ? 1600 : 1100);
}

function learnInit() {
  clearInterval(ttTimer); dActive = false; aRun = undefined; aBusy = false; locked = false;
  line = []; last = undefined; lastKey = undefined; pos = Chess.default(); $('#bar').hidden = true;
  if (S.lmode === 'drill') return drillInit();
  if (S.lmode === 'time') return timeInit();
  if (S.lmode === 'arena') return arenaInit();
  wLines = walkLines(); wHtml = undefined;
  startWalkLine(cur!.walk ?? 0);
}
function learnStep() {
  locked = false; const tok = session;
  if (pos.turn === cur?.color && consumePremove()) return;
  const us = Object.keys(cur!.moves[key(pos)] || {});
  const walk = S.lmode === 'walk';
  $('#path').textContent = fast() && dActive ? runLine()
    : walk ? `Line ${wIdx + 1} of ${wLines.length}${line.length ? ' · ' + pathText(line) : ''}` : pathText(line);
  showNote(noteOf(lastKey, last));
  if (!us.length) {
    if (fast() && dActive) return lineDone();
    if (walk && line.length) return walkDone();
    msg(line.length ? 'Line complete.' : 'Nothing to learn yet. ' + addHint())
  }
  if (pos.turn !== cur!.color) {
    show([], false); msg('Opponent plays…');
    // Walk follows the numbered line; Drill and Time stay random.
    const want = walk ? wLines[wIdx]?.[line.length] : undefined;
    const u = want && us.includes(want) ? want : walk ? us[0] : pick(us);
    setTimeout(() => { if (tok === session) { play(u); learnStep(); } }, fast() ? Math.min(S.learnDelay, 250) : S.learnDelay);
    return;
  }
  show();
  if (walk) {
    const want = wLines[wIdx]?.[line.length];
    const u = want && us.includes(want) ? want : us[0];
    msg(`Play ${makeSan(pos, parseUci(u)!)}.`);
  } else msg(fast() && dActive ? 'Your move.' : 'Your move.');
}
function learnAnswer(u: string, k: string) {
  const mv = cur!.moves[k];
  if (mv[u]) {
    markMove(mv[u], true, u);
    play(u); sfx('move');
    if (S.lmode === 'walk') { const j = lineOf(line); if (j !== wIdx) { wIdx = j; cur!.walk = j; save(); walkPanel(); } }
    if (fast() && dActive) { dScore++; }
    return learnStep();
  }
  buzz(); sfx('bad'); markMove(sanAt(k, u), false, u);
  if (S.lmode === 'drill' && dActive) return drillOver(k, u);
  if (S.lmode === 'time' && dActive) return timeMiss(k);
  msg(`Not in your repertoire. You prepared ${Object.values(mv).join(' or ')}.`, 'bad'); show();
  explainWrong(k, u);
}
const runLine = () => (S.lmode === 'time' ? `Score ${dScore} · lines ${dLines} · best ${bestOf('time')}` : `Streak ${dScore} · lines ${dLines} · best ${bestOf('drill')}`);

/* Drill: a streak across random lines. One mistake ends it. */
function drillInit() {
  show([], false); showNote(''); msg('Drill: play your lines with no mistakes. One miss ends the streak.');
  $('#path').textContent = `Best streak: ${bestOf('drill')}`;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="dstart" class="primary">Start</button></div>`;
}
function drillNextLine() {
  const ks = ownKeys(); if (!ks.length) { dActive = false; msg('Nothing to drill yet. ' + addHint()); return; }
  buildIndex(); const k = pick(ks); const e = parent.get(k);
  pos = fromKey(k); line = pathTo(k); last = e?.uci; lastKey = e?.from; learnStep();
}
function drillStart() {
  session++; dActive = true; dScore = 0; dLines = 0;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="dstop">Stop</button></div>`; drillNextLine();
}
function lineDone() {
  dLines++; if (S.lmode === 'time') ttEnd += 8000;
  sfx('ok'); flash('ok'); msg('Line complete.', 'ok'); locked = true; const tok = session;
  setTimeout(() => { if (tok === session && dActive) { locked = false; drillNextLine(); } }, 500);
}
function drillOver(k: string, u: string) {
  dActive = false; locked = true; const mv = cur!.moves[k];
  const nb = setBest('drill', dScore); show(Object.keys(mv).map(arrow), false);
  msg(`Streak over: ${dScore}.${nb && dScore ? ' New best!' : ''}`, 'bad');
  $('#path').textContent = `You prepared ${Object.values(mv).join(' or ')} here. Best streak ${bestOf('drill')}.`;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="dstart" class="primary">Again</button></div>`;
  explainWrong(k, u);
}

/* Time Trial: 60 seconds, clean lines add time, mistakes cost time. */
function timeInit() {
  show([], false); showNote(''); msg('Time Trial: 60 seconds. A clean line adds 8 seconds, a mistake costs 6.');
  $('#path').textContent = `Best score: ${bestOf('time')}`;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="tstart" class="primary">Start</button></div>`;
}
function timeStart() {
  session++; dActive = true; dScore = 0; dLines = 0; ttEnd = Date.now() + 60000;
  clearInterval(ttTimer); ttTimer = setInterval(tickTT, 200);
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="dstop">Stop</button></div>`; $('#bar').hidden = false; drillNextLine();
}
function tickTT() {
  const left = ttEnd - Date.now();
  if (left <= 0) return timeOver();
  $('#bar').hidden = false; $('#bar i').style.width = `${Math.min(100, left / 600)}%`;
  if (mode === 'learn' && dActive) $('#path').textContent = `${Math.ceil(left / 1000)}s · ${runLine()}`;
}
function timeMiss(k: string) {
  ttEnd -= 6000; locked = true; const mv = cur!.moves[k];
  show(Object.keys(mv).map(arrow), false); msg(`Missed: ${Object.values(mv).join(' or ')}. −6s`, 'bad'); const tok = session;
  setTimeout(() => { if (tok === session && dActive) { locked = false; drillNextLine(); } }, 900);
}
function timeOver() {
  clearInterval(ttTimer); dActive = false; locked = true; session++;
  const nb = setBest('time', dScore); show([], false); sfx('done');
  msg(`Time! Score ${dScore}.${nb && dScore ? ' New best!' : ''}`, 'ok'); $('#bar').hidden = true;
  $('#path').textContent = `${dLines} lines completed. Best ${bestOf('time')}.`;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="tstart" class="primary">Again</button></div>`;
}

/* Arena: your opponent follows your book while you do, then plays like a human. Stockfish judges the result. */
function arenaInit() {
  show([], false); showNote(''); const r = cur!.arena ?? { rating: 950, games: 0 };
  msg('Arena: follow your book, then play on. Stockfish judges the position.');
  $('#path').textContent = `Arena rating ${r.rating} · ${r.games} games`;
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="astart" class="primary">Start a game</button></div>`;
}
async function arenaStart() {
  session++; const tok = session; aBusy = true; locked = false; aRun = new ArenaRun(cur!.moves, cur!.color, engine, S.engineMs);
  pos = aRun.pos; line = []; last = undefined; show([], false); showNote(''); msg('Starting the engine…');
  try {
    await engine.warm(); const first = await aRun.start(); if (tok !== session) return;
    pos = aRun.pos; if (first) last = first.uci;
  } catch { msg('The engine could not start on this device.', 'bad'); aBusy = false; return; }
  aBusy = false; show(); arenaStatus();
  $('#act').innerHTML = `<div class="row"><button data-act="aresign">Resign</button></div>`;
}
function arenaStatus() { msg(aRun!.inBook ? 'Your move. You are in your book.' : 'Your move. You are out of book. Play on.'); $('#path').textContent = `Move ${Math.floor(aRun!.ply / 2) + 1}`; }
async function arenaAnswer(m: any) {
  const run = aRun; if (!run || aBusy || run.ended) return show();
  aBusy = true; const tok = session; msg('Thinking…');
  try { const q = pos.clone(); q.play(m); pos = q; last = makeUci(m); show([], false); } catch { /* keep the old board */ }
  let r; try { r = await run.userMove(m); } catch { aBusy = false; show(); msg('The engine had a problem.', 'bad'); return; }
  if (tok !== session) return;
  pos = run.pos; last = r.reply?.uci ?? r.userUci; sfx('move');
  if (r.ended) { show([], false); return arenaFinish(r.ended); }
  aBusy = false;
  if (consumePremove()) return;
  show(); arenaStatus();
}
function arenaFinish(end: ArenaEnd) {
  aBusy = false; const a = (cur!.arena ??= { rating: 950, games: 0 });
  const exp = 1 / (1 + 10 ** ((1000 - a.rating) / 400)), sc = end.result === 'win' ? 1 : end.result === 'draw' ? 0.5 : 0;
  const before = a.rating; a.rating = Math.round(a.rating + 32 * (sc - exp)); a.games++; save();
  const delta = a.rating - before;
  sfx(end.result === 'win' ? 'done' : end.result === 'draw' ? 'ok' : 'bad'); if (end.result === 'win') flash('ok');
  msg(end.result === 'win' ? 'You won the position.' : end.result === 'loss' ? 'You lost the position.' : 'Equal position.', end.result === 'win' ? 'ok' : end.result === 'loss' ? 'bad' : '');
  $('#path').textContent = `Engine: ${end.eval > 9000 ? 'mate' : fmtScore(end.eval)} for you · rating ${a.rating} (${delta >= 0 ? '+' : ''}${delta}) · book carried you ${end.bookPlies} half-moves`;
  showNote(end.left ? `You left your book at move ${Math.floor(end.left.ply / 2) + 1}: you played ${end.left.played}, your book plays ${end.left.prepared.join(' or ')}.` : end.text === 'Time to judge the position.' ? 'You followed your book to the end, then played on. Stockfish judged the result.' : end.text);
  $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="astart" class="primary">Play again</button></div>`;
}

/* ---------- Review ---------- */
function reviewInit() { buildIndex(); queue = queueKeys(); total = queue.length; reviewNext(); }
function reviewNext() {
  locked = false; hinted = false; reviewGrade = undefined;
  updateDue();
  const done = total - queue.length;
  $('#bar').hidden = !total; $('#bar i').style.width = total ? `${Math.max(0, (total - queue.length) / total) * 100}%` : '0';
  ($('#bar') as HTMLElement).style.backgroundImage = total > 1 && total <= 40     // a notch per card
    ? `repeating-linear-gradient(to right, transparent 0, transparent calc(100% / ${total} - 1px), var(--panel) calc(100% / ${total} - 1px), var(--panel) calc(100% / ${total}))`
    : '';
  if (!queue.length) {
    pos = Chess.default(); line = []; last = undefined; lastKey = undefined; show([], false); showNote(''); $('#path').textContent = '';
    msg(total ? `Session done. ${total} cards reviewed.` : 'All caught up. Nothing is due.', 'ok'); return;
  }
  const k = queue[0], e = parent.get(k); pos = fromKey(k); line = pathTo(k); last = e?.uci; lastKey = e?.from;
  $('#path').textContent = pathText(line); showNote(noteOf(lastKey, last)); show();
  msg(`You play ${cur!.color === 'white' ? 'White' : 'Black'} here. Find your move.`);
  const allLines = walkLines();
  const ln = allLines.findIndex(l => l.length >= line.length && line.every((u, i) => l[i] === u));
  const c0 = cur!.cards[k];
  $('#act').innerHTML = `<div class="row"><span class="hintline">Card ${done + 1} of ${total} · ${queue.length} to go</span></div>
    <div class="row"><button data-act="hint">Hint</button><button data-act="reveal">Show me</button></div>
    <div class="reviewmeta"><span>${esc(cur!.name)} · ${ln >= 0 ? `line ${ln + 1} of ${allLines.length}` : 'a branch that is not a full line'}</span>
    <span>${c0 ? `last seen ${c0.last_review ? rel(new Date(c0.last_review)) : 'never'} · next due ${rel(new Date(c0.due))}` : 'first time'}</span></div>`;
}
/** Schedule one card and hand back the new state. */
function scheduleCard(k: string, rating: Rating) {
  const c = cur!.cards[k];
  const card = c ? { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined } : createEmptyCard();
  const r = f.next(card, new Date(), rating as any).card;    // Rating values are the four grades
  cur!.cards[k] = r;
  cur!.hist ??= {}; cur!.hist[today()] = (cur!.hist[today()] ?? 0) + 1;
  save();
  return r;
}
/** You know how well you knew it; the buttons (or 1–4) decide, and the default is applied if you ignore them. */
let reviewGrade: { k: string; auto: Rating; done: boolean } | undefined;
const gradeRow = (auto: Rating) => `<div class="row grades" role="group" aria-label="How well did you know it?">${([
  [Rating.Again, 'Again', '1'], [Rating.Hard, 'Hard', '2'], [Rating.Good, 'Good', '3'], [Rating.Easy, 'Easy', '4']] as [Rating, string, string][])
  .map(([r, label, key]) => `<button data-act="grade" data-u="${r}" class="${r === auto ? 'on' : ''}" title="${label} (${key})">${label}</button>`).join('')}</div>`;
function applyReviewGrade(rating: Rating) {
  if (!reviewGrade || reviewGrade.done) return;
  reviewGrade.done = true;
  const k = reviewGrade.k, card = scheduleCard(k, rating);
  if (rating === Rating.Again) { queue.push(k); msg('Back in the queue — you will see it again this session.'); }
  else msg(`Next review ${rel(card.due)}.`, 'ok');
  reviewNext();
}
function reviewAnswer(u: string, k: string) {
  locked = true;
  const mv = cur!.moves[k], ok = !!mv[u];
  if (ok) {
    markMove(mv[u], true, u); play(u); sfx('ok'); flash('ok'); show([], false); showNote(noteOf(k, u));
    const auto = hinted ? Rating.Hard : Rating.Good;
    reviewGrade = { k, auto, done: false };
    queue.shift();
    msg('Correct. How well did you know it?', 'ok');
    $('#act').innerHTML = `${gradeRow(auto)}<div class="row"><button data-act="next" class="primary">Next card ›</button></div>`;
    void whyBook(k, u);
    const tok = session;
    setTimeout(() => { if (tok === session && mode === 'review' && reviewGrade && !reviewGrade.done) applyReviewGrade(auto); }, 6000);
  } else {
    buzz(); sfx('bad'); markMove(sanAt(k, u), false, u); scheduleCard(k, Rating.Again); queue.push(queue.shift()!);
    show(Object.keys(mv).map(arrow), false);
    const base = Object.keys(mv).map(x => noteOf(k, x)).filter(Boolean).join('\n'); showNote(base); explainWrong(k, u, base);
    msg(`Not quite. You prepared ${Object.values(mv).join(' or ')}.`, 'bad');
    $('#act').innerHTML = `<div class="row"><button data-act="next" class="primary">Next card</button></div>`;
  }
}

/* ---------- Tactics ---------- */
const allPuzzles = () => (STARTER as Puzzle[]).concat(TRAPS as Puzzle[], imported);
let pmapCache: Map<string, Puzzle> | undefined;
const pmap = () => (pmapCache ??= new Map(allPuzzles().map(p => [p.id, p])));
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

function puzzleQueue(extra = 0) {
  const all = allPuzzles(); const ok = (p: Puzzle) => S.ptheme === 'all' || p.themes.includes(S.ptheme);
  const due = shuffle(all.filter(p => pcards[p.id] && isDue(pcards[p.id]) && ok(p)).map(p => p.id));
  const unseen = all.filter(p => !pcards[p.id] && ok(p)).map(p => [Math.abs(p.rating - pstats.rating) + Math.random() * 120, p] as const).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const inWin = S.window ? unseen.filter(p => Math.abs(p.rating - pstats.rating) <= S.window) : unseen;
  const n = S.newPuzzles + extra;
  return [...due, ...(inWin.length >= n ? inWin : unseen).slice(0, n).map(p => p.id)];
}
function themeSelect() {
  const counts: Record<string, number> = {};
  for (const p of allPuzzles()) for (const t of p.themes) counts[t] = (counts[t] || 0) + 1;
  const opts = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 60);
  return `<label class="field">Theme<select id="t-theme"><option value="all">All themes</option>${opts.map(t => `<option value="${t}" ${S.ptheme === t ? 'selected' : ''}>${humanTheme(t)} (${counts[t]})</option>`).join('')}</select></label>`;
}
const tSetRow = () => `<div class="row mini" role="group" aria-label="Set size">${[5, 10, 20].map(n => `<button data-act="tset" data-u="${n}" class="${S.newPuzzles === n ? 'on' : ''}" title="A set of ${n} puzzles">${n}</button>`).join('')}</div>`;
const tTiles = () => `<div class="tiles"><div class="tile"><b>${Math.round(pstats.rating)}</b><span>Rating</span></div><div class="tile"><b>${pstats.streak}</b><span>Streak</span></div><div class="tile"><b>${pstats.solved}</b><span>Solved</span></div></div>`;

type TResult = { id: string; kind: 'solve' | 'hint' | 'fail' };
let tResults: TResult[] = [];
function tacticsInit(extra = 0) { tQueue = puzzleQueue(extra); tTotal = tQueue.length; tRequeued.clear(); tResults = []; tacticsNext(); }
/** What the set just taught: how many were clean, and how each theme went. */
function tacticsSummary() {
  const rank = { solve: 3, hint: 2, fail: 1 } as const;
  const best = new Map<string, TResult['kind']>();
  for (const r of tResults) { const prev = best.get(r.id); if (!prev || rank[r.kind] > rank[prev]) best.set(r.id, r.kind); }
  const byTheme = new Map<string, { ok: number; n: number }>();
  for (const [id, kind] of best) {
    const p = pmap().get(id); if (!p) continue;
    for (const t of p.themes.filter(x => !['short', 'long', 'oneMove'].includes(x))) {
      const e = byTheme.get(t) ?? { ok: 0, n: 0 };
      e.n++; if (kind !== 'fail') e.ok++;
      byTheme.set(t, e);
    }
  }
  const n = best.size, clean = [...best.values()].filter(k => k === 'solve').length;
  if (!n) return '';
  const sorted = [...byTheme.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  const rows = sorted.map(([t, e]) => `<div class="srow"><span>${esc(humanTheme(t))}</span><b>${e.ok}/${e.n}</b></div>`).join('');
  const weak = sorted.filter(([, e]) => e.ok < e.n).slice(0, 3)
    .map(([t]) => `<button data-act="tth" data-u="${esc(t)}">Practise ${esc(humanTheme(t))}</button>`).join('');
  return `<div class="summary"><h3>${n} puzzle${n === 1 ? '' : 's'} · ${clean} clean · ${Math.round((clean / n) * 100)}%</h3>${rows}
    ${weak ? `<div class="row mini">${weak}</div>` : ''}</div>`;
}
function tacticsNext() {
  session++; tGraded = false; tHinted = false; tFailed = false; const tok = session;
  $('#bar').hidden = !tTotal; $('#bar i').style.width = tTotal ? `${Math.max(0, (tTotal - tQueue.length) / tTotal) * 100}%` : '0';
  updateDue(); showNote('');
  if (!tQueue.length) {
    tRun = undefined; pos = Chess.default(); line = []; last = undefined; tColor = undefined; show([], false);
    $('#path').textContent = '';
    msg(tTotal ? `Session done. ${tTotal} puzzles.` : 'No puzzles to do right now.', 'ok');
    $('#act').innerHTML = `${tacticsSummary()}${tTiles()}${themeSelect()}<div class="row"><button data-act="tmore" class="primary">Practice more</button></div>`;
    return;
  }
  const p = pmap().get(tQueue[0])!; tRun = new PuzzleRun(p); tColor = tRun.solverColor;
  pos = tRun.pos.clone(); last = undefined; show([], false); locked = true;
  const done = tTotal - tQueue.length;
  $('#path').textContent = `Puzzle ${done + 1} of ${tTotal} · rated ${p.rating} (you ${Math.round(pstats.rating)}) · ${S.ptheme === 'all' ? 'all themes' : humanTheme(S.ptheme)}`;
  msg('Get ready…');
  $('#act').innerHTML = `${tTiles()}${tSetRow()}${themeSelect()}<div class="row"><button data-act="thint">Hint</button><button data-act="tsolution">Show solution</button><button data-act="tskip">Skip</button></div>`;
  setTimeout(() => {
    if (tok !== session || !tRun) return;
    const u = tRun.setupMove(); pos = tRun.pos; if (u) last = u;
    show(); locked = false; msg(`${cap(tColor!)} to move. Find the best move.`);
  }, p.setup ? 700 : 150);
}
function gradePuzzle(kind: 'fail' | 'solve' | 'hint') {
  if (tGraded || !tRun) return; tGraded = true;
  const p = tRun.p, ur = pstats.rating, exp = 1 / (1 + 10 ** ((p.rating - ur) / 400));
  const sc = kind === 'solve' ? 1 : kind === 'hint' ? 0.5 : 0;
  pstats.rating = Math.max(400, ur + 24 * (sc - exp));
  tResults.push({ id: p.id, kind });
  pstats.hist ??= {};
  { const d = today(), e = pstats.hist[d] ?? (pstats.hist[d] = { ok: 0, n: 0 }); e.n++; if (kind !== 'fail') e.ok++; }
  if (kind === 'fail') { pstats.failed++; pstats.streak = 0; tFailed = true; } else { pstats.solved++; pstats.streak++; pstats.best = Math.max(pstats.best, pstats.streak); }
  sched(pcards, p.id, kind === 'solve' ? Rating.Good : kind === 'hint' ? Rating.Hard : Rating.Again);
}
function tacticsAnswer(m: any) {
  const run = tRun; if (!run) return;
  const tok0 = session;
  const san = (() => { try { return makeSan(run.pos, m); } catch { return '?'; } })();
  const u = toEngine(run.pos, m), r = run.try(u, m);
  if (r === 'wrong') {
    buzz(); sfx('bad'); markMove(san, false, makeUci(m)); gradePuzzle('fail');
    msg('Not that one. Try again.', 'bad');
    const base = `Looking for: ${puzzleThemes(run.p) || 'the best move'}.`;
    showNote(base); show();
    if (S.explain) {
      const fen = fenOf(run.pos), want = [run.p.moves[run.i]].filter(Boolean);
      void explain(engine, fen, u, want, Math.min(500, S.engineMs))
        .then(t => { if (tok0 === session && mode === 'tactics') showNote(`${base}\n\n${t}`); })
        .catch(() => { /* engine unavailable */ });
    }
    return;
  }
  markMove(san, true, makeUci(m));
  pos = run.pos; last = u; show([], false);
  if (r === 'solved') { sfx('done'); flash('ok'); return finishPuzzle(); }
  sfx('move'); locked = true; msg('Correct. Keep going…', 'ok'); const tok = session;
  setTimeout(() => {
    if (tok !== session || mode !== 'tactics') return;
    const ru = run.reply(); pos = run.pos; if (ru) last = ru; locked = false;
    if (consumePremove()) return;
    show(); msg('Find the next move.');
  }, 450);
}
const puzzleThemes = (p: Puzzle) => p.themes.filter(t => !['short', 'long', 'oneMove'].includes(t)).map(humanTheme).join(' · ');
/** What a move actually did: arrows from the piece that landed to the enemy pieces it now attacks. */
function motifShapes(at: Chess = pos, u: string | undefined = last): any[] {
  if (!u) return [];
  const m = parseUci(u) as any; if (!m) return [];
  const pc = at.board.get(m.to); if (!pc) return [];
  const value: Record<string, number> = { queen: 9, rook: 5, bishop: 3, knight: 3, king: 20 };
  const hits: number[] = [];
  for (const sq of attacks(pc, m.to, at.board.occupied) as any) {
    const t = at.board.get(sq); if (t && t.color !== pc.color) hits.push(sq);
  }
  if (!hits.length) return [];
  hits.sort((a, b) => (value[at.board.get(b)!.role] ?? 0) - (value[at.board.get(a)!.role] ?? 0));
  return hits.slice(0, 2).map(sq => ({ orig: makeSquare(m.to), dest: makeSquare(sq), brush: 'fork' }));
}
function finishPuzzle() {
  const p = tRun!.p; gradePuzzle(tHinted ? 'hint' : 'solve'); locked = true;
  const why = motifShapes();
  if (why.length) show(why, false);
  showNote(`Why this one: ${puzzleThemes(p) || 'tactics'}.`);
  msg(tFailed ? 'Solved, but it counts as a miss.' : tHinted ? 'Solved with a hint.' : 'Solved!', tFailed ? '' : 'ok');
  $('#path').textContent = `Puzzle ${p.rating} · ${p.themes.filter(t => !['short', 'long', 'oneMove'].includes(t)).map(humanTheme).join(', ')}`;
  $('#act').innerHTML = `${tTiles()}<div class="row"><button data-act="tnext" class="primary">Next puzzle</button></div>`;
  updateDue();
}
function tacticsAdvance(skip = false) {
  const id = tQueue.shift();
  if (id && tFailed && !skip && !tRequeued.has(id)) { tRequeued.add(id); tQueue.push(id); tTotal++; }
  tacticsNext();
}
function showSolution() {
  const run = tRun; if (!run) return; gradePuzzle('fail'); locked = true;
  showNote(`Why this one: ${puzzleThemes(run.p) || 'tactics'}.`);
  const rest = run.p.moves.slice(run.i);
  msg(`Solution: ${sanLine(fenOf(run.pos), rest)} — counted as a miss.`);
  const base = rest.length ? [arrow(rest[0])] : [];
  let motif: any[] = [];
  if (rest.length) { const copy = run.pos.clone(); const m: any = parseUci(rest[0]); if (m) { copy.play(m); motif = motifShapes(copy, rest[0]); } }
  show([...base, ...motif], false);
  $('#act').innerHTML = `<div class="row"><button data-act="tnext" class="primary">Next puzzle</button></div>`;
}

/* ---------- Endgames ---------- */
const allDrills = () => DRILLS.concat(egCustom);
function endgamesInit() {
  eRun = undefined; eEnded = false; eBusy = false; $('#bar').hidden = true; showNote('');
  const defs = allDrills(); const nxt = nextDrill();
  pos = fromFen(nxt.fen); eColor = pos.turn; last = undefined; show([], false);
  const groups = [...new Set(defs.map(d => d.group))];
  const status = (d: DrillDef) => { const c = ecards[d.id]; return !c ? 'new' : isDue(c) ? 'due' : rel(new Date(c.due)); };
  const grade = (d: DrillDef) => { const c = ecards[d.id]; return !c?.last ? '' : c.last === 'good' ? '✓' : c.last === 'hard' ? '~' : '✕'; };
  const bestOfDrill = (d: DrillDef) => { const b = ecards[d.id]?.best; return b ? `${b.moves}${b.secs ? ` / ${b.secs}s` : ''}` : ''; };
  const practised = defs.filter(d => ecards[d.id]).length;
  const next = nextDrill();
  msg('Pick an endgame. You play against Stockfish.');
  $('#path').textContent = `${practised} of ${defs.length} practised · mistakes are taken back so you can try again`;
  showNote(next.blurb ? `Next up — ${next.name}: ${next.blurb}` : '');
  $('#act').innerHTML = `<div class="row"><button data-act="enext" data-prev="${next.fen}" class="primary">Next drill: ${esc(next.name)}</button><button data-act="ecustom">Practise a FEN</button></div>` +
    groups.map(g => `<h3>${esc(g)}</h3><div class="list">${defs.filter(d => d.group === g).map(d => `<button class="item" data-act="edrill" data-u="${d.id}" data-prev="${d.fen}"><span>${esc(d.name)}</span><span class="pill ${d.goal}">${d.goal === 'win' ? 'win' : 'hold'}</span><span class="stat ${grade(d) === '✕' ? 'due' : ''}">${grade(d) ? `<b title="last result">${grade(d)}</b> ` : ''}${status(d)}${bestOfDrill(d) ? `<b class="best" title="best run"> ${bestOfDrill(d)}</b>` : ''}</span></button>`).join('')}</div>`).join('');
  updateDue();
}
function nextDrill() {
  const defs = allDrills();
  return defs.find(d => ecards[d.id] && isDue(ecards[d.id])) ?? defs.find(d => !ecards[d.id]) ?? defs[0];
}
let eStart = 0;
async function startDrill(def: DrillDef) {
  session++; const tok = session; eStart = Date.now();
  eRun = new DrillRun(def, engine, S.engineMs); pos = eRun.pos; eColor = eRun.color; last = undefined; eEnded = false; eBusy = true;
  $('#bar').hidden = def.goal !== 'hold'; $('#bar i').style.width = '0';
  show([], false); msg('Starting the engine…'); $('#path').textContent = def.name; showNote(def.blurb);
  $('#act').innerHTML = `<div class="row"><button data-act="elist">All endgames</button></div>`;
  try { await engine.warm(); await eRun.prepare(); }
  catch { if (tok === session) { msg('The engine could not start on this device.', 'bad'); } return; }
  if (tok !== session) return;
  eBusy = false; show();
  msg(def.goal === 'win' ? 'Win this position. Checkmate, or promote and convert.' : `Hold the draw. Survive ${eRun.holdMoves} moves.`);
  $('#act').innerHTML = `<div class="row"><button data-act="ehint">Hint</button><button data-act="erestart">Restart</button><button data-act="elist">All endgames</button></div>`;
}
async function endgameAnswer(m: any) {
  const run = eRun; if (!run || eBusy || eEnded) return show();
  eBusy = true; const tok = session; msg('Checking…');
  // render our move straight away so the reply is the only thing we wait for (and a premove can be set)
  try { const q = pos.clone(); q.play(m); pos = q; last = makeUci(m); show([], false); } catch { /* keep the old board */ }
  let r; try { r = await run.userMove(m); } catch { eBusy = false; show(); msg('The engine had a problem. Try again.', 'bad'); return; }
  if (tok !== session) return;
  pos = run.pos;
  if (r.kind === 'bad') {
    buzz(); sfx('bad'); markMove(r.userSan ?? '?', false, r.userUci); eBusy = false; pos = run.pos; show(r.hint ? [arrow(r.hint)] : []);
    msg(`${r.text} ${r.hint ? `Best was ${r.hintSan}.` : 'Try again.'}`, 'bad'); return;
  }
  last = r.reply?.uci ?? r.userUci;
  if (run.def.goal === 'hold') $('#bar i').style.width = `${Math.min(100, (run.moves / run.holdMoves) * 100)}%`;
  if (r.ended) { show([], false); return finishDrill(r.ended); }
  markMove(r.userSan, true, r.userUci); sfx('move'); eBusy = false;
  if (consumePremove()) return;
  show(); msg(`${r.userSan}, ${r.reply!.san}. Your move.`);
}
function finishDrill(end: DrillEnd) {
  const run = eRun!; eEnded = true; eBusy = false; show([], false);
  const due = sched(ecards, run.def.id, end.grade === 'good' ? Rating.Good : end.grade === 'hard' ? Rating.Hard : Rating.Again);
  const card = (ecards[run.def.id] ??= {}); card.last = end.grade; card.plays = (card.plays ?? 0) + 1; card.ok = end.ok;
  const secs = eStart ? Math.round((Date.now() - eStart) / 1000) : undefined;
  if (end.ok && run.moves && (!card.best || run.moves < card.best.moves || (run.moves === card.best.moves && secs && secs < (card.best.secs ?? 1e9)))) {
    card.best = { moves: run.moves, secs };
  }
  save();
  msg(end.text, end.ok ? 'ok' : 'bad'); sfx(end.ok ? 'done' : 'bad'); if (end.ok) flash('ok');
  $('#path').textContent = `${run.def.name} · ${run.mistakes} mistake${run.mistakes === 1 ? '' : 's'}${run.hinted ? ' · hint used' : ''} · next review ${rel(due)}`;
  $('#act').innerHTML = `<div class="row"><button data-act="eagain" class="primary">Again</button><button data-act="enext">Next drill</button><button data-act="elist">All endgames</button></div>`;
  updateDue();
}
async function customDrill() {
  const fen = await ask({ title: 'Practise a position', text: 'Paste a FEN. The side to move is you.', input: true, placeholder: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ok: 'Next' });
  if (typeof fen !== 'string' || !fen.trim()) return;
  try { fromFen(fen.trim()); } catch { return void toast('That is not a legal position.', { kind: 'bad' }); }
  const win = await ask({ title: 'What is the goal?', text: 'Win the position, or hold the draw?', ok: 'Win it', cancel: 'Hold the draw' });
  const def: DrillDef = { id: 'c' + Date.now(), name: 'My position', group: 'My positions', fen: fen.trim(), goal: win ? 'win' : 'hold', blurb: 'Your own position.', custom: true };
  egCustom.push(def); save(); startDrill(def);
}

/* ---------- Puzzle import ---------- */
async function importCsv(file: File) {
  const dec = new TextDecoder(); const reader = file.stream().getReader(); let rest = '';
  const seen = new Set(allPuzzles().map(p => p.id)); const out: Puzzle[] = [];
  outer: while (true) {
    const { done, value } = await reader.read(); if (done) break;
    rest += dec.decode(value, { stream: true }); const lines = rest.split('\n'); rest = lines.pop()!;
    for (const l of lines) {
      const p = parseCsvLine(l); if (!p || seen.has(p.id) || p.rating < S.importMin || p.rating > S.importMax) continue;
      seen.add(p.id); out.push(p); if (out.length >= S.importCount) { await reader.cancel(); break outer; }
    }
  }
  imported = imported.concat(out).slice(-30000); pmapCache = undefined; kvSet('puzzles', imported);
  return out.length;
}

/* ---------- Dialogs: new, library, settings ---------- */
function openDlg(kind: 'new' | 'rename') {
  $('#dlg').dataset.kind = kind;
  $('#dt').textContent = kind === 'new' ? 'New repertoire' : 'Rename repertoire';
  $('#dok').textContent = kind === 'new' ? 'Create' : 'Save';
  $('#dn').value = kind === 'rename' ? cur!.name : ''; $('#dc').hidden = kind === 'rename'; $('#dlib').hidden = kind === 'rename';
  $('#dlg').showModal(); $('#dn').focus();
}
$('#dlg').addEventListener('close', () => {
  const d = $('#dlg'); if (d.returnValue !== 'ok') return;
  const name = $('#dn').value.trim(); if (!name) return;
  if (d.dataset.kind === 'new') {
    const color = (document.querySelector('input[name=c]:checked') as HTMLInputElement).value as 'white' | 'black';
    cur = { id: crypto.randomUUID(), name, color, moves: {}, cards: {}, notes: {} }; reps.push(cur); save(); enter('build');
  } else { cur!.name = name; save(); enter(mode); }
  d.returnValue = '';
});

async function loadPacks() { return (await import('./library')).PACKS; }
async function openLib() {
  const PACKS = await loadPacks();
  $('#packs').innerHTML = PACKS.map(p => {
    const t: Rep = { id: '', name: '', color: p.color, moves: {}, cards: {}, notes: {} }; importInto(t, p.pgn);
    const own = Object.keys(t.moves).filter(k => k.split(' ')[1] === (p.color === 'white' ? 'w' : 'b')).length;
    const have = reps.some(r => r.src === p.id);
    return `<div class="pack"><div class="packhead"><b>${esc(p.name)}</b><span class="pill">${p.color}</span></div><p class="dim">${esc(p.blurb)}</p><p class="stats">${own} positions to learn · ${Object.keys(t.notes!).length} notes · ${(() => { const n = walkLines(t).length; return have ? `${n} in the bundled pack` : `${n} lines`; })()}</p><div class="row"><button data-act="addpack" data-u="${p.id}" class="${have ? '' : 'primary'}">${have ? 'Add another copy' : 'Add to my repertoires'}</button>${have ? `<button data-act="updpack" data-u="${p.id}" class="primary">Update my copy</button>` : ''}</div></div>`;
  }).join('');
  $('#lib').showModal();
}
function addPack(p: Pack) {
  const rep: Rep = { id: crypto.randomUUID(), name: p.name, color: p.color, moves: {}, cards: {}, notes: {}, src: p.id };
  const n = importInto(rep, p.pgn); reps.push(rep); cur = rep; save();
  document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel'));
  enter('build');
  toast(`Added ${p.name}: ${n} moves — the board is ready.`, { ms: 4200, action: 'Start learning', onAction: () => enter('learn') });
}
/** Refresh a stored copy of a bundled pack: new lines in, review progress and your notes kept. */
function updatePack(p: Pack) {
  const mine_ = reps.filter(r => r.src === p.id);
  if (!mine_.length) return addPack(p);
  const fresh: Rep = { id: '', name: p.name, color: p.color, moves: {}, cards: {}, notes: {} };
  importInto(fresh, p.pgn);
  const lines = walkLines(fresh).length;
  ask({
    title: `Update “${p.name}”?`,
    text: `Your copy gets the bundled ${lines} lines (${Object.keys(fresh.moves).length} positions) instead of the ones it was added with. Review progress and your own notes are kept wherever the position still exists.`,
    ok: 'Update',
  }).then(yes => {
    if (!yes) return;
    for (const r of mine_) {
      const keepNote = (k: string) => {
        const [pos_ = '', uci = ''] = k.split('|');
        return !!fresh.moves[pos_]?.[uci];
      };
      r.moves = fresh.moves;
      r.color = p.color;
      r.notes = { ...fresh.notes, ...Object.fromEntries(Object.entries(r.notes ?? {}).filter(([k]) => keepNote(k))) };
      r.cards = Object.fromEntries(Object.entries(r.cards ?? {}).filter(([k]) => !!fresh.moves[k]));
    }
    save();
    document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel'));
    enter(mode);
    toast(`Updated ${p.name}: ${lines} lines, ${Object.keys(fresh.moves).length} positions.`, { ms: 6000 });
  });
}
/** One line in Settings that says where the live file is and when it was last written. */
function showFileState() {
  const f = fileState(), el = $('#s-file'), link = $('#s-link'), un = $('#s-unlink');
  if (!el) return;
  const when = f.when ? ` · last write ${f.when}` : '';
  el.textContent = f.kind === 'tauri'
    ? `Every change is written straight to ${f.path}${when}.${f.note ? ' ' + f.note + '.' : ''}`
    : f.kind === 'browser'
      ? f.path ? `Writing to ${f.path}${when}.${f.note ? ' ' + f.note + '.' : ''}` : 'Pick a file once — after that every change is written into it, no export.'
      : 'This browser cannot write files. Use the desktop app, or Export backup.';
  if (link) link.hidden = !filePicking() || !!(f.kind === 'browser' && f.path);
  if (un) un.hidden = !(f.kind === 'browser' && f.path);
}

let prevCg: any;
const PREV_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 0 1';
/** The settings board: appearance, piece set and coordinates are shown, not named. */
function renderPreview() {
  const el = $('#setprev'); if (!el) return;
  const conf: any = {
    fen: PREV_FEN, orientation: 'white', coordinates: S.coords, viewOnly: true,
    animation: { enabled: S.anim, duration: 200 }, drawable: { enabled: false },
    movable: { free: false, color: undefined }, premovable: { enabled: false },
  };
  if (!prevCg) prevCg = Chessground(el, conf); else prevCg.set(conf);
}

/** Hovering a drill in the list puts its position on the board, so it can be recognised before it is started. */
let previewFen: string | null = null;
function previewFrom(target: EventTarget | null) {
  const b = (target as HTMLElement | null)?.closest?.('[data-prev]') as HTMLElement | null;
  if (!b || mode !== 'endgames' || eRun) return;
  const fen = b.dataset.prev!;
  if (fen === previewFen) return;
  previewFen = fen;
  try { pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap(); } catch { return; }
  last = null; show([], false);
}

function openSettings() {
  $('#s-new').value = S.newCap; $('#s-ret').value = String(S.retention); $('#s-theme').value = S.theme; $('#s-delay').value = String(S.learnDelay);
  $('#s-san').checked = S.san; $('#s-install').hidden = !deferredInstall; $('#s-expl').checked = S.explain; $('#s-app').value = S.appearance; $('#s-pieces').value = S.pieces; $('#s-sound').checked = S.sound;
  $('#s-coords').checked = S.coords; $('#s-anim').checked = S.anim; $('#s-hap').checked = S.haptics;
  $('#s-ems').value = String(S.engineMs); $('#s-newp').value = S.newPuzzles; $('#s-win').value = String(S.window); $('#s-imin').value = S.importMin; $('#s-imax').value = S.importMax; $('#s-icnt').value = S.importCount;
  $('#s-pinfo').textContent = `${STARTER.length + TRAPS.length} built in (${TRAPS.length} repertoire traps) · ${imported.length} imported · rating ${Math.round(pstats.rating)}`;
  $('#s-build').textContent = `Build ${__BUILD__}`;
  $('#s-info').textContent = `${reps.length} repertoires · ${reps.reduce((a, r) => a + Object.keys(r.cards).length, 0)} cards scheduled. Data stays on this device.`;
  showFileState();
  renderPreview();
  $('#set').showModal();
}
$('#set').addEventListener('change', () => {
  S = { san: $('#s-san').checked, welcomed: S.welcomed, lmode: S.lmode, explain: $('#s-expl').checked, appearance: $('#s-app').value, pieces: $('#s-pieces').value, sound: $('#s-sound').checked, newCap: Math.max(0, Math.min(100, Math.round(+$('#s-new').value || 0))), retention: +$('#s-ret').value, theme: $('#s-theme').value, coords: $('#s-coords').checked, anim: $('#s-anim').checked, haptics: $('#s-hap').checked, learnDelay: +$('#s-delay').value, engineMs: +$('#s-ems').value, newPuzzles: Math.max(0, Math.min(100, Math.round(+$('#s-newp').value || 0))), window: +$('#s-win').value, importMin: +$('#s-imin').value || 0, importMax: +$('#s-imax').value || 3500, importCount: Math.max(1, Math.min(20000, Math.round(+$('#s-icnt').value || 3000))), ptheme: S.ptheme };
  save(); applySettings(); updateDue(); $('#sanform').hidden = !S.san;
});

/* ---------- Shell ---------- */
function enter(m0: Mode) {
  const m: Mode = EDIT_TABS.includes(m0) ? m0 : NATIVE ? 'learn' : 'build';
  mode = m; session++; line = []; last = undefined; lastKey = undefined; pos = Chess.default(); flipped = false; promo = undefined; total = 0;
  clearInterval(ttTimer); dActive = false; aRun = undefined; aBusy = false;
  locked = false; eBusy = false; tColor = undefined; eColor = undefined; tRun = undefined; eRun = undefined;
  cg.cancelPremove(); clearMark();
  $('#bar').hidden = true; showNote('');
  document.querySelectorAll('[data-m]').forEach((b: any) => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-current', b.dataset.m === m ? 'page' : 'false'); });
  document.body.dataset.mode = m;                     // lets CSS put the task above the notes in Review
  $('#sanform').hidden = !S.san; kvSet('ui', { mode: m });
  const panel = $('#panel'); panel.classList.remove('fade'); void panel.offsetWidth; panel.classList.add('fade');
  const op = opening(m);
  $('#rep').innerHTML = reps.map(r => `<option value="${r.id}" ${r === cur ? 'selected' : ''}>${esc(r.name)} · ${r.color}</option>`).join('');
  $('#rep').hidden = !reps.length || !op; $('header [data-act=new]').hidden = !op || NATIVE;   // no editor on the phone, so no empty packs there
  if (m === 'tactics') { tacticsInit(); updateDue(); return; }
  if (m === 'endgames') { endgamesInit(); return; }
  if (!cur) {
    show([], false); $('#path').textContent = ''; msg('Start with your first repertoire.');
    $('#act').innerHTML = `<div class="hero">${mark}</div><button data-act="openlib" class="primary">Add starter lines</button><button data-act="new">Create my own</button>`; updateDue(); return;
  }
  if (m === 'build') renderBuild(); else if (m === 'learn') learnInit(); else reviewInit();
  updateDue();
}

document.addEventListener('pointerover', e => previewFrom(e.target));
document.addEventListener('focusin', e => previewFrom(e.target));
document.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const tab = t.closest('[data-m]') as HTMLElement | null;
  if (tab) return enter(tab.dataset.m as Mode);
  const b = t.closest('[data-act]') as HTMLElement | null; if (!b) return;
  const a = b.dataset.act, u = b.dataset.u!;
  const pickFile = (m: typeof fileMode) => { fileMode = m; $('#file').accept = m === 'pgn' ? '.pgn,.txt' : m === 'csv' ? '.csv,.txt' : '.json'; $('#file').click(); };
  if (a === 'new') openDlg('new');
  else if (a === 'settings') openSettings();
  else if (a === 'openlib') { document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel')); openLib(); }
  else if (a === 'addpack') loadPacks().then(P => addPack(P.find(p => p.id === u)!));
  else if (a === 'updpack') loadPacks().then(P => updatePack(P.find(p => p.id === u)!));
  else if (a === 'askno') $('#ask').close('cancel');
  else if (a === 'keys') { document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel')); $('#keys').showModal(); }
  else if (a === 'install') { deferredInstall?.prompt(); }
  else if (a === 'closedlg') (b.closest('dialog') as HTMLDialogElement).close();
  else if (a === 'dlgcancel') $('#dlg').close('cancel');
  else if (a === 'promo') { locked = false; const m = { ...promo!.m, promotion: u }; $('#act').innerHTML = promo!.prev; promo = undefined; commit(m); }
  else if (a === 'promocancel') { locked = false; $('#act').innerHTML = promo!.prev; promo = undefined; show(); msg('Your move.'); }
  else if (a === 'go') { line.push(u); renderBuild(); }
  else if (a === 'del') {
    const k = key(pos), san = cur!.moves[k][u];
    const snap = snapRep();
    delete cur!.moves[k][u]; if (cur!.notes) delete cur!.notes[k + '|' + u]; if (!Object.keys(cur!.moves[k]).length) delete cur!.moves[k];
    const gone = pruneUnreachable();
    save(); renderBuild();
    undoable(`Removed ${san}${gone ? ` and ${gone} position${gone === 1 ? '' : 's'} below it` : ''}`, snap);
  }
  else if (a === 'dline') deleteLine(+u);
  else if (a === 'goline') buildLine(+u);
  else if (a === 'bprev') buildLine(bIdx - 1);
  else if (a === 'bnext') buildLine(bIdx + 1);
  else if (a === 'viewtree') { treeView = true; renderBuild(); }
  else if (a === 'viewlines') { treeView = false; renderBuild(); }
  else if (a === 'tnode') openNode(u.split(' ').filter(Boolean));
  else if (a === 'tfold') { if (collapsed.has(u)) collapsed.delete(u); else collapsed.add(u); renderBuild(); }
  else if (a === 'tnote') { noteEditId = noteEditId === u ? undefined : u; renderBuild(); setTimeout(() => ($('#tn-ed') as HTMLTextAreaElement | null)?.focus(), 30); }
  else if (a === 'tcut' || a === 'tcutm') cutAt(u.split(' ').filter(Boolean));
  else if (a === 'tpromo') promoteAt(u.split(' ').filter(Boolean));
  else if (a === 'mprev') buildStep(-1);
  else if (a === 'mnext') buildStep(1);
  else if (a === 'tag' && last && lastKey) {
    const nk = lastKey + '|' + last, snap = snapRep();
    cur!.tags ??= {};
    if (cur!.tags[nk] === u) delete cur!.tags[nk]; else cur!.tags[nk] = u;
    save(); renderBuild(); undoable(cur!.tags[nk] ? `${lastSan} marked ${u}.` : `${lastSan} unmarked.`, snap);
  }
  else if (a === 'undo2') doUndo();
  else if (a === 'redo2') doRedo();
  else if (a === 'selall') { if (picked.size) picked.clear(); else walkLines().forEach((_, i) => picked.add(i)); renderBuild(); }
  else if (a === 'delpick') { if (picked.size) { const idx = [...picked]; picked.clear(); deleteMany(idx); } }
  else if (a === 'copypick') {
    const sel = $('#copytarget') as HTMLSelectElement | null, target = reps.find(r => r.id === sel?.value);
    if (!target || !picked.size) return void toast('Tick some lines and pick a pack first.', { ms: 2400 });
    const lines = walkLines(); let n = 0;
    for (const i of [...picked].sort((x, y) => x - y)) { const l = lines[i]; if (l) n += importInto(target, pgnOfLine(l) + '\n'); }
    save(); picked.clear(); renderBuild();
    toast(`Copied ${n} move${n === 1 ? '' : 's'} into ${target.name}.`, { ms: 3200 });
  }
  else if (a === 'paste') { const t = ($('#paste') as HTMLTextAreaElement | null)?.value ?? ''; if (!pasteLine(t)) toast('Nothing legal to add there.', { ms: 2400 }); }
  else if (a === 'copyline') copyText(line.length ? pgnOfLine(line) : 'Nothing played yet.');
  else if (a === 'gaps') void findGaps();
  else if (a === 'wjump') { line = pathTo(u); renderBuild(); msg('This is where that move is played — the chip is below.'); }
  else if (a === 'nameline') { const ls = walkLines(); if (ls[+u]) void nameLine(ls[+u]); }
  else if (a === 'unflag') { if (cur?.bad) { delete cur.bad[u]; save(); renderBuild(); toast('Flag cleared.', { ms: 1600 }); } }
  else if (a === 'checkline') void checkLine();
  else if (a === 'gapadd') { line.push(u); renderBuild(); msg(`Now play the answer you want to ${sanOfUci(key(pos), u)}.`); }
  else if (a === 'wnotes') {
    wNotes = !wNotes; walkPanel();
    const l = wLines[wIdx] ?? line;
    showNote(wNotes ? (lineNotes(l) || 'No notes in this line yet.') : noteOf(lastKey, last));
    if (wNotes) msg('Notes for this line — hide them again before you play it.');
  }
  else if (a === 'wback') walkStep(-1);
  else if (a === 'wfwd') walkStep(1);
  else if (a === 'lprev') { if (!wLines.length) wLines = walkLines(); startWalkLine(wIdx - 1); }
  else if (a === 'lnext') { if (!wLines.length) wLines = walkLines(); startWalkLine(wIdx + 1); }
  else if (a === 'main') {
    const k = key(pos), mv2 = cur!.moves[k] ?? {};
    if (!mv2[u] || Object.keys(mv2)[0] === u) return;
    const snap = snapRep();
    const rest = Object.entries(mv2).filter(([x]) => x !== u);
    cur!.moves[k] = { [u]: mv2[u], ...Object.fromEntries(rest) };
    save(); renderBuild();
    undoable(`“${mv2[u]}” is now the first move here.`, snap);
  }
  else if (a === 'undo') { line.pop(); renderBuild(); }
  else if (a === 'reset') { line = []; renderBuild(); }
  else if (a === 'flip') { flipped = !flipped; cg.set({ orientation: orient() }); }
  else if (a === 'pgn') importPgn($('#pgn').value);
  else if (a === 'exportpgn') exportPgn();
  else if (a === 'exportall') exportAll();
  else if (a === 'linkfile') void linkFile({ kvGet, kvSet }).then(() => { showFileState(); void writeNow(stateJson()); }).catch(() => toast('No file chosen.', { ms: 2000 }));
  else if (a === 'unlinkfile') void unlinkFile({ kvGet, kvSet }).then(showFileState);
  else if (a === 'savefile') void writeNow(stateJson()).then(ok => toast(ok ? 'Written to the file.' : 'There is no file to write to yet.', { ms: 2400 }));
  else if (a === 'import-merge') pickFile('merge');
  else if (a === 'import-replace') pickFile('replace');
  else if (a === 'import-pgn') { if (!cur) return toast('Create or select a repertoire first.', { kind: 'bad' }); pickFile('pgn'); }
  else if (a === 'rename') openDlg('rename');
  else if (a === 'delrep') { ask({ title: 'Delete this repertoire?', text: `“${cur!.name}” and its review progress will be removed. Export a backup first if unsure.`, ok: 'Delete', danger: true }).then(yes => { if (yes) { reps = reps.filter(r => r !== cur); cur = reps[0]; save(); enter('build'); toast('Repertoire deleted.'); } }); }
  else if (a === 'hint') {
    const mv = Object.keys(cur!.moves[key(pos)] || {});
    const want = S.lmode === 'walk' && mode === 'learn' ? wLines[wIdx]?.[line.length] : undefined;
    if (mv.length && !locked) { hinted = true; show([arrow(want && mv.includes(want) ? want : mv[0])]); }
  }
  else if (a === 'restart') { if (S.lmode === 'walk' && mode === 'learn') startWalkLine(0); else learnInit(); }
  else if (a === 'wline') startWalkLine(+u);
  else if (a === 'wsolve') {
    if (S.lmode !== 'walk' || mode !== 'learn' || locked || !cur || pos.turn !== cur.color) return;
    const us = Object.keys(cur.moves[key(pos)] || {});
    const want = wLines[wIdx]?.[line.length];
    const u = want && us.includes(want) ? want : us[0];
    if (!u) return;
    const p = parseUci(u)! as any;
    commit(toMove(makeSquare(p.from), makeSquare(p.to)));
  }
  else if (a === 'wnext') { wLines = walkLines(); wHtml = undefined; startWalkLine(wIdx + 1); }
  else if (a === 'next') reviewNext();
  else if (a === 'grade' && mode === 'review') applyReviewGrade(+u as Rating);
  else if (a === 'reveal' && mode === 'review' && queue.length) {
    locked = true;
    const k = queue[0], mv = cur!.moves[k] || {};
    const card = cur!.cards[k] ? { ...cur!.cards[k], due: new Date(cur!.cards[k].due), last_review: cur!.cards[k].last_review ? new Date(cur!.cards[k].last_review) : undefined } : createEmptyCard();
    cur!.cards[k] = f.next(card, new Date(), Rating.Again).card; save();
    queue.push(queue.shift()!);
    show(Object.keys(mv).map(arrow), false);
    showNote(Object.keys(mv).map(x => noteOf(k, x)).filter(Boolean).join('\n'));
    msg(`You prepared ${Object.values(mv).join(' or ')}. It will come round again.`);
    $('#act').innerHTML = `<div class="row"><button data-act="next" class="primary">Next card ›</button></div>`;
  }
  else if (a === 'lmode') { S.lmode = u as LMode; save(); learnInit(); }
  else if (a === 'dstart') drillStart();
  else if (a === 'tstart') timeStart();
  else if (a === 'dstop') { if (S.lmode === 'time') timeOver(); else { dActive = false; const nb = setBest('drill', dScore); msg(`Stopped. Streak ${dScore}.${nb && dScore ? ' New best!' : ''}`, 'ok'); $('#act').innerHTML = `${lmodeBar()}<div class="row"><button data-act="dstart" class="primary">Again</button></div>`; locked = true; session++; } }
  else if (a === 'astart') arenaStart();
  else if (a === 'aresign') { if (aRun && !aBusy && !aRun.ended) { session++; arenaFinish({ result: 'loss', text: 'You resigned.', eval: -300, bookPlies: aRun.bookPlies, left: aRun.left }); show([], false); } }
  else if (a === 'thint') { if (tRun && !locked) { tHinted = true; show([arrow(tRun.expected())]); } }
  else if (a === 'tsolution') showSolution();
  else if (a === 'tskip') tacticsAdvance(true);
  else if (a === 'tnext') tacticsAdvance();
  else if (a === 'tmore') tacticsInit(10);
  else if (a === 'tset') { S.newPuzzles = Math.max(1, Math.min(100, +u)); save(); tacticsInit(); }
  else if (a === 'tth') { S.ptheme = u; save(); tacticsInit(); }
  else if (a === 'edrill') startDrill(allDrills().find(d => d.id === u)!);
  else if (a === 'enext') startDrill(nextDrill());
  else if (a === 'ecustom') customDrill();
  else if (a === 'elist') { session++; endgamesInit(); }
  else if (a === 'eagain' || a === 'erestart') startDrill(eRun!.def);
  else if (a === 'ehint') { if (eRun && !eBusy && !eEnded) { eBusy = true; msg('Thinking…'); eRun.hint().then(u => { eBusy = false; show([arrow(u)]); msg('Hint shown. It lowers your grade.'); }); } }
  else if (a === 'import-csv') pickFile('csv');
  else if (a === 'clear-puz') { ask({ title: 'Remove imported puzzles?', text: 'The built-in puzzles and your progress stay.', ok: 'Remove', danger: true }).then(yes => { if (yes) { imported = []; pmapCache = undefined; kvSet('puzzles', imported); openSettings(); toast('Imported puzzles removed.'); } }); }
});
document.addEventListener('change', e => {
  const el = e.target as HTMLSelectElement & HTMLInputElement;
  if (el.id === 't-theme') { S.ptheme = el.value; save(); tacticsInit(); }
  if (el.classList.contains('pick')) {
    const i = +el.dataset.u!;
    if (el.checked) picked.add(i); else picked.delete(i);
    renderBuild();
  }
});
/* Chips are draggable: dropping one before another re-orders the moves at this position. */
let dragChip: string | undefined;
document.addEventListener('dragstart', e => {
  const c = (e.target as HTMLElement).closest?.('.chip') as HTMLElement | null;
  if (!c) return;
  dragChip = c.dataset.chip; c.classList.add('dragging');
  e.dataTransfer?.setData('text/plain', dragChip ?? '');
});
document.addEventListener('dragend', e => {
  (e.target as HTMLElement).closest?.('.chip')?.classList.remove('dragging');
  document.querySelectorAll('.chip.over').forEach(x => x.classList.remove('over'));
  dragChip = undefined;
});
document.addEventListener('dragover', e => {
  const c = (e.target as HTMLElement).closest?.('.chip') as HTMLElement | null;
  if (!c || !dragChip || c.dataset.chip === dragChip) return;
  e.preventDefault(); c.classList.add('over');
});
document.addEventListener('dragleave', e => (e.target as HTMLElement).closest?.('.chip')?.classList.remove('over'));
/* Dragging a tree row onto a sibling row re-orders the branches at that point. */
let dragSeg: { par: string; first: string } | undefined;
document.addEventListener('dragstart', e => {
  const seg = (e.target as HTMLElement).closest?.('.tseg') as HTMLElement | null;
  if (!seg || !seg.dataset.first) return;
  dragSeg = { par: seg.dataset.par ?? '', first: seg.dataset.first };
  seg.classList.add('dragging');
});
document.addEventListener('dragend', () => { dragSeg = undefined; document.querySelectorAll('.tseg.dragging,.tseg.over').forEach(x => x.classList.remove('dragging', 'over')); });
document.addEventListener('dragover', e => {
  const seg = (e.target as HTMLElement).closest?.('.tseg') as HTMLElement | null;
  if (!seg || !dragSeg || !seg.dataset.first) return;
  if ((seg.dataset.par ?? '') !== dragSeg.par) return;           // only among siblings
  e.preventDefault(); seg.classList.add('over');
});
document.addEventListener('drop', e => {
  const seg = (e.target as HTMLElement).closest?.('.tseg') as HTMLElement | null;
  if (seg && dragSeg && cur) {
    e.preventDefault();
    const onto = seg.dataset.first ?? '', move = dragSeg.first, par = dragSeg.par;
    if (onto && move && (seg.dataset.par ?? '') === par && move !== onto) {
      const p = Chess.default(); for (const u of par.split(' ').filter(Boolean)) p.play(parseUci(u)!);
      const k = key(p), mv = cur.moves[k];
      if (mv && mv[move] && mv[onto]) {
        const snap = snapRep();
        const rest = Object.entries(mv).filter(([x]) => x !== move);
        const at = rest.findIndex(([x]) => x === onto);
        rest.splice(at < 0 ? rest.length : at, 0, [move, mv[move]]);
        cur.moves[k] = Object.fromEntries(rest);
        save(); renderBuild(); undoable('Reordered the branches here.', snap);
      }
    }
    dragSeg = undefined;
    document.querySelectorAll('.tseg.dragging,.tseg.over').forEach(x => x.classList.remove('dragging', 'over'));
    return;
  }
  const c = (e.target as HTMLElement).closest?.('.chip') as HTMLElement | null;
  if (!c || !dragChip || !cur) return;
  e.preventDefault(); c.classList.remove('over');
  const target = c.dataset.chip!, from = dragChip; dragChip = undefined;
  if (!target || target === from || !line.length === false) { /* still reorder */ }
  const k = key(pos), mv = cur.moves[k]; if (!mv || !mv[from]) return;
  const snap = snapRep();
  const rest = Object.entries(mv).filter(([x]) => x !== from);
  const at = rest.findIndex(([x]) => x === target);
  rest.splice(at < 0 ? rest.length : at, 0, [from, mv[from]]);
  cur.moves[k] = Object.fromEntries(rest);
  save(); renderBuild(); undoable('Reordered the moves here.', snap);
});
let noteSnapKey = '';
document.addEventListener('input', e => {
  const el = e.target as HTMLTextAreaElement;
  if (el.id === 'linefilter') {                       // filter the numbered lines in place, without a re-render
    const q = el.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll('#act .rowline, #act .item[data-act=wline]')] as HTMLElement[];
    let shown = 0;
    rows.forEach(r => { const hit = !q || (r.dataset.line ?? '').includes(q); r.hidden = !hit; if (hit) shown++; });
    const c = document.querySelector('#linecount'); if (c) c.textContent = q ? `${shown} of ${rows.length} lines` : '';
    return;
  }
  if (el.id === 'tn-ed') {                              // the tree's inline note editor
    if (!cur) return;
    const nk = el.dataset.k!;
    cur.notes ??= {};
    if (noteSnapKey !== nk) { noteSnapKey = nk; snapNow(); }
    if (el.value.trim()) cur.notes[nk] = el.value.trim(); else delete cur.notes[nk];
    save(); return;
  }
  if (el.id !== 'note-ed' || !cur || !last || !lastKey) return;
  cur.notes ??= {}; const nk = lastKey + '|' + last;
  if (noteSnapKey !== nk) { noteSnapKey = nk; snapNow(); }
  if (el.value.trim()) cur.notes[nk] = el.value.trim(); else delete cur.notes[nk];
  save();
});
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && noteEditId) { noteEditId = undefined; renderBuild(); return; }
  const typing = (e.target as HTMLElement).matches('input,textarea,select');
  if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); return void (e.shiftKey ? doRedo() : doUndo()); }
  if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); return void doRedo(); }
  if (typing) return;
  if (e.key === '?') return void $('#keys').showModal();
  if (!cur && opening(mode)) return;
  if (e.key === 'Escape') { if (noteEditId) { noteEditId = undefined; renderBuild(); return; } cg.cancelPremove(); return; }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && mode === 'build') {
    e.preventDefault(); buildStep(e.key === 'ArrowRight' ? 1 : -1);
  }
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && mode === 'learn' && S.lmode === 'walk') {
    e.preventDefault(); walkStep(e.key === 'ArrowRight' ? 1 : -1);
  }
  else if (e.key === 'Backspace' && mode === 'build' && line.length) { e.preventDefault(); line.pop(); renderBuild(); }
  else if (e.key === 'h' && mode !== 'build') $('[data-act=hint]')?.click();
  else if (mode === 'review' && reviewGrade && !reviewGrade.done && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); applyReviewGrade(+e.key as Rating); }
  else if ((e.key === 'Enter' || e.key === ' ') && $('[data-act=next]')) { e.preventDefault(); reviewNext(); }
});
$('#rep').addEventListener('change', (e: any) => { cur = reps.find(r => r.id === e.target.value); save(); enter(mode); });
$('#file').addEventListener('change', async (e: any) => {
  const file = e.target.files[0]; if (!file) return;
  if (fileMode === 'csv') { e.target.value = ''; } const text = fileMode === 'csv' ? '' : await file.text(); e.target.value = '';
  const done = (t: string, c = '') => { document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel')); enter(mode); msg(t, c); };
  if (fileMode === 'csv') { const n = await importCsv(file); return done(n ? `Imported ${n} puzzles.` : 'No usable puzzles found. Use the Lichess puzzle CSV.', n ? 'ok' : 'bad'); }
  if (fileMode === 'pgn') { const n = importInto(cur!, text); save(); return done(n ? `Imported ${n} moves.` : 'No moves found in that PGN.', n ? 'ok' : 'bad'); }
  try {
    const data = JSON.parse(text); const arr = (Array.isArray(data) ? data : data.reps)?.filter((r: any) => r && r.id && r.name && r.moves);
    if (!Array.isArray(Array.isArray(data) ? data : data.reps)) throw 0;
    arr.forEach((r: Rep) => { r.cards ??= {}; r.notes ??= {}; });
    const later = (a: any, b: any) => { const t = (x: any) => (x?.last_review ? +new Date(x.last_review) : 0); return t(a) > t(b); };
    if (fileMode === 'replace') {
      if (!(await ask({ title: 'Replace everything?', text: 'All repertoires and progress on this device will be replaced by the backup.', ok: 'Replace', danger: true }))) return;
      reps = arr; if (data.settings) S = { ...DEF, ...data.settings };
      pcards = data.tactics?.cards ?? {}; pstats = { ...pstats, ...(data.tactics?.stats ?? {}) }; imported = data.tactics?.imported ?? []; pmapCache = undefined; kvSet('puzzles', imported);
      ecards = data.endgames?.cards ?? {}; egCustom = data.endgames?.custom ?? [];
    } else {
      mergeReps(arr);
      for (const [k, c] of Object.entries<any>(data.tactics?.cards ?? {})) if (!pcards[k] || later(c, pcards[k])) pcards[k] = c;
      for (const [k, c] of Object.entries<any>(data.endgames?.cards ?? {})) if (!ecards[k] || later(c, ecards[k])) ecards[k] = c;
      if ((data.tactics?.stats?.solved ?? 0) > pstats.solved) pstats = { ...pstats, ...data.tactics.stats };
      const have = new Set(allPuzzles().map(p => p.id)); const add = (data.tactics?.imported ?? []).filter((p: Puzzle) => !have.has(p.id));
      if (add.length) { imported = imported.concat(add); pmapCache = undefined; kvSet('puzzles', imported); }
      const hd = new Set(allDrills().map(d => d.id)); for (const d of data.endgames?.custom ?? []) if (!hd.has(d.id)) egCustom.push(d);
    }
    cur = reps.find(r => r.id === cur?.id) ?? reps[0]; applySettings(); save();
    done(`Backup ${fileMode === 'replace' ? 'restored' : 'merged'}: ${arr.length} repertoires plus training progress.`, 'ok');
  } catch { msg('That file is not a Jan20 backup.', 'bad'); }
});

let deferredInstall: any;
addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferredInstall = e; });
const oops = () => toast('Something went wrong. Your progress is saved.', { action: 'Reload', onAction: () => location.reload(), kind: 'bad', ms: 9000 });
addEventListener('error', e => { console.error(e.error ?? e.message); oops(); });
addEventListener('unhandledrejection', e => { console.error(e.reason); oops(); });
$('#sanform').addEventListener('submit', e => {
  e.preventDefault(); const inp = $('#san'); const text = inp.value.trim().replace(/0/g, 'O'); if (!text) return;
  if (opening(mode) && !cur) return;
  if (!canNow || locked || (mode === 'endgames' && eBusy) || (mode === 'learn' && S.lmode === 'arena' && aBusy)) return toast('It is not your move yet.');
  const m = parseSan(pos, text);
  if (!m) { buzz(); return toast(`“${inp.value.trim()}” is not a legal move here.`, { kind: 'bad' }); }
  inp.value = ''; commit(m);
});
async function init() {
  console.log('Jan20 build', __BUILD__);
  // A service worker belongs to the installed web app only. Inside the Tauri webview it would cache the whole
  // frontend and keep serving an old build while the exe underneath is current — that is exactly what happened.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  }
  nativeInit();
  $('#brand').innerHTML = `${mark}<span>Jan20</span>`;
  navigator.storage?.persist?.();
  reps = (await kvGet('reps')) ?? [];
  if (!reps.length) { try { const old = JSON.parse(localStorage.getItem('reps') || '[]'); if (old.length) reps = old; } catch { /* ignore */ } }
  reps.forEach(r => { r.notes ??= {}; r.cards ??= {}; });
  S = { ...DEF, ...((await kvGet('settings')) ?? {}) };
  // the live file is the source of truth on the desktop
  const fs = await initFile({ kvGet, kvSet });
  if (fs.kind === 'tauri') {
    const onDisk = await readFile();
    if (onDisk?.reps?.length) {
      reps = onDisk.reps; reps.forEach((r: Rep) => { r.notes ??= {}; r.cards ??= {}; });
      if (onDisk.settings) S = { ...S, ...onDisk.settings };
      if (onDisk.tactics) { pcards = onDisk.tactics.cards ?? {}; pstats = { ...pstats, ...(onDisk.tactics.stats ?? {}) }; imported = onDisk.tactics.imported ?? []; }
      if (onDisk.endgames) { ecards = onDisk.endgames.cards ?? {}; egCustom = onDisk.endgames.custom ?? []; }
      console.log('Loaded', reps.length, 'repertoires from', fs.path);
    }
    kvSet('reps', reps);
    if (fs.note) toast(`⚠ ${fs.note}. Your data is safe; a fresh file will be written.`, { ms: 9000 });
  }
  imported = (await kvGet('puzzles')) ?? []; pcards = (await kvGet('pcards')) ?? {}; pstats = { ...pstats, ...((await kvGet('pstats')) ?? {}) };
  ecards = (await kvGet('ecards')) ?? {}; egCustom = (await kvGet('egcustom')) ?? [];
  const id = await kvGet('cur'); cur = reps.find(r => r.id === id) ?? reps[0];
  if (NATIVE) {
    document.querySelector('[data-m=build]')?.remove();
    const w = $('#w-modes'); if (w) w.innerHTML = '<b>Learn, Review, Tactics, Endgames</b> Walk and drill your lines, then review them on a spaced-repetition schedule. This build trains; edit the repertoire on the desktop version.';
  }
  const ui = await kvGet('ui');
  const first: Mode = EDIT_TABS.includes(ui?.mode) ? ui.mode : NATIVE ? 'learn' : 'build';
  applySettings(); enter(first);
  if (fs.kind === 'tauri') writeSoon(stateJson(), 150);     // touch the file at start-up so it always exists
  if (!S.welcomed) { S.welcomed = true; save(); if (!reps.length) $('#welcome').showModal(); }
}
init();
