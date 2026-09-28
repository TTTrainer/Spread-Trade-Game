/**
 * Adaptive music, played live with Tone.js (MIT). Four layers (pad, bass, arpeggio, drums with
 * hats) fade in and out with the game's intensity; the tempo and key shift with the scene
 * (Reviews run faster and darker). A new section is composed every eight bars and at every scene
 * change, so a run never sits on one loop. Three styles: synthwave, darkwave and chiptune.
 */

import * as Tone from 'tone';
import { create } from 'zustand';
import {
  chordNotes,
  compose,
  layerLevels,
  midiToFreq,
  type LayerLevels,
  type MusicStyle,
  type Scene,
  type Section,
} from './composer';

interface Rig {
  pad: Tone.PolySynth;
  bass: Tone.MonoSynth;
  arp: Tone.Synth;
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hat: Tone.MetalSynth;
  gains: Record<'pad' | 'bass' | 'arp' | 'drums' | 'hats', Tone.Gain>;
  filter: Tone.Filter;
  nodes: { dispose: () => unknown }[];
}

function buildRig(style: MusicStyle, out: Tone.ToneAudioNode): Rig {
  const nodes: { dispose: () => unknown }[] = [];
  const keep = <T extends { dispose: () => unknown }>(n: T): T => (nodes.push(n), n);
  const gain = () => keep(new Tone.Gain(0).connect(out));
  const gains = { pad: gain(), bass: gain(), arp: gain(), drums: gain(), hats: gain() };
  const filter = keep(new Tone.Filter({ frequency: 1200, type: 'lowpass', rolloff: -24 }));
  // A convolution reverb (its impulse is rendered offline): no audio worklet, which the app's
  // content security policy would block.
  const reverb = keep(new Tone.Reverb({ decay: style === 'darkwave' ? 5 : 3.2, preDelay: 0.02, wet: 0.35 }));
  filter.connect(reverb);
  reverb.connect(gains.pad);
  const delay = keep(
    new Tone.FeedbackDelay({ delayTime: style === 'chiptune' ? '8n' : '8n.', feedback: 0.32, wet: 0.28 }),
  ).connect(gains.arp);

  const padOsc = style === 'chiptune' ? 'square' : style === 'darkwave' ? 'fattriangle' : 'fatsawtooth';
  const pad = keep(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: padOsc } as Tone.OmniOscillatorOptions,
      envelope:
        style === 'chiptune'
          ? { attack: 0.01, decay: 0.3, sustain: 0.25, release: 0.4 }
          : { attack: 0.9, decay: 0.6, sustain: 0.7, release: 2.2 },
      volume: style === 'chiptune' ? -22 : -16,
    }),
  ).connect(filter);
  const bass = keep(
    new Tone.MonoSynth({
      oscillator: { type: style === 'chiptune' ? 'triangle' : 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0.2,
        release: 0.3,
        baseFrequency: 120,
        octaves: 2.6,
      },
      volume: -10,
    }),
  ).connect(gains.bass);
  const arp = keep(
    new Tone.Synth({
      oscillator: { type: style === 'darkwave' ? 'sine' : 'square' } as Tone.OmniOscillatorOptions,
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.1, release: 0.15 },
      volume: style === 'darkwave' ? -12 : -20,
    }),
  ).connect(delay);
  const kick = keep(new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, volume: -6 })).connect(
    gains.drums,
  );
  const snare = keep(
    new Tone.NoiseSynth({
      noise: { type: style === 'darkwave' ? 'pink' : 'white' },
      envelope: { attack: 0.001, decay: style === 'chiptune' ? 0.08 : 0.18, sustain: 0 },
      volume: -16,
    }),
  ).connect(gains.drums);
  const hat = keep(
    new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -30,
    }),
  ).connect(gains.hats);
  hat.frequency.value = 250;
  return { pad, bass, arp, kick, snare, hat, gains, filter, nodes };
}

export interface MusicState {
  available: boolean;
  playing: boolean;
  style: MusicStyle;
  scene: Scene;
  intensity: number;
  sections: number;
  bpm: number;
  levels: LayerLevels | null;
}

export const useMusic = create<MusicState>(() => ({
  available: true,
  playing: false,
  style: 'synthwave',
  scene: 'title',
  intensity: 0,
  sections: 0,
  bpm: 0,
  levels: null,
}));

class Player {
  private rig: Rig | null = null;
  private master: Tone.Volume | null = null;
  private loop: Tone.Loop | null = null;
  private section: Section | null = null;
  private step = 0;
  private index = 0;
  private seed = 'menu';
  private volume = 0.4;

  private get st(): MusicState {
    return useMusic.getState();
  }

  private starting: Promise<void> | null = null;

  /** Start once: a click and a key press can both ask before the first start finishes. */
  start(): Promise<void> {
    if (this.st.playing || !this.st.available) return Promise.resolve();
    if (!this.starting) this.starting = this.boot().finally(() => (this.starting = null));
    return this.starting;
  }

  private async boot(): Promise<void> {
    try {
      await Tone.start();
      this.master = new Tone.Volume(this.db()).toDestination();
      this.rig = buildRig(this.st.style, this.master);
      this.section = compose(this.st.style, this.st.scene, this.seed, this.index);
      const tr = Tone.getTransport();
      tr.bpm.value = this.section.bpm;
      this.loop = new Tone.Loop((time) => this.tick(time), '16n').start(0);
      tr.start('+0.05');
      useMusic.setState({ playing: true, bpm: this.section.bpm, sections: 1 });
      this.applyLevels(0.1);
    } catch (err) {
      console.warn('music unavailable', err);
      useMusic.setState({ available: false, playing: false });
    }
  }

  stop(): void {
    this.lastTick = -1;
    this.loop?.dispose();
    this.loop = null;
    Tone.getTransport().stop();
    this.rig?.nodes.forEach((n) => n.dispose());
    this.rig = null;
    this.master?.dispose();
    this.master = null;
    useMusic.setState({ playing: false });
  }

  private db(): number {
    return this.volume <= 0.001 ? -Infinity : Tone.gainToDb(this.volume) - 4;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.volume.rampTo(this.db(), 0.3);
    if (this.volume <= 0.001 && this.st.playing) this.stop();
  }

  setStyle(style: MusicStyle): void {
    if (style === this.st.style) return;
    useMusic.setState({ style });
    if (!this.st.playing || !this.master) return;
    this.rig?.nodes.forEach((n) => n.dispose());
    this.rig = buildRig(style, this.master);
    this.nextSection();
    this.applyLevels(0.3);
  }

  /** A new scene (or a new round, via the seed) composes fresh music right away. */
  setScene(scene: Scene, seed: string): void {
    if (scene === this.st.scene && seed === this.seed) return;
    useMusic.setState({ scene });
    this.seed = seed;
    this.index = 0;
    if (this.st.playing) {
      this.nextSection();
      this.applyLevels(1.2);
    }
  }

  setIntensity(x: number): void {
    const v = Math.max(0, Math.min(1, x));
    if (Math.abs(v - this.st.intensity) < 0.02) return;
    useMusic.setState({ intensity: v });
    this.applyLevels(1.5);
  }

  private nextSection(): void {
    this.section = compose(this.st.style, this.st.scene, this.seed, this.index++);
    Tone.getTransport().bpm.rampTo(this.section.bpm, 2);
    useMusic.setState({ sections: this.st.sections + 1, bpm: this.section.bpm });
  }

  private applyLevels(ramp: number): void {
    const r = this.rig;
    if (!r) return;
    const lv = layerLevels(this.st.scene, this.st.intensity);
    r.gains.pad.gain.rampTo(lv.pad, ramp);
    r.gains.bass.gain.rampTo(lv.bass, ramp);
    r.gains.arp.gain.rampTo(lv.arp, ramp);
    r.gains.drums.gain.rampTo(lv.drums, ramp);
    r.gains.hats.gain.rampTo(lv.hats, ramp);
    r.filter.frequency.rampTo(300 + 3200 * lv.brightness, ramp);
    useMusic.setState({ levels: lv });
  }

  private lastTick = -1;

  private tick(time: number): void {
    const s = this.section;
    const r = this.rig;
    if (!s || !r) return;
    // Synths can't start two notes at the same instant. When the page is busy, late ticks get
    // clamped to "now" and would collide, so a tick that's already late plays nothing.
    const late = time <= this.lastTick || time < Tone.getContext().currentTime;
    this.lastTick = Math.max(this.lastTick, time);
    if (!late)
      try {
        this.play(time, s, r);
      } catch (err) {
        console.warn('music tick skipped', err);
      }
    this.step++;
    // Eight bars, then something new.
    if (this.step % (16 * s.bars) === 0) Tone.getDraw().schedule(() => this.nextSection(), time);
  }

  private play(time: number, s: Section, r: Rig): void {
    const i = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const chord = chordNotes(s, s.progression[bar % s.progression.length]);
    const lv = this.st.levels ?? layerLevels(this.st.scene, this.st.intensity);
    if (i === 0 && lv.pad > 0.01)
      r.pad.triggerAttackRelease(
        chord.slice(0, 3).map(midiToFreq),
        s.style === 'chiptune' ? '8n' : '1m',
        time,
        0.5,
      );
    const b = s.bass[i];
    if (b >= 0 && lv.bass > 0.01)
      r.bass.triggerAttackRelease(midiToFreq(chord[0] - 24 + [0, 7, 12][b]), '16n', time, 0.8);
    const a = s.arp[i];
    if (a >= 0 && lv.arp > 0.01)
      r.arp.triggerAttackRelease(midiToFreq(chord[a % chord.length] + 12), '32n', time, 0.6);
    if (lv.drums > 0.01) {
      if (s.kick[i]) r.kick.triggerAttackRelease('C1', '8n', time, 0.9);
      if (s.snare[i]) r.snare.triggerAttackRelease('16n', time, 0.7);
    }
    if (lv.hats > 0.01 && s.hat[i]) r.hat.triggerAttackRelease('32n', time, 0.3);
  }
}

export const music = new Player();
