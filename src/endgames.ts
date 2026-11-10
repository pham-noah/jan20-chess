import type { DrillDef } from './drill';

/** Every position here was checked with Stockfish: "win" drills are won with best play, "hold" drills are drawn with exactly the right defence. */
export const DRILLS: DrillDef[] = [
  { id: 'kqk', group: 'Basic mates', name: 'King and queen vs king', goal: 'win', fen: '8/8/8/3k4/8/8/8/Q3K3 w - - 0 1',
    blurb: 'Keep the queen a knight’s move from the king to shrink the box, then bring your own king. Check every move for stalemate.' },
  { id: 'krk', group: 'Basic mates', name: 'King and rook vs king', goal: 'win', fen: '8/8/8/8/8/5k2/8/R3K3 w - - 0 1',
    blurb: 'Cut the king off along a rank, bring your king to the opposition, then check to drive it back one rank at a time.' },
  { id: 'kbbk', group: 'Basic mates', name: 'Two bishops vs king', goal: 'win', fen: '8/8/8/8/8/6k1/8/2B1KB2 w - - 0 1',
    blurb: 'Bishops on neighbouring diagonals form a wall. Push the king to the edge, then to a corner, with your king close behind.' },

  { id: 'kpk-w1', group: 'King and pawn', name: 'Key squares: c-pawn', goal: 'win', fen: '2k5/K7/8/2P5/8/8/8/8 w - - 0 1',
    blurb: 'A king standing two squares in front of its pawn on a key square wins. Reach the key squares before the defender blocks them.' },
  { id: 'kpk-w2', group: 'King and pawn', name: 'Win the opposition', goal: 'win', fen: '4k3/8/8/2P2K2/8/8/8/8 w - - 0 1',
    blurb: 'Kings facing each other with the move to the opponent: that side gives way. Take the opposition, then advance with the king in front.' },
  { id: 'kpk-w3', group: 'King and pawn', name: 'Rule of the square', goal: 'win', fen: '8/8/8/7P/3k4/K7/8/8 w - - 0 1',
    blurb: 'Draw the square from the pawn to its promotion square. If the defender’s king cannot step inside it, the pawn runs through.' },
  { id: 'kpk-w4', group: 'King and pawn', name: 'Pawn and king vs king: b-pawn', goal: 'win', fen: '8/8/8/8/1P6/4k3/8/5K2 w - - 0 1',
    blurb: 'Use the pawn to gain tempi. Only one move keeps the win here.' },
  { id: 'kpk-w5', group: 'King and pawn', name: 'Escort the f-pawn', goal: 'win', fen: '8/8/8/8/5P1k/8/6K1/8 w - - 0 1',
    blurb: 'Bring the king beside the pawn and keep the defender away from the front squares.' },
  { id: 'kpk-h1', group: 'King and pawn', name: 'Defend the key square (hold)', goal: 'hold', hold: 12, fen: '2k5/K7/8/2P5/8/8/8/8 b - - 0 1',
    blurb: 'Meet the pawn with the king in front of it. One accurate move holds the draw. Reach the pawn’s front squares.' },
  { id: 'kpk-h2', group: 'King and pawn', name: 'Catch the rook pawn (hold)', goal: 'hold', hold: 12, fen: '8/8/8/7P/3k4/K7/8/8 b - - 0 1',
    blurb: 'Step into the square of the pawn at once. Only the right first move saves the game.' },
  { id: 'kpk-h3', group: 'King and pawn', name: 'Stop the g-pawn (hold)', goal: 'hold', hold: 12, fen: '8/5K2/8/8/4k1P1/8/8/8 b - - 0 1',
    blurb: 'Attack the pawn from the side while keeping your king in front of it.' },
  { id: 'kpk-h4', group: 'King and pawn', name: 'Run to the d-pawn (hold)', goal: 'hold', hold: 12, fen: '8/8/8/8/3P4/7k/8/2K5 b - - 0 1',
    blurb: 'The pawn is far from promotion. Head for it and take the opposition in front of it.' },

  { id: 'breakthrough', group: 'Pawns', name: 'Pawn breakthrough 3 vs 3', goal: 'win', fen: '8/ppp5/8/PPP5/8/8/8/K6k w - - 0 1',
    blurb: 'When pawns face each other, sacrifice one to create a passed pawn. The middle pawn leads the way.' },

  { id: 'lucena', group: 'Rook endings', name: 'Lucena position', goal: 'win', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    blurb: 'Build a bridge. Check with the rook, then place it on the fourth rank so your king can walk out and hide behind it.' },
  { id: 'philidor', group: 'Rook endings', name: 'Philidor position (hold)', goal: 'hold', hold: 20, fen: '4k3/8/r7/3PK3/8/8/8/7R b - - 0 1',
    blurb: 'Keep your rook on the sixth rank so the king cannot advance. When the pawn reaches the sixth, check from behind.' },

  { id: 'wrong-bishop', group: 'Minor pieces', name: 'Wrong bishop and rook pawn (hold)', goal: 'hold', hold: 12, fen: '6k1/8/6KP/8/8/8/8/5B2 b - - 0 1',
    blurb: 'The bishop does not control the corner square, so you only need to reach the corner. Only one king move keeps it.' },
];
