// Finds plausible opponent replies that a pack does not answer. Usage: node tools/gaps.mjs pack.pgn white|black out.json
import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const [file, side, out] = process.argv.slice(2);
const key = p => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const nodes = new Map(); // key -> { fen, path:[san], moves:Set(uci internal) }
const walk = (n, p, path) => { for (const c of n.children) { const m = parseSan(p, c.data.san); const k = key(p); if (!nodes.has(k)) nodes.set(k, { fen: makeFen(p.toSetup()), path: [...path], turn: p.turn, moves: new Set() }); nodes.get(k).moves.add(makeUci(m)); const q = p.clone(); q.play(m); walk(c, q, [...path, makeSan(p, m)]); } };
for (const g of parsePgn(fs.readFileSync(file, 'utf8'))) walk(g.moves, startingPosition(g.headers).unwrap(), []);
const std = (pos, m) => { const pc = pos.board.get(m.from); let to = m.to; if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = m.to > m.from ? m.from + 2 : m.from - 2; return makeUci({ from: m.from, to, promotion: m.promotion }); };
const sf = createSF(); await sf.init();
const gaps = [];
for (const [k, n] of nodes) {
  if (n.turn === side) continue;                       // only positions where the opponent moves
  if (n.path.length > 22) continue;
  const pos = Chess.fromSetup((await import('chessops/fen')).parseFen(n.fen).unwrap()).unwrap();
  const have = new Set([...n.moves].map(u => std(pos, parseUci(u))));
  const r = await sf.search(n.fen, { depth: 13, multipv: 4 });
  const top = score(r.pvs[0]);
  for (const pv of r.pvs) {
    if (top - score(pv) > 70) continue;
    const u = pv.pv[0]; if (have.has(u)) continue;
    const m = parseUci(u); const pc = pos.board.get(m.from); if (pc?.role === 'king' && Math.abs((m.from & 7) - (m.to & 7)) === 2) m.to = m.to > m.from ? (m.from & 56) | 7 : m.from & 56;
    gaps.push({ ply: n.path.length, path: n.path, san: makeSan(pos, m), uci: u, eval: score(pv), best: top });
  }
}
gaps.sort((a, b) => a.ply - b.ply || b.eval - a.eval);
fs.writeFileSync(out, JSON.stringify(gaps));
console.log(file, 'opponent positions', [...nodes.values()].filter(n => n.turn !== side).length, 'gaps', gaps.length);
gaps.slice(0, 12).forEach(g => console.log(String(g.ply).padStart(3), g.path.join(' '), '>>', g.san, `(${g.eval})`));
sf.quit();
