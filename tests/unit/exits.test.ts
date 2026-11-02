import { describe, expect, it } from 'vitest';
import { exitKind, planExample, recordExit } from '../../src/engine/run/exits';

describe('the exit plan scorecard', () => {
  it('names how a trade closed, plan exits first', () => {
    expect(exitKind('target', 'decision')).toBe('target');
    expect(exitKind('stop', 'stop')).toBe('stop');
    expect(exitKind(null, 'expired')).toBe('expired');
    expect(exitKind(null, 'assigned')).toBe('expired');
    expect(exitKind(null, 'manual')).toBe('manual');
    expect(exitKind(null, 'window_end')).toBe('other');
  });

  it('adds up each kind, and what each stop saved against the max loss', () => {
    let log = recordExit({}, 'target', 5_000, 40_000);
    log = recordExit(log, 'target', 4_000, 30_000);
    log = recordExit(log, 'stop', -10_000, 40_000);
    log = recordExit(log, 'manual', -2_000, 40_000);
    expect(log.target).toEqual({ n: 2, cents: 9_000, savedCents: 0 });
    expect(log.stop).toEqual({ n: 1, cents: -10_000, savedCents: 30_000 });
    expect(log.manual?.n).toBe(1);
    // Integer cents in, integer cents out.
    expect(Number.isInteger(log.stop!.savedCents)).toBe(true);
  });

  it('shows what a plan does to an example spread', () => {
    // $1.00 credit on a $5-wide spread, take 50%, stop at 2x the credit.
    expect(planExample(100, 500, 0.5, 2)).toEqual({
      maxProfitCents: 100,
      targetCents: 50,
      stopCents: -200,
      maxLossCents: -400,
    });
    // A stop past the max loss is just the max loss.
    expect(planExample(100, 200, 0.5, 4).stopCents).toBe(-100);
  });
});
