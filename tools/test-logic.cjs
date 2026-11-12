// Logic tests: bundled puzzles solve exactly as stored, and every endgame drill can be completed by playing the engine's own moves.
const { createSF, score } = require('./sf.cjs');
const fs = require('fs');
const { PuzzleRun } = require('./.build/puzzle.cjs');
const { nextPlayable, premoveLinkAllowed } = require('./.build/premove.cjs');
const { DrillRun } = require('./.build/drill.cjs');
const { fromEngine } = require('./.build/uci.cjs');
const load = (f) => JSON.parse(fs.readFileSync('src/tactics/' + f, 'utf8'));
const starter = load('starter.json');
const traps = load('traps.json');
const lichess = load('lichess.json');
const drills = require('./.build/endgames.cjs').DRILLS;
const only = process.argv[2];
(async () => {
  let bad = 0;
  {
    // premove chains: a link the reply made impossible is dropped on its own, the rest still runs
    const q = (a, b) => ({ from: a, to: b });
    let queue = [q('a2', 'a3'), q('a3', 'a4')];
    let r = nextPlayable(queue, (x) => x.from === 'a3');        // first link impossible
    let ok = r.next === queue[0] && r.skipped === 1 && queue.length === 1;
    queue = [q('a2', 'a3'), q('a3', 'a4')];
    r = nextPlayable(queue, () => true);
    ok = ok && r.next?.from === 'a2' && r.skipped === 0 && queue.length === 2;
    queue = [q('a2', 'a3')];
    r = nextPlayable(queue, () => false);
    ok = ok && r.next === undefined && r.skipped === 1 && queue.length === 0;
    console.log(ok ? 'ok   premove chain drops only the impossible link' : 'FAIL premove chain skip logic');
    if (!ok) bad++;
  }
  {
    // premove destinations: whole empty-board reach, but never a king
    const sq = (n) => (n.charCodeAt(0) - 97) + (Number(n[1]) - 1) * 8;
    const cells = {
      [sq('c7')]: { role: 'pawn', color: 'white' },
      [sq('d8')]: { role: 'king', color: 'black' },          // a pawn next to the enemy king
      [sq('e5')]: { role: 'pawn', color: 'white' },
      [sq('e6')]: { role: 'king', color: 'black' },          // a king straight in front of a pawn
      [sq('g1')]: { role: 'knight', color: 'white' },
      [sq('d1')]: { role: 'queen', color: 'white' },
    };
    const b = { get: (s) => cells[s] };                      // premoveLinkAllowed only asks board.get
    const cases = [
      ['pawn capturing the king', premoveLinkAllowed(b, sq('c7'), sq('d8'), 'white'), false],
      ['pawn pushing onto the king', premoveLinkAllowed(b, sq('e5'), sq('e6'), 'white'), false],
      ['knight jumping two up', premoveLinkAllowed(b, sq('g1'), sq('g3'), 'white'), false],
      ['knight to f3', premoveLinkAllowed(b, sq('g1'), sq('f3'), 'white'), true],
      ['queen through pieces', premoveLinkAllowed(b, sq('d1'), sq('h5'), 'white'), true],
      ['the opponent\'s piece', premoveLinkAllowed(b, sq('g1'), sq('f3'), 'black'), false],
      ['a square holding your own piece', premoveLinkAllowed(
        { get: (s) => (s === sq('f1') ? { role: 'rook', color: 'white' } : cells[s]) }, sq('d1'), sq('f1'), 'white'), false],
    ];
    for (const [what, got, want] of cases) {
      if (got !== want) { console.log(`FAIL premove destination: ${what} (got ${got}, want ${want})`); bad++; }
    }
    if (!bad) console.log('ok   premove destinations allow reach but never a king');
  }
  {
    // an impossible move must be refused by the drill itself — never handed to the engine, which is
    // what made an illegal move look like "the engine had a problem"
    const { DrillRun } = require('./.build/drill.cjs');
    const def = { id: 't', name: 't', group: 'g', fen: '8/8/8/3k4/8/8/8/Q3K3 w - - 0 1', goal: 'win', blurb: '' };
    const eng = { search: async () => { throw new Error('the engine was asked about an illegal move'); } };
    const run = new DrillRun(def, eng, 100);
    const step = await run.userMove({ from: 4, to: 60 });          // e1-e8: not a king move
    const ok = step.kind === 'bad' && /not legal/.test(step.text);
    console.log(ok ? 'ok   an illegal drill move is refused without the engine' : 'FAIL illegal drill move reached the engine');
    if (!ok) bad++;
  }
  if (!only || only === 'puzzles') {
    for (const p of [...starter, ...traps, ...lichess]) {
      // some lines end on the opponent's reply, some on ours: playing every stored move without a
      // wrong answer is what "sound" means here.
      const run = new PuzzleRun(p); run.setupMove(); let ok = true;
      while (run.i < p.moves.length) {
        const u = run.expected(); const m = fromEngine(run.pos, u);
        if (!m) { console.log('PUZZLE ILLEGAL MOVE', p.id, u); ok = false; break; }
        const res = run.try(u, m);
        if (res === 'wrong') { console.log('PUZZLE FAIL', p.id, u); ok = false; break; }
        if (res === 'solved') break;
        run.reply();
      }
      if (!ok) bad++;
    }
    console.log(`puzzles checked: ${starter.length} starter + ${traps.length} traps + ${lichess.length} lichess = ${starter.length + traps.length + lichess.length}`);
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
