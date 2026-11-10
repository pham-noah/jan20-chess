// Finds opponent mistakes your lines could punish.
// Usage: node tools/traps.mjs pack.pgn white [depth] [thresholdCp] [maxPerPosition]
// Walks every position where the opponent is to move; a legal reply that is not in the
// pack and is >= threshold cp worse than their best is a punishable mistake. For each,
// it searches the refutation so you can see what White actually wins.
import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');

const [file, side, depthArg, thrArg, maxArg, outArg] = process.argv.slice(2);
const DEPTH = +depthArg || 12;
const THRESH = +thrArg || 100;
const MAXPER = +maxArg || 3;
const OUT = outArg || null;
const key = p => makeFen(p.toSetup()).split(' ').slice(0, 4).join(' ');
const std = (pos, m) => {
  const pc = pos.board.get(m.from); let to = m.to;
  if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = m.to > m.from ? m.from + 2 : m.from - 2;
  return makeUci({ from: m.from, to, promotion: m.promotion });
};

// collect positions where the opponent is to move, with the replies our pack already has
const nodes = new Map();
const walk = (n, p, path) => {
  for (const c of n.children) {
    const m = parseSan(p, c.data.san);
    if (!m) continue;
    const k = key(p);
    if (!nodes.has(k)) nodes.set(k, { fen: makeFen(p.toSetup()), path: [...path], turn: p.turn, moves: new Set() });
    nodes.get(k).moves.add(std(p, m));
    const q = p.clone(); q.play(m);
    walk(c, q, [...path, makeSan(p, m)]);
  }
};
for (const g of parsePgn(fs.readFileSync(file, 'utf8'))) walk(g.moves, startingPosition(g.headers).unwrap(), []);

const sf = createSF(); await sf.init();
const traps = [];
let checked = 0;
for (const [k, n] of nodes) {
  if (n.turn === side) continue;
  if (n.path.length > 20) continue;
  checked++;
  const pos = Chess.fromSetup(parseFen(n.fen).unwrap()).unwrap();
  const have = new Set([...n.moves].map(u => std(pos, parseUci(u))));
  const r = await sf.search(n.fen, { depth: DEPTH, multipv: 6 });
  const best = score(r.pvs[0]);
  const seenDelta = [];
  for (const pv of r.pvs) {
    const u = pv.pv[0];
    if (have.has(u)) continue;                       // already in the repertoire
    const delta = best - score(pv);                  // how much worse than their best
    if (delta < THRESH) continue;
    if (seenDelta.some(d => Math.abs(d - delta) < 15)) continue;   // near-duplicates
    const m = parseUci(u);
    const ref = await sf.search(makeFen((() => { const q = pos.clone(); q.play(m); return q; })().toSetup()), { depth: DEPTH + 2 });
    const q = pos.clone(); q.play(m);
    const pvUci = ref.pvs[0].pv.slice(0, 6);
    const p2 = q.clone(); const sans = []; const ucis = [];
    for (const mv of pvUci) { const mm = parseUci(mv); if (!mm) break; try { sans.push(makeSan(p2, mm)); ucis.push(mv); p2.play(mm); } catch { break; } }
    traps.push({
      ply: n.path.length, path: n.path, fen: n.fen, blunder: makeSan(pos, m), uci: u,
      delta, evalAfter: score(ref.pvs[0]), bestEval: best,
      refutation: sans, refutationUci: ucis,
      mate: ref.pvs[0].kind === 'mate' ? ref.pvs[0].val : undefined,
    });
    seenDelta.push(delta);
    if (seenDelta.length >= MAXPER) break;
  }
}
traps.sort((a, b) => b.delta - a.delta);
const num = t => t.path.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + s).join(' ');
console.log(`${file} [${side}] opponent positions ${checked} | punishable mistakes ${traps.length} (>= ${THRESH}cp, depth ${DEPTH})`);
for (const t of traps.slice(0, 15)) {
  const line = num(t).split(' ').slice(-6).join(' ');
  console.log(`  ${String(t.ply).padStart(2)} …${line} >> ${t.blunder} costs ${t.delta}cp${t.mate ? ` (mate ${t.mate})` : ''} -> ${t.refutation.slice(0, 4).join(' ')} [${(t.evalAfter / 100).toFixed(1)} for you]`);
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(traps, null, 1)); console.log('json ->', OUT); }
sf.quit();
