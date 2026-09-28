/**
 * The animated backdrop for the title and menus: a row of pixel candlesticks drifting across the
 * horizon above the synth grid, drawn with PixiJS. Original art: a random walk makes the candles,
 * and a few tall "event" wicks flash now and then. Reduced motion freezes it.
 */

import { useEffect, useRef } from 'react';
// The app's content security policy forbids eval; this module swaps in eval-free shaders.
import 'pixi.js/unsafe-eval';
import { Application, Graphics } from 'pixi.js';
import { useApp } from '../ui/store/app';

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

function walk(n: number, seed: number): Candle[] {
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Candle[] = [];
  let px = 0;
  for (let i = 0; i < n; i++) {
    const o = px;
    const c = o + (rnd() - 0.48) * 14 + (rnd() < 0.04 ? (rnd() - 0.5) * 40 : 0);
    const h = Math.max(o, c) + rnd() * 8;
    const l = Math.min(o, c) - rnd() * 8;
    out.push({ o, c, h, l });
    px = c * 0.97;
  }
  return out;
}

export function Backdrop({ opacity = 0.5, testId }: { opacity?: number; testId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useApp((s) => s.settings.display.reducedMotion);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let app: Application | null = null;
    let dead = false;
    const candles = walk(400, 7);
    const W = 9; // pixels per candle
    void (async () => {
      const a = new Application();
      try {
        await a.init({ backgroundAlpha: 0, antialias: false, resizeTo: el, preference: 'webgl' });
      } catch (err) {
        console.warn('backdrop unavailable', err);
        return;
      }
      if (dead) {
        a.destroy(true);
        return;
      }
      app = a;
      a.canvas.style.imageRendering = 'pixelated';
      el.appendChild(a.canvas);
      const g = new Graphics();
      a.stage.addChild(g);
      let offset = 0;
      const draw = () => {
        const w = a.screen.width;
        const h = a.screen.height;
        const mid = h * 0.5;
        g.clear();
        const count = Math.ceil(w / W) + 2;
        const start = Math.floor(offset / W);
        const frac = offset % W;
        for (let i = 0; i < count; i++) {
          const k = candles[(start + i) % candles.length];
          const x = i * W - frac;
          const up = k.c >= k.o;
          const col = up ? 0x3ef2ff : 0xff3ea5;
          const y = (v: number) => mid - v * 1.4;
          g.rect(Math.round(x + 3), Math.round(y(k.h)), 2, Math.max(2, Math.round((k.h - k.l) * 1.4))).fill({
            color: col,
            alpha: 0.55,
          });
          g.rect(
            Math.round(x),
            Math.round(y(Math.max(k.o, k.c))),
            7,
            Math.max(2, Math.round(Math.abs(k.c - k.o) * 1.4)),
          ).fill({
            color: col,
            alpha: 0.8,
          });
        }
      };
      draw();
      a.ticker.add((t) => {
        if (reduced) return;
        offset += t.deltaMS * 0.012;
        draw();
      });
    })();
    return () => {
      dead = true;
      app?.destroy(true);
    };
  }, [reduced]);

  return <div ref={host} className="backdrop" style={{ opacity }} aria-hidden="true" data-testid={testId} />;
}
