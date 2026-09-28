/**
 * Sound effects generated in code, sfxr-style: a few oscillators, pitch slides, arpeggios,
 * envelopes and a low-pass filter render into AudioBuffers once, then play instantly.
 * All original; no sample packs, so no licenses to track.
 */

type Wave = 'square' | 'saw' | 'sine' | 'triangle' | 'noise';

interface SfxDef {
  wave: Wave;
  freq: number;
  /** Frequency multiplier per second (1 = flat, 0.25 = drops two octaves per second). */
  slide?: number;
  attack?: number;
  sustain: number;
  decay: number;
  volume?: number;
  duty?: number;
  vibratoDepth?: number;
  vibratoSpeed?: number;
  arp?: { at: number; mult: number }[];
  lowpass?: number; // 0..1, lower = darker
  layer?: SfxDef;
}

export type SfxName =
  | 'click'
  | 'hover'
  | 'select'
  | 'deal'
  | 'fill'
  | 'stamp'
  | 'tick'
  | 'multPop'
  | 'coin'
  | 'win'
  | 'loss'
  | 'stop'
  | 'whoosh'
  | 'error'
  | 'decision'
  | 'boom'
  | 'reveal'
  | 'buy';

const DEFS: Record<SfxName, SfxDef> = {
  click: { wave: 'square', freq: 900, sustain: 0.012, decay: 0.03, volume: 0.25, duty: 0.3 },
  hover: { wave: 'sine', freq: 1400, sustain: 0.005, decay: 0.02, volume: 0.08 },
  select: { wave: 'square', freq: 520, slide: 3, sustain: 0.03, decay: 0.05, volume: 0.25, duty: 0.25 },
  deal: { wave: 'noise', freq: 3000, sustain: 0.01, decay: 0.05, volume: 0.25, lowpass: 0.6, layer: { wave: 'triangle', freq: 700, slide: 2, sustain: 0.01, decay: 0.04, volume: 0.15 } },
  fill: { wave: 'square', freq: 523, sustain: 0.05, decay: 0.12, volume: 0.3, duty: 0.4, arp: [{ at: 0.05, mult: 1.5 }] },
  stamp: { wave: 'noise', freq: 800, sustain: 0.02, decay: 0.16, volume: 0.5, lowpass: 0.25, layer: { wave: 'square', freq: 90, slide: 0.4, sustain: 0.03, decay: 0.12, volume: 0.45 } },
  tick: { wave: 'triangle', freq: 1200, sustain: 0.004, decay: 0.025, volume: 0.15 },
  multPop: { wave: 'square', freq: 660, slide: 4, sustain: 0.03, decay: 0.08, volume: 0.28, duty: 0.2, vibratoDepth: 0.03, vibratoSpeed: 30 },
  coin: { wave: 'square', freq: 988, sustain: 0.06, decay: 0.2, volume: 0.28, duty: 0.5, arp: [{ at: 0.06, mult: 1.335 }] },
  win: { wave: 'square', freq: 523, sustain: 0.36, decay: 0.3, volume: 0.28, duty: 0.35, arp: [{ at: 0.09, mult: 1.26 }, { at: 0.18, mult: 1.498 }, { at: 0.27, mult: 2 }] },
  loss: { wave: 'saw', freq: 196, slide: 0.35, sustain: 0.15, decay: 0.3, volume: 0.35, lowpass: 0.35 },
  stop: { wave: 'square', freq: 330, slide: 0.3, sustain: 0.1, decay: 0.2, volume: 0.3, duty: 0.5, layer: { wave: 'noise', freq: 400, sustain: 0.02, decay: 0.1, volume: 0.3, lowpass: 0.3 } },
  whoosh: { wave: 'noise', freq: 2000, attack: 0.08, sustain: 0.05, decay: 0.15, volume: 0.25, lowpass: 0.45 },
  error: { wave: 'square', freq: 196, sustain: 0.06, decay: 0.06, volume: 0.28, duty: 0.5, arp: [{ at: 0.07, mult: 0.8 }] },
  decision: { wave: 'triangle', freq: 440, sustain: 0.12, decay: 0.25, volume: 0.35, arp: [{ at: 0.08, mult: 1.5 }], vibratoDepth: 0.01, vibratoSpeed: 8 },
  boom: { wave: 'noise', freq: 200, sustain: 0.05, decay: 0.45, volume: 0.55, lowpass: 0.12, layer: { wave: 'sine', freq: 60, slide: 0.5, sustain: 0.05, decay: 0.35, volume: 0.5 } },
  reveal: { wave: 'triangle', freq: 392, slide: 1.8, sustain: 0.1, decay: 0.2, volume: 0.3 },
  buy: { wave: 'square', freq: 392, sustain: 0.05, decay: 0.12, volume: 0.3, duty: 0.4, arp: [{ at: 0.05, mult: 1.26 }] },
};

const RATE = 44100;

function render(def: SfxDef): Float32Array {
  const attack = def.attack ?? 0.002;
  const total = attack + def.sustain + def.decay;
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  let seed = 22222;
  let noiseVal = 0;
  let lp = 0;
  const lpAlpha = def.lowpass === undefined ? 1 : Math.max(0.01, def.lowpass);
  const slidePerSample = def.slide ? Math.pow(def.slide, 1 / RATE) : 1;
  let freq = def.freq;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let f = freq;
    if (def.arp) for (const a of def.arp) if (t >= a.at) f *= a.mult;
    if (def.vibratoDepth) f *= 1 + def.vibratoDepth * Math.sin(2 * Math.PI * (def.vibratoSpeed ?? 6) * t);
    phase += f / RATE;
    const p = phase % 1;
    let s: number;
    switch (def.wave) {
      case 'square':
        s = p < (def.duty ?? 0.5) ? 1 : -1;
        break;
      case 'saw':
        s = 2 * p - 1;
        break;
      case 'sine':
        s = Math.sin(2 * Math.PI * p);
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(p - 0.5);
        break;
      case 'noise':
        if (p < f / RATE || i === 0) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          noiseVal = (seed / 0x7fffffff) * 2 - 1;
        }
        s = noiseVal;
        break;
    }
    lp += lpAlpha * (s - lp);
    const env = t < attack ? t / attack : t < attack + def.sustain ? 1 : Math.max(0, 1 - (t - attack - def.sustain) / def.decay);
    out[i] = lp * env * (def.volume ?? 0.3);
    freq *= slidePerSample;
  }
  if (def.layer) {
    const extra = render(def.layer);
    for (let i = 0; i < Math.min(n, extra.length); i++) out[i] += extra[i];
  }
  return out;
}

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let volume = 0.64;
let enabled = true;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function setSfxVolume(master: number, sfx: number): void {
  volume = Math.max(0, Math.min(1, master * sfx));
  enabled = volume > 0.001;
}

export function audioContext(): AudioContext | null {
  return audio();
}

/** Play a sound. `pitch` shifts it (1 = normal); count-ups raise pitch as numbers climb. */
export function sfx(name: SfxName, pitch = 1, gain = 1): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();
  let buf = buffers.get(name);
  if (!buf) {
    const data = render(DEFS[name]);
    buf = ac.createBuffer(1, data.length, RATE);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    buffers.set(name, buf);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  const g = ac.createGain();
  g.gain.value = volume * gain;
  src.connect(g).connect(ac.destination);
  src.start();
}

/** Exposed for tests: the raw samples of a sound. */
export function renderSfx(name: SfxName): Float32Array {
  return render(DEFS[name]);
}
