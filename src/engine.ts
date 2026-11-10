/** Stockfish 19 (lite, single-threaded WASM) running in a Web Worker. Everything stays on the device. */
export type Line = { score: number; mate?: number; pv: string[] };
export type Res = { best: string; score: number; mate?: number; pv: string[]; lines: Line[]; history: { depth: number; mv: string }[] };
export type Opts = { ms?: number; depth?: number; multipv?: number; searchmoves?: string[] };
export type Eng = { search(fen: string, o?: Opts): Promise<Res> };

const toScore = (kind: string, v: number) => (kind === 'mate' ? (v > 0 ? 10000 - v : -10000 - v) : v);

class Engine implements Eng {
  private w?: Worker;
  private listeners = new Set<(l: string) => void>();
  private ready?: Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();

  private send(cmd: string) { this.w!.postMessage(cmd); }
  private collect(until: RegExp, timeout: number): Promise<string[]> {
    return new Promise((res, rej) => {
      const buf: string[] = [];
      const t = setTimeout(() => { this.listeners.delete(fn); rej(new Error('engine timeout')); }, timeout);
      const fn = (l: string) => { buf.push(l); if (until.test(l)) { clearTimeout(t); this.listeners.delete(fn); res(buf); } };
      this.listeners.add(fn);
    });
  }
  private boot() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const w = new Worker(new URL('engine/stockfish-19-lite-single.js', document.baseURI));
      this.w = w;
      w.onmessage = e => { const l = typeof e.data === 'string' ? e.data : ''; if (l) for (const fn of [...this.listeners]) fn(l); };
      w.onerror = () => { this.ready = undefined; this.w = undefined; };
      let p = this.collect(/^uciok/, 20000); this.send('uci'); await p;
      this.send('setoption name Hash value 16');
      p = this.collect(/^readyok/, 20000); this.send('isready'); await p;
    })().catch(e => { this.ready = undefined; throw e; });
    return this.ready;
  }
  /** Warm the engine up without searching. */
  warm() { return this.boot(); }
  newGame() { return this.boot().then(() => this.send('ucinewgame')); }

  search(fen: string, o: Opts = {}): Promise<Res> {
    const run = async (): Promise<Res> => {
      await this.boot();
      const mpv = o.multipv ?? 1;
      this.send(`setoption name MultiPV value ${mpv}`);
      this.send(`position fen ${fen}`);
      const ms = o.ms ?? 400;
      const p = this.collect(/^bestmove/, (o.depth ? 30000 : ms) + 15000);
      this.send(`go ${o.depth ? 'depth ' + o.depth : 'movetime ' + ms}${o.searchmoves ? ' searchmoves ' + o.searchmoves.join(' ') : ''}`);
      const lines = await p;
      const byPv: Record<string, Line> = {}; const history: Res['history'] = [];
      for (const l of lines) {
        if (/bound/.test(l)) continue;
        const m = l.match(/^info (?:.* )?depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (.*)$/);
        if (!m) continue;
        const pv = m[5].split(' ');
        byPv[m[2]] = { score: toScore(m[3], +m[4]), mate: m[3] === 'mate' ? +m[4] : undefined, pv };
        if (m[2] === '1') history.push({ depth: +m[1], mv: pv[0] });
      }
      const bm = (lines[lines.length - 1].match(/bestmove (\S+)/) || [])[1] ?? '';
      const ls = Object.keys(byPv).sort((a, b) => +a - +b).map(k => byPv[k]);
      const top = ls[0] ?? { score: 0, pv: [] as string[] };
      return { best: bm === '(none)' ? '' : bm, score: top.score, mate: top.mate, pv: top.pv, lines: ls, history };
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
export const engine = new Engine();
