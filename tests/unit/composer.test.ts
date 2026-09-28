import { describe, expect, it } from 'vitest';
import {
  chordNotes,
  compose,
  layerLevels,
  midiToFreq,
  type MusicStyle,
  type Scene,
} from '../../src/audio/composer';

const STYLES: MusicStyle[] = ['synthwave', 'darkwave', 'chiptune'];

describe('the composer', () => {
  it('is deterministic for a seed and changes from section to section', () => {
    for (const style of STYLES) {
      expect(compose(style, 'trade', 's', 3)).toEqual(compose(style, 'trade', 's', 3));
      // Over a long run (40 sections = 320 bars), the music keeps changing.
      const sigs = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const s = compose(style, 'ff', 'run-1', i);
        sigs.add(JSON.stringify([s.root, s.progression, s.arp, s.bass, s.scale]));
      }
      expect(sigs.size).toBeGreaterThan(12);
    }
  });

  it('gives the three styles their own tempo and color', () => {
    const bpm = (st: MusicStyle) => compose(st, 'trade', 'x', 0).bpm;
    expect(bpm('chiptune')).toBeGreaterThan(bpm('synthwave'));
    expect(bpm('synthwave')).toBeGreaterThan(bpm('darkwave'));
  });

  it('speeds up and darkens for Reviews', () => {
    for (const style of STYLES) {
      const review = compose(style, 'review', 'x', 0);
      const trade = compose(style, 'trade', 'x', 0);
      expect(review.bpm).toBeGreaterThan(trade.bpm - 3);
      expect(review.scale[2]).toBe(3); // minor third
    }
  });

  it('builds chords from the scale and every pattern is 16 steps', () => {
    const s = compose('synthwave', 'trade', 'x', 0);
    for (const deg of s.progression) {
      const c = chordNotes(s, deg);
      expect(c).toHaveLength(4);
      for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    }
    for (const p of [s.arp, s.bass, s.kick, s.snare, s.hat]) expect(p).toHaveLength(16);
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it('adds layers as intensity rises, and keeps menus calm', () => {
    const scenes: Scene[] = ['trade', 'ff', 'review'];
    for (const sc of scenes) {
      let prev = layerLevels(sc, 0);
      for (let x = 0.1; x <= 1.0001; x += 0.1) {
        const l = layerLevels(sc, x);
        expect(l.bass).toBeGreaterThanOrEqual(prev.bass);
        expect(l.drums).toBeGreaterThanOrEqual(prev.drums);
        expect(l.hats).toBeGreaterThanOrEqual(prev.hats);
        expect(l.brightness).toBeGreaterThanOrEqual(prev.brightness);
        prev = l;
      }
      expect(layerLevels(sc, 1).drums).toBeGreaterThan(0.8);
    }
    expect(layerLevels('ff', 0).drums).toBe(0);
    expect(layerLevels('menu', 1).drums).toBe(0);
    expect(layerLevels('title', 1).drums).toBe(0);
    // Reviews start with some drive even when calm.
    expect(layerLevels('review', 0).bass).toBeGreaterThan(layerLevels('trade', 0).bass);
  });
});
