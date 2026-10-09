import { describe, expect, it } from 'vitest';
import { STYLE_TEXT, styleState, structureTypes, type StyleTrade } from '../../src/engine/run/style';
import { BOSSES, BOSS_IDS } from '../../src/content/bosses';

const t = (over: Partial<StyleTrade> = {}): StyleTrade => ({
  structureId: 'bull_put',
  open: false,
  realizedCents: 1_000,
  exitReason: 'target',
  daysHeld: 4,
  ...over,
});

describe('boss style bonuses', () => {
  it('every boss has a style with a short plain condition', () => {
    for (const id of BOSS_IDS) {
      expect(STYLE_TEXT[BOSSES[id].style], id).toBeTruthy();
      expect(STYLE_TEXT[BOSSES[id].style].length).toBeLessThanOrEqual(50);
    }
  });

  it('plan exits: broken by any other exit, met when every trade closed at a plan', () => {
    expect(styleState('plan_exits', [t(), t({ exitReason: 'stop', realizedCents: -500 })], false)).toBe(
      'met',
    );
    expect(styleState('plan_exits', [t(), t({ exitReason: 'manual' })], false)).toBe('broken');
    expect(styleState('plan_exits', [t(), t({ open: true, exitReason: null })], false)).toBe('on_track');
    expect(styleState('plan_exits', [], true)).toBe('broken');
  });

  it('no loser and no stop break the moment it happens', () => {
    expect(styleState('no_loser', [t({ realizedCents: -1 }), t({ open: true })], false)).toBe('broken');
    expect(styleState('no_stop', [t({ exitReason: 'stop', realizedCents: -10 })], false)).toBe('broken');
    expect(styleState('no_stop', [t(), t({ open: true })], false)).toBe('on_track');
  });

  it('counts wins, holds and streaks', () => {
    expect(styleState('three_wins', [t(), t()], false)).toBe('on_track');
    expect(styleState('three_wins', [t(), t()], true)).toBe('broken');
    expect(styleState('three_wins', [t(), t(), t()], false)).toBe('met');
    expect(styleState('hold_wins', [t({ daysHeld: 5 })], false)).toBe('broken');
    expect(styleState('hold_wins', [t({ daysHeld: 6 })], false)).toBe('met');
    const loss = t({ realizedCents: -100, exitReason: 'stop' });
    expect(styleState('no_streak', [loss, t(), loss], false)).toBe('met');
    expect(styleState('no_streak', [t(), loss, loss], false)).toBe('broken');
  });

  it('green and every-type-green are judged on the closed money', () => {
    expect(styleState('green', [t({ realizedCents: 500 }), t({ realizedCents: -200 })], true)).toBe('met');
    expect(styleState('green', [t({ realizedCents: -500 })], true)).toBe('broken');
    const mixed = [t(), t({ structureId: 'bear_call', realizedCents: -300 })];
    expect(styleState('all_types_green', mixed, false)).toBe('on_track');
    expect(styleState('all_types_green', mixed, true)).toBe('broken');
    expect(styleState('all_types_green', [t(), t({ structureId: 'bear_call' })], true)).toBe('met');
  });

  it('counts distinct structure types for the Allocator', () => {
    expect(structureTypes([t(), t(), t({ structureId: 'bear_call' })])).toEqual(['bull_put', 'bear_call']);
  });
});
