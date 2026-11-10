// Mines tactical puzzles from randomised engine self-play. Run: node tools/mine.mjs <games> <outfile>
import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci, makeUci, makeSquare } from 'chessops/util';
import { attacks } from 'chessops/attacks';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const N = +process.argv[2] || 20, OUT = process.argv[3] || '/tmp/puzzles.json';
const VAL = { pawn: 100, knight: 300, bishop: 300, rook: 500, queen: 900, king: 0 };

const norm = (pos, u) => { const m = parseUci(u); const pc = pos.board.get(m.from); if (pc?.role === 'king' && Math.abs((m.from & 7) - (m.to & 7)) === 2) m.to = (m.to & 7) > (m.from & 7) ? (m.from & 56) | 7 : m.from & 56; return m; };
const std = (pos, m) => { const pc = pos.board.get(m.from); let to = m.to; if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = (m.to & 7) > (m.from & 7) ? (m.from & 56) | 6 : (m.from & 56) | 2; return makeUci({ from: m.from, to, promotion: m.promotion }); };
const fenOf = p => makeFen(p.toSetup());
const mat = (p, c) => { let s = 0; for (const [sq, pc] of p.board) if (pc.color === c) s += VAL[pc.role]; return s; };
const sc = r => score(r);
const sleep = () => new Promise(r => setImmediate(r));

async function main() {
  const sf = createSF(); await sf.init();
  const out = []; const seen = new Set(); let tried = 0, t0 = Date.now();
  for (let g = 0; g < N; g++) {
    let pos = Chess.default(); let prev = null; let ply = 0; let puzzlesInGame = 0;
    while (ply < 90 && !pos.isEnd()) {
      const fen = fenOf(pos);
      // analyse for puzzle candidate
      if (ply >= 16 && puzzlesInGame < 2 && prev) {
        const quick = await sf.search(fen, { depth: 9, multipv: 2 });
        const b = quick.pvs[0], s2 = quick.pvs[1];
        if (b && sc(b) >= 250 && (!s2 || sc(s2) <= sc(b) - 150)) {
          tried++;
          const p = await buildPuzzle(sf, pos, prev);
          if (p && !seen.has(p.fen)) { seen.add(p.fen); p.id = 'S' + String(out.length + 1).padStart(3, '0'); out.push(p); puzzlesInGame++; fs.writeFileSync(OUT, JSON.stringify(out)); }
        }
      }
      // choose a move: imperfect play
      const r = await sf.search(fen, { depth: 5, multipv: 4 });
      let pick = r.pvs[0];
      const roll = Math.random(); const lim = ply < 10 ? 120 : 320;
      const cands = r.pvs.filter(x => sc(r.pvs[0]) - sc(x) <= lim);
      if (roll < (ply < 10 ? 0.8 : 0.4)) pick = cands[Math.floor(Math.random() * cands.length)];
      const u = pick.pv[0]; const m = norm(pos, u);
      prev = { fen, uci: u };
      pos.play(m); ply++;
      if (ply % 6 === 0) await sleep();
    }
    console.log(`ply ${ply} end ${pos.isCheckmate() ? "mate" : pos.isEnd() ? "draw" : "cap"}`); console.log(`game ${g + 1}/${N} puzzles ${out.length} candidates ${tried} ${((Date.now() - t0) / 1000) | 0}s`);
  }
  sf.quit();
}

async function buildPuzzle(sf, startPos, prev) {
  const solver = startPos.turn; const startMat = mat(startPos, solver) - mat(startPos, solver === 'white' ? 'black' : 'white');
  let pos = startPos.clone(); const line = []; let mateIn = 0, firstRes = null, hist = null; let minMat = 0;
  for (let step = 0; step < 3; step++) {
    const res = await sf.search(fenOf(pos), { depth: 14, multipv: 3 });
    const b = res.pvs[0], s2 = res.pvs[1];
    if (!b) return null;
    if (step === 0) {
      if (!(sc(b) >= 300) || (s2 && sc(s2) > sc(b) - 200 && sc(s2) > 80)) return null;
      firstRes = res; hist = res.history;
    } else if (sc(b) < 250 || (s2 && sc(s2) > sc(b) - 150 && sc(b) < 9000)) break;
    const u = b.pv[0]; line.push(u); const m = norm(pos, u); pos.play(m);
    minMat = Math.min(minMat, mat(pos, solver) - mat(pos, solver === 'white' ? 'black' : 'white') - startMat);
    if (pos.isCheckmate()) { mateIn = step + 1; break; }
    if (pos.isEnd()) break;
    const rep = await sf.search(fenOf(pos), { depth: 12 });
    const ru = rep.bestmove; line.push(ru); pos.play(norm(pos, ru));
    if (pos.isEnd()) { line.pop(); break; }
  }
  if (!line.length) return null;
  if (line.length % 2 === 0) line.pop();
  // final material swing for solver
  const endGain = mat(pos, solver) - mat(pos, solver === 'white' ? 'black' : 'white') - startMat;
  const best0 = firstRes.pvs[0];
  if (!mateIn && endGain < 150 && sc(best0) < 600) return null;      // must win something concrete
  // difficulty from the depth at which the engine settles on the move
  let settle = 1; for (const h of hist) if (h.mv !== line[0]) settle = h.depth + 1;
  const solverMoves = Math.ceil(line.length / 2);
  // themes
  const themes = []; const sp = startPos.clone(); const m0 = norm(sp, line[0]); const mover = sp.board.get(m0.from);
  const captured = sp.board.get(m0.to);
  const enemy = solver === 'white' ? 'black' : 'white';
  if (mateIn) { themes.push('mate', 'mateIn' + mateIn); } else if (sc(best0) >= 600) themes.push('crushing'); else themes.push('advantage');
  if (solverMoves === 1) themes.push('oneMove'); else if (solverMoves >= 3) themes.push('long'); else themes.push('short');
  if (mover && line.some((u, i) => i % 2 === 0 && u.length === 5)) themes.push('promotion');
  if (line.some((u, i) => i % 2 === 0 && u.length === 5 && u[4] !== 'q')) themes.push('underPromotion');
  if (minMat <= -200 && (endGain > 0 || mateIn)) themes.push('sacrifice');
  if (captured && captured.color === enemy) { if (sp.kingAttackers(m0.to, enemy, sp.board.occupied).isEmpty()) themes.push('hangingPiece'); }
  { const q = sp.clone(); q.play(m0); const pc = q.board.get(m0.to); let tg = 0; if (pc) { const occ = q.board.occupied; for (const t of attacks(pc, m0.to, occ)) { const tp = q.board.get(t); if (!tp || tp.color !== enemy) continue; if (tp.role === 'king' || VAL[tp.role] > VAL[pc.role] || q.kingAttackers(t, enemy, q.board.occupied).isEmpty()) tg++; } } if (tg >= 2 && endGain >= 200) themes.push('fork'); }
  if (mateIn) { const q = startPos.clone(); for (const u of line) q.play(norm(q, u)); const k = q.board.kingOf(q.turn); const kr = k >> 3; if ((kr === 0 || kr === 7)) { const ch = q.kingAttackers(k, solver, q.board.occupied); const first = [...ch][0]; const cp = q.board.get(first); if (cp && (cp.role === 'rook' || cp.role === 'queen') && (first >> 3) === kr) themes.push('backRankMate'); }
    const q2 = startPos.clone(); for (const u of line) q2.play(norm(q2, u)); const k2 = q2.board.kingOf(q2.turn); const ch2 = q2.kingAttackers(k2, solver, q2.board.occupied); const f2 = [...ch2][0]; if (q2.board.get(f2)?.role === 'knight') { let ok = true; for (const n of attacks({ role: 'king', color: q2.turn }, k2, q2.board.occupied)) { const np = q2.board.get(n); if (!np || np.color !== q2.turn) ok = false; } if (ok) themes.push('smotheredMate'); } }
  const pcs = [...startPos.board].length; themes.push(pcs <= 12 ? 'endgame' : prev && pcs >= 28 ? 'opening' : 'middlegame');
  const rating = Math.round(Math.min(2400, Math.max(700, 650 + 110 * settle + (solverMoves - 1) * 120 + (themes.includes('sacrifice') ? 150 : 0) + (mateIn ? -50 : 0))) / 10) * 10;
  return { id: '', fen: prev.fen, moves: [prev.uci, ...line], rating, themes, setup: true };
}
main();
