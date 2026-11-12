// Mines tactic puzzles out of the shipped lines with Stockfish, and labels each one from the
// position rather than from a guess: a fork is a piece that attacks two of them after the move,
// a pin is a slider with exactly one enemy piece between it and the king, and so on.
//
// Usage: node tools/gen-puzzles.mjs [--depth 12] [--per-theme 60] [--target 400] [--max-cand 900]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { attacks } from 'chessops/attacks';
import { makeUci, parseUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const DEPTH = arg('depth', 12), PER_THEME = arg('per-theme', 60), TARGET = arg('target', 400), MAXC = arg('max-cand', 900);
const MINWIN = arg('minwin', 220), MINGAP = arg('mingap', 140);
const OUT = 'src/tactics/generated.json';
const val = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 99 };
const key = (p) => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const fromFen = (fen) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

/* ---------- 1. collect candidate positions from every shipped line ---------- */
const sf = createSF(); await sf.init();
const cands = new Map();
const files = fs.readdirSync('src/library').filter((f) => f.endsWith('.pgn')).sort();
for (const f of files) {
  const text = fs.readFileSync(path.join('src/library', f), 'utf8');
  for (const game of parsePgn(text)) {
    let pos = startingPosition(game.headers).unwrap();
    const walk = (node) => {
      for (const child of node.children) {
        const m = parseSan(pos, child.data.san);
        if (!m) continue;
        const k = key(pos);
        // a puzzle is worth mining only where the mover is not already winning by a mile
        if (!pos.isCheck() && !cands.has(k)) cands.set(k, { fen: makeFen(pos.toSetup()), turn: pos.turn, src: f });
        const q = pos.clone(); q.play(m); pos = q;
        walk(child);
      }
    };
    walk(game.moves);
  }
}
// Book lines are quiet by design; middlegames are where the tactics are. Play games from random
// openings and keep the positions, so the pool has forks and pins to find.
const SELF = arg('selfplay', 0);
if (SELF) {
  // Random play, not engine play: two engines agree too often and the position stays healthy, while
  // random play walks straight into the tactics we want to mine.
  const seenKeys = new Set(cands.keys());
  const rand = (n) => Math.floor(Math.random() * n);
  for (let g = 0; g < SELF; g++) {
    let pos = Chess.default();
    for (let ply = 0; ply < 80 && !pos.isEnd(); ply++) {
      const all = [];
      for (const [from, ds] of pos.allDests()) for (const to of ds) all.push({ from, to });
      if (!all.length) break;
      const k = key(pos);
      if (ply > 8 && !pos.isCheck() && !seenKeys.has(k)) {
        seenKeys.add(k);
        cands.set(k, { fen: makeFen(pos.toSetup()), turn: pos.turn, src: 'random' });
      }
      pos.play(all[rand(all.length)]);
    }
  }
  console.log(`random play added positions, pool now ${cands.size}`);
}
const pool = [...cands.values()];
// deterministic thinning so a re-run gives the same puzzles
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
pool.sort((a, b) => hash(a.fen) - hash(b.fen));
const sample = pool.slice(0, MAXC);
console.log(`positions: ${pool.length} seen, ${sample.length} to search (${files.length} line files)`);

/* ---------- 2. what did that move actually do? ---------- */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The first two pieces along a slider's ray. */
function rayPieces(board, from, role) {
  const straight = role === 'rook' || role === 'queen', diag = role === 'bishop' || role === 'queen';
  const found = [];
  const f0 = from & 7, r0 = from >> 3;
  for (const [df, dr] of DIRS) {
    if (!((df === 0 || dr === 0) ? straight : diag)) continue;
    let f = f0 + df, r = r0 + dr; const hits = [];
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = r * 8 + f;
      const pc = board.get(sq);
      if (pc) { hits.push({ sq, piece: pc }); if (hits.length === 2) break; }
      f += df; r += dr;
    }
    if (hits.length === 2) found.push(hits);
  }
  return found;
}

function themesFor(fen, uci, mateIn) {
  const pos = fromFen(fen);
  const m = parseUci(uci);
  const mover = pos.board.get(m.from);
  const captured = pos.board.get(m.to);
  const q = pos.clone(); q.play(m);
  const enemy = mover.color === 'white' ? 'black' : 'white';
  const enemyKing = [...q.board.pieces(enemy, 'king')][0];
  const out = [];

  if (q.isCheckmate()) {
    out.push('mateIn1');
    const rank = enemyKing >> 3;
    if (rank === 0 || rank === 7) out.push('backRankMate');
  } else if (mateIn && mateIn <= 3) out.push('mateIn2');
  if (m.promotion) out.push('promotion');

  const hits = [];
  for (const sq of attacks(q.board.get(m.to), m.to, q.board.occupied)) {
    const t = q.board.get(sq);
    if (t && t.color === enemy && t.role !== 'king') hits.push(t.role);
  }
  if (hits.length >= 2 && hits.reduce((a, role) => a + val[role], 0) >= 5) out.push('fork');

  let pin = false, skewer = false;
  for (const from of q.board.pieces(mover.color, 'queen').union(q.board.pieces(mover.color, 'rook')).union(q.board.pieces(mover.color, 'bishop')).union(q.board.pieces(mover.color, 'knight')).union(q.board.pieces(mover.color, 'pawn'))) {
    const pc = q.board.get(from);
    if (!pc || !['bishop', 'rook', 'queen'].includes(pc.role)) continue;
    for (const [near, far] of rayPieces(q.board, from, pc.role)) {
      if (near.piece.color !== enemy || far.piece.color !== enemy) continue;
      if (far.piece.role === 'king' && near.piece.role !== 'king') pin = true;
      else if (['queen', 'rook'].includes(far.piece.role) && val[near.piece.role] < val[far.piece.role]) skewer = true;
    }
  }
  if (pin) out.push('pin');
  if (skewer) out.push('skewer');

  if (q.isCheck() && !q.isCheckmate()) {
    let byOther = false;
    for (const from of q.board.pieces(mover.color, 'queen').union(q.board.pieces(mover.color, 'rook')).union(q.board.pieces(mover.color, 'bishop')).union(q.board.pieces(mover.color, 'knight')).union(q.board.pieces(mover.color, 'pawn'))) {
      if (from === m.to) continue;
      const pc = q.board.get(from);
      if (!pc || pc.role === 'king') continue;
      for (const sq of attacks(pc, from, q.board.occupied)) if (sq === enemyKing) byOther = true;
    }
    if (byOther) out.push('discoveredCheck');
  }

  if (captured && ['queen', 'rook', 'bishop', 'knight'].includes(captured.role)) {
    const board = pos.board;                                    // judged before the capture
    const defended = [...board.pieces(captured.color, 'queen').union(board.pieces(captured.color, 'rook')).union(board.pieces(captured.color, 'bishop')).union(board.pieces(captured.color, 'knight')).union(board.pieces(captured.color, 'pawn'))].some((sq) => {
      if (sq === m.to) return false;
      const p2 = board.get(sq);
      if (!p2) return false;
      for (const atk of attacks(p2, sq, board.occupied)) if (atk === m.to) return true;
      return false;
    });
    if (!defended) out.push('hangingPiece');
  }
  if (!out.length) out.push('advantage');
  return [...new Set(out)];
}

/* ---------- 3. search, verify, keep ---------- */
const kept = [];
const perTheme = {};
const seen = new Set();
const rate = (cp, themes) => {
  let r = 1150 + Math.min(400, Math.max(0, cp) / 6);
  if (themes.includes('fork')) r += 120;
  if (themes.includes('pin')) r += 150;
  if (themes.includes('skewer')) r += 200;
  if (themes.includes('discoveredCheck')) r += 180;
  if (themes.includes('mateIn2')) r += 320;
  if (themes.includes('mateIn1')) r += 80;
  return Math.max(800, Math.min(2400, Math.round(r / 10) * 10));
};
let searched = 0;
for (const c of sample) {
  if (kept.length >= TARGET) break;
  searched++;
  let r;
  try { r = await sf.search(c.fen, { depth: DEPTH, multipv: 3 }); } catch { continue; }
  if (!r?.pvs?.length) continue;
  const top = r.pvs[0], second = r.pvs[1];
  const topScore = score(top);
  const mateIn = top.kind === 'mate' ? top.val : 0;
  if (mateIn < 0) continue;
  const win = mateIn > 0 ? 10000 : topScore;
  if (win < MINWIN) continue;
  if (mateIn === 0 && second && score(second) > topScore - MINGAP) continue;
  let pv = (top.pv || []).slice(0, 5);
  if (pv.length % 2 === 0) pv = pv.slice(0, pv.length - 1);
  if (!pv.length) continue;
  // only forcing ideas make good puzzles: mate, a capture, or a check
  const probe = fromFen(c.fen); const pm = parseUci(pv[0]);
  const victim = probe.board.get(pm.to);
  const capture = !!victim && victim.color !== probe.board.get(pm.from)?.color;
  const after = probe.clone(); after.play(pm);
  const forcing = mateIn > 0 || capture || after.isCheck() || !!pm.promotion;
  if (!forcing) continue;
  const themes = themesFor(c.fen, pv[0], mateIn);
  const primary = themes[0];
  if ((perTheme[primary] = (perTheme[primary] || 0) + 1) > PER_THEME) continue;
  const id = 'gen' + hash(c.fen + pv[0]).toString(36).slice(0, 7);
  if (seen.has(id)) continue;
  seen.add(id);
  kept.push({ id, fen: c.fen, moves: pv, rating: rate(win, themes), themes, setup: false });
  if (kept.length % 25 === 0) console.log(`  ... ${kept.length} kept after ${searched} searches`);
}
try { await sf.quit(); } catch {}
// --append merges into what is already there (used for a mate-only pass)
if (process.argv.includes('--append') && fs.existsSync(OUT)) {
  const prior = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  for (const q of prior) if (!kept.some((k) => k.id === q.id)) kept.push(q);
}
kept.sort((a, b) => a.rating - b.rating);
fs.writeFileSync(OUT, JSON.stringify(kept));
const tally = {};
for (const p2 of kept) for (const t of p2.themes) tally[t] = (tally[t] || 0) + 1;
console.log(`\nwrote ${kept.length} puzzles to ${OUT} after ${searched} searches`);
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join('  '));
