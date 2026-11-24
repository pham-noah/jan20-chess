
const raw = import.meta.glob('./library/*.pgn', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** The hand-checked lines plus the engine-suggested sidelines (id.ext.pgn), as one PGN. */
const pgnOf = (id: string) => `${raw[`./library/${id}.pgn`] ?? ''}\n\n${raw[`./library/${id}.ext.pgn`] ?? ''}`;

export type Pack = { id: string; name: string; color: 'white' | 'black'; blurb: string; pgn: string };

export const PACKS: Pack[] = [
  { id: 'italian', name: 'Italian Game', color: 'white', pgn: pgnOf('italian'),
    blurb: 'Fried Liver, 5.d4 against 3...Bc5, 4.d4 against the Hungarian' },
  { id: 'evans', name: 'Evans Gambit', color: 'white', pgn: pgnOf('evans'),
    blurb: 'Normal, Morphy, Goering, Ulvestad, Lasker, Tartakower' },
  { id: 'halloween', name: 'Halloween Gambit', color: 'white', pgn: pgnOf('halloween'),
    blurb: 'The 4.Nxe5 sacrifice against the Four Knights' },
  { id: 'caro-kann', name: 'Caro-Kann Defence', color: 'black', pgn: pgnOf('caro-kann'),
    blurb: 'Classical, Karpov, Advance, Exchange, Panov, Fantasy' },
  { id: 'sicilian', name: 'Sicilian Najdorf', color: 'black', pgn: pgnOf('sicilian'),
    blurb: 'English Attack, Bg5, Be2, Bc4, h3, plus the Alapin' },
  { id: 'stafford', name: 'Stafford Gambit', color: 'black', pgn: pgnOf('stafford'),
    blurb: 'The 3...Nc6 gambit, queen trap and fishing-pole mate' },
  { id: 'alien', name: 'Alien Gambit', color: 'white', pgn: pgnOf('alien'),
    blurb: 'White gambit: 5.Ng5 and the 6.Nxf7 sacrifice' },
  { id: 'martian', name: 'Martian Gambit', color: 'white', pgn: pgnOf('martian'),
    blurb: 'Classical 4...Bf5: 5.Ng5 Bg6 6.N1f3 h6 7.Ne6' },
];
