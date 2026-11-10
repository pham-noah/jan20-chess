import type { Eng, Res } from './engine';

export const CLAMP = 600;
export const MISTAKE = 150;
export const clamp = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));

/** How much worse the played move is than the best one, from the mover's point of view (capped, so "mate in 3 vs mate in 9" is not a mistake). */
export async function judge(eng: Eng, fen: string, uci: string, best: Res, ms: number) {
  if (uci === best.best) return { loss: 0, score: best.score };
  const r = await eng.search(fen, { ms, searchmoves: [uci] });
  return { loss: clamp(best.score) - clamp(r.score), score: r.score };
}
export function reason(best: number, played: number) {
  const b = clamp(best), p = clamp(played);
  if (b >= 300 && p < 100) return 'That lets the win slip away.';
  if (b > -150 && p <= -300) return 'That loses.';
  return 'There was a clearly better move.';
}
