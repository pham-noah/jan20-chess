import type { Puzzle } from './puzzle';

/** A lesson is a chapter: the idea, then three steps that take it from plain to played. */
export type StepTier = 'basic' | 'advanced' | 'game';

export type LessonStep = {
  tier: StepTier;
  title: string;
  text: string;
  /** A position taken from the puzzle database, chosen by theme and difficulty. */
  puzzle?: { theme: string; band: 'easy' | 'hard' | 'game' };
  /** Or a position of its own (endgames mostly). */
  drill?: string;
};

export type Lesson = {
  id: string; group: string; name: string; idea: string; look: string;
  theme?: string; drill?: string;
  steps: LessonStep[];
};

const t = (tier: StepTier, title: string, text: string, rest: Partial<LessonStep> = {}): LessonStep =>
  ({ tier, title, text, ...rest });

const tac = (theme: string, idea: string, look: string, basic: [string, string], adv: [string, string], game: [string, string]): Lesson => ({
  id: theme, group: 'Tactics', theme, name: basic[0], idea, look,
  steps: [
    t('basic', basic[0], basic[1], { puzzle: { theme, band: 'easy' } }),
    t('advanced', adv[0], adv[1], { puzzle: { theme, band: 'hard' } }),
    t('game', game[0], game[1], { puzzle: { theme, band: 'game' } }),
  ],
});

const end = (id: string, drill: string, name: string, idea: string, look: string,
             basic: [string, string], adv: [string, string], game: [string, string], second?: string): Lesson => ({
  id, group: 'Endgames', drill, name, idea, look,
  steps: [
    t('basic', basic[0], basic[1], { drill }),
    t('advanced', adv[0], adv[1], { drill: second ?? drill }),
    t('game', game[0], game[1], { drill }),
  ],
});

/** Every lesson, in teaching order: the plain idea, the way it goes wrong, then a real game. */
export const LESSONS: Lesson[] = [
  tac('fork', 'One piece attacks two things at once, and only one can be saved.',
    'Knights fork most often — check every knight hop for two targets, especially king and queen.',
    ['Fork', 'One move, two targets. Take the piece that is worth least and you win what is left: most forks win a queen because the king cannot stay in check.'],
    ['The forking square', 'A fork only works if the forking piece is safe and both targets are really there after the move. Count the square it lands on before you play it.'],
    ['Forks in real games', 'This one is from a real game. The fork is rarely the first idea you see — it is what is left after you notice two loose pieces.']),

  tac('pin', 'A piece cannot move because something more valuable stands behind it.',
    'Bishops, rooks and queens on the same line as the king: the piece in front is frozen.',
    ['Pin', 'A pin freezes a piece in front of something worth more. When the king is behind, the piece may not legally move at all.'],
    ['Absolute and relative', 'A relative pin is not a freeze: the piece may move if it is worth more than what it exposes. That is why you attack a pinned piece with a pawn.'],
    ['Pins in real games', 'A pin decides games when it is attacked, not when it is merely made. Watch for the move that piles up on the frozen piece.']),

  tac('skewer', 'A pin the other way round: the valuable piece is in front and must move, losing what is behind.',
    'King or queen in front of something on the same line — attack the front piece.',
    ['Skewer', 'The reverse of a pin. The valuable piece stands in front, so it must move — and whatever stood behind it is yours.'],
    ['Make the front piece move', 'Check first, take second. A skewer works when the front piece has no choice, so give it a check or attack the queen.'],
    ['Skewers in real games', 'In a real game the skewer usually arrives as a check on a king that has just been dragged forward.']),

  tac('discoveredAttack', 'Moving one piece uncovers the attack of another.',
    'Two of your pieces on one line with the enemy behind: the front one can step aside with tempo.',
    ['Discovered attack', 'One piece steps aside and the piece behind it suddenly attacks. The mover can even be sacrificed — the piece behind does the work.'],
    ['Discovered check', 'When the piece behind is aimed at the king, the piece in front moves with total freedom: it can take something or give check too.'],
    ['Discoveries in real games', 'The strongest discoveries are double checks: the front piece takes something on its way out.']),

  tac('doubleCheck', 'Two pieces give check at once, so no single reply can answer both — the king must move.',
    'After a discovered check, ask whether the moving piece also checks.',
    ['Double check', 'Two checkers at once. You cannot capture or block both, so the king must move — usually into a square you have already taken away.'],
    ['King only', 'Because only a king move answers a double check, the sacrifice that creates one is safe: count the flight squares before you give the material.'],
    ['Double checks in real games', 'A double check is nearly always the start of a mating net rather than an end in itself.']),

  tac('deflection', 'A defender is lured or driven away from the square it has to guard.',
    'Ask what each defender is guarding, then whether you can attack it with tempo.',
    ['Deflection', 'The defender is doing a job. Offer it something it must take, or attack it, and the square it guarded is free.'],
    ['Drive, do not ask', 'The best deflection is a check or a capture: the defender has no choice, so the square it left is empty on your next move.'],
    ['Deflections in real games', 'Watch a real game for the capture that looks free — it is usually a defender being pulled off its post.']),

  tac('attraction', 'A sacrifice drags the king or a piece onto a square where a tactic works.',
    'A sacrifice next to the king is usually pulling it into a fork or a mate net.',
    ['Attraction', 'Give something away so the enemy lands on the square you want: a king pulled forward into a fork, or a piece pulled onto a bad line.'],
    ['Drag the king out', 'A sacrifice on the king’s doorstep is worth it when every recapture walks into a check. Count the checks before you commit.'],
    ['Attraction in real games', 'In real games the giving-away move is often a queen: what follows is a forced mate, not a count of material.']),

  tac('clearance', 'A piece steps out of the way, or is sacrificed, so a line becomes usable.',
    'Your own piece blocking your rook, bishop or queen: can it move with tempo?',
    ['Clearance', 'Your own piece is in the way. Move it — with tempo if you can — and the line behind it is yours.'],
    ['Clear it with a threat', 'The clearance only pays if the moving piece does something: a check, a capture, or a threat that must be answered.'],
    ['Clearances in real games', 'The move that clears the line is usually a sacrifice, and the line it opens is the one aimed at the king.']),

  tac('interference', 'A piece is planted between a defender and what it defends.',
    'A defender on a line with the piece it guards — can something land in between?',
    ['Interference', 'Plant a piece between a defender and the square it protects: the defence stops working and the attack arrives anyway.'],
    ['The square in between', 'It is worth giving a whole piece to sit on that square — the defender never gets to use its line again.'],
    ['Interference in real games', 'Rare enough that it is worth knowing by sight: a defender, a line, and one square in the middle.']),

  tac('xRayAttack', 'A piece attacks through another to a square behind it.',
    'A defender in front of the king: the piece behind can often still be won.',
    ['X-ray', 'Your piece attacks through an enemy piece to what stands behind it. The piece in the middle does not save the one behind.'],
    ['Defenders do not defend', 'A defender sitting on the line is not defending what is behind it — the attack passes straight through.'],
    ['X-rays in real games', 'Look for it when a defender is pinned: the piece behind is effectively undefended.']),

  tac('hangingPiece', 'Something is simply undefended, and the game is about who notices first.',
    'Before every move, scan what is attacked and what defends it — both colours.',
    ['Hanging piece', 'An undefended piece is free. Most club games are decided by this and nothing cleverer.'],
    ['Before every move', 'Check what is attacked on both sides before you commit: the mistake is usually made by the player who only looked at their own plan.'],
    ['Missed pieces in real games', 'Even masters leave pieces loose under time pressure — the habit is what catches them.']),

  tac('trappedPiece', 'A piece has no safe square, so it can be hunted rather than captured at once.',
    'A knight or bishop deep in enemy space with few squares: count its exits.',
    ['Trapped piece', 'A piece with nowhere safe to go is a piece you can win without a tactic: take its squares one at a time.'],
    ['Count the exits', 'Count the squares it can reach and which of them you control. If the count is one, the hunt is already over.'],
    ['Traps in real games', 'Deep knights are the usual victim: they look strong until someone counts the squares.']),

  tac('backRankMate', 'A castled king with no escape square is mated along the last rank.',
    'Empty squares in front of the king. One rook or queen reaching the back rank is enough.',
    ['Back-rank mate', 'A castled king is safe only while its pawns are there. One rook on the last rank and the game is over.'],
    ['Make the square', 'The mate needs a way in: a sacrifice to remove the guard, or a deflection of the piece that defends the rank.'],
    ['Back-rank mates in real games', 'The commonest grandmaster blunder of all — a queen trade that leaves the back rank empty.']),

  tac('mateIn1', 'Every legal reply must be check, and every check must be mate.',
    'List every check, then for each one ask what the king can do.',
    ['Mate in one', 'Find the one move that ends the game. Start by listing every check you have.'],
    ['Every escape covered', 'For each check, ask where the king can go and whether a capture or block helps. If every reply fails, it is mate.'],
    ['One move, real game', 'The mate in one is there in most winning positions — provided you look for it before you look for material.']),

  tac('mateIn2', 'A sacrifice or a quiet move leaves the king with no good reply, then mate follows.',
    'Look for a forcing first move: check or capture that narrows the king to one square.',
    ['Mate in two', 'The first move forces, the second mates. Almost always a sacrifice or a check that closes the last square.'],
    ['Force it', 'Try every check and every capture: one of them leaves the king with a single reply, and your second move is the mate.'],
    ['Mates in real games', 'A real game is won when the forcing move is found a move earlier than the opponent expected.']),

  tac('mateIn3', 'A longer forcing sequence where each move keeps the king boxed in.',
    'Work backwards: what is the mating position, then what forces it?',
    ['Mate in three', 'Longer, but the same method: every white move is a check or a forced threat, and the king has one square at a time.'],
    ['Work backwards', 'Find the mating picture first, then ask which move forces the king into it. Two forcing moves are easier to find than one clever one.'],
    ['Longer mates in real games', 'When you see a mate in three in a real game, the first move is usually the quiet-looking one.']),

  tac('promotion', 'A pawn reaching the last rank decides the game.',
    'Passed pawns with a clear run, and pawns that can promote with check.',
    ['Promotion', 'A pawn that cannot be stopped becomes a queen. Look for the pawn that is already running.'],
    ['Clear the way', 'If a piece or pawn stands in the way, sacrifice it: promotion beats material every time.'],
    ['Promotions in real games', 'The pawn that promotes is often not the obvious one — count who gets there first.']),

  tac('quietMove', 'The winning move checks nothing and captures nothing — it takes away the last escape.',
    'When every forcing move fails, ask what square the king or piece needs taken away.',
    ['Quiet move', 'The move that wins is a threat in waiting. No check, no capture — it removes the last square or sets up an unstoppable idea.'],
    ['When forcing fails', 'If all the checks do not work, stop checking. Ask which single square the defence needs, and take it.'],
    ['Quiet moves in real games', 'The quiet move is what separates calculation from guessing: it only appears once you have run out of forcing moves.']),

  tac('zugzwang', 'The opponent is fine where they are, but every move they make loses.',
    'Endgames where both sides are frozen: whose turn is it?',
    ['Zugzwang', 'The opponent would be fine if they could pass. They cannot — every move breaks something.'],
    ['Spare tempi', 'The winner is the side with a move to spare. Count the spare pawn moves before you go hunting for a combination.'],
    ['Zugzwang in real games', 'This is an endgame idea almost always: a king forced to step aside and let the other one through.']),

  tac('exposedKing', 'A king that has lost its pawn cover is a target on its own.',
    'King in the centre or with a broken pawn shield: count the checks available.',
    ['Exposed king', 'A king without pawn cover is a target, whatever the material says. Count the checks first.'],
    ['Count the checks', 'Each check either wins material or drives the king further into the open. The trick is finding the one that does both.'],
    ['Attacks in real games', 'Watch how a real attack starts: it is rarely a sacrifice, it is a check that also develops a piece.']),

  tac('capturingDefender', 'Trade or take the piece that holds the position together.',
    'Which enemy piece is doing the most defending? Can you attack it first?',
    ['Remove the defender', 'Find the piece doing the defending and take it. What it was guarding falls on the next move.'],
    ['Defenders of defenders', 'Sometimes the defender is itself defended: trade it off, or deflect the second defender first.'],
    ['In real games', 'This is the most practical tactic of all: it needs no special shape, only the habit of asking what is defended by what.']),

  tac('sacrifice', 'Material is given up for something that matters more: mate, promotion, or a winning endgame.',
    'When a capture looks free, check whether giving it up opens a line or a square.',
    ['Sacrifice', 'Give material away for something worth more: a mate, a promotion, or an endgame you cannot lose.'],
    ['Make it count', 'A sacrifice without a follow-up is a blunder. Name the move after it before you play it.'],
    ['Sacrifices in real games', 'Real sacrifices are forcing: every reply by the opponent is a check or a capture, and the counting ends in mate.']),

  /* ---------- Endgames: the position, the technique, then play it out ---------- */
  end('l-kqk', 'kqk', 'King and queen vs king',
    'Mate with the queen shrunken box and your own king walking up.',
    "Keep the queen a knight's move from the king; check every move for stalemate.",
    ['The idea', 'The queen takes squares away, your king takes them too, and the enemy king is squeezed to the edge. The queen alone never mates.'],
    ['The trap', 'The only way to fail is stalemate: before every queen move, ask whether the king still has a legal move.'],
    ['Play it out', 'Now do it against the engine. Take your time; the box only shrinks.']),

  end('l-krk', 'krk', 'King and rook vs king',
    'Cut the king off with the rook, then bring your king to the right side.',
    'Rook on the third rank or the file, never a square the king can attack.',
    ['The idea', 'The rook cuts the board in half, and your king walks up to help. Two pieces, one job each.'],
    ['The trap', 'The rook must stay a knight’s move from the king, or it gets taken. Keep the distance and the mate comes.'],
    ['Play it out', 'The engine defends properly. Cut, walk up, mate.']),

  end('l-kbbk', 'kbbk', 'Two bishops vs king',
    'The bishops make a wall and the king pushes the enemy king into a corner.',
    'Bishops side by side in the centre, king in front — never let the king slip past.',
    ['The idea', 'Two bishops side by side build a wall the king cannot cross. Your king does the pushing.'],
    ['The corner', 'The wall drives the king to a corner of the bishops’ colour. If it slips past, rebuild the wall — do not chase.'],
    ['Play it out', 'Slow and certain: wall, squeeze, mate.']),

  end('l-kpk', 'kpk-w1', 'King and pawn: key squares',
    'A king in front of its pawn wins if it reaches the key square two ranks ahead.',
    'Count the squares in front of the pawn: they, not the pawn, decide the result.',
    ['Key squares', 'With the king on the sixth rank in front of its pawn, the pawn promotes. Those squares are the whole theory.'],
    ['Getting there', 'If your king is behind the pawn, the key squares decide whether it is a win or a draw: count before you push.'],
    ['Play it out', 'Win it against the engine, then try the same position from the other side.']),

  end('l-opp', 'kpk-w2', 'Opposition',
    'King facing king with one square between them: the side not to move is winning.',
    'Count spare tempo moves — sometimes the pawn makes the difference.',
    ['Opposition', 'Kings face to face with one square between: whoever must move loses ground. That single idea wins most pawn endings.'],
    ['Distant opposition', 'Odd numbers of squares between the kings do the same job. Count the squares, not the distance.'],
    ['Play it out', 'Play the same position twice: once with the move, once without.']),

  end('l-square', 'kpk-w3', 'Rule of the square',
    'Draw a square from the pawn to its promotion square: if the king is inside, it catches it.',
    'Straight-line distance, one diagonal step per move.',
    ['The square', 'Draw the square from the pawn up to its promotion square. If the defending king is inside it, the pawn is caught.'],
    ['The exception', 'The rule breaks if the king is on the pawn’s path — or if the pawn moves with check. Look before you run.'],
    ['Play it out', 'Count the square first, then prove it against the engine.']),

  end('l-hold', 'kpk-h1', 'Defending king and pawn',
    'Run to the right square, and know when the pawn is already dead.',
    'Get in front of the pawn, not behind it.',
    ['Defending', 'Get the king in front of the pawn. A blocked pawn with the king in front is a draw.'],
    ['Not too early', 'Do not step in front too soon: the defending king must take the opposition at the right moment, not just arrive.'],
    ['Play it out', 'Hold the draw against the engine.']),

  end('l-break', 'breakthrough', 'Pawn breakthrough',
    'Three pawns against three can force one through with a sacrifice.',
    'Count the pawn race: give one up to create a passer.',
    ['The idea', 'Equal pawns can still lose: one sacrifice makes a passed pawn the other side cannot stop.'],
    ['Count the race', 'Before you push, count both sides’ moves to promotion. The sacrifice has to be one tempo faster.'],
    ['Play it out', 'Break through against the engine.']),

  end('l-lucena', 'lucena', 'Lucena position',
    'The classic rook ending win: build a bridge with the rook to shield the king.',
    'King on the promotion square, rook one rank behind: rook to the fourth rank, then bridge.',
    ['Lucena', 'The king is on the promoting square and the rook shields it: this position is won, and the win has a name.'],
    ['The bridge', 'Rook to the fourth rank, king steps out, rook drops behind to block the checks. That is the whole technique.'],
    ['Play it out', 'Build the bridge against the engine.']),

  end('l-philidor', 'philidor', 'Philidor position',
    'The classic rook ending draw: rook on the third rank until the king arrives.',
    'Keep checking from behind once the king comes forward.',
    ['Philidor', 'The draw every strong player knows: rook on the third rank, king in front of the pawn.'],
    ['Checks from behind', 'When the king advances, the rook checks from behind, forever. Distance is the whole defence.'],
    ['Play it out', 'Draw it against the engine: rook on the third rank, checks from behind, and the pawn never moves.']),

  end('l-wrong', 'wrong-bishop', 'Wrong bishop draw',
    'Bishop and rook pawn with the wrong-coloured bishop is a draw — hold it.',
    'Corner square colour against the bishop colour.',
    ['Wrong bishop', 'Bishop and rook’s pawn, with the bishop not controlling the promotion square: a draw by force.'],
    ['Hold it', 'Keep the king in the corner. The defender has one job and one square.'],
    ['Play it out', 'Hold the draw, then try to win it as the other side.']),
];

/** The puzzle a step points at: the easiest of its theme, the hardest, or one from a real game. */
export function puzzleFor(step: LessonStep, puzzles: Puzzle[]): Puzzle | undefined {
  const spec = step.puzzle;
  if (!spec) return undefined;
  const pool = puzzles.filter(p => (p.themes || []).includes(spec.theme));
  if (!pool.length) return undefined;
  const byRating = [...pool].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
  if (spec.band === 'easy') return byRating[Math.floor((byRating.length - 1) * 0.08)];
  if (spec.band === 'hard') return byRating[Math.floor((byRating.length - 1) * 0.92)];
  const real = pool.filter(p => (p.themes || []).some(x => x === 'master' || x === 'masterVsMaster' || x === 'superGM'));
  const from = real.length ? real : byRating;
  return from[Math.floor(from.length / 2)];
}
