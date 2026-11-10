import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import type { Eng } from './engine';
import { fromEngine, fenOf, toEngine } from './uci';

export type ArenaEnd = { result: 'win' | 'draw' | 'loss'; text: string; eval: number; bookPlies: number; left?: { ply: number; played: string; prepared: string[] } };
export type ArenaStep = { kind: 'ok'; userSan: string; userUci: string; reply?: { uci: string; san: string }; ended?: ArenaEnd };
type Moves = Record<string, Record<string, string>>;
type Color = 'white' | 'black';
const posKey = (p: Chess) => fenOf(p).split(' ').slice(0, 4).join(' ');
const pickRand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A short game from the start of the repertoire. Your opponent follows your book while you do, then plays like a human-ish engine.
 *  Stockfish judges the position some moves after the book is over. */
export class ArenaRun {
  pos = Chess.default(); ply = 0; bookPlies = 0; inBook = true; left?: ArenaEnd['left']; ended?: ArenaEnd; offBookPlies = 0;
  constructor(private moves: Moves, public color: Color, private eng: Eng, private ms: number, private maxOffBook = 8) {}

  private async oppMove(): Promise<{ uci: string; san: string }> {
    const k = posKey(this.pos); const mv = this.moves[k];
    if (this.inBook && mv && Object.keys(mv).length) {
      const u = pickRand(Object.keys(mv)); const m: any = parseUci(u)!; const san = makeSan(this.pos, m);
      this.pos.play(m); this.bookPlies++; this.ply++; return { uci: u, san };
    }
    this.inBook = false;
    const r = await this.eng.search(fenOf(this.pos), { ms: this.ms, multipv: 3 });
    const top = r.lines[0]?.score ?? 0; const cands = r.lines.filter(l => top - l.score <= 70 && l.pv[0]);
    const pick = Math.random() < 0.65 ? cands[0] : pickRand(cands.length ? cands : r.lines);
    const u = (pick?.pv[0]) || r.best; const m = fromEngine(this.pos, u); const san = makeSan(this.pos, m);
    this.pos.play(m); this.ply++; this.offBookPlies++; return { uci: u, san };
  }
  /** Plays the opponent's first move when you have Black. */
  async start() { if (this.pos.turn !== this.color) return this.oppMove(); return undefined; }

  private async judge(text: string): Promise<ArenaEnd> {
    const r = await this.eng.search(fenOf(this.pos), { ms: this.ms * 2 });
    const mine = this.pos.turn === this.color ? r.score : -r.score;
    const result = mine >= 50 ? 'win' : mine <= -50 ? 'loss' : 'draw';
    return (this.ended = { result, text, eval: mine, bookPlies: this.bookPlies, left: this.left });
  }
  async userMove(m: { from: number; to: number; promotion?: any }): Promise<ArenaStep> {
    const k = posKey(this.pos); const prepared = this.moves[k]; const u = (m.from + ',' + m.to);
    const internal = `${'abcdefgh'[m.from & 7]}${(m.from >> 3) + 1}${'abcdefgh'[m.to & 7]}${(m.to >> 3) + 1}`;
    const userSan = makeSan(this.pos, m as any); const userUci = toEngine(this.pos, m);
    if (this.inBook) {
      if (prepared && Object.keys(prepared).length) {
        if (!prepared[internal]) { this.inBook = false; this.left = { ply: this.ply, played: userSan, prepared: Object.values(prepared) }; }
        else this.bookPlies++;
      } else this.inBook = false;
    }
    void u; this.pos.play(m as any); this.ply++; if (!this.inBook) this.offBookPlies++;
    const base: ArenaStep = { kind: 'ok', userSan, userUci };
    if (this.pos.isCheckmate()) return { ...base, ended: await this.endGame('result', true) };
    if (this.pos.isEnd()) return { ...base, ended: await this.endGame('draw', false) };
    if (this.offBookPlies >= this.maxOffBook || this.ply >= 70) return { ...base, ended: await this.judge('Time to judge the position.') };
    const reply = await this.oppMove();
    if (this.pos.isCheckmate()) return { ...base, reply, ended: await this.endGame('result', false) };
    if (this.pos.isEnd()) return { ...base, reply, ended: await this.endGame('draw', false) };
    if (this.offBookPlies >= this.maxOffBook || this.ply >= 70) return { ...base, reply, ended: await this.judge('Time to judge the position.') };
    return { ...base, reply };
  }
  private async endGame(kind: 'result' | 'draw', iWon: boolean): Promise<ArenaEnd> {
    if (kind === 'draw') return (this.ended = { result: 'draw', text: 'The game ended in a draw.', eval: 0, bookPlies: this.bookPlies, left: this.left });
    return (this.ended = { result: iWon ? 'win' : 'loss', text: iWon ? 'Checkmate. You won.' : 'You were checkmated.', eval: iWon ? 10000 : -10000, bookPlies: this.bookPlies, left: this.left });
  }
}
