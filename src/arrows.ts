/** Arrow shapes.
 *
 *  Chessground draws every arrow as a straight line, which is a lie about a knight: it jumps over
 *  whatever stands in the way. The knight's arrow is an L instead — the two-square leg first, then
 *  the one-square leg into the destination, with a rounded corner and a head.
 */

/** Is this arrow a knight's hop (one file and two ranks, or the other way round)? */
export function isKnightHop(from: number, to: number): boolean {
  const df = Math.abs((from & 7) - (to & 7)), dr = Math.abs((from >> 3) - (to >> 3));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

export type KnightPath = { d: string; head: string };

/** The path and its head, in board coordinates (0..8, origin at the top-left as drawn). */
export function knightPath(
  x1: number, y1: number, x2: number, y2: number,
  opts: { corner?: number; head?: number; half?: number; pull?: number } = {},
): KnightPath {
  const r = opts.corner ?? 0.26;                 // how much the corner is rounded
  const head = opts.head ?? 0.34;                // length of the arrowhead
  const half = opts.half ?? 0.19;                // half its width
  const pull = opts.pull ?? 0.14;                // gap left at the piece it starts from
  const dx = x2 - x1, dy = y2 - y1;
  const alongX = Math.abs(dx) > Math.abs(dy);    // a knight goes two squares one way first
  const cx = alongX ? x2 : x1, cy = alongX ? y1 : y2;      // the corner
  const sx = x1 + (alongX ? Math.sign(dx) : 0) * pull;
  const sy = y1 + (alongX ? 0 : Math.sign(dy)) * pull;
  const ux = Math.sign(x2 - cx), uy = Math.sign(y2 - cy);  // direction of the last leg
  const bx = x2 - ux * head, by = y2 - uy * head;          // where the head begins
  const q1 = [cx - (alongX ? Math.sign(dx) : 0) * r, cy - (alongX ? 0 : Math.sign(dy)) * r];
  const q2 = [cx + ux * r, cy + uy * r];
  const d = `M${sx} ${sy}L${q1[0]} ${q1[1]}Q${cx} ${cy} ${q2[0]} ${q2[1]}L${bx} ${by}`;
  const px = -uy, py = ux;                      // across the last leg, for the head's base
  const p1 = [bx + px * half, by + py * half], p2 = [bx - px * half, by - py * half];
  return { d, head: `${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}` };
}
