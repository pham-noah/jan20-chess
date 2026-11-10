// Usage: node tools/audit.mjs pack.pgn white|black  -> flags repertoire moves that are much worse than the engine's best (depth 13)
import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const sf = createSF(); await sf.init();
const file = process.argv[2], side = process.argv[3];
const std = (pos, m) => { const pc = pos.board.get(m.from); let to = m.to; if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = m.to > m.from ? m.from + 2 : m.from - 2; return makeUci({ from: m.from, to, promotion: m.promotion }); };
const cl = x => Math.max(-600, Math.min(600, x));
const jobs = []; const seen = new Set();
const walk = (node, p, path) => { for (const c of node.children) { const m = parseSan(p, c.data.san); const fen = makeFen(p.toSetup()); if (p.turn === side && !seen.has(fen + std(p, m))) { seen.add(fen + std(p, m)); jobs.push({ fen, uci: std(p, m), san: makeSan(p, m), path: path.join(' ') }); } const q = p.clone(); q.play(m); walk(c, q, [...path, makeSan(p, m)]); } };
for (const g of parsePgn(fs.readFileSync(file, 'utf8'))) walk(g.moves, startingPosition(g.headers).unwrap(), []);
let flagged = 0;
for (const j of jobs) {
  const best = await sf.search(j.fen, { depth: 13 });
  let loss = 0, mv = score(best.pvs[0]);
  if (j.uci !== best.bestmove) { const r = await sf.search(j.fen, { depth: 13, searchmoves: [j.uci] }); mv = score(r.pvs[0]); loss = cl(score(best.pvs[0])) - cl(mv); }
  if (loss >= 150) { flagged++; console.log(`loss ${String(loss).padStart(4)}cp  ${j.path} >> ${j.san}   (best ${best.bestmove}, ${score(best.pvs[0])} vs ${mv})`); }
}
console.log(`${file}: ${jobs.length} repertoire moves checked, ${flagged} flagged`);
sf.quit();
