import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
const lines = {
  'stafford trap 1': 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#',
  'stafford trap 2': 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 Nc3 Bc5 Bc4 Ng4 O-O Qh4 h3 Nxf2 Qf3 Nxh3+ Kh2 Nf2+ Kg1 Qh1#',
};
for (const [n, s] of Object.entries(lines)) {
  const p = Chess.default(); let ok = true;
  for (const t of s.split(' ')) { const m = parseSan(p, t); if (!m) { console.log(n, 'ILLEGAL at', t); ok = false; break; } p.play(m); }
  if (ok) console.log(n, 'final checkmate:', p.isCheckmate());
}
