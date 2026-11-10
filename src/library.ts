
const raw = import.meta.glob('./library/*.pgn', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** The hand-checked lines plus the engine-suggested sidelines (id.ext.pgn), as one PGN. */
const pgnOf = (id: string) => `${raw[`./library/${id}.pgn`] ?? ''}\n\n${raw[`./library/${id}.ext.pgn`] ?? ''}`;

export type Pack = { id: string; name: string; color: 'white' | 'black'; blurb: string; pgn: string };

export const PACKS: Pack[] = [
  { id: 'italian', name: 'Italian Game', color: 'white', pgn: pgnOf('italian'),
    blurb: 'Giuoco Pianissimo plans against ...Bc5, plus Two Knights (4.d3 and 4.Ng5) and Hungarian set-ups. Plus engine-suggested sidelines.' },
  { id: 'evans', name: 'Evans Gambit', color: 'white', pgn: pgnOf('evans'),
    blurb: 'Accepted lines (Normal Position, Morphy, Goering, Ulvestad, Lasker, Tartakower, Mieses, Compromised) and the Declined 4...Bb6. Plus engine-suggested sidelines.' },
  { id: 'halloween', name: 'Halloween Gambit', color: 'white', pgn: pgnOf('halloween'),
    blurb: 'The 4.Nxe5 knight sacrifice against the Four Knights, vs 5...Ng6, 5...Nc6 and 5...Neg4. Plus engine-suggested sidelines.' },
  { id: 'caro-kann', name: 'Caro-Kann Defence', color: 'black', pgn: pgnOf('caro-kann'),
    blurb: 'Classical, Karpov, Advance, Exchange, Panov-Botvinnik, Fantasy and the Two Knights. Plus engine-suggested sidelines.' },
  { id: 'sicilian', name: 'Sicilian Najdorf', color: 'black', pgn: pgnOf('sicilian'),
    blurb: 'Najdorf vs the English Attack, Bg5, Be2, Bc4 and h3, plus Alapin, Closed and Moscow anti-Sicilians. Plus engine-suggested sidelines.' },
  { id: 'stafford', name: 'Stafford Gambit', color: 'black', pgn: pgnOf('stafford'),
    blurb: 'Black pawn sacrifice in the Petrov (3...Nc6) with the queen trap and the fishing-pole mate, plus solid replies to every other third move (3.d4, 3.Nc3, 3.Bc4, 3.d3) and to 4.d4, 4.Nf3, 4.Nc3, 4.Bc4 and 5.e5, 5.Nc3, 5.Qe2, 5.f3. Plus engine-suggested sidelines.' },
  { id: 'alien', name: 'Alien Gambit', color: 'white', pgn: pgnOf('alien'),
    blurb: 'White gambit against the Caro-Kann: 5.Ng5 and the 6.Nxf7 knight sacrifice, with the safe replies to 5...Bf5, 5...e6 and 5...c5. Plus engine-suggested sidelines.' },
  { id: 'martian', name: 'Martian Gambit', color: 'white', pgn: pgnOf('martian'),
    blurb: 'White gambit against the Caro-Kann Classical (4...Bf5): 5.Ng5 Bg6 6.N1f3 h6 7.Ne6, with safe replies to 5...e6, 5...h6, 5...Nf6 and 5...Qd5. Plus engine-suggested sidelines.' },
];
