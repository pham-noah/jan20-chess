// Checks a bundled PGN: every SAN must be legal, and prints each line as SAN.
import { readFileSync } from 'fs';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
import { makeUci } from 'chessops/util';

const file = process.argv[2] || 'src/library/italian.pgn';
const lines = []; let illegal = 0;
const walk = (node, pos, path, sans) => {
  for (const c of node.children) {
    const m = parseSan(pos, c.data.san);
    if (!m) { illegal++; console.log('ILLEGAL:', sans.join(' '), '->', c.data.san); continue; }
    const q = pos.clone(); q.play(m);
    const p2 = [...path, makeUci(m)], s2 = [...sans, makeSan(pos, m)];
    if (!c.children.length) lines.push(s2);
    walk(c, q, p2, s2);
  }
};
for (const g of parsePgn(readFileSync(file, 'utf8'))) {
  const sp = startingPosition(g.headers);
  if (!sp.isOk) { console.log('BAD START'); continue; }
  walk(g.moves, sp.unwrap(), [], []);
}
const num = (sans) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + s).join(' ');
console.log(`lines: ${lines.length}  illegal moves: ${illegal}`);
lines.forEach((l, i) => console.log(`${String(i + 1).padStart(2)}. ${num(l)}`));
