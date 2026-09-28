/**
 * 64x64 pixel-art portraits, authored in code: each character is painted onto a palette-indexed
 * pixel map from simple shapes, then each expression repaints the brows, eyes and mouth.
 * A final pass outlines every shape so the sprites read at small sizes.
 */

import type { CharacterId, Expression } from './characters';

export const PORTRAIT_SIZE = 64;

export interface PixelMap {
  size: number;
  palette: string[]; // index 0 is transparent
  pixels: Uint8Array;
}

class Grid {
  readonly px = new Uint8Array(PORTRAIT_SIZE * PORTRAIT_SIZE);
  set(x: number, y: number, c: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= PORTRAIT_SIZE || yi >= PORTRAIT_SIZE) return;
    this.px[yi * PORTRAIT_SIZE + xi] = c;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= PORTRAIT_SIZE || y >= PORTRAIT_SIZE) return 0;
    return this.px[y * PORTRAIT_SIZE + x];
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, onlyTop = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (onlyTop && y > cy) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** Trapezoid for shoulders: top width at y0 to bottom width at y1, centered on cx. */
  trap(cx: number, y0: number, y1: number, w0: number, w1: number, c: number): void {
    for (let y = y0; y <= y1; y++) {
      const w = w0 + ((w1 - w0) * (y - y0)) / Math.max(1, y1 - y0);
      this.rect(Math.round(cx - w / 2), y, Math.round(cx + w / 2), y, c);
    }
  }
  /** Outline every filled shape with color c where it touches empty space. */
  outline(c: number): void {
    const copy = this.px.slice();
    for (let y = 0; y < PORTRAIT_SIZE; y++)
      for (let x = 0; x < PORTRAIT_SIZE; x++) {
        if (copy[y * PORTRAIT_SIZE + x] !== 0) continue;
        const n = [
          copy[y * PORTRAIT_SIZE + x - 1],
          copy[y * PORTRAIT_SIZE + x + 1],
          y > 0 ? copy[(y - 1) * PORTRAIT_SIZE + x] : 0,
          y < PORTRAIT_SIZE - 1 ? copy[(y + 1) * PORTRAIT_SIZE + x] : 0,
        ];
        if ((x > 0 && n[0]) || (x < PORTRAIT_SIZE - 1 && n[1]) || n[2] || n[3]) this.set(x, y, c);
      }
  }
}

/** Brows for an expression: left and right brow from inner (x near 32) to outer. */
function brows(g: Grid, mood: Expression, y: number, c: number, spread = 7, len = 6): void {
  const L0 = 32 - spread + 1;
  const R0 = 32 + spread - 1;
  const tilt = mood === 'angry' ? 2 : mood === 'worried' ? -2 : mood === 'happy' ? -1 : 0;
  // Inner end moves down for angry, up for worried.
  g.line(L0, y + tilt, L0 - len, y - (mood === 'happy' ? 1 : 0), c);
  g.line(R0, y + tilt, R0 + len, y - (mood === 'happy' ? 1 : 0), c);
  g.line(L0, y + tilt + 1, L0 - len, y + 1 - (mood === 'happy' ? 1 : 0), c);
  g.line(R0, y + tilt + 1, R0 + len, y + 1 - (mood === 'happy' ? 1 : 0), c);
}

function mouth(g: Grid, mood: Expression, cx: number, y: number, w: number, c: number, teeth?: number): void {
  if (mood === 'happy') {
    g.line(cx - w, y - 1, cx - w + 2, y + 1, c);
    g.line(cx - w + 2, y + 1, cx + w - 2, y + 1, c);
    g.line(cx + w - 2, y + 1, cx + w, y - 1, c);
    if (teeth) g.rect(cx - w + 3, y, cx + w - 3, y, teeth);
  } else if (mood === 'angry') {
    g.line(cx - w, y + 1, cx - w + 2, y, c);
    g.line(cx - w + 2, y, cx + w - 2, y, c);
    g.line(cx + w - 2, y, cx + w, y + 1, c);
  } else if (mood === 'worried') {
    g.line(cx - w + 1, y + 1, cx - 1, y, c);
    g.line(cx - 1, y, cx + 1, y + 1, c);
    g.line(cx + 1, y + 1, cx + w - 1, y, c);
  } else g.line(cx - w + 1, y, cx + w - 1, y, c);
}

function kessler(mood: Expression): PixelMap {
  // 1 outline, 2 skin, 3 shade, 4 hair, 5 hair dark, 6 suit, 7 shirt, 8 tie, 9 frame, 10 lens, 11 mouth, 12 eye, 13 pupil, 14 suit light
  const palette = [
    '',
    '#0a0716',
    '#e2ad8c',
    '#b67b5d',
    '#a7adbd',
    '#6d7386',
    '#1d2747',
    '#eceef6',
    '#b3203d',
    '#1a1a26',
    '#78c9f5',
    '#6b2830',
    '#f4f4f4',
    '#0e0e16',
    '#2f3d66',
  ];
  const g = new Grid();
  g.trap(32, 46, 63, 30, 58, 6);
  g.trap(32, 50, 63, 10, 20, 14);
  g.trap(32, 46, 58, 12, 2, 7);
  g.rect(31, 47, 33, 60, 8);
  g.rect(30, 47, 34, 49, 8);
  g.rect(27, 40, 37, 47, 3);
  g.ellipse(18, 27, 3, 4, 3);
  g.ellipse(46, 27, 3, 4, 3);
  g.ellipse(32, 27, 13, 16, 2);
  g.rect(21, 30, 43, 38, 2);
  g.ellipse(32, 38, 11, 6, 2);
  g.ellipse(32, 15, 14, 8, 4, true);
  g.rect(18, 15, 20, 24, 5);
  g.rect(44, 15, 46, 24, 5);
  g.line(22, 10, 42, 10, 5);
  g.line(20, 13, 44, 13, 5);
  // glasses
  g.rect(21, 23, 30, 29, 9);
  g.rect(34, 23, 43, 29, 9);
  g.rect(22, 24, 29, 28, 10);
  g.rect(35, 24, 42, 28, 10);
  g.line(30, 25, 34, 25, 9);
  const eyeY = mood === 'worried' ? 26 : 26;
  g.rect(24, eyeY - 1, 27, eyeY + 1, 12);
  g.rect(37, eyeY - 1, 40, eyeY + 1, 12);
  g.rect(25, eyeY, 26, eyeY, 13);
  g.rect(38, eyeY, 39, eyeY, 13);
  if (mood === 'angry') {
    g.rect(22, 24, 29, 24, 9);
    g.rect(35, 24, 42, 24, 9);
  }
  brows(g, mood, 20, 5, 7, 7);
  g.line(32, 28, 32, 33, 3);
  g.set(31, 34, 3);
  g.set(33, 34, 3);
  mouth(g, mood, 32, 39, 5, 11);
  if (mood === 'happy') g.line(24, 36, 25, 37, 3);
  g.outline(1);
  return { size: PORTRAIT_SIZE, palette, pixels: g.px };
}

function ines(mood: Expression): PixelMap {
  // 1 outline, 2 skin, 3 shade, 4 hair, 5 hair light, 6 jacket, 7 jacket light, 8 shirt, 9 gold, 10 eye, 11 mouth, 12 eye white, 13 scar
  const palette = [
    '',
    '#0a0716',
    '#c98c5f',
    '#9a6242',
    '#2e1b12',
    '#5a3727',
    '#26262e',
    '#474756',
    '#2aa39c',
    '#ffcf40',
    '#1b0f08',
    '#7a2e2e',
    '#f2eee6',
    '#b47455',
  ];
  const g = new Grid();
  // hair volume behind the head (curls)
  g.ellipse(32, 26, 21, 22, 4);
  for (const [x, y] of [
    [12, 20],
    [14, 34],
    [52, 20],
    [50, 34],
    [20, 8],
    [44, 8],
    [32, 5],
    [11, 28],
    [53, 28],
  ])
    g.ellipse(x, y, 5, 5, 4);
  for (const [x, y] of [
    [20, 10],
    [42, 9],
    [14, 24],
    [50, 24],
  ])
    g.ellipse(x, y, 2, 2, 5);
  // jacket and shirt
  g.trap(32, 47, 63, 26, 60, 6);
  g.trap(32, 47, 60, 10, 4, 8);
  g.line(22, 48, 29, 62, 7);
  g.line(42, 48, 35, 62, 7);
  g.rect(28, 41, 36, 48, 3);
  // face
  g.ellipse(32, 29, 12, 15, 2);
  g.ellipse(32, 38, 9, 6, 2);
  g.set(44, 33, 9);
  g.set(44, 34, 9);
  // bangs
  g.ellipse(32, 17, 13, 6, 4, true);
  g.line(21, 17, 26, 21, 4);
  g.line(43, 17, 38, 21, 4);
  // eyes
  const open = mood === 'worried' ? 2 : mood === 'angry' ? 1 : 1;
  g.rect(24, 27, 28, 27 + open, 12);
  g.rect(36, 27, 40, 27 + open, 12);
  g.rect(26, 27, 27, 27 + open, 10);
  g.rect(37, 27, 38, 27 + open, 10);
  brows(g, mood, 23, 4, 6, 6);
  // nose, scar
  g.line(32, 29, 31, 34, 3);
  g.line(40, 33, 42, 35, 13);
  // mouth: a smirk when happy
  if (mood === 'happy') {
    g.line(28, 40, 34, 40, 11);
    g.line(34, 40, 36, 38, 11);
  } else mouth(g, mood, 32, 40, 4, 11);
  g.outline(1);
  return { size: PORTRAIT_SIZE, palette, pixels: g.px };
}

function bradley(mood: Expression): PixelMap {
  // 1 outline, 2 skin, 3 shade, 4 hair, 5 hair shade, 6 polo, 7 collar, 8 shades frame, 9 shades lens, 10 eye, 11 mouth, 12 eye white, 13 teeth
  const palette = [
    '',
    '#0a0716',
    '#f1bca3',
    '#cf8b76',
    '#ffd95e',
    '#d4a52c',
    '#ff79b0',
    '#fbf6ff',
    '#1b1b22',
    '#4c4cae',
    '#1f5f9a',
    '#8a2f45',
    '#f7f7f7',
    '#ffffff',
  ];
  const g = new Grid();
  g.trap(32, 47, 63, 28, 60, 6);
  // popped collar
  g.line(24, 44, 28, 52, 7);
  g.line(25, 44, 29, 52, 7);
  g.line(40, 44, 36, 52, 7);
  g.line(39, 44, 35, 52, 7);
  g.rect(29, 41, 35, 48, 3);
  g.ellipse(32, 29, 12, 15, 2);
  g.ellipse(32, 38, 9, 6, 2);
  g.ellipse(20, 30, 2, 3, 3);
  g.ellipse(44, 30, 2, 3, 3);
  // the swoop
  g.ellipse(30, 15, 16, 9, 4, true);
  g.ellipse(40, 16, 10, 5, 4);
  g.line(18, 16, 24, 22, 5);
  g.line(44, 20, 47, 26, 4);
  g.line(25, 12, 40, 14, 5);
  // sunglasses perched on the hair
  g.rect(20, 9, 29, 12, 8);
  g.rect(35, 9, 44, 12, 8);
  g.rect(21, 10, 28, 11, 9);
  g.rect(36, 10, 43, 11, 9);
  g.line(29, 10, 35, 10, 8);
  // eyes
  const wide = mood === 'worried' ? 2 : 1;
  const lid = mood === 'happy' ? 1 : 0;
  g.rect(24, 27 + lid, 28, 27 + wide, 12);
  g.rect(36, 27 + lid, 40, 27 + wide, 12);
  g.rect(26, 27 + lid, 27, 27 + wide, 10);
  g.rect(37, 27 + lid, 38, 27 + wide, 10);
  brows(g, mood, 23, 5, 6, 6);
  g.line(32, 29, 33, 34, 3);
  if (mood === 'neutral') {
    // the smirk
    g.line(28, 40, 34, 40, 11);
    g.line(34, 40, 37, 38, 11);
  } else mouth(g, mood, 32, 40, 5, 11, 13);
  g.outline(1);
  return { size: PORTRAIT_SIZE, palette, pixels: g.px };
}

function comply(mood: Expression): PixelMap {
  // 1 outline, 2 casing, 3 casing dark, 4 screen, 5 magenta, 6 green, 7 red, 8 amber, 9 bolt
  const palette = [
    '',
    '#0a0716',
    '#5c5c7c',
    '#3a3a52',
    '#12081f',
    '#ff3ea5',
    '#3eff9a',
    '#ff4f6d',
    '#ffbf3e',
    '#9a9ab8',
  ];
  const g = new Grid();
  g.trap(32, 50, 63, 24, 56, 3);
  g.rect(27, 46, 37, 52, 2);
  g.rect(12, 12, 52, 47, 2);
  g.rect(12, 44, 52, 47, 3);
  g.rect(16, 16, 48, 41, 4);
  g.line(32, 4, 32, 11, 3);
  g.ellipse(32, 4, 2, 2, mood === 'angry' ? 7 : mood === 'happy' ? 6 : 5);
  for (const [x, y] of [
    [14, 14],
    [50, 14],
    [14, 45],
    [50, 45],
  ])
    g.set(x, y, 9);
  const c = mood === 'angry' ? 7 : mood === 'happy' ? 6 : mood === 'worried' ? 8 : 5;
  if (mood === 'happy') {
    g.line(21, 27, 24, 24, c);
    g.line(24, 24, 27, 27, c);
    g.line(37, 27, 40, 24, c);
    g.line(40, 24, 43, 27, c);
  } else if (mood === 'angry') {
    g.line(20, 23, 28, 26, c);
    g.rect(21, 26, 27, 28, c);
    g.line(44, 23, 36, 26, c);
    g.rect(37, 26, 43, 28, c);
  } else if (mood === 'worried') {
    g.rect(22, 24, 26, 27, c);
    g.rect(38, 24, 42, 27, c);
    g.line(16, 31, 48, 31, 3);
  } else {
    g.rect(21, 24, 27, 27, c);
    g.rect(37, 24, 43, 27, c);
  }
  for (let x = 22; x <= 42; x += 4)
    g.rect(x, mood === 'happy' ? 35 : 36, x + 2, mood === 'happy' ? 36 : 36, c);
  g.outline(1);
  return { size: PORTRAIT_SIZE, palette, pixels: g.px };
}

const PAINTERS: Record<CharacterId, (m: Expression) => PixelMap> = { kessler, ines, bradley, comply };
const cache = new Map<string, PixelMap>();

export function portrait(id: CharacterId, mood: Expression): PixelMap {
  const key = `${id}:${mood}`;
  let p = cache.get(key);
  if (!p) {
    p = PAINTERS[id](mood);
    cache.set(key, p);
  }
  return p;
}

export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'angry', 'worried'];
