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

KNOWING WHICH BUILD YOU HAVE (v10)
- Version is now 1.1.0 everywhere (package.json, tauri.conf.json, Android versionCode 2 / versionName 1.1.0), so the
  installers are named Jan20_1.1.0_x64-setup.exe / .msi instead of every build being "1.0.0".
- Every build is stamped with version + git sha + local build time, shown in Settings ("Build 1.1.0+3df0b07
  (2026-11-10 19:58)") and logged to the console, so a stale copy is obvious.
- The PWA reloads itself as soon as a new service worker takes control. Without that a freshly served dist looks
  older than it is: workbox precaches index.html and the bundle, so the first load after a rebuild still comes from
  the old cache. When testing locally, reload once more, or use npm run dev which never caches.

MOVE FEEDBACK ON THE BOARD (v10)
- Wrong moves no longer shake the board. Instead the move is marked where it happened: the from- and to-squares are
  tinted red and a red badge with a white cross sits on the destination (right moves get the same in green with a
  tick) centred on the top-right corner of the destination square, straddling the corner so the piece underneath
  stays uncovered. It reads on top of the
  pieces, works in Build, Learn (all four modes), Review, Tactics and Endgames, fades
  after a moment (1.1 s right, 2.4 s wrong) and clears when you change tab.
- The green board glow on a correct move stays; only the shake is gone.

WALK STAYS ON THE LINE YOU CHOSE (v10)
- Fixes a bug where every line after the first played like line 1: the walk re-homed to the "first line whose prefix
  matches what you have played", and since almost every line starts 1.e4, the second line's first move snapped the
  walk back to line 1. It now stays on the current line while that line still matches, and only re-homes when you
  genuinely deviate into another one.

MARKS ON THE SQUARE, AND THE RIGHT KING (v18)
- **The mate badge was on the wrong king.** `board.king` in chessops is a SquareSet holding both kings, and the code took
  the first one — so mating Black put the hash on your own king. It now picks the king of the side to move, the side
  that has no move. Verified both ways: 1.f3 e5 2.g4 Qh4# marks e1, 1.e4 f6 2.d4 g5 3.Qh5# marks e8.
- **The mate mark is colour-independent**: a black hash with a white halo, no disc and no square tint, so it reads on a
  white king, a black king, a light board or a dark one.
- **A marked move now carries its badge on the board.** The annotation of the move you are looking at is drawn on the
  corner of its destination square — in the Editor as soon as you mark it, and in Learn while that ply is on the board
  (including the pause when a line is done, before the walk moves on).

MARKS EVERYWHERE, AND THE ENDING ON THE BOARD (v17)
- **Annotations now travel with the move.** They were only drawn in the editor's chips and its tree, because every
  other place that prints moves (the editor's flat line list, the line under the message, Walk/Learn, the Review card)
  went through one function that printed bare SAN. That function now emits the glyph too: `1.e4 e5 2.Nf3!` reads the
  same wherever the line is shown.
- **Checkmate is drawn on the king.** The mated king gets a corner badge from a separate overlay layer (so the
  transient move badge clearing does not wipe it): a black disc with a white **#** — the way a scoresheet writes mate —
  with a grey ½ for stalemate. Chessground's own red check glow stays underneath. The panel
  says "Checkmate." instead of inviting another move, and the dashed "＋ add a move here" slot disappears once the
  position is over.
- Engine deltas no longer print a mate score as "+99.3 worse": past 18 pawns it says "a forced mate".

SHOW, DON'T TELL (v16)
- **Endgames show the position.** Hovering (or tabbing to) a drill draws that endgame on the big board, with the real
  pieces, before you commit to it — the board is idle in the list, so it becomes the preview. Small postage stamps in
  each row were tried first and removed: at 54 px the pieces were unreadable decoration.
- **Tactics draw the motif.** When the solution is shown, the move that lands is drawn to the enemy pieces it now
  attacks (purple arrows), so "Why this one: Fork" is something you see rather than read.
- **Settings show their effect.** A live 180 px board under the Settings heading reflects board colours, piece set and
  coordinates as you change them, instead of naming them.
- **Review progress is notched**: one notch per card on the bar, with "Card 1 of 15" still spelled out.

SHOW, DON'T TELL (v15)
The rule now applied where the app was talking instead of drawing:
- **The board shows the repertoire.** Every move saved at the position you are on is drawn on the board as an arrow
  (green for yours, grey for the opponent's replies), instead of only appearing as chips in the panel. The gap finder
  draws the moves it found no answer for in red on the board as well, so "3 gaps" is something you can see.
- **An empty position offers a slot**, not a sentence: a dashed ＋ where a move could go, rather than "No saved moves
  from this position yet."
- **Deleted the standing instructions**: the Learn key hint and the weak-spot explainer are gone (the keys live in the
  ? sheet, the pawn costs are a column of numbers).
- Chessground dims its whole shape layer to 0.6 by default, which made every arrow look like a smudge; the layer is
  painted at full strength now and the brushes were tuned (10/0.85 mine, 9/0.8 replies, 9/0.8 gaps).

TEXT PASS (v15)
- Cut the standing instruction paragraphs and the duplicated counts. The Editor said its position and line counts twice
  (once as a paragraph, once in the status strip) and kept a 20-word tree tutorial permanently on screen; both are gone,
  the counts moved into the strip and the tutorial into the keyboard-shortcuts sheet. Learn stated its line number twice
  ("Line 1 of 33" and "playing line 1") and its discovered count twice; the heading is now just "All lines (33)".
  Chrome text per screen went from 46 → 35 words (Editor), 44 → 32 (Learn), 34 → 28 (Review).
- Shorter in the places that were throat-clearing: "Play a move to save it." / "Prepare a reply." instead of two
  sentences; the welcome and library blurbs lost a clause each.
- Fixed while looking: "33 below" regained the word it needed ("33 ends below"), Review's strip no longer says
  "0 due today" beside 15 cards, the tree's ✕ no longer reads as part of the notation ("e4✕"), and the status strip
  sticks to the bottom of a long panel instead of living under 2500 px of tree.

IF THE LIVE FILE IS DAMAGED (v15)
- A live file that cannot be parsed is never overwritten. It is renamed to `jan20-repertoire.broken-<unix>.json` first,
  the app carries on from what it has stored, and it says so in a toast. Your old data is then still on disk, unlike
  before, where a startup save would have replaced it with whatever the app happened to have in memory.
- The desktop shell also deletes the webview's service-worker store on every start. That store can keep serving an old
  frontend for ever — the new code cannot unregister it because the stale page is the one running — and that is how the
  desktop app silently showed a months-old build twice.

FEATURES (v15)
- **Move annotations**: !, !?, ?!, ?, ?? and a ⚑ "trap" mark on any move, chosen from a palette under the note box,
  drawn as a glyph on the chip, in the tree and in the line list, and exported to PGN as real NAGs ($1, $5, $6, $2,
  $4). Undoable like every other edit.
- **You grade the review card.** A correct answer shows Again / Hard / Good / Easy (keys 1–4) with the automatic choice
  marked; the default is applied after six seconds if you ignore it, and choosing Again puts the card back in the
  session. A miss is still graded Again automatically.
- **Weak spots**: every move the engine guard flagged, worst first, with how many pawns it gives up — click one to jump
  to it, ✕ to clear the flag. This is the ⚠ data finally being useful rather than a badge you see once.
- **Tactics**: set size (5 / 10 / 20) is chosen in the panel, and the end-of-set summary offers "Practise <theme>" for
  whichever themes you got wrong, which restarts a set filtered to that theme.
- **Line names**: name any line ("Fried Liver") from the ✎ in the line list; the name shows in the list, on the line's
  leaf in the tree, and when Walk starts that line.
- **Progress over time**: reviews per day and tactics results per day are recorded, and the status strip shows the last
  seven days — "7-day 78% (54)" in Tactics, "12 reviews this week" in Review.

UX PASS 3 (v14)
- Tactics ends a set with a summary instead of a bare "Session done": how many puzzles, how many clean, the accuracy,
  and a per-theme table ("Crushing 4/5, Middlegame 2/3, Trap 1/1"). Revealed and skipped puzzles are counted the way
  they were graded, so the number matches the rating change you just felt.
- Learn can show **every note in the line** on demand (Notes button) instead of only revealing one when you reach that
  move — the notes for a whole line are also shown automatically once the line is finished, so nothing is spoiled early.
- The tree rows are draggable: drop a branch on a sibling to re-order it, which is what numbers the Walk lines. It only
  accepts drops among siblings (a row's own parent path has to match), it is undoable, and ↑ still sends one to the front.
- Endgames remembers each drill's best run ("18 / 12s" — fewest moves, then fastest) beside the last result and the due
  date, and the panel says how many drills you have practised.

UX PASS 2 (v13, continued) — the gaps the first pass listed are closed
- Review's controls now sit above the note text (a note used to outrank the thing you were supposed to do), and the
  space under the short panel carries state: "Italian Game · line 5 of 33" and "last seen … · next due …".
- Tactics teaches: a solved puzzle, a revealed solution and a wrong move all say what the puzzle was — "Why this one:
  Fork · Middlegame".
- The numbered Lines view has a filter: type a move (Bb5) and it narrows to the lines that contain it, with "2 of 33
  lines" beside it. No re-render, so the caret stays in the box.
- Endgames fills its empty column with the next drill's idea instead of blank space.
- The tree's delete cross is a touch more visible (32%) without turning the tree into a wall of crosses.

UX PASS: ONE TASK PER SCREEN, AND PROGRESS YOU CAN SEE (v13)
Scored the five modes as a designer before touching anything (5.3/10) and fixed what the score was paying for:
- Review said only "Find your move. 15 left." It now says whose move it is ("You play White here"), counts the card
  ("Card 3 of 15"), offers **Show me** next to Hint, grades a reveal as a miss and puts the card back, and after every
  answer there is an explicit **Next card ›** rather than a silent 900 ms jump. Notes stay on screen long enough to read.
- Learn put the loudest button on "Next line", which is the escape hatch, not the task. The board is the task now; line
  controls moved to their own quieter row, the ply buttons are labelled by their tooltips and the hint line spells out
  the keys ("Drag a move or type one · ← → step through the line · H hint").
- Tactics tells you where you are in the set and how the puzzle relates to you ("Puzzle 3 of 10 · rated 1220 (you 1200)"),
  and keeps the theme picker inside the session (removing it stranded you until the set ended).
- Endgames says "3 of 16 practised", names the next drill ("Next drill: King and queen vs king"), and every row keeps
  its last result (✓ good, ~ with a hint, ✕ failed) next to the due status.
- The Editor lost its duplicate header (one "Lines and tree" row with the Tree | Lines toggle), the board is sticky so
  clicking a tree move no longer scrolls it away, and the panel says what to do instead of leaving the import message
  up. Adding a pack toasts "Start learning" as an action instead of printing a hint that never goes away.
- Tree fixes found while testing: move buttons were inheriting the 44 px touch target, so rows overlapped and clicks
  landed on the wrong row; rows now flow like text with a hanging indent, and counts/line numbers float right instead
  of squeezing the moves. Nested branches no longer duplicated their opening move in the path.

EVERY CHANGE IS WRITTEN STRAIGHT TO A FILE (v12)
- No export step any more. In the desktop app each save writes the whole state to `jan20-repertoire.json` in the app
  config folder (`%APPDATA%\app.jan20.trainer` on Windows), and that file is read back at start-up — it is the copy
  that survives a reinstall, and you can back it up, diff it or put it in git. Settings > Data > Live file shows the
  path and the time of the last write; "Write now" forces one.
- In a browser the same thing is available through the File System Access API: Settings > Data > Live file > "Link a
  file…" picks a file once, and from then on every change is written into it. (Chrome/Edge only; Firefox and Safari
  get the old Export backup button.)
- The service worker is now registered only over http(s). Inside the desktop webview it was caching the whole
  frontend, so the desktop app kept showing a 2023-era build while the exe underneath was current, and none of the
  newer code (including this file writing) ever ran there. If you have an old install, clear its cache once.

THE REPERTOIRE IS SHOWN AS A TREE (v12)
- "Every line in this repertoire" was a flat list of 33 SAN strings that mostly repeated the same first six moves,
  so you could not see where lines actually part company. It now opens on a tree of **move runs**, the way a chess
  game is written: an unbroken stretch of moves stays on one row (`1. e4 e5 2. Nf3`) and a new row is indented only
  where the repertoire really splits. Per-ply indentation was tried first and was wrong — with 7 branch points in
  142 positions it made the tree fan out from move 1 and pushed every real branch off the right edge. A caret folds
  a branch, branch points carry the branch count, leaves carry the line number, notes show a dot, engine warnings a
  ⚠, and the current path is picked out in the accent colour.
  Click a move to jump the board there; ↑ makes that branch the first one (which is what numbers the learned lines);
  ✕ deletes the move and everything only it reached. Folding is remembered per node while the repertoire is open.
- The numbered flat list is still one click away behind the Tree | Lines (N) toggle — the line numbers on the tree
  leaves are the same numbers Walk says out loud ("Line 7 of 33"), so nothing about learning changes. Bulk select,
  delete and copy-to-another-pack live in that Lines view.
- Counts only appear where they carry information: a node with one child says nothing, a branch point says
  "3 branches · 33 lines", a leaf says "line 12".

THE PHONE BUILD HAS NO EDITOR TAB (v11)
- Capacitor builds (`window.Capacitor.isNativePlatform()` or a `capacitor:` protocol) drop the Editor tab and open in
  Learn instead; a saved "editor" tab in storage is ignored there, and the New-repertoire button is hidden because an
  empty pack would be a dead end without the editor. Add packs from Browse starter lines / Settings instead.
- The empty-state hints say "Add lines in the desktop version of Jan20." rather than pointing at a tab that is not
  there. The web build and the desktop app keep all five tabs — the Editor is a PC tool.

THE BUILD TAB IS NOW THE EDITOR (v11)
- Renamed to Editor, and it does the things you asked of an opening editor:
- Undo / redo for every edit (adding a move, deleting a move or a whole line, promoting a variation,
  reordering, pasting, editing a note): Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y), and the two arrow buttons under the board.
  Up to 80 steps, per repertoire session.
- Paste a line: drop "1. e4 e5 2. Nf3 Nc6 3. Bc4" (or bare "e4 e5 Nf3 Nc6") into the box and it is added from the
  position you stand on — a full line pasted while standing at its end is aligned, not rejected. Comments,
  variations and result tokens are ignored; the first move that does not follow stops the paste with a reason.
  "Copy this line" puts the current line back on the clipboard as PGN.
- Engine guard: a move of yours that the engine rates 1.5 pawns worse than the best move is saved but flagged with
  a red warning mark on its chip (hover for the number) and a toast naming the better move. Opponent mistakes are
  never flagged — those are traps you want. "Check this line" runs the guard over every move of yours in the line.
- Gaps: "Find gaps here" asks the engine for the moves worth preparing for at the position you are on and lists the
  ones you have no answer for; tap one to jump to it and add your reply. (This is the editor version of
  tools/gaps.mjs, without needing to run a script.)
- Bulk lines: tick lines in the list, then delete them together or copy them into another pack. One undo undoes the
  whole batch.
- Position context under the board: how many positions and lines the pack holds, and for the square you are on —
  saved moves, how many lines pass through it, and how many line-endings sit below it (what a delete would cut).
- Chips show whose move each one is (yours carry an accent underline, the opponent's are dimmed), a dot when the
  move has a note, and can be dragged to reorder; the ↑ button still sends a move to the front.

EDITING A LINE THAT ALREADY EXISTS (v10)
- Arrows and the ‹ Move / Move › buttons step through the moves of the line you are looking at, like a chess
  viewer: back and forward through the whole variation. Walk has the same pair (‹ ›) to look back through the moves
  you have played; the board shows the earlier position and training pauses until you step forward again.
- Line switching has its own controls (‹ Line / Line › in Build, ‹ Line / Next line in Walk) so the arrows stay
  free for stepping moves.
- "Every line in this repertoire" under Build is now a list you can work from: tap a line and it loads into Build
  — the board jumps to its final position, the path shows its moves, and you can extend it, branch it, or cut it
  with the chip ✕. Before this, the only way in was replaying the moves chip by chip from the start.
- Each saved move at a position has an ↑ button: it makes that move the first one there, which is what orders the
  numbered Walk lines and the chip order. So "3...Bc5 before 3...Nf6" is now a click instead of a rewrite.
- Deleting still prunes everything only that move reached, and both edits are undoable/toast-confirmed.

PACK UPDATES REACH COPIES YOU ALREADY ADDED (v10)
- Adding a pack copies its tree into your repertoire, so a later rewrite of the bundled pack never reached it: the
  Italian Game stayed at its old 22 lines while the shipped pack had 33.
- The library now offers "Update my copy" next to "Add another copy". It swaps in the bundled tree and keeps your
  review cards and notes wherever the position still exists, pruning the ones that no longer do. The pack card also
  says how many lines the bundled version has.

TRAPS: PUNISHING OPPONENT MISTAKES (v9)
- tools/traps.mjs walks every position in a pack where the opponent moves and asks Stockfish which legal replies
  they could blunder; a reply that is at least 100 cp worse than their best, and not already in the pack, is a
  punishable mistake, with the refutation searched so you can see what you win. Usage:
    node tools/traps.mjs src/library/italian.pgn white 12 100 2 out.json
- The Italian pack holds 52 such mistakes in its book positions (60 including the engine extensions): e.g. after
  3...d6 4.c3 Be7 5.Qb3 Na5 6.Bxf7+ Kd7?? is mate in 2 (Nxe5+ dxe5 Qe6#), and 6...b5 after 4.d4 exd4 5.Nxd4 Nf6
  6.Nxc6 drops a rook (Bxf7+ Kxf7 Nxd8+).
- The 40 sharpest became puzzles: tools/traps-to-puzzles.mjs writes src/tactics/traps.json, which the Tactics tab
  serves as the "Trap" theme (207 puzzles built in now). They are the same positions you meet in the repertoire,
  so Drill/Learn and Tactics reinforce each other. Note the earlier Fried Liver branch is the one trap the lines
  themselves already carried.

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
