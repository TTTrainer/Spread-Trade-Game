import { useEffect, useRef } from 'react';
import type { CharacterId, Expression } from '../../content/characters';
import { portrait, PORTRAIT_SIZE } from '../../content/portraits';

/** A 64x64 pixel portrait painted onto a canvas and scaled up with crisp pixels. */
export function Portrait({
  id,
  mood,
  scale = 2,
  testId,
}: {
  id: CharacterId;
  mood: Expression;
  scale?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const p = portrait(id, mood);
    const img = ctx.createImageData(PORTRAIT_SIZE, PORTRAIT_SIZE);
    for (let i = 0; i < p.pixels.length; i++) {
      const k = p.pixels[i];
      if (!k) continue;
      const hex = p.palette[k];
      img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
      img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [id, mood]);
  return (
    <canvas
      ref={ref}
      width={PORTRAIT_SIZE}
      height={PORTRAIT_SIZE}
      className="portrait"
      style={{ width: PORTRAIT_SIZE * scale, height: PORTRAIT_SIZE * scale }}
      data-testid={testId}
      aria-label={`${id} (${mood})`}
    />
  );
}
