// Tests for the static "hangs a piece" check and the engine explanation text.
import { createRequire } from 'module';
import { hangs, explain } from '../src/explain';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const posAfter = s => { const p = Chess.default(); for (const t of s.split(' ')) p.play(parseSan(p, t)); return p; };
let bad = 0; const ok = (n, c, x = '') => { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ' | ' + x)); if (!c) bad++; };
await (async () => {
  let p = posAfter('e4 e5 Qh5 Nc6'); let m = parseSan(p, 'Qxe5');
  const h1 = hangs(p, m); ok('queen takes a defended pawn: hanging queen reported', /queen on e5 hanging/.test(h1 || ''), h1);
  p = posAfter('e4 e5 Nf3 Nc6'); m = parseSan(p, 'Bc4'); ok('a developing move is not flagged', hangs(p, m) === undefined, hangs(p, m));
  p = posAfter('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5'); m = parseSan(p, 'Nxd5'); ok('a normal recapture is not flagged', hangs(p, m) === undefined, hangs(p, m));
  const sf = createSF(); await sf.init();
  const eng = { async search(fen, o = {}) { const r = await sf.search(fen, { movetime: o.ms, depth: o.depth, multipv: o.multipv, searchmoves: o.searchmoves }); const lines = r.pvs.map(q => ({ score: score(q), mate: q.kind === 'mate' ? q.val : undefined, pv: q.pv })); const top = lines[0] || { score: 0, pv: [] }; return { best: r.bestmove, score: top.score, mate: top.mate, pv: top.pv, lines, history: r.history }; } };
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const t1 = await explain(eng, start, 'a2a3', ['e2e4'], 150); ok('explains an off-book but fine move', /^Engine: a3 is playable|is fine too/.test(t1), t1);
  const t2 = await explain(eng, start, 'f2f3', ['e2e4'], 150); ok('explains a clearly worse move or a playable one with scores', /Engine: f3/.test(t2) && /[+-]\d\.\d/.test(t2), t2);
  const fenQ = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2';
  const t3 = await explain(eng, fenQ, 'g8h6', ['b8c6'], 150); console.log('   sample:', t3);
  ok('every explanation is non-empty and mentions the book move', t3.length > 20 && /book|line/.test(t3), t3);
  // gambit wording: prepared move far below the best
  const gam = 'r1bqkb1r/pppp1ppp/2n2n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3';
  const t4 = await explain(eng, gam, 'd7d6', ['c6e5'], 200); console.log('   sample:', t4);
  sf.quit(); console.log(bad ? 'FAILURES ' + bad : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
