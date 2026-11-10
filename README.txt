Jan20 - local chess opening trainer
One codebase, three ways to run it. All data stays on the device (IndexedDB). No accounts, no sync.

1) WEB / PWA        npm run build, then host the dist folder on any HTTPS static host and Install from the browser.
2) PHONE (Capacitor)
   Android: install Android Studio, then  npm install --legacy-peer-deps && npm run android
            Run on a device/emulator, or Build > Build APK(s).
   iOS:     needs a Mac with Xcode and an Apple Developer account.
            npx cap add ios && npm run ios
3) DESKTOP (Tauri)  Install Rust (rustup.rs) plus the Tauri prerequisites for your OS, then
            npm run desktop         (dev window)
            npm run desktop:build   (installer in src-tauri/target/release/bundle)

NO TOOLCHAINS? Push this folder to a GitHub repo, open Actions > "Build Jan20 apps" > Run workflow.
It builds Windows, macOS and Linux installers and an Android APK and attaches them as downloads.

Store releases: Google Play needs a signed AAB (create a keystore in Android Studio). Apple needs the developer account.
Change the app id in capacitor.config.ts and src-tauri/tauri.conf.json (app.jan20.trainer) if you want your own.
Logo/icons: public/, assets/ (sources for Android icons: npx @capacitor/assets generate --android).
Palette: ink #101820, sage #5c7d73, mist #dfe6d6, amber #e3b653.
Back up your lines: Build > Import, export and backup > Download backup.

WHAT'S INSIDE (v2)
- Notes: in Build, play a move and write a note under the board. Notes show in Learn and Review and travel with PGN/backup.
- Starter lines: + > "Browse starter lines" (or Settings > Starter lines): Italian Game, Evans Gambit, Halloween Gambit, Alien Gambit, Martian Gambit (White);
  Caro-Kann, Sicilian Najdorf, Stafford Gambit (Black). Sources: src/library/*.pgn. Edit those files to change the bundled lines.
- Settings: new cards per session, target retention, board colors, coordinates, animation, vibration, Learn speed.
- Backup: Settings > Export backup / Import backup (merge or replace). Merge keeps the newer review of each card.
The bundled lines were checked for legal moves, not by an engine. Treat deep theory as a starting point.

TACTICS AND ENDGAMES (v3)
- Tactics tab: 167 built-in puzzles (mined from engine games, every solution checked), spaced repetition (FSRS), a puzzle rating,
  theme filter. Import more from the Lichess puzzle database (CC0): download lichess_db_puzzle.csv from database.lichess.org
  (unzip the .zst), then Settings > Import Lichess puzzle CSV. Set the rating range and max count first; huge files are streamed
  and reading stops once the max count is reached.
- Endgames tab: 16 drills against Stockfish (basic mates, king and pawn, Lucena, Philidor, wrong bishop, pawn breakthrough),
  plus "Practise a FEN" for your own positions. Moves that throw away the result are taken back; a hint lowers your grade.
- Engine: Stockfish 19 lite (WASM) runs in a Web Worker from public/engine. No network needed.
- Dev tools: tools/mine.mjs (mine puzzles), tools/eg-verify.mjs (verify endgames), npm run test:logic (logic tests, needs Node).

LICENCE NOTE
Stockfish and chessground are GPL-3.0. Personal use is fine. If you distribute the app, it must be released under the GPL too.

LOOK AND FEEL (v4)
- Appearance: dark, light, or match the device. Five board colour sets and five piece sets (Classic, Merida, Chessnut, Pirouetti, Fantasy).
  Piece credits are in PIECES-LICENSES.md. Fonts (Fraunces, Inter) are bundled, so it looks the same offline on every device.
- Sounds (synthesised, no audio files) and a board flash/shake on right and wrong answers. All can be switched off in Settings.
- Browser tests: pip install playwright && playwright install chromium, serve dist/ (python3 -m http.server 8099 in dist), then
  python3 tools/e2e.py. 22 checks: real piece dragging, castling, promotion, tap-to-move on a phone, persistence, backup, offline.

NEW PACKS (v5)
- Stafford Gambit (Black, 38 positions to learn) and Alien Gambit (White, 31). Checked for legal moves, both mating traps verified as forced mates,
  and every repertoire move audited with Stockfish (tools/audit.mjs): only the intended gambit sacrifices lose material.
- Query any position with the engine: node tools/q.mjs "e4 e5 Nf3" 16 3

PACK UPDATE (v6)
- Martian Gambit (White): 5.Ng5 Bg6 6.N1f3 h6 7.Ne6 with the safe lines.
- Stafford Gambit now covers 3.d4, 3.Nc3, 3.Bc4, 3.d3 and the 4th/5th-move sidelines (154 Black moves, all audited).
- tools/grow.mjs builds engine-checked trees: node tools/grow.mjs "e4 e5 Nf3 Nf6 d4" black 10 2 60

TRAINING MODES AND CONTENT CHECKS (v7)
- Learn tab now has four modes: Walk (follow a line), Drill (a streak across random lines, one mistake ends it),
  Time (60 seconds, clean lines add 8s, mistakes cost 6s) and Arena (your opponent follows your book while you do, then plays like a
  human; Stockfish judges the position and your Arena rating moves). Best scores are saved per repertoire.
- Engine explanations: when you play a wrong move in Walk/Review/Drill, Jan20 checks it with Stockfish ("that leaves your bishop
  hanging", or "engine likes it too, but your book plays ...", with scores). Switch off in Settings.
- Every bundled repertoire move was audited against Stockfish (tools/audit.mjs). Only the intended gambit sacrifices cost material.
  The audit found and fixed a real mistake in the Caro-Kann 6.Nf3 line (10...Ngf6? loses to 11.Nxf7; now 8...Nxe5 9.dxe5 Qa5+).
- Each pack now also loads <pack>.ext.pgn: engine-suggested sidelines for opponent replies the hand-made lines did not answer
  (found with tools/gaps.mjs, written by tools/extend.mjs). They are marked "Engine-suggested sideline" in the notes.
- Tests: tools/e2e.py, e2e-packs.py, e2e-packs2.py, e2e-modes.py (browser), npm run test:logic and npm run test:explain (engine logic).

APP POLISH (v8)
- Styled dialogs and an Undo toast replace the browser's confirm/prompt/alert. Deleting a move can be undone.
- First-run welcome sheet, shortcuts sheet (press ?), optional typed-move entry (Settings), remembers your last tab, panel transitions.
- Layouts: landscape phones get a left tab rail and a full-height board; 320px phones and tablets checked for overflow.
- Accessibility: live status messages, aria-current on tabs, labelled dialogs, keyboard move entry, reduced-motion respected.
- Faster start: the starter library and the extra piece sets load on demand (startup JS 222 KB -> 185 KB, CSS 229 KB -> 31 KB).
- Errors: a friendly toast with Reload for unexpected errors, and a warning if the browser cannot save progress.
- Native shell (Android/iOS via Capacitor): back button closes dialogs, then returns to Build, then minimises; status bar follows the theme;
  haptics use the device motor. These native pieces are written but not run on a device.
- Tests: tools/e2e-polish.py (25 checks) joins the other browser suites (72 checks in total).

ITALIAN PACK REBUILT ON THE CHESSREPS COURSE (v9)
- The Italian repertoire now follows the line order of the Chessreps course (GM Wei Yi) as far as it is visible
  without an account: line 1 is the Two Knights with the Fried Liver (4.Ng5 d5 5.exd5 Nxd5 6.Nxf7 Kxf7 7.Qf3+ Ke8
  8.Bxd5), then the Giuoco Piano with 5.d4 (8.d5, the ...Bb4+ lines, ...Nxd2/...Bxd2+/...Ne7 and the 8...Qe7+ 10.Kf1
  sidestep), ending with opposite-side castling.
- The quiet 5.d3 Pianissimo and the 4.d3 Two Knights lines are gone, along with the engine sidelines that hung off
  them. 3...Be7 is now met by 4.d4 instead of 4.d3.
- The gaps the hand-made lines leave are filled from the engine, as with the other packs: tools/gaps.mjs listed 69
  plausible replies the 15-line pack did not answer, and tools/extend.mjs wrote 14 checked continuations into
  italian.ext.pgn (2...Nf6, 2...d5, 3...d6 with ...f5/...h6, 3...Be7 with 4...Na5/4...d6, 5...Nd4 and friends).
  33 lines, 189 positions, 100 White moves. Every move legal; audited at depth 13 (63 + 58 moves, 0 flagged).
- Those gaps are ranked by the engine, not by how often humans play them: Chessreps' "any reply played in 1% of
  Lichess games" rule needs Lichess data, and the explorer API now answers 401 without a token here.
- The rest of the course (97 more lines) is paywalled, so it is not included. To bring it in, export the PGNs from
  Chessreps and paste them into Build > More > Import PGN.
- Moves only: the notes are ours. Every move was re-checked for legality and audited with Stockfish (63 White moves
  at depth 13, 0 flagged, including the 6.Nxf7 sacrifice).

LEARN PARITY WITH CHESSREPS (v9)
- Walk now names the move, as Chessreps' Learn does: the status line reads "Play Nf3." and the author's note for
  the position still shows above it. Solve (next to Hint) plays that move for you, so you can skim a line.
- Lines are tracked as discovered: the panel header reads "All lines (22) · 5 discovered", walked lines get a ✓,
  and the progress bar under the header fills up. Stored per repertoire, so it survives a reload.
- Everything else already matched or beat Chessreps' Learn: numbered line list with the divergent move picked out
  (they have a plain list), Next line, and Jump to any line (they have < > and a # picker).
- Deliberate differences: Chessreps answers your move instantly and tells you the move in words; Jan20 keeps the
  opponent reply delay (Settings) so you can pre-move, and Drill/Time still hide the move and pick at random.

WALK IS A NUMBERED WALKTHROUGH (v9)
- Walk lists every line in the repertoire, numbered, main line first. The panel shows "All lines (N)" with the
  current one highlighted, and the move where each line leaves the one above it is picked out in amber, so the
  variants are recognisable at a glance. Tap any line to jump to it.
- While walking, the opponent follows the numbered line instead of replying at random. A line that hits a prepared
  move you did not plan to play re-syncs to the line you actually entered.
- When a line ends it counts itself off ("Line 3 of 22 done") and moves to the next one; after the last it starts again.
  Next line jumps forward, Start over returns to line 1. The line you were on is remembered per repertoire.
- Drill and Time still pick random lines and random replies: that is their point.

EDITING A REPERTOIRE (v9)
- Build keeps the whole tree: play a move at any position (either colour) to add it, play a second reply there to
  branch, so one opening can hold every line you know.
- Deleting a move used to leave its whole continuation orphaned in storage; it now removes that branch and every
  position only it reached. Both deletes are undoable and report what went ("Removed d5 and 7 positions below it").
- "Every line in this repertoire" under Build lists the numbered lines with the variant move picked out, and each
  row has a ✕ that removes just that line — it cuts the move where the line leaves the others.
- To replace a move: delete it and play the new one. There is no in-place rename or re-ordering of lines.

PRE-MOVES (v9)
- While the opponent is thinking (Learn Walk/Drill/Time/Arena and Endgames) you can already play your next move:
  drag it or tap from/to, and the squares light up in amber. The moment your turn comes back it is played.
- Any square the piece could reach on an empty board is allowed, as on chess.com, so you can pre-move a piece that
  is still blocked. If the opponent's reply makes the move illegal, it is dropped silently instead of being punished.
- Tap the piece again, or press Escape, to cancel. Premoves cannot be used in Build or Review (nobody answers there).
- A premove that promotes queens automatically.
- Move animation is 200 ms and follows the "Animate moves" setting.
