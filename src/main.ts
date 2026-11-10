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
import { makeSan, parseSan } from 'chessops/san';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { chessgroundDests } from 'chessops/compat';
import { fsrs, createEmptyCard, Rating } from 'ts-fsrs';
import { engine } from './engine';
import { toEngine, fenOf, fromFen } from './uci';
import { PuzzleRun, parseCsvLine, humanTheme, sanLine, type Puzzle } from './puzzle';
import { DrillRun, type DrillDef, type DrillEnd } from './drill';
import { DRILLS } from './endgames';
import { explain, fmtScore } from './explain';
import { ArenaRun, type ArenaEnd } from './arena';
import STARTER from './tactics/starter.json';

type Rep = { id: string; name: string; color: 'white' | 'black'; moves: Record<string, Record<string, string>>; cards: Record<string, any>; notes?: Record<string, string>; src?: string; best?: { drill?: number; time?: number }; arena?: { rating: number; games: number }; walk?: number };
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
let mode: Mode = 'build';
let pos = Chess.default();
let line: string[] = [];
let last: string | undefined, lastKey: string | undefined, lastSan = '';
let queue: string[] = [];
let total = 0, hinted = false, locked = false, flipped = false, session = 0;
let fileMode: 'merge' | 'replace' | 'pgn' | 'csv' = 'merge';
let imported: Puzzle[] = []; let pcards: Record<string, any> = {};
let pstats = { rating: 1200, solved: 0, failed: 0, streak: 0, best: 0 };
let ecards: Record<string, any> = {}; let egCustom: DrillDef[] = [];
let tRun: PuzzleRun | undefined, tColor: 'white' | 'black' | undefined, tGraded = false, tHinted = false, tQueue: string[] = [], tTotal = 0;
const tRequeued = new Set<string>(); let tFailed = false;
let eRun: DrillRun | undefined, eColor: 'white' | 'black' | undefined, eBusy = false, eEnded = false;
let promo: { m: any; prev: string } | undefined;
const parent = new Map<string, { from: string; uci: string }>();
let dScore = 0, dLines = 0, dActive = false, ttEnd = 0, ttTimer: any;
let wLines: string[][] = [], wIdx = 0;
let aRun: ArenaRun | undefined, aBusy = false;

let timer: any;
const flush = () => { kvSet('reps', reps); kvSet('cur', cur?.id); kvSet('settings', S); kvSet('pcards', pcards); kvSet('pstats', pstats); kvSet('ecards', ecards); kvSet('egcustom', egCustom); };
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 120); };
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

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

const cg: any = Chessground($('#board'), {
  animation: { duration: 200 },
  premovable: { enabled: false, showDests: true, castle: true },
  draggable: { distance: 4 },
  drawable: { brushes: { green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 }, red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 }, blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 }, yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 }, hint: { key: 'h', color: '#e3b653', opacity: 0.92, lineWidth: 11 } } } as any,
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
const updateDue = () => {
  $('#due').textContent = cur ? queueKeys().length || '' : '';
  $('#tdue').textContent = dueCount(pcards) || ''; $('#edue').textContent = dueCount(ecards) || '';
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
  if (mode === 'build') { (cur!.moves[k] ??= {})[u] = s; save(); line.push(u); sfx('move'); renderBuild(); }
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
  const nt = (u: string) => { const t = cur!.notes?.[k + '|' + u]; return t ? ` {${t.replace(/[{}]/g, '')}}` : ''; };
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
const exportAll = () => download(`jan20-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'jan20', v: 3, exported: new Date().toISOString(), settings: S, reps, tactics: { cards: pcards, stats: pstats, imported }, endgames: { cards: ecards, custom: egCustom } }));

/* ---------- Build ---------- */
function renderBuild() {
  pos = Chess.default(); last = undefined; lastKey = undefined; lastSan = '';
  for (const u of line) { const m = parseUci(u)!; lastKey = key(pos); lastSan = makeSan(pos, m); pos.play(m); last = u; }
  show(); showNote('');
  const keys = Object.keys(cur!.moves);
  const mv = cur!.moves[key(pos)] || {};
  msg(pos.turn === cur!.color ? 'Your move. Play it on the board to save it.' : 'Opponent’s move. Play a reply you want to prepare for.');
  $('#path').textContent = pathText(line);
  const chips = Object.entries(mv).map(([u, s]) =>
    `<span class="chip"><button data-act="go" data-u="${u}">${esc(s)}</button><button data-act="del" data-u="${u}" aria-label="Delete ${esc(s)}">✕</button></span>`).join('');
  const editor = last ? `<label class="field">Note for ${esc(lastSan)}<textarea id="note-ed" maxlength="800" placeholder="Why this move? Plans, traps, what to remember.">${esc(noteOf(lastKey, last))}</textarea></label>` : '';
  $('#act').innerHTML = `<div class="chips">${chips || '<span class="dim">No saved moves from this position yet.</span>'}</div>
    ${editor}
    <div class="row"><button data-act="undo">Undo</button><button data-act="reset">Start</button><button data-act="flip">Flip board</button></div>
    <p class="stats">${keys.length} positions · ${keys.filter(k => k.split(' ')[1] === mine()).length} yours</p>
    <details><summary>More</summary>
      <textarea id="pgn" placeholder="Paste a PGN with variations and comments"></textarea>
      <div class="row"><button data-act="pgn">Import PGN</button><button data-act="exportpgn">Export PGN</button><button data-act="rename">Rename</button><button data-act="delrep" class="danger">Delete</button></div>
    </details>`;
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
function walkLines(): string[][] {
  const out: string[][] = [];
  if (!cur) return out;
  const walk = (k: string, path: string[]) => {
    if (out.length >= 400) return;
    const us = Object.keys(cur!.moves[k] || {});
    if (!us.length) { if (path.length) out.push(path); return; }
    for (const u of us) {
      const p = fromKey(k); p.play(parseUci(u)!);
      walk(key(p), [...path, u]);
    }
  };
  walk(START, []);
  return out;
}
/** Which numbered line does this played prefix belong to? (falls back to the current one) */
function lineOf(prefix: string[]) {
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
function walkPanel() {
  wHtml ??= wLines.map((l, i) => lineHtml(l, wLines[i - 1]));
  const rows = wLines.map((l, i) =>
    `<button class="item ${i === wIdx ? 'on' : ''}" data-act="wline" data-u="${i}"><span>${i + 1}.</span><span class="walk">${wHtml![i]}</span></button>`).join('');
  $('#act').innerHTML = `${lmodeBar()}
    <div class="row"><button data-act="hint">Hint</button><button data-act="wnext" class="primary">Next line</button><button data-act="restart">Start over</button></div>
    <h3>All lines (${wLines.length})</h3><div class="list">${rows || '<p class="dim">No lines yet. Add moves in Build.</p>'}</div>`;
}
function startWalkLine(i: number) {
  if (!wLines.length) return;
  wIdx = Math.max(0, Math.min(wLines.length - 1, i));
  cur!.walk = wIdx; save();
  session++; line = []; last = undefined; lastKey = undefined; pos = Chess.default(); locked = false;
  walkPanel();
  learnStep();
}
function walkDone() {
  const last = wIdx >= wLines.length - 1;
  locked = true; sfx('ok'); flash('ok'); show([], false);
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
    show([], false); msg(line.length ? 'Line complete.' : 'Nothing to learn yet. Add moves in Build.', 'ok'); return;
  }
  if (pos.turn !== cur!.color) {
    show([], false); msg('Opponent plays…');
    // Walk follows the numbered line; Drill and Time stay random.
    const want = walk ? wLines[wIdx]?.[line.length] : undefined;
    const u = want && us.includes(want) ? want : walk ? us[0] : pick(us);
    setTimeout(() => { if (tok === session) { play(u); learnStep(); } }, fast() ? Math.min(S.learnDelay, 250) : S.learnDelay);
    return;
  }
  show(); msg(fast() && dActive ? 'Your move.' : 'Your move.');
}
function learnAnswer(u: string, k: string) {
  const mv = cur!.moves[k];
  if (mv[u]) {
    play(u); sfx('move');
    if (S.lmode === 'walk') { const j = lineOf(line); if (j !== wIdx) { wIdx = j; cur!.walk = j; save(); walkPanel(); } }
    if (fast() && dActive) { dScore++; }
    return learnStep();
  }
  buzz(); sfx('bad'); flash('bad');
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
  const ks = ownKeys(); if (!ks.length) { dActive = false; msg('Nothing to drill yet. Add moves in Build.'); return; }
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
  locked = false; hinted = false;
  $('#act').innerHTML = queue.length ? `<div class="row"><button data-act="hint">Hint</button></div>` : '';
  updateDue();
  $('#bar').hidden = !total; $('#bar i').style.width = total ? `${Math.max(0, (total - queue.length) / total) * 100}%` : '0';
  if (!queue.length) {
    pos = Chess.default(); line = []; last = undefined; lastKey = undefined; show([], false); showNote(''); $('#path').textContent = '';
    msg(total ? `Session done. ${total} cards reviewed.` : 'All caught up. Nothing is due.', 'ok'); return;
  }
  const k = queue[0], e = parent.get(k); pos = fromKey(k); line = pathTo(k); last = e?.uci; lastKey = e?.from;
  $('#path').textContent = pathText(line); showNote(noteOf(lastKey, last)); show(); msg(`Find your move. ${queue.length} left.`);
}
function reviewAnswer(u: string, k: string) {
  locked = true;
  const mv = cur!.moves[k], ok = !!mv[u], c = cur!.cards[k];
  const card = c ? { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined } : createEmptyCard();
  const r = f.next(card, new Date(), ok ? (hinted ? Rating.Hard : Rating.Good) : Rating.Again).card;
  cur!.cards[k] = r; save();
  if (ok) {
    play(u); sfx('ok'); flash('ok'); show([], false); showNote(noteOf(k, u)); msg(`Correct. Next review ${rel(r.due)}.`, 'ok'); queue.shift();
    const wait = noteOf(k, u) ? 2600 : 900;
    const tok = session; setTimeout(() => { if (mode === 'review' && tok === session) reviewNext(); }, wait);
  } else {
    buzz(); sfx('bad'); flash('bad'); queue.push(queue.shift()!); show(Object.keys(mv).map(arrow), false);
    const base = Object.keys(mv).map(x => noteOf(k, x)).filter(Boolean).join('\n'); showNote(base); explainWrong(k, u, base);
    msg(`Not quite. You prepared ${Object.values(mv).join(' or ')}.`, 'bad');
    $('#act').innerHTML = `<div class="row"><button data-act="next" class="primary">Next card</button></div>`;
  }
}

/* ---------- Tactics ---------- */
const allPuzzles = () => (STARTER as Puzzle[]).concat(imported);
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
const tTiles = () => `<div class="tiles"><div class="tile"><b>${Math.round(pstats.rating)}</b><span>Rating</span></div><div class="tile"><b>${pstats.streak}</b><span>Streak</span></div><div class="tile"><b>${pstats.solved}</b><span>Solved</span></div></div>`;

function tacticsInit(extra = 0) { tQueue = puzzleQueue(extra); tTotal = tQueue.length; tRequeued.clear(); tacticsNext(); }
function tacticsNext() {
  session++; tGraded = false; tHinted = false; tFailed = false; const tok = session;
  $('#bar').hidden = !tTotal; $('#bar i').style.width = tTotal ? `${Math.max(0, (tTotal - tQueue.length) / tTotal) * 100}%` : '0';
  updateDue(); showNote('');
  if (!tQueue.length) {
    tRun = undefined; pos = Chess.default(); line = []; last = undefined; tColor = undefined; show([], false);
    $('#path').textContent = '';
    msg(tTotal ? `Session done. ${tTotal} puzzles.` : 'No puzzles to do right now.', 'ok');
    $('#act').innerHTML = `${tTiles()}${themeSelect()}<div class="row"><button data-act="tmore" class="primary">Practice more</button></div>`;
    return;
  }
  const p = pmap().get(tQueue[0])!; tRun = new PuzzleRun(p); tColor = tRun.solverColor;
  pos = tRun.pos.clone(); last = undefined; show([], false); locked = true;
  $('#path').textContent = ''; msg('Get ready…');
  $('#act').innerHTML = `${tTiles()}${themeSelect()}<div class="row"><button data-act="thint">Hint</button><button data-act="tsolution">Show solution</button><button data-act="tskip">Skip</button></div>`;
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
  if (kind === 'fail') { pstats.failed++; pstats.streak = 0; tFailed = true; } else { pstats.solved++; pstats.streak++; pstats.best = Math.max(pstats.best, pstats.streak); }
  sched(pcards, p.id, kind === 'solve' ? Rating.Good : kind === 'hint' ? Rating.Hard : Rating.Again);
}
function tacticsAnswer(m: any) {
  const run = tRun; if (!run) return;
  const u = toEngine(run.pos, m), r = run.try(u, m);
  if (r === 'wrong') { buzz(); sfx('bad'); flash('bad'); gradePuzzle('fail'); msg('Not that one. Try again.', 'bad'); show(); return; }
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
function finishPuzzle() {
  const p = tRun!.p; gradePuzzle(tHinted ? 'hint' : 'solve'); locked = true;
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
  const rest = run.p.moves.slice(run.i);
  msg(`Solution: ${sanLine(fenOf(run.pos), rest)}`, 'bad');
  show(rest.length ? [arrow(rest[0])] : [], false);
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
  msg('Pick an endgame. You play against Stockfish.'); $('#path').textContent = 'Mistakes are taken back so you can try again. Hints lower your grade.';
  $('#act').innerHTML = `<div class="row"><button data-act="enext" class="primary">Next drill</button><button data-act="ecustom">Practise a FEN</button></div>` +
    groups.map(g => `<h3>${esc(g)}</h3><div class="list">${defs.filter(d => d.group === g).map(d => `<button class="item" data-act="edrill" data-u="${d.id}"><span>${esc(d.name)}</span><span class="pill ${d.goal}">${d.goal === 'win' ? 'win' : 'hold'}</span><span class="stat ${status(d) === 'due' ? 'due' : ''}">${status(d)}</span></button>`).join('')}</div>`).join('');
  updateDue();
}
function nextDrill() {
  const defs = allDrills();
  return defs.find(d => ecards[d.id] && isDue(ecards[d.id])) ?? defs.find(d => !ecards[d.id]) ?? defs[0];
}
async function startDrill(def: DrillDef) {
  session++; const tok = session;
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
    buzz(); sfx('bad'); flash('bad'); eBusy = false; pos = run.pos; show(r.hint ? [arrow(r.hint)] : []);
    msg(`${r.text} ${r.hint ? `Best was ${r.hintSan}.` : 'Try again.'}`, 'bad'); return;
  }
  last = r.reply?.uci ?? r.userUci;
  if (run.def.goal === 'hold') $('#bar i').style.width = `${Math.min(100, (run.moves / run.holdMoves) * 100)}%`;
  if (r.ended) { show([], false); return finishDrill(r.ended); }
  sfx('move'); eBusy = false;
  if (consumePremove()) return;
  show(); msg(`${r.userSan}, ${r.reply!.san}. Your move.`);
}
function finishDrill(end: DrillEnd) {
  const run = eRun!; eEnded = true; eBusy = false; show([], false);
  const due = sched(ecards, run.def.id, end.grade === 'good' ? Rating.Good : end.grade === 'hard' ? Rating.Hard : Rating.Again);
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
    return `<div class="pack"><div class="packhead"><b>${esc(p.name)}</b><span class="pill">${p.color}</span></div><p class="dim">${esc(p.blurb)}</p><p class="stats">${own} positions to learn · ${Object.keys(t.notes!).length} notes</p><button data-act="addpack" data-u="${p.id}" class="${have ? '' : 'primary'}">${have ? 'Add another copy' : 'Add to my repertoires'}</button></div>`;
  }).join('');
  $('#lib').showModal();
}
function addPack(p: Pack) {
  const rep: Rep = { id: crypto.randomUUID(), name: p.name, color: p.color, moves: {}, cards: {}, notes: {}, src: p.id };
  const n = importInto(rep, p.pgn); reps.push(rep); cur = rep; save();
  document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel'));
  enter('build'); msg(`Added ${p.name}: ${n} moves. Try Learn next.`, 'ok');
}
function openSettings() {
  $('#s-new').value = S.newCap; $('#s-ret').value = String(S.retention); $('#s-theme').value = S.theme; $('#s-delay').value = String(S.learnDelay);
  $('#s-san').checked = S.san; $('#s-install').hidden = !deferredInstall; $('#s-expl').checked = S.explain; $('#s-app').value = S.appearance; $('#s-pieces').value = S.pieces; $('#s-sound').checked = S.sound;
  $('#s-coords').checked = S.coords; $('#s-anim').checked = S.anim; $('#s-hap').checked = S.haptics;
  $('#s-ems').value = String(S.engineMs); $('#s-newp').value = S.newPuzzles; $('#s-win').value = String(S.window); $('#s-imin').value = S.importMin; $('#s-imax').value = S.importMax; $('#s-icnt').value = S.importCount;
  $('#s-pinfo').textContent = `${STARTER.length} built in · ${imported.length} imported · rating ${Math.round(pstats.rating)}`;
  $('#s-info').textContent = `${reps.length} repertoires · ${reps.reduce((a, r) => a + Object.keys(r.cards).length, 0)} cards scheduled. Data stays on this device.`;
  $('#set').showModal();
}
$('#set').addEventListener('change', () => {
  S = { san: $('#s-san').checked, welcomed: S.welcomed, lmode: S.lmode, explain: $('#s-expl').checked, appearance: $('#s-app').value, pieces: $('#s-pieces').value, sound: $('#s-sound').checked, newCap: Math.max(0, Math.min(100, Math.round(+$('#s-new').value || 0))), retention: +$('#s-ret').value, theme: $('#s-theme').value, coords: $('#s-coords').checked, anim: $('#s-anim').checked, haptics: $('#s-hap').checked, learnDelay: +$('#s-delay').value, engineMs: +$('#s-ems').value, newPuzzles: Math.max(0, Math.min(100, Math.round(+$('#s-newp').value || 0))), window: +$('#s-win').value, importMin: +$('#s-imin').value || 0, importMax: +$('#s-imax').value || 3500, importCount: Math.max(1, Math.min(20000, Math.round(+$('#s-icnt').value || 3000))), ptheme: S.ptheme };
  save(); applySettings(); updateDue(); $('#sanform').hidden = !S.san;
});

/* ---------- Shell ---------- */
function enter(m: Mode) {
  mode = m; session++; line = []; last = undefined; lastKey = undefined; pos = Chess.default(); flipped = false; promo = undefined; total = 0;
  clearInterval(ttTimer); dActive = false; aRun = undefined; aBusy = false;
  locked = false; eBusy = false; tColor = undefined; eColor = undefined; tRun = undefined; eRun = undefined;
  cg.cancelPremove();
  $('#bar').hidden = true; showNote('');
  document.querySelectorAll('[data-m]').forEach((b: any) => { b.classList.toggle('on', b.dataset.m === m); b.setAttribute('aria-current', b.dataset.m === m ? 'page' : 'false'); });
  $('#sanform').hidden = !S.san; kvSet('ui', { mode: m });
  const panel = $('#panel'); panel.classList.remove('fade'); void panel.offsetWidth; panel.classList.add('fade');
  const op = opening(m);
  $('#rep').innerHTML = reps.map(r => `<option value="${r.id}" ${r === cur ? 'selected' : ''}>${esc(r.name)} · ${r.color}</option>`).join('');
  $('#rep').hidden = !reps.length || !op; $('header [data-act=new]').hidden = !op;
  if (m === 'tactics') { tacticsInit(); updateDue(); return; }
  if (m === 'endgames') { endgamesInit(); return; }
  if (!cur) {
    show([], false); $('#path').textContent = ''; msg('Start with your first repertoire.');
    $('#act').innerHTML = `<div class="hero">${mark}</div><button data-act="openlib" class="primary">Add starter lines</button><button data-act="new">Create my own</button>`; updateDue(); return;
  }
  if (m === 'build') renderBuild(); else if (m === 'learn') learnInit(); else reviewInit();
  updateDue();
}

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
  else if (a === 'askno') $('#ask').close('cancel');
  else if (a === 'keys') { document.querySelectorAll('dialog[open]').forEach((d: any) => d.close('cancel')); $('#keys').showModal(); }
  else if (a === 'install') { deferredInstall?.prompt(); }
  else if (a === 'closedlg') (b.closest('dialog') as HTMLDialogElement).close();
  else if (a === 'dlgcancel') $('#dlg').close('cancel');
  else if (a === 'promo') { locked = false; const m = { ...promo!.m, promotion: u }; $('#act').innerHTML = promo!.prev; promo = undefined; commit(m); }
  else if (a === 'promocancel') { locked = false; $('#act').innerHTML = promo!.prev; promo = undefined; show(); msg('Your move.'); }
  else if (a === 'go') { line.push(u); renderBuild(); }
  else if (a === 'del') {
    const k = key(pos), san = cur!.moves[k][u], note = cur!.notes?.[k + '|' + u];
    delete cur!.moves[k][u]; if (cur!.notes) delete cur!.notes[k + '|' + u]; if (!Object.keys(cur!.moves[k]).length) delete cur!.moves[k]; save(); renderBuild();
    toast(`Removed ${san}`, { action: 'Undo', onAction: () => { (cur!.moves[k] ??= {})[u] = san; if (note) (cur!.notes ??= {})[k + '|' + u] = note; save(); if (mode === 'build') renderBuild(); } });
  }
  else if (a === 'undo') { line.pop(); renderBuild(); }
  else if (a === 'reset') { line = []; renderBuild(); }
  else if (a === 'flip') { flipped = !flipped; cg.set({ orientation: orient() }); }
  else if (a === 'pgn') importPgn($('#pgn').value);
  else if (a === 'exportpgn') exportPgn();
  else if (a === 'exportall') exportAll();
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
  else if (a === 'wnext') { wLines = walkLines(); wHtml = undefined; startWalkLine(wIdx + 1 >= wLines.length ? 0 : wIdx + 1); }
  else if (a === 'next') reviewNext();
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
  const el = e.target as HTMLSelectElement;
  if (el.id === 't-theme') { S.ptheme = el.value; save(); tacticsInit(); }
});
document.addEventListener('input', e => {
  const el = e.target as HTMLTextAreaElement;
  if (el.id !== 'note-ed' || !cur || !last || !lastKey) return;
  cur.notes ??= {}; const nk = lastKey + '|' + last;
  if (el.value.trim()) cur.notes[nk] = el.value.trim(); else delete cur.notes[nk];
  save();
});
document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if (e.key === '?') return void $('#keys').showModal();
  if (!cur && opening(mode)) return;
  if (e.key === 'Escape') { cg.cancelPremove(); return; }
  if (e.key === 'ArrowLeft' && mode === 'build') { line.pop(); renderBuild(); }
  else if (e.key === 'h' && mode !== 'build') $('[data-act=hint]')?.click();
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
  nativeInit();
  $('#brand').innerHTML = `${mark}<span>Jan20</span>`;
  navigator.storage?.persist?.();
  reps = (await kvGet('reps')) ?? [];
  if (!reps.length) { try { const old = JSON.parse(localStorage.getItem('reps') || '[]'); if (old.length) reps = old; } catch { /* ignore */ } }
  reps.forEach(r => { r.notes ??= {}; r.cards ??= {}; });
  S = { ...DEF, ...((await kvGet('settings')) ?? {}) };
  imported = (await kvGet('puzzles')) ?? []; pcards = (await kvGet('pcards')) ?? {}; pstats = { ...pstats, ...((await kvGet('pstats')) ?? {}) };
  ecards = (await kvGet('ecards')) ?? {}; egCustom = (await kvGet('egcustom')) ?? [];
  const id = await kvGet('cur'); cur = reps.find(r => r.id === id) ?? reps[0];
  const ui = await kvGet('ui'); const first: Mode = (['build', 'learn', 'review', 'tactics', 'endgames'] as Mode[]).includes(ui?.mode) ? ui.mode : 'build';
  applySettings(); enter(first);
  if (!S.welcomed) { S.welcomed = true; save(); if (!reps.length) $('#welcome').showModal(); }
}
init();
