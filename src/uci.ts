import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci, makeUci } from 'chessops/util';

export const fromFen = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
export const fenOf = (p: Chess) => makeFen(p.toSetup());

/** chessops stores castling as king-takes-rook; engines and Lichess use the king's two-square move. */
export function toEngine(pos: Chess, m: { from: number; to: number; promotion?: any }): string {
  const pc = pos.board.get(m.from);
  let to = m.to;
  if (pc?.role === 'king' && pos.board.get(m.to)?.color === pc.color) to = m.to > m.from ? m.from + 2 : m.from - 2;
  return makeUci({ from: m.from, to, promotion: m.promotion } as any);
}
export function fromEngine(pos: Chess, u: string) {
  const m: any = parseUci(u)!;
  const pc = pos.board.get(m.from);
  if (pc?.role === 'king' && Math.abs((m.from & 7) - (m.to & 7)) === 2) m.to = m.to > m.from ? (m.from & 56) | 7 : m.from & 56;
  return m;
}
