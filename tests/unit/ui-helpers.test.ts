import { describe, expect, it } from 'vitest';
import { renderSfx } from '../../src/audio/sfx';
import { DEFAULT_HOTKEYS, DEFAULT_SETTINGS, mergeSettings } from '../../src/shared/settings';
import { pnlText, pnlClass, price, pct, num, signed } from '../../src/ui/format';

describe('settings', () => {
  it('ships thinkorswim default hotkeys without collisions', () => {
    const seen = new Map<string, string>();
    for (const [action, key] of Object.entries(DEFAULT_HOTKEYS)) {
      expect(seen.has(key), `${key} used by ${seen.get(key)} and ${action}`).toBe(false);
      seen.set(key, action);
    }
    expect(DEFAULT_HOTKEYS.sell).toBe('Alt+S');
    expect(DEFAULT_HOTKEYS.positions).toBe('Ctrl+1');
  });

  it('merges saved settings over defaults', () => {
    const m = mergeSettings({ game: { ffSecondsPerDay: 0.5 }, hotkeys: { sell: 'Alt+X' } });
    expect(m.game.ffSecondsPerDay).toBe(0.5);
    expect(m.game.shortDelta).toBe(DEFAULT_SETTINGS.game.shortDelta);
    expect(m.hotkeys.sell).toBe('Alt+X');
    expect(m.hotkeys.buy).toBe('Alt+B');
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('pauses on a hit profit target, including for saves from before 1.6', () => {
    expect(DEFAULT_SETTINGS.game.pause.target_hit).toBe(true);
    const old = mergeSettings({ version: 4, game: { pause: { target_hit: false, stop_hit: false } } });
    expect(old.game.pause.target_hit).toBe(true);
    expect(old.game.pause.stop_hit).toBe(false);
    // Once on the new version, switching it off sticks.
    const now = mergeSettings({ version: 5, game: { pause: { target_hit: false } } });
    expect(now.game.pause.target_hit).toBe(false);
  });
});

describe('format', () => {
  it('never shows P/L by color alone', () => {
    expect(pnlText(12345)).toBe('▲ +$123.45');
    expect(pnlText(-500)).toBe('▼ −$5.00');
    expect(pnlText(0)).toBe('■ $0.00');
    expect(pnlClass(-1)).toBe('down');
    expect(price(0.1234)).toBe('0.123');
    expect(price(null)).toBe('—');
    expect(pct(0.1234)).toBe('12.3%');
    expect(pct(0.05, 0, true)).toBe('+5%');
    expect(num(1234.5, 1)).toBe('1,234.5');
    expect(signed(-1.5)).toBe('−1.50');
  });
});

describe('generated sound effects', () => {
  it('render audible, bounded samples', () => {
    for (const name of ['click', 'stamp', 'win', 'loss', 'coin', 'boom'] as const) {
      const s = renderSfx(name);
      expect(s.length).toBeGreaterThan(100);
      const peak = s.reduce((a, x) => Math.max(a, Math.abs(x)), 0);
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1.2);
    }
  });
});
