/**
 * The Pad: a pixel-art apartment drawn in code on a 320x180 canvas (scaled up with crisp pixels).
 * Everything is original: rectangles and a few hand-placed pixels, no image files.
 */

import { COLLECTIONS, type CollectionId } from '../../content/meta';
import type { Profile } from '../../engine/meta/profile';

export const PAD_W = 320;
export const PAD_H = 180;

type Ctx = CanvasRenderingContext2D;

function rect(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Small deterministic hash so each art piece and star field is stable. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FLOOR_Y = 132;

// ---------------- rooms ----------------

function studio(g: Ctx): void {
  rect(g, 0, 0, PAD_W, FLOOR_Y, '#1c1530');
  for (let x = 0; x < PAD_W; x += 16) rect(g, x, 0, 1, FLOOR_Y, '#221a3a');
  // Small window with the night city.
  rect(g, 20, 22, 70, 50, '#3a2f5c');
  rect(g, 23, 25, 64, 44, '#0b0d22');
  const r = lcg(7);
  for (let i = 0; i < 9; i++) {
    const bx = 24 + i * 7;
    const bh = 10 + Math.floor(r() * 24);
    rect(g, bx, 69 - bh, 6, bh, '#161a36');
    for (let y = 69 - bh + 2; y < 67; y += 4) if (r() > 0.55) rect(g, bx + 2, y, 2, 2, '#ffd36b');
  }
  rect(g, 54, 25, 1, 44, '#3a2f5c');
  // Radiator.
  rect(g, 100, 108, 34, 22, '#4b4466');
  for (let x = 102; x < 132; x += 4) rect(g, x, 110, 2, 18, '#5d5680');
  // Floorboards.
  rect(g, 0, FLOOR_Y, PAD_W, PAD_H - FLOOR_Y, '#2b1d16');
  for (let y = FLOOR_Y + 6; y < PAD_H; y += 8) rect(g, 0, y, PAD_W, 1, '#22160f');
}

function loft(g: Ctx): void {
  rect(g, 0, 0, PAD_W, FLOOR_Y, '#4a2322');
  for (let y = 0; y < FLOOR_Y; y += 6) {
    rect(g, 0, y, PAD_W, 1, '#2e1515');
    const off = (y / 6) % 2 ? 0 : 7;
    for (let x = off; x < PAD_W; x += 14) rect(g, x, y, 1, 6, '#2e1515');
  }
  // Tall arched window with the skyline.
  rect(g, 14, 14, 110, 92, '#1b1b22');
  rect(g, 18, 18, 102, 84, '#1a2350');
  for (let i = 0; i < 20; i++) rect(g, 18, 18 + i * 2, 102, 2, i < 10 ? '#20306a' : '#2a2a70');
  const r = lcg(11);
  for (let i = 0; i < 12; i++) {
    const bx = 18 + i * 9;
    const bh = 20 + Math.floor(r() * 44);
    rect(g, bx, 102 - bh, 8, bh, '#0f1330');
    for (let y = 102 - bh + 3; y < 100; y += 5) if (r() > 0.5) rect(g, bx + 3, y, 2, 2, '#ffe08a');
  }
  rect(g, 68, 18, 2, 84, '#1b1b22');
  rect(g, 18, 58, 102, 2, '#1b1b22');
  // Floor.
  rect(g, 0, FLOOR_Y, PAD_W, PAD_H - FLOOR_Y, '#5a3a22');
  for (let y = FLOOR_Y + 5; y < PAD_H; y += 7) rect(g, 0, y, PAD_W, 1, '#4a2e1a');
}

function penthouse(g: Ctx): void {
  // Glass wall, sunset.
  const bands = ['#2b0f4c', '#4a1260', '#7a1a6a', '#b0306a', '#e0556a', '#ff8a5c', '#ffb55c'];
  const bh = FLOOR_Y / bands.length;
  bands.forEach((c, i) => rect(g, 0, i * bh, PAD_W, bh + 1, c));
  rect(g, 200, 70, 30, 30, '#ffd27a');
  rect(g, 196, 78, 38, 14, '#ffd27a');
  const r = lcg(23);
  for (let i = 0; i < 40; i++) {
    const bx = i * 8;
    const h = 25 + Math.floor(r() * 60);
    rect(g, bx, FLOOR_Y - h, 8, h, '#1a0a26');
    for (let y = FLOOR_Y - h + 4; y < FLOOR_Y - 4; y += 6) if (r() > 0.6) rect(g, bx + 3, y, 2, 2, '#ffcf6b');
  }
  for (let x = 0; x < PAD_W; x += 64) rect(g, x, 0, 3, FLOOR_Y, '#0e0a18');
  rect(g, 0, 0, PAD_W, 4, '#0e0a18');
  // Marble floor.
  rect(g, 0, FLOOR_Y, PAD_W, PAD_H - FLOOR_Y, '#d8d2e6');
  for (let x = 0; x < PAD_W; x += 24) rect(g, x, FLOOR_Y, 1, PAD_H - FLOOR_Y, '#b8b0cc');
  rect(g, 0, FLOOR_Y + 22, PAD_W, 1, '#b8b0cc');
}

function orbital(g: Ctx): void {
  rect(g, 0, 0, PAD_W, FLOOR_Y, '#15182a');
  const r = lcg(97);
  for (let i = 0; i < 70; i++)
    rect(g, Math.floor(r() * PAD_W), Math.floor(r() * FLOOR_Y), 1, 1, r() > 0.8 ? '#ffffff' : '#8890c0');
  // Viewport with Earth.
  const cx = 70;
  const cy = 66;
  for (let y = -52; y <= 52; y++) {
    const w = Math.floor(Math.sqrt(52 * 52 - y * y));
    rect(g, cx - w, cy + y, w * 2, 1, '#05060f');
  }
  for (let y = 0; y <= 40; y++) {
    const w = Math.floor(Math.sqrt(90 * 90 - (y + 50) * (y + 50)) || 0);
    if (w > 0)
      rect(g, cx - Math.min(w, 50), cy + 52 - 40 + y, Math.min(w, 50) * 2, 1, y < 3 ? '#8fd8ff' : '#1f5fb0');
  }
  rect(g, cx - 20, cy + 28, 14, 4, '#2f9e5a');
  rect(g, cx + 8, cy + 34, 18, 3, '#2f9e5a');
  rect(g, cx - 34, cy + 36, 10, 2, '#e8f4ff');
  for (let a = 0; a < 360; a += 3) {
    const x = cx + Math.cos((a * Math.PI) / 180) * 54;
    const y = cy + Math.sin((a * Math.PI) / 180) * 54;
    rect(g, x - 1, y - 1, 3, 3, '#6a7090');
  }
  // Hull panels.
  for (let x = 140; x < PAD_W; x += 30) rect(g, x, 0, 1, FLOOR_Y, '#22263e');
  for (let y = 20; y < FLOOR_Y; y += 36) rect(g, 130, y, PAD_W - 130, 1, '#22263e');
  rect(g, 0, FLOOR_Y, PAD_W, PAD_H - FLOOR_Y, '#2a2e44');
  for (let x = 0; x < PAD_W; x += 20) rect(g, x, FLOOR_Y, 1, PAD_H - FLOOR_Y, '#383d5a');
  rect(g, 0, FLOOR_Y, PAD_W, 2, '#00e5ff');
}

// ---------------- lighting ----------------

function lighting(g: Ctx, level: number): void {
  if (level === 0) {
    rect(g, 150, 2, 60, 3, '#e8f0ff');
    g.globalAlpha = 0.05;
    rect(g, 0, 0, PAD_W, PAD_H, '#c8e0ff');
  } else if (level === 1) {
    g.globalAlpha = 0.12;
    for (let i = 0; i < 12; i++) rect(g, 214 - i * 4, 92 + i * 3, 20 + i * 8, 3, '#ffcf7a');
  } else if (level === 2) {
    rect(g, 0, 4, PAD_W, 2, '#ff2fd0');
    g.globalAlpha = 0.1;
    rect(g, 0, 6, PAD_W, 20, '#ff2fd0');
  } else {
    const bands = ['#2de2a6', '#47d7ff', '#9d7bff', '#ff2fd0'];
    g.globalAlpha = 0.14;
    bands.forEach((c, i) => rect(g, 0, i * 7, PAD_W, 7, c));
  }
  g.globalAlpha = 1;
  if (level === 1) {
    // The lamp itself.
    rect(g, 236, 96, 2, 14, '#303040');
    rect(g, 230, 92, 12, 5, '#ffb347');
  }
}

// ---------------- desk ----------------

function desk(g: Ctx, monitors: number): void {
  const x0 = 150;
  const top = 110;
  // Desk.
  rect(g, x0 - 20, top, 140, 5, '#3a3448');
  rect(g, x0 - 20, top + 5, 140, 2, '#241f30');
  rect(g, x0 - 16, top + 7, 4, 28, '#241f30');
  rect(g, x0 + 112, top + 7, 4, 28, '#241f30');
  // Screens.
  const screens = monitors === 0 ? 0 : [0, 2, 3, 4, 6][monitors];
  const chart = (sx: number, sy: number, w: number, h: number, seed: number) => {
    rect(g, sx, sy, w, h, '#05081a');
    const r = lcg(seed);
    let y = sy + h / 2;
    for (let x = sx + 2; x < sx + w - 2; x += 3) {
      const ny = Math.max(sy + 2, Math.min(sy + h - 4, y + (r() - 0.45) * 6));
      const up = ny < y;
      rect(g, x, Math.min(y, ny), 2, Math.max(1, Math.abs(ny - y)), up ? '#2de2a6' : '#ff4f7b');
      y = ny;
    }
  };
  if (screens === 0) {
    // Laptop.
    rect(g, x0 + 30, top - 18, 36, 18, '#2a2a36');
    chart(x0 + 32, top - 16, 32, 14, 3);
    rect(g, x0 + 26, top - 1, 44, 2, '#3e3e4e');
  } else {
    const rows = screens > 3 ? 2 : 1;
    const perRow = Math.ceil(screens / rows);
    const w = 30;
    const h = 20;
    const totalW = perRow * (w + 2);
    const sx0 = x0 + 48 - totalW / 2;
    let n = 0;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < perRow && n < screens; i++, n++) {
        const sx = sx0 + i * (w + 2);
        const sy = top - 26 - row * (h + 3) - (rows === 2 && row === 0 ? 0 : 0);
        rect(g, sx - 1, sy - 1, w + 2, h + 2, '#1a1a24');
        chart(sx, sy, w, h, 17 + n * 13);
      }
    rect(g, x0 + 44, top - 5, 8, 5, '#1a1a24');
  }
  // Keyboard.
  rect(g, x0 + 30, top - 2, 34, 2, '#50506a');
}

/** The chair sits in front of the desk, seen from behind. */
function chair(g: Ctx, level: number): void {
  const cx = 198;
  const base = (y: number) => {
    rect(g, cx - 2, y, 4, 12, '#303040');
    rect(g, cx - 12, y + 12, 24, 2, '#303040');
    rect(g, cx - 13, y + 14, 3, 2, '#101018');
    rect(g, cx + 10, y + 14, 3, 2, '#101018');
    rect(g, cx - 1, y + 14, 3, 2, '#101018');
  };
  if (level === 0) {
    rect(g, cx - 12, 108, 24, 16, '#7a7a8a');
    rect(g, cx - 12, 108, 24, 2, '#9a9aaa');
    rect(g, cx - 11, 124, 2, 26, '#5a5a6a');
    rect(g, cx + 9, 124, 2, 26, '#5a5a6a');
  } else if (level === 1) {
    rect(g, cx - 13, 102, 26, 24, '#262e3e');
    for (let y = 104; y < 124; y += 3) rect(g, cx - 11, y, 22, 1, '#3e4a5e');
    base(126);
  } else if (level === 2) {
    rect(g, cx - 15, 96, 30, 30, '#b01848');
    rect(g, cx - 4, 96, 8, 30, '#18181e');
    rect(g, cx - 11, 99, 22, 3, '#18181e');
    rect(g, cx - 15, 96, 30, 2, '#ff4f7b');
    base(126);
  } else {
    rect(g, cx - 17, 90, 34, 36, '#4a2410');
    rect(g, cx - 15, 92, 30, 32, '#6a3418');
    for (let y = 96; y < 122; y += 6)
      for (let x = cx - 11; x < cx + 12; x += 8) rect(g, x, y, 2, 2, '#e8c15a');
    rect(g, cx - 17, 88, 34, 3, '#e8c15a');
    base(126);
  }
}

function plant(g: Ctx, level: number): void {
  if (level === 0) return;
  const x = 286;
  if (level === 1) {
    rect(g, x, 104, 10, 6, '#b06a3a');
    rect(g, x + 2, 98, 6, 6, '#3ea860');
    rect(g, x + 4, 96, 2, 2, '#5ed080');
  } else if (level === 2) {
    rect(g, x - 2, 116, 16, 16, '#8a4a2a');
    for (let i = 0; i < 7; i++) rect(g, x - 8 + i * 4, 96 + (i % 3) * 4, 3, 20 - (i % 3) * 4, '#2e9a52');
  } else {
    rect(g, x - 2, 116, 18, 16, '#5a5a6a');
    rect(g, x + 5, 70, 4, 46, '#6a4020');
    for (let i = 0; i < 5; i++)
      rect(g, x - 12 + i * 2, 50 + i * 5, 36 - i * 4, 6, i % 2 ? '#2e9a52' : '#3cb868');
  }
}

// ---------------- collections ----------------

const ART_SPOTS: [number, number][] = [
  [140, 20],
  [172, 16],
  [204, 22],
  [236, 16],
  [268, 22],
  [140, 50],
  [172, 48],
  [204, 54],
  [236, 48],
  [268, 54],
  [300, 16],
  [300, 46],
];

function artPiece(g: Ctx, id: string, x: number, y: number, colors: [string, string]): void {
  const w = 22;
  const h = 18;
  rect(g, x - 1, y - 1, w + 2, h + 2, '#e8c15a');
  rect(g, x, y, w, h, colors[1]);
  const kind = hash(id) % 4;
  const c = colors[0];
  if (kind === 0) {
    rect(g, x + 9, y + 3, 4, 12, c);
    rect(g, x + 10, y + 1, 2, 16, c);
  } else if (kind === 1) {
    for (let i = 0; i < 9; i++) rect(g, x + 2 + i * 2, y + 14 - i, 2, 2, c);
  } else if (kind === 2) {
    for (let yy = -5; yy <= 5; yy++) {
      const ww = Math.floor(Math.sqrt(25 - yy * yy));
      rect(g, x + 11 - ww, y + 9 + yy, ww * 2, 1, c);
    }
  } else {
    for (let i = 0; i < 5; i++) rect(g, x + 2 + i * 4, y + (i % 2 ? 4 : 10), 3, 5, c);
  }
}

function watchCase(g: Ctx, owned: string[]): void {
  const items = COLLECTIONS.watches.items.filter((w) => owned.includes(w.id));
  if (!items.length) return;
  const x = 18;
  const y = 112;
  rect(g, x - 2, y - 2, 58, 22, '#8890b0');
  rect(g, x, y, 54, 18, '#101424');
  items.forEach((w, i) => {
    const cx = x + 4 + (i % 4) * 13;
    const cy = y + 2 + Math.floor(i / 4) * 8;
    rect(g, cx + 1, cy, 4, 7, w.colors[1]);
    rect(g, cx, cy + 2, 6, 3, w.colors[0]);
  });
  rect(g, x - 2, y + 20, 58, 12, '#3a3448');
}

function vehicle(g: Ctx, owned: string[]): void {
  const items = COLLECTIONS.vehicles.items.filter((v) => owned.includes(v.id));
  if (!items.length) return;
  const top = items[items.length - 1];
  // A landing pad or garage bay in the lower left, the newest vehicle on it.
  const x = 30;
  const y = 150;
  // A showroom plinth with a neon edge and a spotlight.
  g.globalAlpha = 0.05;
  for (let i = 0; i < 20; i++) rect(g, x + 26 - i, y - 40 + i * 2.5, 6 + i * 2, 3, '#ffffff');
  g.globalAlpha = 1;
  rect(g, x - 8, y + 15, 74, 6, '#2a2a3a');
  rect(g, x - 8, y + 15, 74, 1, '#00e5ff');
  rect(g, x - 8, y + 21, 74, 1, '#ff2fd0');
  const [a, b] = top.colors;
  rect(g, x, y + 4, 58, 8, a);
  rect(g, x + 12, y - 2, 30, 7, b);
  rect(g, x + 16, y - 1, 10, 4, '#9fd8ff');
  rect(g, x + 28, y - 1, 10, 4, '#9fd8ff');
  rect(g, x + 4, y + 11, 8, 4, '#101018');
  rect(g, x + 44, y + 11, 8, 4, '#101018');
  // The rest of the fleet as badges.
  items.slice(0, -1).forEach((v, i) => {
    rect(g, 118 + i * 12, 170, 10, 5, v.colors[0]);
    rect(g, 120 + i * 12, 168, 6, 3, v.colors[1]);
  });
}

function deskItems(g: Ctx, items: string[]): void {
  const x0 = 136;
  const y = 110;
  let x = x0;
  for (const it of items) {
    if (it === 'mug') {
      rect(g, x, y - 7, 6, 7, '#f0e8d8');
      rect(g, x + 6, y - 5, 2, 3, '#f0e8d8');
      rect(g, x + 1, y - 5, 4, 1, '#c04040');
    } else if (it === 'duck') {
      rect(g, x, y - 4, 7, 4, '#ffd23a');
      rect(g, x + 4, y - 7, 4, 4, '#ffd23a');
      rect(g, x + 8, y - 6, 2, 1, '#ff8a3d');
    } else if (it === 'bonsai') {
      rect(g, x, y - 3, 8, 3, '#6a4a3a');
      rect(g, x + 3, y - 7, 2, 4, '#6a4020');
      rect(g, x - 1, y - 11, 10, 4, '#2e9a52');
    } else if (it === 'lava') {
      rect(g, x + 1, y - 12, 5, 12, '#402060');
      rect(g, x + 2, y - 10, 3, 3, '#ff4f7b');
      rect(g, x + 2, y - 5, 3, 2, '#ff8a3d');
    } else if (it === 'bell') {
      rect(g, x, y - 2, 8, 2, '#6a4020');
      rect(g, x + 1, y - 7, 6, 5, '#e8c15a');
      rect(g, x + 3, y - 9, 2, 2, '#e8c15a');
    } else if (it === 'trophy') {
      rect(g, x + 1, y - 2, 6, 2, '#6a4020');
      rect(g, x + 3, y - 5, 2, 3, '#e8c15a');
      rect(g, x, y - 11, 8, 6, '#e8c15a');
    }
    x -= 11;
  }
}

export interface PadView {
  tier: number;
  items: string[];
  setup: Profile['pad']['setup'];
  deskItems: string[];
}

export function drawPad(g: Ctx, v: PadView): void {
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, PAD_W, PAD_H);
  [studio, loft, penthouse, orbital][Math.max(0, Math.min(3, v.tier))](g);
  const cols: CollectionId[] = ['art'];
  let spot = 0;
  for (const col of cols)
    for (const item of COLLECTIONS[col].items)
      if (v.items.includes(item.id) && spot < ART_SPOTS.length) {
        const [x, y] = ART_SPOTS[spot++];
        artPiece(g, item.id, x, y, item.colors);
      }
  lighting(g, v.setup.lighting);
  plant(g, v.setup.plants);
  desk(g, v.setup.monitors);
  deskItems(g, v.deskItems);
  chair(g, v.setup.chair);
  watchCase(g, v.items);
  vehicle(g, v.items);
}
