/** Premove rules, all in one testable place.
 *
 *  A premove is a guess about a position that does not exist yet, so the destination is judged on an
 *  empty board — you may pre-move a rook through your own pawn, the way chess.com allows. What is
 *  never legal is capturing a king: nothing captures a king, and drawing it looks like the app
 *  played an illegal move. A link the reply has made impossible is dropped when the turn comes back.
 */
import type { Board } from 'chessops/board';
import { attacks } from 'chessops/attacks';
import { SquareSet } from 'chessops/squareSet';
import type { Color, Piece } from 'chessops/types';

export type QueuedPremove = { from: string; to: string };

/** May this drag become a link in the premove chain? */
export function premoveLinkAllowed(board: Board, from: number, to: number, me: Color | undefined): boolean {
  const pc = board.get(from);
  if (!pc || !me || pc.color !== me || to === from) return false;
  const target = board.get(to);
  if (target && target.color === pc.color) return false;                             // cannot take your own
  if (target && target.role === 'king') return false;                                 // never a king
  return reachableOnEmpty(pc, from, to);
}

/** Would the piece reach `to` on a board with nothing in the way? */
export function reachableOnEmpty(pc: Piece, from: number, to: number): boolean {
  if (to === from) return false;
  const df = (to & 7) - (from & 7), dr = (to >> 3) - (from >> 3);
  if (pc.role === 'pawn') {
    const fwd = pc.color === 'white' ? 1 : -1, start = pc.color === 'white' ? 1 : 6;
    if (df === 0 && dr === fwd) return true;
    if (df === 0 && dr === 2 * fwd && (from >> 3) === start) return true;
    return Math.abs(df) === 1 && dr === fwd;                    // a capture may appear there
  }
  for (const sq of attacks(pc, from, SquareSet.empty())) if (sq === to) return true;
  return false;
}

/** Walk the queue, discarding links that are no longer possible, and return the first one that is. */
export function nextPlayable(
  queue: QueuedPremove[],
  legal: (q: QueuedPremove) => boolean,
): { next?: QueuedPremove; skipped: number } {
  let skipped = 0;
  while (queue.length) {
    const q = queue[0];
    if (legal(q)) return { next: q, skipped };
    queue.shift();
    skipped++;
  }
  return { skipped };
}
