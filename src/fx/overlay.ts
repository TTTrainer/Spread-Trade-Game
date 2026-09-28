/**
 * Particles and celebrations on a PixiJS (MIT) overlay above the UI: confetti when a target is
 * met, coins for payouts, sparkles on Legendaries, fireworks for a victory, embers for a loss.
 * Square pixels only, to match the look. The ticker sleeps whenever nothing is on screen, so the
 * overlay costs nothing during a quiet fast-forward. Reduced motion turns it off.
 */

// The app's content security policy forbids eval; this module swaps in eval-free shaders.
import 'pixi.js/unsafe-eval';
import { Application, Container, Sprite, Texture } from 'pixi.js';

export type BurstKind = 'confetti' | 'coins' | 'sparkle' | 'firework' | 'embers';

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
  spin: number;
  fade: boolean;
}

const PALETTE = {
  confetti: [0x3ef2ff, 0xff3ea5, 0xffbf3e, 0x4dff9a, 0x9d6bff],
  coins: [0xffbf3e, 0xffe08a, 0xe8a820],
  sparkle: [0xffffff, 0xffbf3e, 0xfff3b0],
  firework: [0x3ef2ff, 0xff3ea5, 0xffbf3e, 0x4dff9a, 0xffffff],
  embers: [0xff4f6d, 0xff8a3d, 0x7a1030],
};

const MAX = 900;

class Overlay {
  private app: Application | null = null;
  private layer = new Container();
  private live: P[] = [];
  private pool: Sprite[] = [];
  private starting: Promise<void> | null = null;
  enabled = true;
  /** Reduced motion (a setting) turns celebrations off. */
  reduced = false;
  /** Particles spawned so far (tests read it). */
  spawned = 0;

  private async ensure(): Promise<Application | null> {
    if (this.app) return this.app;
    if (typeof document === 'undefined') return null;
    if (!this.starting)
      this.starting = (async () => {
        const app = new Application();
        await app.init({
          backgroundAlpha: 0,
          antialias: false,
          resizeTo: window,
          autoStart: false,
          preference: 'webgl',
        });
        app.canvas.className = 'fx-overlay';
        app.canvas.setAttribute('aria-hidden', 'true');
        app.canvas.dataset.testid = 'fx-overlay';
        document.body.appendChild(app.canvas);
        app.stage.addChild(this.layer);
        app.ticker.add((t) => this.update(t.deltaMS / 1000));
        this.app = app;
      })().catch((err) => {
        console.warn('fx overlay unavailable', err);
        this.enabled = false;
      });
    await this.starting;
    return this.app;
  }

  private sprite(): Sprite {
    const s = this.pool.pop() ?? new Sprite(Texture.WHITE);
    s.visible = true;
    s.alpha = 1;
    this.layer.addChild(s);
    return s;
  }

  /** Throw particles from a point (screen pixels). */
  async burst(kind: BurstKind, x: number, y: number, count?: number): Promise<void> {
    if (!this.enabled || this.reduced) return;
    const app = await this.ensure();
    if (!app) return;
    const colors = PALETTE[kind];
    const n = Math.min(
      count ?? { confetti: 90, coins: 26, sparkle: 30, firework: 70, embers: 34 }[kind],
      MAX - this.live.length,
    );
    for (let i = 0; i < n; i++) {
      const s = this.sprite();
      const size = kind === 'coins' ? 6 : kind === 'sparkle' ? 3 + ((i * 7) % 3) : 4 + ((i * 13) % 4);
      s.width = size;
      s.height = kind === 'confetti' ? size * 1.6 : size;
      s.tint = colors[i % colors.length];
      s.anchor.set(0.5);
      s.x = x;
      s.y = y;
      const a = Math.random() * Math.PI * 2;
      let vx = 0;
      let vy = 0;
      let gravity = 900;
      let max = 1.4 + Math.random() * 0.8;
      if (kind === 'confetti') {
        const sp = 350 + Math.random() * 450;
        vx = Math.cos(a) * sp * 0.8;
        vy = -Math.abs(Math.sin(a)) * sp - 200;
        gravity = 700;
      } else if (kind === 'coins') {
        vx = (Math.random() - 0.5) * 380;
        vy = -380 - Math.random() * 320;
        gravity = 1300;
        max = 1.1;
      } else if (kind === 'sparkle') {
        const sp = 60 + Math.random() * 140;
        vx = Math.cos(a) * sp;
        vy = Math.sin(a) * sp;
        gravity = 0;
        max = 0.7 + Math.random() * 0.6;
      } else if (kind === 'firework') {
        const sp = 220 + Math.random() * 260;
        vx = Math.cos(a) * sp;
        vy = Math.sin(a) * sp;
        gravity = 260;
        max = 1.2 + Math.random() * 0.6;
      } else {
        vx = (Math.random() - 0.5) * 160;
        vy = 40 + Math.random() * 120;
        gravity = 200;
        max = 1 + Math.random() * 0.5;
      }
      this.live.push({
        s,
        vx,
        vy,
        life: 0,
        max,
        gravity,
        spin: (Math.random() - 0.5) * 12,
        fade: kind !== 'coins',
      });
    }
    this.spawned += n;
    if (!app.ticker.started) app.ticker.start();
  }

  /** A few fireworks across the top of the screen. */
  async celebrate(): Promise<void> {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < 5; i++) {
      window.setTimeout(
        () => void this.burst('firework', w * (0.2 + 0.15 * i), h * (0.18 + 0.12 * (i % 2))),
        i * 260,
      );
    }
    void this.burst('confetti', w / 2, h * 0.35);
  }

  private update(dt: number): void {
    const t = Math.min(0.05, dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += t;
      p.vy += p.gravity * t;
      p.vx *= 0.99;
      p.s.x += p.vx * t;
      p.s.y += p.vy * t;
      p.s.rotation += p.spin * t;
      if (p.fade) p.s.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max || p.s.y > window.innerHeight + 40) {
        p.s.visible = false;
        this.layer.removeChild(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
      }
    }
    if (!this.live.length && this.app) {
      // One last frame to clear the canvas, then sleep until the next burst.
      this.app.render();
      this.app.ticker.stop();
    }
  }
}

export const fx = new Overlay();

/** Burst from the middle of an element. */
export function burstAt(el: Element | null, kind: BurstKind, count?: number): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  void fx.burst(kind, r.left + r.width / 2, r.top + r.height / 2, count);
}
