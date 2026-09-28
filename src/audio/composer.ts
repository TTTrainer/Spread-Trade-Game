/**
 * The composer: pure and seeded, so it is testable without audio. It writes "sections" of
 * music (key, chords, arpeggio, bass line and drum pattern) for three styles. The player
 * (music.ts) asks for a new section every eight bars and whenever the scene changes, so a run
 * never sits on one loop. How loud each layer plays comes from the game's intensity.
 */

import { Rng } from '../engine/rng';

export type MusicStyle = 'synthwave' | 'darkwave' | 'chiptune';
export type Scene = 'title' | 'menu' | 'trade' | 'ff' | 'tally' | 'shop' | 'review' | 'victory' | 'defeat';

export interface Section {
  style: MusicStyle;
  bpm: number;
  /** MIDI note of the key's root (octave 3). */
  root: number;
  scale: number[];
  /** Chords as scale degrees (0-based), one per bar, repeating over the section. */
  progression: number[];
  /** Arpeggio: chord-tone indices per 16th step (-1 = rest). */
  arp: number[];
  /** Bass: 16 steps, 0 = root, 1 = fifth, 2 = octave, -1 = rest. */
  bass: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  bars: number;
}

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;

interface StylePalette {
  bpm: number;
  scales: (keyof typeof SCALES)[];
  progressions: number[][];
  arps: number[][];
  bass: number[][];
  kicks: number[][];
  snares: number[][];
  hats: number[][];
}

const R = -1;
const PALETTES: Record<MusicStyle, StylePalette> = {
  synthwave: {
    bpm: 96,
    scales: ['minor', 'dorian', 'minor'],
    progressions: [
      [0, 5, 2, 6],
      [0, 3, 5, 4],
      [5, 3, 0, 4],
      [0, 6, 5, 6],
      [3, 4, 0, 0],
      [0, 2, 3, 4],
    ],
    arps: [
      [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3],
      [0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2],
      [2, 1, 0, 1, 2, 1, 0, 1, 3, 2, 1, 0, 1, 2, 3, 2],
    ],
    bass: [
      [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 1, 2, 1],
      [0, R, 0, 0, R, 0, 0, R, 0, 0, R, 0, 2, 0, 1, 0],
    ],
    kicks: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    ],
    snares: [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
    hats: [
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    ],
  },
  darkwave: {
    bpm: 84,
    scales: ['phrygian', 'minor'],
    progressions: [
      [0, 1, 0, 6],
      [0, 5, 3, 1],
      [0, 0, 5, 6],
      [3, 1, 0, 0],
      [0, 6, 1, 0],
    ],
    arps: [
      [0, R, R, 2, R, R, 1, R, 0, R, R, 3, R, R, 2, R],
      [0, R, 1, R, 2, R, 1, R, 0, R, 1, R, 3, R, 2, R],
    ],
    bass: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, R, 0, R, 0, R, 0, 1, 0, R, 0, R, 2, R, 1, R],
    ],
    kicks: [
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    ],
    snares: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    ],
    hats: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    ],
  },
  chiptune: {
    bpm: 132,
    scales: ['major', 'mixolydian', 'dorian'],
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 4],
      [5, 3, 0, 4],
      [0, 5, 3, 4],
      [3, 4, 2, 5],
    ],
    arps: [
      [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
      [0, 2, 1, 3, 0, 2, 1, 3, 3, 2, 1, 0, 3, 2, 1, 0],
      [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0, 0, 1, 2],
    ],
    bass: [
      [0, R, 2, R, 0, R, 2, R, 0, R, 2, R, 1, R, 2, R],
      [0, 0, 2, 0, 1, 0, 2, 0, 0, 0, 2, 0, 1, 1, 2, 2],
    ],
    kicks: [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0]],
    snares: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    ],
    hats: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    ],
  },
};

/** Scene moods: tempo and key color. Reviews speed up and darken. */
const SCENE_TEMPO: Record<Scene, number> = {
  title: 0.92,
  menu: 0.95,
  trade: 1,
  ff: 1.04,
  tally: 1,
  shop: 0.9,
  review: 1.12,
  victory: 1.05,
  defeat: 0.85,
};

export function compose(style: MusicStyle, scene: Scene, seed: string, index: number): Section {
  const p = PALETTES[style];
  const rng = new Rng(`music:${style}:${scene}:${seed}:${index}`);
  const bright = scene === 'victory' && style !== 'darkwave';
  const dark = scene === 'review' || scene === 'defeat';
  const scaleName: keyof typeof SCALES = bright
    ? 'major'
    : dark
      ? style === 'chiptune'
        ? 'minor'
        : 'phrygian'
      : rng.pick(p.scales);
  return {
    style,
    bpm: Math.round(p.bpm * SCENE_TEMPO[scene] + rng.int(-3, 3)),
    root: 45 + rng.int(0, 7), // A2..E3 region, a different key each section
    scale: [...SCALES[scaleName]],
    progression: rng.pick(p.progressions).slice(),
    arp: rng.pick(p.arps).slice(),
    bass: rng.pick(p.bass).slice(),
    kick: rng.pick(p.kicks).slice(),
    snare: rng.pick(p.snares).slice(),
    hat: rng.pick(p.hats).slice(),
    bars: 8,
  };
}

/** MIDI notes of the chord (a seventh chord stacked in thirds) on a scale degree. */
export function chordNotes(s: Section, degree: number, octave = 0): number[] {
  const out: number[] = [];
  for (let k = 0; k < 4; k++) {
    const d = degree + k * 2;
    const oct = Math.floor(d / s.scale.length);
    out.push(s.root + 12 + octave * 12 + s.scale[d % s.scale.length] + 12 * oct);
  }
  return out;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface LayerLevels {
  pad: number;
  bass: number;
  arp: number;
  drums: number;
  hats: number;
  /** 0..1, opens the synth filters. */
  brightness: number;
}

/**
 * How loud each layer plays (0..1). The music builds with intensity (realized volatility, stress,
 * meter pressure); menus stay gentle.
 */
export function layerLevels(scene: Scene, intensity: number): LayerLevels {
  const x = Math.max(0, Math.min(1, intensity));
  const calm = scene === 'title' || scene === 'menu' || scene === 'shop';
  if (calm)
    return {
      pad: 0.8,
      bass: scene === 'shop' ? 0.5 : 0.25,
      arp: 0.45,
      drums: 0,
      hats: scene === 'shop' ? 0.3 : 0,
      brightness: 0.35,
    };
  if (scene === 'defeat') return { pad: 0.7, bass: 0.3, arp: 0, drums: 0, hats: 0, brightness: 0.15 };
  if (scene === 'victory') return { pad: 0.8, bass: 0.7, arp: 0.8, drums: 0.7, hats: 0.6, brightness: 0.8 };
  const base = scene === 'review' ? 0.25 : 0;
  const y = Math.min(1, x + base);
  return {
    pad: 0.75,
    bass: 0.35 + 0.55 * y,
    arp: y < 0.25 ? 0.2 : 0.4 + 0.5 * y,
    drums: y < 0.2 ? 0 : 0.35 + 0.6 * y,
    hats: y < 0.5 ? 0 : 0.3 + 0.6 * (y - 0.5) * 2,
    brightness: 0.25 + 0.7 * y,
  };
}
