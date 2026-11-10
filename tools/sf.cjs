// Tiny promise wrapper around Stockfish (node) for verifying/mining content.
const make = require('stockfish');
function createSF() {
  let resolveLine = null; let buf = []; let waiting = null;
  const eng = make('lite-single', line => { buf.push(line); if (waiting && waiting.test(line)) { const w = waiting; waiting = null; w.res(buf); buf = []; } });
  const send = (cmd, until) => new Promise(res => { buf = []; waiting = until ? Object.assign(until, { res }) : null; eng.processCommand(cmd); if (!until) res(); });
  return {
    async init() { await send('uci', /uciok/); await send('setoption name Threads value 1'); await send('setoption name Hash value 32'); await send('isready', /readyok/); },
    async search(fen, { depth, movetime, multipv = 1, searchmoves } = {}) {
      await send(`setoption name MultiPV value ${multipv}`); await send('isready', /readyok/);
      eng.processCommand(`position fen ${fen}`);
      const lines = await new Promise(res => { buf = []; waiting = Object.assign(/^bestmove/, { res }); eng.processCommand(`go ${depth ? 'depth ' + depth : 'movetime ' + (movetime || 300)}${searchmoves ? ' searchmoves ' + searchmoves.join(' ') : ''}`); });
      const best = {}; const history = [];
      for (const l of lines) {
        if (/bound/.test(l)) continue;
        const m = l.match(/^info (?:.* )?depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (.*)$/);
        if (m) { best[m[2]] = { depth: +m[1], kind: m[3], val: +m[4], pv: m[5].split(' ') }; if (m[2] === '1') history.push({ depth: +m[1], mv: m[5].split(' ')[0] }); }
      }
      const bm = lines[lines.length - 1].match(/bestmove (\S+)/)[1];
      return { bestmove: bm, history, pvs: Object.keys(best).sort((a, b) => a - b).map(k => best[k]) };
    },
    quit() { eng.terminate(); },
  };
}
const score = p => (p.kind === 'mate' ? (p.val > 0 ? 10000 - p.val : -10000 - p.val) : p.val);
module.exports = { createSF, score };
