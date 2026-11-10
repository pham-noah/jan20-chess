// Logic tests: bundled puzzles solve exactly as stored, and every endgame drill can be completed by playing the engine's own moves.
const { createSF, score } = require('./sf.cjs');
const fs = require('fs');
const { PuzzleRun } = require('./.build/puzzle.cjs');
const { DrillRun } = require('./.build/drill.cjs');
const { fromEngine } = require('./.build/uci.cjs');
const starter = JSON.parse(fs.readFileSync('src/tactics/starter.json', 'utf8'));
const drills = require('./.build/endgames.cjs').DRILLS;
const only = process.argv[2];
(async () => {
  let bad = 0;
  if (!only || only === 'puzzles') {
    for (const p of starter) {
      const run = new PuzzleRun(p); run.setupMove(); let res = '';
      while (run.i < p.moves.length) {
        const u = run.expected(); const m = fromEngine(run.pos, u); res = run.try(u, m);
        if (res === 'wrong') { console.log('PUZZLE FAIL', p.id, u); bad++; break; }
        if (res === 'correct') run.reply();
      }
      if (res !== 'solved') { console.log('PUZZLE NOT SOLVED', p.id); bad++; }
    }
    console.log('puzzles checked:', starter.length);
  }
  if (!only || only === 'drills') {
    const sf = createSF(); await sf.init();
    const eng = { async search(fen, o = {}) { const r = await sf.search(fen, { movetime: o.ms, depth: o.depth, multipv: o.multipv, searchmoves: o.searchmoves }); const lines = r.pvs.map(p => ({ score: score(p), mate: p.kind === 'mate' ? p.val : undefined, pv: p.pv })); const top = lines[0] || { score: 0, pv: [] }; return { best: r.bestmove === '(none)' ? '' : r.bestmove, score: top.score, mate: top.mate, pv: top.pv, lines, history: r.history }; } };
    for (const d of drills) {
      const run = new DrillRun(d, eng, 120); await run.prepare(); let n = 0, step;
      while (!run.ended && n++ < 90) { const m = fromEngine(run.pos, run.best.best); step = await run.userMove(m); if (step.kind === 'bad') { console.log('  engine move judged bad?!', d.id); break; } }
      const ok = run.ended && run.ended.ok && run.mistakes === 0;
      console.log(ok ? 'ok  ' : 'FAIL', d.id.padEnd(14), d.goal, 'moves', run.moves, run.ended ? run.ended.text : 'not finished');
      if (!ok) bad++;
    }
    // a clearly bad move must be rejected in a hold drill
    const hold = drills.find(d => d.goal === 'hold');
    if (hold) {
      const run = new DrillRun(hold, eng, 150); await run.prepare(); let flagged = 0;
      for (const [from, ds] of run.pos.allDests()) for (const to of ds) { if (flagged) break; const mv = { from, to }; const st = await run.userMove(mv); if (st.kind === 'bad') flagged++; else break; }
      console.log(flagged ? 'ok   bad-move rejection works' : 'WARN no bad move found in first tries');
    }
    sf.quit();
  }
  console.log(bad ? `FAILURES: ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
