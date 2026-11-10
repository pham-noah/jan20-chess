import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import type { Eng } from './engine';
import { fromFen, toEngine } from './uci';
import { clamp } from './judge';

const VAL: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 99 };
const NAME: Record<string, string> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen' };
const SQ = (s: number) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);

type Victim = { sq: number; role: string; gain: number; by: number };
/** Pieces of `me` that `me` cannot hold if the opponent takes them: free, or for a profit. */
function victims(pos: Chess, me: 'white' | 'black'): Victim[] {
  const opp = me === 'white' ? 'black' : 'white';
  const out: Victim[] = [];
  for (const [sq, pc] of pos.board) {
    if (pc.color !== me || pc.role === 'king') continue;
    const attackers = pos.kingAttackers(sq, opp, pos.board.occupied);
    if (attackers.isEmpty()) continue;
    let cheapest = 99, from = -1;
    for (const a of attackers) { const r = VAL[pos.board.get(a)!.role]; if (r < cheapest) { cheapest = r; from = a; } }
    const defended = !pos.kingAttackers(sq, me, pos.board.occupied).isEmpty();
    const gain = defended ? VAL[pc.role] - cheapest : VAL[pc.role];
    if (gain > 0) out.push({ sq, role: pc.role, gain, by: from });
  }
  return out;
}

/** Does this move *leave* one of the mover's pieces hanging — i.e. newly, not already? Static check, no engine.
 *  Only victims that were not en prise before the move are reported: a piece that was already attacked was not
 *  put there by this move, and saying so reads as if the move were the mistake. */
export function hangs(pos: Chess, m: { from: number; to: number; promotion?: any }): string | undefined {
  const me = pos.turn; const q = pos.clone(); q.play(m as any);
  const already = new Set(victims(pos, me).map(v => v.sq));
  let worst: Victim | undefined;
  for (const v of victims(q, me)) {
    if (already.has(v.sq)) continue;
    if (!worst || v.gain > worst.gain) worst = v;
  }
  if (!worst || worst.gain < 2) return undefined;
  let cap = '';
  try { cap = makeSan(q, { from: worst.by, to: worst.sq } as any); } catch { /* ignore */ }
  return `That leaves your ${NAME[worst.role]} on ${SQ(worst.sq)} hanging${cap ? ` (${cap})` : ''}.`;
}

export const fmtScore = (score: number, mate?: number) => (mate != null ? (mate > 0 ? `mate in ${mate}` : `getting mated in ${-mate}`) : `${score >= 0 ? '+' : ''}${(score / 100).toFixed(1)}`);

/** Explains why a move that is not in the repertoire is (not) a problem, using the engine. Moves are in chessops' internal form. */
export async function explain(eng: Eng, fen: string, userUci: string, preparedUcis: string[], ms = 250): Promise<string> {
  const pos = fromFen(fen);
  const um: any = parseUci(userUci)!; const std = toEngine(pos, um); const userSan = makeSan(pos, um);
  const parts: string[] = [];
  const h = hangs(pos, um); if (h) parts.push(h);
  const best = await eng.search(fen, { ms });
  const user = std === best.best ? best : await eng.search(fen, { ms, searchmoves: [std] });
  const prepSans = preparedUcis.map(u => makeSan(pos, parseUci(u) as any));
  const prepStd = toEngine(pos, parseUci(preparedUcis[0]) as any);
  const prep = prepStd === best.best ? best : await eng.search(fen, { ms, searchmoves: [prepStd] });
  const bestSan = best.best ? (() => { try { const bm: any = parseUci(best.best)!; const pc = pos.board.get(bm.from); if (pc?.role === 'king' && Math.abs((bm.from & 7) - (bm.to & 7)) === 2) bm.to = bm.to > bm.from ? (bm.from & 56) | 7 : bm.from & 56; return makeSan(pos, bm); } catch { return best.best; } })() : '';
  const loss = clamp(best.score) - clamp(user.score);
  const gambit = clamp(best.score) - clamp(prep.score) >= 100;
  if (clamp(user.score) >= clamp(prep.score) - 30) {
    parts.push(`Engine: ${userSan} is fine too (${fmtScore(user.score, user.mate)}), but your book plays ${prepSans[0]} (${fmtScore(prep.score, prep.mate)}).${gambit ? ' That is the price of the gambit.' : ' Stick to the book so you can learn the line.'}`);
  } else if (loss >= 150) {
    const book = bestSan === prepSans[0] ? ' That is also your book move.' : ` Your book plays ${prepSans[0]} (${fmtScore(prep.score, prep.mate)}).`;
    parts.push(`Engine: ${userSan} rates ${fmtScore(user.score, user.mate)}, clearly worse than ${bestSan} (${fmtScore(best.score, best.mate)}).${book}`);
  } else {
    parts.push(`Engine: ${userSan} is playable (${fmtScore(user.score, user.mate)}) but it is off book. Your line plays ${prepSans[0]} (${fmtScore(prep.score, prep.mate)}).`);
  }
  return parts.join(' ');
}
