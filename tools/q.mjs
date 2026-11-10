// Usage: node tools/q.mjs "e4 c6 d4 d5" [depth] [multipv]  -> engine view of a position given SAN moves
import { createRequire } from 'module';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan, makeSan } from 'chessops/san';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const sf = createSF(); await sf.init();
const depth = +process.argv[3] || 16, mpv = +process.argv[4] || 4;
for (const seq of process.argv[2].split('|')) {
  const p = Chess.default();
  for (const san of seq.trim().split(/\s+/)) { const m = parseSan(p, san); if (!m) { console.log('ILLEGAL', san, 'in', seq); process.exit(1); } p.play(m); }
  const r = await sf.search(makeFen(p.toSetup()), { depth, multipv: mpv });
  console.log(`\n${seq}  (${p.turn} to move)`);
  r.pvs.forEach(pv => console.log('  ', (pv.kind === 'mate' ? 'M' + pv.val : (pv.val / 100).toFixed(2)).padStart(6), pv.pv.slice(0, 5).join(' ')));
}
sf.quit();
