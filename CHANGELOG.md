# Changelog

## 0.1.0 — first public release

The numbering restarts here; this is the state of the app, not a diff against the private builds.

**Repertoire editor**
- Play moves onto the board to build a tree; notes on any move, per-line names, branch reordering by
  drag, line deletion that prunes whatever only that line reached.
- Warnings where a repertoire move is worse than the engine's first choice, one click to the engine's
  view of it, gap finding for opponent moves with no prepared answer.
- Paste a PGN or SAN line at any position, paste a FEN to look at it, undo/redo across edits.
- Annotations: arrows and square marks by right-drag, modifier for the brush, ctrl to erase; knight
  arrows bend, and the position can be looked back through with ← / →.

**Learn**
- Walk a line with its notes, or drill it: a wrong move restarts the line, and the drill only grows
  from the shortest line as you keep it clean.
- Premoves, chess.com-style: queue several moves while the opponent replies, and the queue drops only
  the link the reply made impossible.
- Arena: play a full game out of your own line, opponent following the book until you leave it.

**Review**
- FSRS scheduling over positions, four grades, new cards per session and target retention in Settings.
- The day's queue is one number in the tab and in the strip, so the badge and the counts agree.

**Tactics**
- 1,245 bundled Lichess puzzles with a rating that follows your results, theme filter, and a week view.
- 22 tactical lessons, each three steps: the plain idea, the way it goes wrong, a real game — with the
  solution drawn as the motif the puzzle is filed under (fork, pin, skewer, mate net).
- CSV import of the full Lichess puzzle database, streamed, with a rating range and a count limit.

**Endgames**
- 16 drills against Stockfish, every position checked with the engine for the stated goal, plus
  *practise a FEN* for your own.

**Platforms and data**
- One source, three targets: Tauri desktop (Windows installers), Capacitor Android (APK), and a static
  web build that installs as a PWA and works offline.
- IndexedDB as the store, a live JSON file on desktop and (opt-in) in the browser, JSON backup in merge
  or replace mode, PGN export and import.
- In-app update check against GitHub releases, with APK handoff to the Android installer.

**Under the hood**
- Stockfish 19 lite (WASM) in a Web Worker; chessground for the board and its own drawable replaced by
  an arrow layer that draws knight moves as an L.
- `npm run test:logic` and `npm run test:explain` in Node, five Playwright suites over the built app in
  CI (Chromium), and a GitHub Actions workflow that typechecks, builds and runs all of it.
