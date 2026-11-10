// Builds an engine-suggested extension file from a gap list. Usage: node tools/extend.mjs pack white|black N [plies]
import { createRequire } from 'module';
import fs from 'fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan, makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
const require = createRequire(import.meta.url);
const { createSF, score } = require('./sf.cjs');
const [pack, side, nArg, pliesArg, prefixArg] = process.argv.slice(2);
const PREFIX = (prefixArg || '').trim();
const N = +nArg || 10, PLIES = +pliesArg || 8;
const gaps = JSON.parse(fs.readFileSync(`/tmp/gaps_${pack}.json`, 'utf8'));
const norm = (pos, u) => { const m = parseUci(u); const pc = pos.board.get(m.from); if (pc?.role === 'king' && Math.abs((m.from & 7) - (m.to & 7)) === 2) m.to = m.to > m.from ? (m.from & 56) | 7 : m.from & 56; return m; };
const fmt = cp => `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
// pick gaps: shallowest first, at most 2 per path to keep variety
const chosen = []; const perPath = {};
for (const g of gaps) { const pk = g.path.join(' '); if (PREFIX && !pk.startsWith(PREFIX)) continue; if ((perPath[pk] = (perPath[pk] || 0) + 1) > 2) continue; chosen.push(g); if (chosen.length >= N) break; }
const sf = createSF(); await sf.init();
const games = [];
for (const g of chosen) {
  const pos = Chess.default(); const sans = []; const notes = {};
  for (const t of g.path) { const m = parseSan(pos, t); pos.play(m); sans.push(t); }
  const gm = norm(pos, g.uci); const gsan = makeSan(pos, gm); pos.play(gm); sans.push(gsan);
  notes[sans.length - 1] = `Engine-suggested sideline: ${gsan} is also a sound try here (${fmt(g.eval * (pos.turn === side ? -1 : 1) * -1)}). The replies below are engine picks, not book theory.`;
  for (let i = 0; i < PLIES && !pos.isEnd(); i++) {
    const r = await sf.search(makeFen(pos.toSetup()), { depth: 15 });
    const m = norm(pos, r.bestmove); sans.push(makeSan(pos, m)); pos.play(m);
  }
  let txt = ''; sans.forEach((s, i) => { if (i % 2 === 0) txt += `${i / 2 + 1}. `; txt += s + (notes[i] ? ` {${notes[i]}}` : '') + ' '; });
  games.push(`[Event "${pack} engine extension"]\n[Orientation "${side}"]\n\n${txt.trim()}`);
}
fs.writeFileSync(`src/library/${pack}.ext.pgn`, games.join('\n\n') + '\n');
console.log(pack, 'extension games:', games.length);
games.slice(0, 3).forEach(x => console.log(x.split('\n\n')[1]));
sf.quit();
