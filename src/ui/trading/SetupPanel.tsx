/**
 * Shaping a trade with sliders instead of number boxes: the view it takes, when it expires, where
 * the short strike sits, how wide it is, and how much conviction (size) is behind it. Every slider
 * snaps to real, listed values, and everything the trade depends on updates as you move them.
 */

import { diffDays } from '../../engine/calendar';
import { BUCKET_GLYPHS, BUCKET_NAMES } from '../../engine/scoring/calls';
import { expirationsOf, quotesFor, STRUCTURES } from '../../engine/strategies/structures';
import type { OptionLeg } from '../../engine/strategies/types';
import { CONVICTION, convictionStep } from '../../engine/trading/conviction';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { SnapSlider } from '../components/SnapSlider';
import { liveCardId, tradeOpen, useTrading } from '../store/trading';
import { SetupPresets } from './BuilderTray';

const DELTA_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
const NO_WIDTH = [
  'long_straddle',
  'long_strangle',
  'covered_call',
  'cash_secured_put',
  'calendar',
  'double_calendar',
];

/** The third Friday: the classic monthly expiration. */
function isMonthly(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCDay() === 5 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21;
}

/** What the trade is betting on, in one line. */
export function ViewChip() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const plan = useTrading((s) => s.plan)();
  const call = useTrading((s) => s.impliedCall)();
  useTrading((s) => s.version);
  if (!session || !cardId || !plan?.ok || !call)
    return <div className="view-chip dim">Shape a trade to see what it bets on.</div>;
  const spot = session.view(cardId).spot();
  const bes = (plan.metrics?.breakevens ?? []).slice().sort((a, b) => a - b);
  const s = STRUCTURES[builder.structureId];
  const away = (x: number) => `${x >= spot ? '+' : '−'}${Math.abs((x / spot - 1) * 100).toFixed(1)}%`;
  const line =
    bes.length === 2
      ? s.bias === 'long_vol'
        ? `profits outside ${price(bes[0])} – ${price(bes[1])}`
        : `profits between ${price(bes[0])} and ${price(bes[1])}`
      : bes.length === 1
        ? `${s.bias === 'bear' ? 'profits below' : 'profits above'} ${price(bes[0])} (${away(bes[0])})`
        : 'profit depends on the move';
  const flippable = s.bias === 'long_vol';
  return (
    <div
      className={`view-chip b${call.bucket} ${flippable ? 'flip' : ''}`}
      data-testid="view-chip"
      data-tip="g:your_view"
      onClick={() => {
        if (!flippable) return;
        sfx('select');
        setBuilder({ flipVol: !builder.flipVol });
      }}
    >
      <span className="vc-k">YOUR VIEW</span>
      <span className="vc-glyph">{BUCKET_GLYPHS[call.bucket]}</span>
      <b>{BUCKET_NAMES[call.bucket].toUpperCase()}</b>
      <span className="vc-line num">{line}</span>
      {flippable && <span className="vc-flip">⇅</span>}
    </div>
  );
}

export function SetupSliders() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading(liveCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const confidence = useTrading((s) => s.confidence);
  const setConfidence = useTrading((s) => s.setConfidence);
  const open = useTrading(tradeOpen);
  const plan = useTrading((s) => s.plan)();
  useTrading((s) => s.version);
  if (!session || !cardId) return null;
  const chain = session.chain(cardId);
  const now = session.view(cardId).now;
  const exps = chain
    ? expirationsOf(chain).filter((e) => {
        const d = diffDays(now, e);
        return d >= 1 && (d <= 63 || e === builder.expiration);
      })
    : [];
  const off = !open;
  const expIdx = Math.max(0, exps.indexOf(builder.expiration ?? ''));
  const lead = plan?.legs.find((l): l is OptionLeg => l.kind === 'option');
  // With a dragged strike, the slider sits at that strike's own delta.
  const anchorDelta =
    builder.anchor !== null && chain && lead
      ? Math.abs(
          quotesFor(chain, lead.expiration, lead.right).find(
            (q) => Math.abs(q.strike - builder.anchor!) < 1e-6,
          )?.delta ?? builder.delta,
        )
      : builder.delta;
  const deltaIdx = DELTA_STEPS.reduce(
    (b, d, i) => (Math.abs(d - anchorDelta) < Math.abs(DELTA_STEPS[b] - anchorDelta) ? i : b),
    0,
  );
  const convIdx = CONVICTION.findIndex((c) => c.confidence === convictionStep(confidence).confidence);
  const two = STRUCTURES[builder.structureId].twoExpiries;
  const backs = exps.filter((e) => builder.expiration && diffDays(builder.expiration, e) >= 14);
  const shorts =
    plan?.legs.filter((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0).map((l) => l.strike) ?? [];
  return (
    <div className="tray-section setup" data-testid="setup-sliders">
      <ViewChip />
      <SetupPresets />
      <SnapSlider
        label="Expires"
        tip="g:expiration"
        testId="slider-exp"
        byValue
        disabled={off || exps.length === 0}
        options={exps.map((e) => ({
          value: diffDays(now, e),
          major: isMonthly(e),
          mark: isMonthly(e) ? `${diffDays(now, e)}d` : undefined,
        }))}
        index={expIdx}
        onIndex={(i) =>
          setBuilder({
            expiration: exps[i],
            legs: null,
            backExpiration: expirationsOf(chain!).find((x) => diffDays(exps[i], x) >= 21) ?? null,
          })
        }
        readout={
          builder.expiration ? (
            <>
              {diffDays(now, builder.expiration)} days{' '}
              <span className="dim">
                {isMonthly(builder.expiration) ? 'monthly' : 'weekly'}
                {session.config.blind ? '' : ` · ${builder.expiration.slice(5)}`}
              </span>
            </>
          ) : (
            '—'
          )
        }
      />
      {two && (
        <SnapSlider
          label="Back month"
          byValue
          disabled={off || backs.length === 0}
          options={backs.map((e) => ({ value: diffDays(now, e) }))}
          index={Math.max(0, backs.indexOf(builder.backExpiration ?? ''))}
          onIndex={(i) => setBuilder({ backExpiration: backs[i], legs: null })}
          readout={builder.backExpiration ? `${diffDays(now, builder.backExpiration)} days` : '—'}
        />
      )}
      <SnapSlider
        label="Short Δ"
        tip="g:delta"
        testId="slider-delta"
        accent="magenta"
        disabled={off}
        options={DELTA_STEPS.map((d) => ({
          value: d,
          major: d === 0.3,
          mark: (d * 100) % 10 === 0 ? `.${Math.round(d * 100)}` : undefined,
        }))}
        index={deltaIdx}
        onIndex={(i) => setBuilder({ delta: DELTA_STEPS[i], anchor: null, legs: null })}
        readout={
          <>
            Δ .{Math.round(anchorDelta * 100)}
            {shorts.length > 0 && <span className="dim"> · K {shorts.join('/')}</span>}
          </>
        }
      />
      {!NO_WIDTH.includes(builder.structureId) && (
        <SnapSlider
          label="Width"
          tip="g:width"
          testId="slider-width"
          accent="amber"
          disabled={off}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((w) => ({ value: w, major: w === 2, mark: `${w}` }))}
          index={Math.max(0, Math.min(7, builder.width - 1))}
          onIndex={(i) => setBuilder({ width: i + 1, legs: null })}
          readout={plan?.metrics ? `$${price(plan.metrics.width)} wide` : `${builder.width} strikes`}
        />
      )}
      <SnapSlider
        label="Conviction"
        tip="g:conviction"
        testId="slider-conviction"
        accent="up"
        disabled={off}
        options={CONVICTION.map((c) => ({
          value: c.confidence,
          major: c.confidence === 0.7,
          mark: `${Math.round(c.confidence * 100)}%`,
        }))}
        index={Math.max(0, convIdx)}
        onIndex={(i) => void setConfidence(CONVICTION[i].confidence)}
        readout={
          plan?.ok ? (
            <>
              {convictionStep(confidence).label} · {plan.qty}×{' '}
              <span className="dim">
                risk {money(plan.maxLossCents)} ({pct(plan.riskPct)})
              </span>
            </>
          ) : (
            convictionStep(confidence).label
          )
        }
      />
    </div>
  );
}
