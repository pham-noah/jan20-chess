import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { fromFen, fromEngine } from './uci';

export type Puzzle = { id: string; fen: string; moves: string[]; rating: number; themes: string[]; setup: boolean };

/** Lichess puzzle database row: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags.
 *  In that format the first move is the opponent's last move, then the solver moves. */
export function parseCsvLine(line: string): Puzzle | null {
  const c = line.trim().split(',');
  if (c.length < 8 || c[0] === 'PuzzleId') return null;
  const rating = +c[3]; const moves = c[2].split(' ').filter(Boolean);
  if (!c[0] || !c[1] || moves.length < 2 || !isFinite(rating)) return null;
  return { id: c[0], fen: c[1], moves, rating, themes: c[7].split(' ').filter(Boolean), setup: true };
}

export const humanTheme = (t: string) => {
  const s = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2').toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
};

export function sanLine(fen: string, ucis: string[]) {
  const p = fromFen(fen); let n = Number(fen.split(' ')[5]) || 1; let s = ''; let first = true;
  for (const u of ucis) {
    const m = fromEngine(p, u); const san = makeSan(p, m);
    if (p.turn === 'white') s += `${n}. `; else if (first) s += `${n}… `;
    if (p.turn === 'black') n++;
    s += san + ' '; p.play(m); first = false;
  }
  return s.trim();
}

export class PuzzleRun {
  pos: Chess; i = 0;
  constructor(public p: Puzzle) { this.pos = fromFen(p.fen); }
  get solverColor() { return this.p.setup ? (this.pos.turn === 'white' ? 'black' : 'white') : this.pos.turn; }
  /** Plays the opponent's setup move (Lichess format). Returns its UCI. */
  setupMove(): string | undefined {
    if (!this.p.setup || this.i !== 0) return undefined;
    const u = this.p.moves[0]; this.pos.play(fromEngine(this.pos, u)); this.i = 1; return u;
  }
  expected() { return this.p.moves[this.i]; }
  /** Checks the solver's move. Any checkmate counts, even if it is not the stored move. */
  try(uci: string, m: any): 'correct' | 'wrong' | 'solved' {
    const q = this.pos.clone(); q.play(m);
    if (uci === this.expected()) { this.pos = q; this.i++; return this.i >= this.p.moves.length ? 'solved' : 'correct'; }
    if (q.isCheckmate()) { this.pos = q; this.i = this.p.moves.length; return 'solved'; }
    return 'wrong';
  }
  reply(): string | undefined {
    const u = this.p.moves[this.i]; if (u === undefined) return undefined;
    this.pos.play(fromEngine(this.pos, u)); this.i++; return u;
  }
}
