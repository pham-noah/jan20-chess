import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const sc = p => score(p);
const hand = [
  ['KQ vs K', '8/8/8/4k3/8/8/8/Q3K3 w - - 0 1', 'win'],
  ['KR vs K', '8/8/8/8/8/5k2/8/R3K3 w - - 0 1', 'win'],
  ['KBB vs K', '8/8/8/8/8/6k1/8/2B1KB2 w - - 0 1', 'win'],
  ['Lucena', '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'win'],
  ['Philidor', '4k3/8/r7/3PK3/8/8/8/R7 b - - 0 1', 'hold'],
  ['Wrong bishop A', '7k/8/6K1/7P/8/8/8/5B2 b - - 0 1', 'hold'],
  ['Wrong bishop B', '6k1/8/6KP/8/8/8/8/5B2 b - - 0 1', 'hold'],
  ['Breakthrough', '8/ppp5/8/PPP5/8/8/8/K6k w - - 0 1', 'win'],
  ['Breakthrough black', '8/8/8/8/ppp5/8/PPP5/K6k b - - 0 1', 'win'],
  ['Q vs R', '8/8/8/8/8/3k4/r7/Q3K3 b - - 0 1', 'win'],
  ['Rook vs pawn cut', '8/8/8/8/8/3k4/p7/R3K3 w - - 0 1', 'win'],
  ['Vancura', '8/8/8/8/8/... ', 'skip'],
];
const sf = createSF(); await sf.init();
for (const [n, fen, goal] of hand) {
  if (goal === 'skip') continue;
  let ok; try { ok = Chess.fromSetup(parseFen(fen).unwrap()).unwrap(); } catch (e) { console.log(n, 'ILLEGAL FEN'); continue; }
  const r = await sf.search(fen, { movetime: 1500, multipv: 3 });
  console.log(n.padEnd(18), goal.padEnd(5), r.pvs.map(p => `${p.kind === 'mate' ? 'M' + p.val : p.val} ${p.pv[0]}`).join(' | '));
}
// mine KPK
const rnd = n => Math.floor(Math.random() * n);
const sq = (f, r) => r * 8 + f;
const wins = [], holds = []; const t0 = Date.now();
for (let i = 0; i < 500 && (wins.length < 12 || holds.length < 10); i++) {
  const pf = rnd(8), pr = 1 + rnd(5), wk = rnd(64), bk = rnd(64); const wp = sq(pf, pr);
  if (new Set([wp, wk, bk]).size < 3) continue;
  const adj = Math.abs((wk & 7) - (bk & 7)) <= 1 && Math.abs((wk >> 3) - (bk >> 3)) <= 1; if (adj) continue;
  const files = 'abcdefgh'; const nm = s => files[s & 7] + ((s >> 3) + 1);
  const rows = []; for (let r = 7; r >= 0; r--) { let row = '', e = 0; for (let f = 0; f < 8; f++) { const s = sq(f, r); const c = s === wk ? 'K' : s === bk ? 'k' : s === wp ? 'P' : ''; if (!c) e++; else { if (e) row += e; e = 0; row += c; } } if (e) row += e; rows.push(row); }
  for (const turn of ['w', 'b']) {
    const fen = rows.join('/') + ` ${turn} - - 0 1`;
    let pos; try { pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap(); } catch { continue; }
    if (pos.isEnd() || pos.isCheck() && false) continue;
    const r = await sf.search(fen, { depth: 14, multipv: 2 });
    if (r.pvs.length < 2) continue;
    const b = sc(r.pvs[0]), s2 = sc(r.pvs[1]);
    const rank = pr + 1;
    if (turn === 'w' && b >= 500 && s2 <= 60 && rank >= 3) wins.push({ fen, pf: files[pf], b, s2, mv: r.pvs[0].pv[0] });
    if (turn === 'b' && b >= -40 && b <= 40 && s2 <= -500) holds.push({ fen, pf: files[pf], b, s2, mv: r.pvs[0].pv[0] });
  }
}
console.log('KPK mined in', ((Date.now() - t0) / 1000) | 0, 's wins', wins.length, 'holds', holds.length);
fs.writeFileSync('/tmp/kpk.json', JSON.stringify({ wins, holds }));
wins.slice(0, 8).forEach(w => console.log('W', w.fen, w.b, w.s2, w.mv));
holds.slice(0, 8).forEach(w => console.log('H', w.fen, w.b, w.s2, w.mv));
sf.quit();
