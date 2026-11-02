/**
 * The Month rounds' emblems on the month menu, as pixel maps authored here (the boss card has the
 * boss's own art): Month 1 rings the opening bell, Month 2 is the climb of three rising candles.
 * One character per pixel; '.' is clear.
 */

export const ROUND_EMBLEMS = {
  bell: [
    '.......OO.......',
    '......OLGO......',
    '.....OLGGGO.....',
    '....OLGGGGDO....',
    '....OLGGGGDO....',
    '...OLGGGGGGDO...',
    '...OLLGGGGGDO...',
    '...OLGGGGGGDO...',
    '..OLLGGGGGGGDO..',
    '..OLGGGGGGGGDO..',
    '.OLLGGGGGGGGGDO.',
    'OOOOOOOOOOOOOOOO',
    'OLGGGGGGGGGGGGDO',
    'OOOOOOOOOOOOOOOO',
    '......OAAO......',
    '.......OO.......',
  ],
  candles: [
    '............W...',
    '...........OUO..',
    '...........OHO..',
    '.......W...OUO..',
    '......OUO..OUO..',
    '......OHO..OUO..',
    '......OUO..OUO..',
    '..W...OUO...W...',
    '.OUO..OUO.......',
    '.OHO...W........',
    '.OUO............',
    '.OUO............',
    '..W.............',
    '................',
    'AAAAAAAAAAAAAAAA',
    '................',
  ],
} as const;

export type RoundEmblemId = keyof typeof ROUND_EMBLEMS;

/** What each Month round is called on its card, and its emblem. */
export const MONTH_CARDS: { title: string; emblem: RoundEmblemId; accent: string }[] = [
  { title: 'Opening bell', emblem: 'bell', accent: '#3ef2ff' },
  { title: 'The climb', emblem: 'candles', accent: '#9d6bff' },
];

const PALETTES: Record<RoundEmblemId, Record<string, string>> = {
  bell: { O: '#2a1a08', G: '#e7b53a', L: '#ffe08a', D: '#a7741c', A: '#ff3ea5' },
  candles: { O: '#0d3a22', U: '#4dff9a', H: '#c9ffe0', W: '#a49de0', A: '#5b4bc4' },
};

export function RoundEmblem({ id, px = 5 }: { id: RoundEmblemId; px?: number }) {
  const map = ROUND_EMBLEMS[id];
  const colors = PALETTES[id];
  const w = map[0].length;
  return (
    <svg
      className={`round-emblem re-${id}`}
      width={w * px}
      height={map.length * px}
      viewBox={`0 0 ${w} ${map.length}`}
      shapeRendering="crispEdges"
      aria-hidden
      data-testid={`round-emblem-${id}`}
    >
      {map.flatMap((row, y) =>
        [...row].map((c, x) =>
          c in colors ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[c]} /> : null,
        ),
      )}
    </svg>
  );
}
