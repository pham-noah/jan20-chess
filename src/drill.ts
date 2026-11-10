import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import type { Eng, Res } from './engine';
import { judge, reason, MISTAKE } from './judge';
import { fromFen, fenOf, toEngine, fromEngine } from './uci';

export type DrillDef = { id: string; name: string; group: string; fen: string; goal: 'win' | 'hold'; blurb: string; hold?: number; custom?: boolean };
export type DrillEnd = { ok: boolean; text: string; grade: 'good' | 'hard' | 'again' };
export type DrillStep =
  | { kind: 'bad'; text: string; hint?: string; hintSan?: string }
  | { kind: 'ok'; userUci: string; userSan: string; reply?: { uci: string; san: string }; ended?: DrillEnd };

type Color = 'white' | 'black';
const count = (p: Chess, c: Color) => { const r = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 } as Record<string, number>; for (const [, pc] of p.board) if (pc.color === c && pc.role !== 'king') r[pc.role]++; return r; };
const bare = (p: Chess, c: Color) => Object.values(count(p, c)).every(n => n === 0);
const trivialWin = (p: Chess, me: Color) => bare(p, me === 'white' ? 'black' : 'white') && (count(p, me).queen > 0 || count(p, me).rook > 0);

/** One endgame drill against the engine. Moves that throw away the result are taken back. */
export class DrillRun {
  pos: Chess; color: Color; mistakes = 0; moves = 0; hinted = false; ended?: DrillEnd;
  best?: Res; private streak = 0; private mateOnly: boolean;
  constructor(public def: DrillDef, private eng: Eng, private ms: number) {
    this.pos = fromFen(def.fen); this.color = this.pos.turn; this.mateOnly = trivialWin(this.pos, this.color);
  }
  get holdMoves() { return this.def.hold ?? 20; }
  async prepare() { this.best = await this.eng.search(fenOf(this.pos), { ms: Math.round(this.ms * 1.5) }); }
  async hint() { if (!this.best) await this.prepare(); this.hinted = true; return this.best!.best; }

  private finish(ok: boolean, text: string): DrillEnd {
    const grade = !ok ? 'again' : this.mistakes === 0 && !this.hinted ? 'good' : this.mistakes <= 2 ? 'hard' : 'again';
    return (this.ended = { ok, text, grade });
  }
  async userMove(m: { from: number; to: number; promotion?: any }): Promise<DrillStep> {
    if (!this.best) await this.prepare();
    const fen = fenOf(this.pos), u = toEngine(this.pos, m);
    const j = await judge(this.eng, fen, u, this.best!, this.ms);
    if (j.loss >= MISTAKE) {
      this.mistakes++; this.streak++;
      const step: DrillStep = { kind: 'bad', text: reason(this.best!.score, j.score) };
      if (this.streak >= 2) { step.hint = this.best!.best; step.hintSan = makeSan(this.pos, fromEngine(this.pos, this.best!.best)); }
      return step;
    }
    this.streak = 0;
    const userSan = makeSan(this.pos, m); this.pos.play(m); this.moves++;
    const base = { kind: 'ok' as const, userUci: u, userSan };
    if (this.pos.isCheckmate()) return { ...base, ended: this.finish(this.def.goal === 'win', 'Checkmate.') };
    if (this.pos.isEnd() || this.pos.halfmoves >= 100) return { ...base, ended: this.finish(this.def.goal === 'hold', this.def.goal === 'hold' ? 'Drawn. You held.' : 'Drawn. The win slipped away.') };
    const r = await this.eng.search(fenOf(this.pos), { ms: this.ms });
    if (this.def.goal === 'win' && !this.mateOnly && (trivialWin(this.pos, this.color) || (m.promotion && -r.score >= 400))) {
      return { ...base, ended: this.finish(true, 'Converted. The rest is routine.') };
    }
    const rm = fromEngine(this.pos, r.best); const rsan = makeSan(this.pos, rm); this.pos.play(rm);
    const reply = { uci: r.best, san: rsan };
    if (this.pos.isCheckmate()) return { ...base, reply, ended: this.finish(false, 'You were checkmated.') };
    if (this.pos.isEnd() || this.pos.halfmoves >= 100) return { ...base, reply, ended: this.finish(this.def.goal === 'hold', this.def.goal === 'hold' ? 'Drawn. You held.' : 'Drawn. The win slipped away.') };
    if (this.def.goal === 'hold' && this.moves >= this.holdMoves) return { ...base, reply, ended: this.finish(true, `You held the draw for ${this.moves} moves.`) };
    if (this.def.goal === 'win' && this.moves >= 60) return { ...base, reply, ended: this.finish(false, 'Too slow. The fifty-move rule would save the defender.') };
    this.best = await this.eng.search(fenOf(this.pos), { ms: Math.round(this.ms * 1.5) });
    return { ...base, reply };
  }
}
