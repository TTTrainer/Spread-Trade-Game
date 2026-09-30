/**
 * Art slots for The Pad. The scene is laid out on a 320x180 grid, and uploaded pictures are drawn
 * at twice that (640x360 for a whole room), so each pixel of art is half a grid step: twice the
 * detail of the code-drawn fallback. Sizes here are the PNG sizes; anchors are grid positions.
 * Anything not uploaded falls back to the code drawing, one piece at a time.
 */

import { COLLECTIONS } from './meta';
import { PAD_TIERS, SETUP_TRACKS } from './meta';

export interface PadArt {
  /** File is `pad-<id>.png`. */
  id: string;
  name: string;
  /** PNG size in pixels. */
  w: number;
  h: number;
  /** Grid position (320x180): the top-left corner, or the bottom-center point for 'bottom'. */
  x: number;
  y: number;
  anchor: 'topleft' | 'bottom';
  what: string;
  idea: string;
}

const ROOM_IDEAS: Record<string, string> = {
  studio:
    'a cramped studio at night: one small window with a distant city, peeling wallpaper, a radiator, bare floorboards',
  loft: 'an industrial loft at night: exposed brick, a huge steel-framed window onto a lit skyline, wide plank floor',
  penthouse:
    'a penthouse at night: floor-to-ceiling glass over a neon skyline far below, polished dark floor, clean lines',
  orbital:
    'an orbital suite: a curved hull with a huge round viewport onto Earth and stars, metal floor panels with cyan light strips',
};

const MONITOR_IDEAS = [
  'a thin laptop, open, a candlestick chart on screen',
  'two monitors side by side on stands, charts on both',
  'three monitors in a slight arc, charts and an option chain',
  'four monitors, two over two, charts glowing',
  'a six-screen wall, two rows of three, the trading-floor look',
];
const CHAIR_IDEAS = [
  'a grey metal folding chair, seen from behind',
  'a black mesh office chair on a five-star base, seen from behind',
  'a red-and-black racing chair with a tall winged back, seen from behind',
  'a tufted oxblood leather throne with gold studs, seen from behind',
];
const PLANT_IDEAS = [
  '',
  'a succulent in a small terracotta pot',
  'a lush fern in a clay pot',
  'a tall indoor fig tree in a concrete planter',
];

export const PAD_ART: PadArt[] = [
  ...PAD_TIERS.map((t): PadArt => ({
    id: `room_${t.id}`,
    name: `${t.name} (room)`,
    w: 640,
    h: 360,
    x: 0,
    y: 0,
    anchor: 'topleft',
    what: `The whole ${t.name} room with no furniture: walls, window, floor. The floor line sits 264 px down.`,
    idea: ROOM_IDEAS[t.id] ?? '',
  })),
  {
    id: 'desk',
    name: 'Desk',
    w: 288,
    h: 80,
    x: 130,
    y: 108,
    anchor: 'topleft',
    what: 'The trading desk seen from the front: a long top and two legs, nothing on it.',
    idea: 'a long dark desk with a thin top and two slim legs, a faint cyan edge light',
  },
  ...SETUP_TRACKS.monitors.levels.map((l, i): PadArt => ({
    id: `monitors_${i}`,
    name: l.name,
    w: 224,
    h: 96,
    x: 198,
    y: 110,
    anchor: 'bottom',
    what: `${l.name} standing on the desk, keyboard in front (bottom edge sits on the desk top).`,
    idea: MONITOR_IDEAS[i] ?? '',
  })),
  ...SETUP_TRACKS.chair.levels.map((l, i): PadArt => ({
    id: `chair_${i}`,
    name: l.name,
    w: 80,
    h: 128,
    x: 198,
    y: 152,
    anchor: 'bottom',
    what: `${l.name}, seen from behind, in front of the desk.`,
    idea: CHAIR_IDEAS[i] ?? '',
  })),
  ...SETUP_TRACKS.plants.levels.slice(1).map((l, i): PadArt => ({
    id: `plant_${i + 1}`,
    name: l.name,
    w: 80,
    h: 160,
    x: 291,
    y: 132,
    anchor: 'bottom',
    what: `${l.name} standing on the floor at the right.`,
    idea: PLANT_IDEAS[i + 1] ?? '',
  })),
  {
    id: 'light_0',
    name: 'Fluorescent tube',
    w: 128,
    h: 16,
    x: 180,
    y: 2,
    anchor: 'topleft',
    what: 'A ceiling fluorescent tube, lit (it hangs from the top edge).',
    idea: 'a buzzing white fluorescent tube in a metal holder',
  },
  {
    id: 'light_1',
    name: 'Desk lamp',
    w: 48,
    h: 48,
    x: 236,
    y: 110,
    anchor: 'bottom',
    what: 'An architect desk lamp standing on the desk, lit.',
    idea: 'a bent-arm desk lamp with a warm amber glow',
  },
  {
    id: 'light_2',
    name: 'Neon strip',
    w: 640,
    h: 24,
    x: 0,
    y: 4,
    anchor: 'topleft',
    what: 'A magenta neon strip across the top of the wall, with its glow (transparent elsewhere).',
    idea: 'a thin hot-pink neon tube with a soft glow bleeding down',
  },
  {
    id: 'light_3',
    name: 'Aurora ceiling',
    w: 640,
    h: 96,
    x: 0,
    y: 0,
    anchor: 'topleft',
    what: 'Aurora light bands across the ceiling (mostly transparent, soft colored ribbons).',
    idea: 'green, cyan, violet and pink aurora ribbons, semi-transparent',
  },
  ...COLLECTIONS.art.items.map((a): PadArt => ({
    id: a.id,
    name: a.name,
    w: 44,
    h: 36,
    x: 0,
    y: 0,
    anchor: 'topleft',
    what: `A framed painting for the wall: "${a.name}" (${a.blurb}) Include the frame.`,
    idea: `a small framed painting in a gold frame: ${a.blurb.replace(/\.$/, '')}`,
  })),
  ...COLLECTIONS.watches.items.map((w): PadArt => ({
    id: w.id,
    name: w.name,
    w: 24,
    h: 24,
    x: 0,
    y: 0,
    anchor: 'topleft',
    what: `A wristwatch, face up, for the display case: ${w.name}.`,
    idea: `a ${w.name.toLowerCase()} lying face up`,
  })),
  ...COLLECTIONS.vehicles.items.map((v): PadArt => ({
    id: v.id,
    name: v.name,
    w: 144,
    h: 64,
    x: 59,
    y: 165,
    anchor: 'bottom',
    what: `${v.name}, side view, parked on the showroom plinth (bottom edge touches it).`,
    idea: `a sleek ${v.name.toLowerCase()} in side view, retro-futurist`,
  })),
  ...[
    ['mug', "Ines's Mug", 'a white coffee mug with a red stripe'],
    ['duck', 'Rubber Duck', 'a yellow rubber duck'],
    ['bonsai', 'Bonsai', 'a tiny bonsai tree in a dish'],
    ['lava', 'Lava Lamp', 'a purple lava lamp with pink blobs'],
    ['bell', 'Closing Bell', 'a small brass bell on a wooden base'],
    ['trophy', 'Tier 8 Trophy', 'a small gold trophy cup'],
  ].map(([id, name, idea]): PadArt => ({
    id: `item_${id}`,
    name,
    w: 24,
    h: 28,
    x: 0,
    y: 0,
    anchor: 'bottom',
    what: `${name}, standing on the desk.`,
    idea,
  })),
];

export const PAD_ART_BY_ID: Record<string, PadArt> = Object.fromEntries(PAD_ART.map((a) => [a.id, a]));
