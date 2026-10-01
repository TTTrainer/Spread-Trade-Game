/**
 * Art slots for The Pad. The scene is laid out on a 320x180 grid and drawn at twice that, so a
 * whole room is a 640x360 picture. Every other piece stands on the bottom edge of its PNG with a
 * transparent background; the scene trims the empty margin and fits the piece into its spot
 * (see src/ui/pad/scene.ts), so a picture a little off the listed size still lands in place.
 * Anything not uploaded falls back to the code drawing, one piece at a time.
 */

import { COLLECTIONS, COSMETICS, PAD_TIERS, SETUP_TRACKS } from './meta';

export interface PadArt {
  /** File is `pad-<id>.png`. */
  id: string;
  name: string;
  /** PNG size in pixels. */
  w: number;
  h: number;
  what: string;
  idea: string;
}

const ROOM_IDEAS: Record<string, string> = {
  studio: 'a small studio at night: big window onto the skyline, a bed, a bookshelf, one painting',
  loft: 'a loft living room at night: tall window, couch, wall of lit shelves, a ceiling lamp',
  penthouse: 'a penthouse lounge: brick feature wall under a spotlight, a TV console, a glowing display case',
  orbital: 'a top-floor villa: a stone fireplace between two floor-to-ceiling windows onto the skyline',
};

const DESK_IDEAS = [
  'a plain grey metal desk with drawers on both sides',
  'a modern desk with a blue glass top and steel drawers',
  'a dark walnut desk with drawer pedestals',
  'an executive desk in brass and dark wood',
  'a legendary gold-trimmed desk with a lit edge',
];
const MONITOR_IDEAS = [
  '',
  'two monitors side by side, charts on both',
  'three monitors in an arc, charts on each',
  'a command center: two side monitors and a wide world-map screen',
];
const CHAIR_IDEAS = [
  'a navy office chair, facing you',
  'a black-and-red racing chair',
  'a light grey mesh chair',
  'a tan leather chair',
  'a black and gold executive throne',
];
const PLANT_IDEAS = [
  '',
  'a succulent in a small white pot',
  'a palm in a grey pot',
  'a monstera in a grey pot',
  'a bonsai in a shallow dish',
  'a snake plant in a grey pot',
  'a vine in a hanging basket',
];
const LAMP_IDEAS = [
  'a bent-arm desk lamp in bronze',
  'a slim bar lamp on a stand',
  "a green banker's lamp",
  'a pink neon tube on a stand',
  'a glowing amber orb on a wooden base',
];

const DESK_ITEM_IDEAS: Record<string, string> = {
  mug: 'a white coffee mug',
  duck: 'a yellow rubber duck',
  bonsai: 'a small succulent in a white pot',
  lava: 'a purple lava lamp with pink blobs',
  bell: 'a small brass bell on a wooden base',
  trophy: 'a gold bull trophy',
  notebook: 'an open notebook with a pen',
  water: 'a steel water bottle',
  pens: 'a cup of pens',
  sticky: 'a pad of sticky notes',
  phone: 'a phone on a stand',
  headphones: 'studio headphones',
  books: 'a short stack of books',
  controller: 'a game controller',
  photo: 'a framed photo of a dog',
  cube: 'a puzzle cube',
  coins: 'stacks of gold coins',
};

const live = <T extends { retired?: boolean }>(xs: T[]): T[] => xs.filter((x) => !x.retired);

export const PAD_ART: PadArt[] = [
  ...PAD_TIERS.map((t): PadArt => ({
    id: `room_${t.id}`,
    name: `${t.name} (room)`,
    w: 640,
    h: 360,
    what: `The whole ${t.name} room, furnished, with open floor at the bottom center for the desk.`,
    idea: ROOM_IDEAS[t.id] ?? '',
  })),
  ...SETUP_TRACKS.desk.levels.map((l, i): PadArt => ({
    id: `desk_${i}`,
    name: l.name,
    w: 320,
    h: 112,
    what: `${l.name} seen from the front, nothing on it.`,
    idea: DESK_IDEAS[i] ?? '',
  })),
  {
    id: 'item_laptop',
    name: 'One laptop',
    w: 96,
    h: 80,
    what: 'A closed or open laptop lying on the desk (the first monitor level).',
    idea: 'a slim laptop',
  },
  ...SETUP_TRACKS.monitors.levels.slice(1).map((l, i): PadArt => ({
    id: `monitors_${i + 1}`,
    name: l.name,
    w: 400,
    h: 160,
    what: `${l.name} on their stands (bottom edge sits on the desk).`,
    idea: MONITOR_IDEAS[i + 1] ?? '',
  })),
  ...SETUP_TRACKS.chair.levels.map((l, i): PadArt => ({
    id: `chair_${i}`,
    name: l.name,
    w: 128,
    h: 160,
    what: `${l.name}, standing beside the desk.`,
    idea: CHAIR_IDEAS[i] ?? '',
  })),
  ...SETUP_TRACKS.plants.levels.slice(1).map((l, i): PadArt => ({
    id: `plant_${i + 1}`,
    name: l.name,
    w: 128,
    h: 160,
    what: i + 1 === 6 ? `${l.name}, hanging from the ceiling.` : `${l.name} standing on the floor.`,
    idea: PLANT_IDEAS[i + 1] ?? '',
  })),
  ...SETUP_TRACKS.lighting.levels.map((l, i): PadArt => ({
    id: `light_${i}`,
    name: l.name,
    w: 112,
    h: 150,
    what: `${l.name}, standing on the desk, lit.`,
    idea: LAMP_IDEAS[i] ?? '',
  })),
  ...live(COLLECTIONS.art.items).map((a): PadArt => ({
    id: a.id,
    name: a.name,
    w: 240,
    h: 180,
    what: `A framed painting for the wall: "${a.name}" (${a.blurb}) Include the frame.`,
    idea: `a framed painting: ${a.blurb.replace(/\.$/, '')}`,
  })),
  ...live(COLLECTIONS.watches.items).map((w): PadArt => ({
    id: w.id,
    name: w.name,
    w: 64,
    h: 64,
    what: `A wristwatch, face on, for the display case: ${w.name}.`,
    idea: `a ${w.name.toLowerCase()}`,
  })),
  ...live(COLLECTIONS.vehicles.items).map((v): PadArt => ({
    id: v.id,
    name: v.name,
    w: 360,
    h: 250,
    what: `${v.name}, three-quarter view, on a showroom turntable.`,
    idea: `a ${v.name.toLowerCase()}`,
  })),
  ...COSMETICS.filter((c) => c.kind === 'deskitem').map((c): PadArt => ({
    id: `item_${c.value}`,
    name: c.name,
    w: 96,
    h: 80,
    what: `${c.name}, standing on the desk.`,
    idea: DESK_ITEM_IDEAS[c.value] ?? c.name.toLowerCase(),
  })),
];

export const PAD_ART_BY_ID: Record<string, PadArt> = Object.fromEntries(PAD_ART.map((a) => [a.id, a]));
