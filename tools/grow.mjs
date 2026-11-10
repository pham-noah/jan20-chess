// Grow an engine-checked repertoire tree.
// Usage: node tools/grow.mjs "e4 e5 Nf3 Nf6 d4" black 10 [K] [window]
//  - repertoire side picks the engine's best move; the opponent branches into its top K moves (within `window` cp of best) for the first plies.
import { createRequire } from 'module';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan, makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const [seq, side, depthArg, kArg, winArg] = process.argv.slice(2);
const DEPTH = +depthArg || 10, K = +kArg || 2, WIN = +winArg || 60;
const sf = createSF(); await sf.init();
const norm = (pos, u) => { const m = parseUci(u); const pc = pos.board.get(m.from); if (pc?.role === 'king' && Math.abs((m.from & 7) - (m.to & 7)) === 2) m.to = m.to > m.from ? (m.from & 56) | 7 : m.from & 56; return m; };
const start = Chess.default(); for (const t of seq.split(/\s+/)) { const m = parseSan(start, t); if (!m) { console.error('ILLEGAL', t); process.exit(1); } start.play(m); }
const base = seq.split(/\s+/).length;
async function grow(pos, ply) {
  if (ply >= base + DEPTH || pos.isEnd()) return [];
  const mine = pos.turn === side;
  const r = await sf.search(makeFen(pos.toSetup()), { depth: 15, multipv: mine ? 1 : Math.max(K, 2) });
  const top = score(r.pvs[0]);
  const k = mine ? 1 : (ply - base < 5 ? K : 1);
  const picks = r.pvs.filter((p, i) => i < k && (i === 0 || top - score(p) <= WIN));
  const out = [];
  for (const p of picks) { const m = norm(pos, p.pv[0]); const san = makeSan(pos, m); const q = pos.clone(); q.play(m); out.push({ san, ev: score(p), children: await grow(q, ply + 1) }); }
  return out;
}
function emit(children, ply, needNum) {
  if (!children.length) return '';
  const [main, ...alts] = children; const n = Math.floor(ply / 2) + 1;
  const lab = (c, num) => (ply % 2 === 0 ? `${n}. ` : num ? `${n}... ` : '') + c.san;
  let out = lab(main, needNum);
  for (const a of alts) out += ` (${emit([a], ply, true)})`;
  const nxt = emit(main.children, ply + 1, alts.length > 0); return (out + ' ' + nxt).trim();
}
const tree = await grow(start, base);
console.log(emit(tree, base, true));
sf.quit();
