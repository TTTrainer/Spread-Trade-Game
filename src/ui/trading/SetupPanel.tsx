/**
 * Shaping a trade with sliders instead of number boxes: the view it takes, when it expires, where
 * the short strike sits, how wide it is, and how much conviction (size) is behind it. Every slider
 * snaps to real, listed values, and everything the trade depends on updates as you move them.
 */

import { diffDays } from '../../engine/calendar';
import { BUCKET_GLYPHS, BUCKET_NAMES } from '../../engine/scoring/calls';
import { expirationsOf, quotesFor, STRUCTURES } from '../../engine/strategies/structures';
import type { OptionLeg } from '../../engine/strategies/types';
import { CONVICTION, convictionQty, convictionStep } from '../../engine/trading/conviction';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { SnapSlider } from '../components/SnapSlider';
import { liveCardId, tradeOpen, useTrading } from '../store/trading';
import { SetupPresets } from './BuilderTray';
import { LONG_ANCHOR, STRUCTURE_COACH, type CoachControl } from '../../content/structureCoach';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { useActiveBoss, useSealed } from '../boss';
import { LockStamp } from './BossBanner';

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
  const seen = useApp((s) => s.settings.game.seenStructures);
  const boss = useActiveBoss();
  const inTutorial = useRun((s) => s.engine?.state.config.mode === 'tutorial');
  // The Executor seals expirations until the trade is open: evenly spaced, unlabeled stops.
  const dteSealed = useSealed('dte');
  if (!session || !cardId) return null;
  const sid = builder.structureId;
  // The first time a structure is picked, each control says what it moves for that structure.
  const coach =
    open &&
    !inTutorial &&
    !(seen ?? []).includes(sid) &&
    !session.positions.some((p) => p.structureId === sid)
      ? STRUCTURE_COACH[sid]
      : null;
  const hint = (k: CoachControl) => coach?.controls[k];
  const markSeen = () =>
    useApp.getState().updateSettings((st) => ({
      ...st,
      game: { ...st.game, seenStructures: [...new Set([...(st.game.seenStructures ?? []), sid])] },
    }));
  // Debit spreads and long premium place the leg you buy (cyan); everything else the leg you sell.
  const anchorLong = LONG_ANCHOR.includes(sid);
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
  const equity = session.markedEquityCents();
  const cap = session.config.riskCapPct;
  const perContract = plan?.ok && plan.qty > 0 ? plan.maxLossCents / plan.qty : null;
  return (
    <div className="tray-section setup" data-testid="setup-sliders">
      <ViewChip />
      {coach && (
        <div className="coach-pitch" data-testid="structure-coach">
          <span className="cp-new num">NEW</span>
          <span className="cp-text">
            <b>{STRUCTURES[sid].name}:</b> {coach.pitch}
          </span>
          <button
            className="pixel-btn small"
            onClick={() => (sfx('click'), markSeen())}
            data-testid="structure-coach-ok"
          >
            GOT IT
          </button>
        </div>
      )}
      <SetupPresets />
      {/* Each control wears the color of the line it moves on the chart: the amber EXP line, the
          magenta strike you sell, the cyan strike you buy; size is violet, not P/L green. */}
      <SnapSlider
        label="Expires"
        tip="g:expiration"
        testId="slider-exp"
        accent="amber"
        hint={hint('exp')}
        byValue={!dteSealed}
        disabled={off || exps.length === 0}
        options={exps.map((e, i) =>
          dteSealed
            ? { value: i }
            : {
                value: diffDays(now, e),
                major: isMonthly(e),
                mark: isMonthly(e) ? `${diffDays(now, e)}d` : undefined,
              },
        )}
        index={expIdx}
        onIndex={(i) =>
          setBuilder({
            expiration: exps[i],
            legs: null,
            backExpiration: expirationsOf(chain!).find((x) => diffDays(exps[i], x) >= 21) ?? null,
          })
        }
        readout={
          builder.expiration && dteSealed ? (
            <span data-testid="exp-sealed-readout">
              🔒 ? days{' '}
              <span className="dim">
                · term {expIdx + 1} of {exps.length}
              </span>
            </span>
          ) : builder.expiration ? (
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
          accent="amber"
          hint={hint('back')}
          byValue={!dteSealed}
          disabled={off || backs.length === 0}
          options={backs.map((e, i) => ({ value: dteSealed ? i : diffDays(now, e) }))}
          index={Math.max(0, backs.indexOf(builder.backExpiration ?? ''))}
          onIndex={(i) => setBuilder({ backExpiration: backs[i], legs: null })}
          readout={
            builder.backExpiration
              ? dteSealed
                ? '🔒 ? days'
                : `${diffDays(now, builder.backExpiration)} days`
              : '—'
          }
        />
      )}
      <SnapSlider
        label={anchorLong ? 'Long Δ' : 'Short Δ'}
        tip="g:delta"
        testId="slider-delta"
        accent={anchorLong ? 'cyan' : 'magenta'}
        hint={hint('strike')}
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
          accent={anchorLong ? 'magenta' : 'cyan'}
          hint={hint('width')}
          disabled={off}
          options={[1, 2, 3, 4, 5, 6, 7, 8].map((w) => ({ value: w, major: w === 2, mark: `${w}` }))}
          index={Math.max(0, Math.min(7, builder.width - 1))}
          onIndex={(i) => setBuilder({ width: i + 1, legs: null })}
          readout={plan?.metrics ? `$${price(plan.metrics.width)} wide` : `${builder.width} strikes`}
        />
      )}
      <SnapSlider
        label="Size"
        tip="g:conviction"
        testId="slider-conviction"
        accent="violet"
        hint={hint('size')}
        disabled={off}
        options={CONVICTION.map((c) => ({
          value: c.confidence,
          major: c.confidence === 0.7,
          // Each step shows the contracts it buys, so conviction reads as size (and risk).
          mark: perContract ? `${convictionQty(perContract, equity, cap, c.confidence)}×` : c.label,
        }))}
        index={Math.max(0, convIdx)}
        onIndex={(i) => void setConfidence(CONVICTION[i].confidence)}
        readout={
          plan?.ok ? (
            <>
              <b className="conv-qty" data-testid="conv-qty">
                {plan.qty} CONTRACT{plan.qty === 1 ? '' : 'S'}
              </b>{' '}
              <span className="dim">· {convictionStep(confidence).label}</span>
            </>
          ) : (
            convictionStep(confidence).label
          )
        }
      />
      {plan?.ok && (
        <div
          className="conv-cap num"
          data-testid="conv-cap"
          data-tip-title="Conviction is size"
          data-tip-body={`More conviction buys more contracts, and every contract adds risk. This trade risks ${money(plan.maxLossCents)}: ${pct(plan.riskPct)} of your account, out of the ${pct(cap, 0)} one trade may risk.`}
        >
          <span className="cc-k">RISKING</span>
          <span className="cc-track">
            <i
              style={{ width: `${Math.min(1, plan.riskPct / cap) * 100}%` }}
              className={plan.riskPct / cap > 0.8 ? 'hot' : ''}
            />
          </span>
          <span className="cc-v">
            <b>{money(plan.maxLossCents)}</b> · {pct(plan.riskPct)} of account
          </span>
          {boss?.rule.riskCapMult !== undefined && (
            <LockStamp
              text={`${Math.round((1 - boss.rule.riskCapMult) * 100)}% IN RESERVE`}
              by={boss.def.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
