// Converts a trap report into app puzzles: fen before the blunder, blunder, then our refutation.
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
const [inFile, outFile, maxArg] = process.argv.slice(2);
const MAX = +maxArg || 40;
const traps = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const out = []; const seen = new Set();
for (const t of traps) {
  if (!t.uci || !t.path || !t.refutation?.length) continue;
  const k = t.path.join(' ') + '|' + t.uci;
  if (seen.has(k)) continue;
  seen.add(k);
  // the position is the pack path replayed from the start (older trap reports carry only SAN)
  let pos = Chess.default();
  try { for (const san of t.path) pos.play(parseSan(pos, san)); } catch { continue; }
  const fen = makeFen(pos.toSetup());
  try { pos.play(parseUci(t.uci)); } catch { continue; }
  const ucis = [];
  for (const san of t.refutation) {
    const m = parseSan(pos, san);
    if (!m) break;
    ucis.push(makeUci(m)); pos.play(m);
  }
  if (ucis.length < 1) continue;
  const n = ucis.length;
  let rating = 1000 + 90 * (n - 1) + (t.mate ? 120 : 0);
  rating = Math.min(2000, Math.max(760, Math.round(rating / 10) * 10));
  out.push({
    id: `IT${String(out.length + 1).padStart(3, '0')}`,
    fen,
    moves: [t.uci, ...ucis],
    rating,
    themes: ['trap', 'opening', 'crushing', ...(t.mate ? ['mate'] : [])],
    setup: true,
  });
  if (out.length >= MAX) break;
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('puzzles:', out.length, '->', outFile);
out.slice(0, 3).forEach(p => console.log(p.id, p.rating, p.moves.join(' '), '|', p.fen));
