import { useEffect, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { lastMark, optionLegsOf, stockRatio } from '../../engine/lifecycle/position';
import { BUCKET_GLYPHS } from '../../engine/scoring/calls';
import { quotesFor, STRUCTURES } from '../../engine/strategies/structures';
import { payoffNow, type PricingEnv } from '../../engine/strategies/metrics';
import type { DecisionAction, DecisionPoint, Position } from '../../engine/lifecycle/types';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { Kbd, Modal, Pnl, TiltCard } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { useTrading } from '../store/trading';
import { useApp } from '../store/app';
import { cardBackImage } from '../art';
import { Sparkline } from '../components/Sparkline';
import { briefFor, StreetChip } from './NewsBrief';
import { LivePnl, PaceControls, useDayProgress } from './DayPlayer';
import { priceAt } from './dayPath';
import type { BriefAccess } from '../../engine/news/brief';
import { RollDialog } from './RollDialog';
import { MiniCandles } from './DayRecap';

export { RollDialog };

/** What a lineup card may show. Sandbox shows everything; Career earns badges through analysts. */
export interface CardBadges {
  ivr: boolean;
  earnings: boolean;
  extra?: React.ReactNode;
}

/** The card's price, ticking with the candle while a day plays. */
function LivePx({ cardId, settled }: { cardId: string; settled: number }) {
  const p = useDayProgress();
  const c = p?.anim.cards[cardId];
  const px = c ? priceAt(c.path, p.t) : settled;
  const dir = c ? (px >= c.prevClose ? 'up' : 'down') : '';
  return <span className={`lc-px num ${c ? `live ${dir}` : ''}`}>{px.toFixed(2)}</span>;
}

/** The sparkline's last point follows the forming candle. */
function LiveSpark({ cardId, closes }: { cardId: string; closes: number[] }) {
  const p = useDayProgress();
  const c = p?.anim.cards[cardId];
  return <Sparkline closes={c ? [...closes.slice(0, -1), priceAt(c.path, p.t)] : closes} />;
}

export function LineupColumn({
  extra,
  badges,
  briefAccess,
}: {
  extra?: React.ReactNode;
  badges?: (cardId: string) => CardBadges;
  briefAccess?: BriefAccess;
}) {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const selected = useTrading((s) => s.selectedCardId);
  const select = useTrading((s) => s.select);
  const cardBack = useApp((s) => s.settings.display.cardBack);
  useHotkeys(
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [
        `select${n}`,
        () => {
          const c = session?.cards[n - 1];
          if (c) select(c.id);
        },
      ]),
    ),
  );
  if (!session) return null;
  return (
    <div className="lineup" data-testid="lineup">
      <div className="section-title">
        Lineup <Kbd>Alt+1-9</Kbd>
      </div>
      {session.cards.map((c, i) => {
        const view = session.view(c.id);
        const ctx = session.context(c.id);
        const bars = view.bars();
        const pos = c.positionIds.map((id) => session.position(id)).find((p) => p?.status === 'open');
        const closed = c.positionIds.map((id) => session.position(id)).filter((p) => p?.status === 'closed');
        const pl = pos
          ? (lastMark(pos)?.plCents ?? 0)
          : closed.reduce((a, p) => a + (p?.realizedCents ?? 0), 0);
        const earnDays = ctx.nextEarnings ? diffDays(view.now, ctx.nextEarnings.date) : null;
        const b = badges ? badges(c.id) : { ivr: true, earnings: true };
        const brief = briefFor(session, c.id, briefAccess);
        return (
          <TiltCard
            key={c.id}
            selected={selected === c.id}
            onClick={() => select(c.id)}
            className="lineup-card"
            testId={`card-${i}`}
          >
            <div
              key={`deal-${c.id}`}
              className={`deal-back cardback cardback-${cardBack}`}
              style={{ animationDelay: `${i * 90}ms`, ...cardBackImage(cardBack) }}
              aria-hidden="true"
            />
            <div className="lc-top" data-tip="g:lineup_card">
              <span className="lc-sym">{c.displaySymbol}</span>
              <LivePx cardId={c.id} settled={view.spot()} />
            </div>
            {!session.config.blind && c.realSymbol !== c.displaySymbol && (
              <div className="lc-name">{c.realSymbol}</div>
            )}
            <LiveSpark cardId={c.id} closes={bars.slice(-60).map((b) => b.close)} />
            <div className="lc-badges">
              {/* Blind cards all share the same "Day N" (the clock shows it), so only real dates earn a chip. */}
              {!view.transform.hideDates && (
                <span
                  className="chip"
                  data-tip-title="Date"
                  data-tip-body={`Today on this card, with ${bars.length - 1} trading days of chart behind it.`}
                >
                  {view.dayLabel()}
                </span>
              )}
              {brief && <StreetChip brief={brief} />}
              {b.ivr && ctx.ivr !== null && (
                <span className={`chip ${ctx.ivr >= 50 ? 'magenta' : ''}`} data-tip="g:ivr_chip">
                  IVR {ctx.ivr.toFixed(0)}
                </span>
              )}
              {b.earnings && earnDays !== null && earnDays <= 45 && (
                <span className="chip warn" data-tip="g:ern_chip">
                  ERN {earnDays}d
                </span>
              )}
              {b.extra}
              {bars[bars.length - 1]?.source !== 'real' &&
                (bars[bars.length - 1]?.source === 'synthetic' ? (
                  <span className="chip model" data-tip="g:sim_chip">
                    SIM
                  </span>
                ) : (
                  <span className="chip model" data-tip="g:model_chip">
                    MODEL
                  </span>
                ))}
            </div>
            <div className="lc-bottom num">
              {c.call ? (
                <span className="lc-call">
                  {BUCKET_GLYPHS[c.call.bucket]} {Math.round(c.call.confidence * 100)}%
                </span>
              ) : (
                <span className="dim">no call</span>
              )}
              {pos ? <LivePnl pos={pos} /> : closed.length > 0 && <Pnl cents={pl} />}
            </div>
          </TiltCard>
        );
      })}
      {extra}
    </div>
  );
}

function distanceToShort(p: Position, spot: number): { atr: number | null; em: number | null } {
  const shorts = optionLegsOf(p.legs).filter((l) => l.ratio < 0);
  if (!shorts.length) return { atr: null, em: null };
  const d = Math.min(...shorts.map((s) => Math.abs(s.strike - spot)));
  return {
    atr: p.entry.atr ? d / p.entry.atr : null,
    em: p.entry.expectedMove ? d / p.entry.expectedMove : null,
  };
}

export function PositionsDock() {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const closePosition = useTrading((s) => s.closePosition);
  const cancelOrder = useTrading((s) => s.cancelOrder);
  const selectedPos = useTrading((s) => s.selectedPositionId);
  const selectPosition = useTrading((s) => s.selectPosition);
  const [rolling, setRolling] = useState<Position | null>(null);
  useHotkeys({
    flatten: () => {
      const id = selectedPos ?? session?.openPositions()[0]?.id;
      if (id) {
        sfx('stamp');
        void closePosition(id);
      }
    },
  });
  if (!session) return null;
  const rows = session.positions;
  return (
    <div className="dock" data-testid="positions-dock">
      <div className="section-title">
        Positions <Kbd>Ctrl+1</Kbd> · <Kbd>Alt+F</Kbd> flatten selected
      </div>
      <table className="pos-table num">
        <thead>
          <tr>
            <th>Sym</th>
            <th data-tip="g:structure">Structure</th>
            <th data-tip="g:contracts">Qty</th>
            <th data-tip="g:open_price">Open</th>
            <th data-tip="g:mark">Mark</th>
            <th data-tip="g:pl_open">P/L</th>
            <th data-tip="g:pct_risk">% risk</th>
            <th data-tip="g:dte">DTE</th>
            <th data-tip="g:pos_delta">Δ</th>
            <th data-tip="g:pos_theta">Θ/day</th>
            <th data-tip="g:pos_vega">Vega</th>
            <th data-tip="g:brackets">Plan</th>
            <th data-tip="g:to_short">To short</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const view = session.view(p.cardId);
            const m = lastMark(p);
            const pl = p.status === 'open' ? (m?.plCents ?? 0) : (p.realizedCents ?? 0);
            const dte = optionLegsOf(p.legs).length
              ? Math.min(...optionLegsOf(p.legs).map((l) => diffDays(view.now, l.expiration)))
              : null;
            const dist = distanceToShort(p, view.spot());
            return (
              <tr
                key={p.id}
                className={`${p.status} ${selectedPos === p.id ? 'sel' : ''}`}
                onClick={() => selectPosition(p.id)}
                data-testid={`pos-${p.id}`}
              >
                <td>{p.symbol}</td>
                <td>
                  {STRUCTURES[p.structureId].short}
                  {stockRatio(p.legs) !== 0 && <span className="chip warn"> SHARES</span>}
                  {m?.modeled && <span className="chip model"> MODEL</span>}
                </td>
                <td>{p.qty}</td>
                <td>{price(Math.abs(p.openNet))}</td>
                <td>{p.status === 'open' ? price(Math.abs(m?.value ?? 0)) : p.exitReason}</td>
                <td>{p.status === 'open' ? <LivePnl pos={p} /> : <Pnl cents={pl} />}</td>
                <td>{pct(pl / Math.max(1, p.entry.maxLossCents), 0)}</td>
                <td>{p.status === 'open' ? (dte ?? '—') : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.delta ?? 0).toFixed(0) : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.theta ?? 0).toFixed(1) : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.vega ?? 0).toFixed(1) : '—'}</td>
                <td>
                  {p.brackets.targetPl !== null
                    ? `T+${money(Math.round(p.brackets.targetPl * 100 * p.qty * 100))}`
                    : 'T—'}{' '}
                  {p.brackets.stopPl !== null ? (
                    `S−${money(Math.round(p.brackets.stopPl * 100 * p.qty * 100))}`
                  ) : p.flags.stopDeclined ? (
                    <span className="down">STOP DECLINED</span>
                  ) : (
                    'S—'
                  )}
                </td>
                <td>
                  {dist.atr === null ? '—' : `${dist.atr.toFixed(1)} ATR · ${dist.em?.toFixed(2) ?? '—'} EM`}
                </td>
                <td>
                  {p.status === 'open' && (
                    <>
                      <button
                        className="mini-btn"
                        onClick={() => void closePosition(p.id)}
                        data-testid={`close-${p.id}`}
                        data-tip="g:close_pos"
                      >
                        CLOSE
                      </button>
                      <button className="mini-btn" onClick={() => setRolling(p)} data-tip="g:roll">
                        ROLL
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {session.orders.map((o) => (
            <tr key={o.id} className="resting">
              <td>{session.card(o.cardId).displaySymbol}</td>
              <td>{STRUCTURES[o.structureId].short}</td>
              <td>{o.qty}</td>
              <td colSpan={9}>Resting limit {price(Math.abs(o.limit))} · fills if the market comes to you</td>
              <td colSpan={2}>
                <button className="mini-btn" onClick={() => void cancelOrder(o.id)}>
                  CANCEL
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && session.orders.length === 0 && (
            <tr>
              <td colSpan={14} className="dim">
                No positions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rolling && <RollDialog pos={rolling} onClose={() => setRolling(null)} />}
    </div>
  );
}

const ACTION_LABEL: Record<DecisionAction, string> = {
  hold: 'Hold',
  close: 'Close',
  roll: 'Roll',
  adjust: 'Adjust',
  exercise: 'Exercise',
  sell_shares: 'Sell shares at the open',
};
const ACTION_KEY: Partial<Record<DecisionAction, string>> = {
  close: 'C',
  hold: 'H',
  roll: 'R',
  sell_shares: 'S',
};

export function DecisionModal() {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const ff = useTrading((s) => s.ff);
  const decide = useTrading((s) => s.decide);
  const selected = useTrading((s) => s.selectedCardId);
  const select = useTrading((s) => s.select);
  const [rolling, setRolling] = useState<DecisionPoint | null>(null);
  // Reviewing the chart: the dialog tucks into a bar so the full chart can be scrolled and zoomed.
  const peek = useTrading((s) => s.reviewChart);
  const setPeek = useTrading((s) => s.setReviewChart);
  const dp = ff === 'decision' ? session?.decisions[0] : undefined;
  const pos = dp ? session?.position(dp.positionId) : undefined;
  const act = (a: DecisionAction) => {
    if (!dp) return;
    if (a === 'roll') {
      setPeek(false);
      setRolling(dp);
      return;
    }
    sfx(a === 'close' ? 'stamp' : 'click');
    setPeek(false);
    void decide(dp.id, a);
  };
  // The chart behind the dialog shows the stock the decision is about.
  const cardId = pos?.cardId;
  useEffect(() => {
    if (cardId && selected !== cardId) select(cardId);
  }, [dp?.id, cardId]);
  useEffect(() => {
    if (!dp) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyV' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setPeek(!peek);
      } else if (e.key === 'Escape' && peek) setPeek(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dp, peek]);
  useHotkeys(
    dp
      ? {
          confirm: () => act(dp.planned ?? 'hold'),
        }
      : {},
  );
  useEffect(() => {
    // A new decision (or none) always starts as the full dialog.
    if (!dp && peek) setPeek(false);
  }, [dp?.id]);
  if (!dp || !pos || !session) return null;
  const m = lastMark(pos);
  const view = session.view(pos.cardId);
  const buttons = dp.options.map((o) => (
    <button
      key={o}
      className={`pixel-btn ${dp.planned === o ? 'primary' : ''}`}
      onClick={() => act(o)}
      data-testid={`dp-${o}`}
      title={ACTION_KEY[o] ? `Hotkey ${ACTION_KEY[o]}` : undefined}
    >
      {ACTION_LABEL[o]} {dp.planned === o && <span className="chip good">PLAN</span>}
    </button>
  ));
  const roll = rolling && (
    <RollDialog
      pos={pos}
      onClose={() => setRolling(null)}
      onRoll={(legs) => {
        void decide(rolling.id, 'roll', legs);
      }}
    />
  );
  if (peek)
    return (
      <div className="dp-dock panel" data-testid="decision-dock" role="region" aria-label="Decision">
        <div className={`dp-kind kind-${dp.kind}`}>
          {dp.title}: {pos.symbol}
        </div>
        <span className="num">
          P/L <Pnl cents={m?.plCents ?? 0} />
        </span>
        <div className="dp-actions">{buttons}</div>
        <button className="pixel-btn" onClick={() => setPeek(false)} data-testid="dp-back">
          ▣ BACK <Kbd>V</Kbd>
        </button>
        {roll}
      </div>
    );
  const legs = optionLegsOf(pos.legs);
  return (
    <Modal testId="decision-modal">
      <div className={`dp-kind kind-${dp.kind}`}>DECISION POINT · {view.dayLabel()}</div>
      <h2>
        {dp.title}: {pos.symbol}
      </h2>
      <p className="dp-msg">{dp.message}</p>
      <div className="dp-chart" data-testid="dp-mini-chart">
        <MiniCandles
          bars={view.bars().slice(-30)}
          shorts={legs.filter((l) => l.ratio < 0).map((l) => l.strike)}
          longs={legs.filter((l) => l.ratio > 0).map((l) => l.strike)}
          width={440}
          height={150}
          tags
        />
      </div>
      <div className="num dp-facts">
        <span>
          P/L <Pnl cents={m?.plCents ?? 0} />
        </span>
        <span>spot {view.spot().toFixed(2)}</span>
        <span>short {pos.entry.shortStrikes.join('/') || '—'}</span>
      </div>
      <div className="modal-actions dp-actions">
        {buttons}
        <button
          className="pixel-btn"
          onClick={() => setPeek(true)}
          data-testid="dp-peek"
          title="Hide this dialog to scroll and zoom the full chart; your choices stay in a bar"
        >
          ◐ REVIEW CHART <Kbd>V</Kbd>
        </button>
      </div>
      {dp.kind === 'stop_hit' && (
        <p className="dp-warn">
          Holding past your own stop is how small losses become big ones. It will cost stress.
        </p>
      )}
      <p className="dim num">
        <Kbd>Enter</Kbd> follows the plan
      </p>
      {roll}
    </Modal>
  );
}

export function FastForwardBar() {
  const ff = useTrading((s) => s.ff);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const toggle = useTrading((s) => s.toggle);
  const pace = useTrading((s) => s.pace);
  useHotkeys({ playPause: () => toggle() });
  const started = !!session?.clockStarted;
  const label =
    ff === 'running'
      ? '❚❚ PAUSE'
      : pace === 'step' && started
        ? '▶ NEXT DAY'
        : started
          ? '▶ RESUME'
          : '▶ START CLOCK';
  return (
    <div className="ffbar num" data-testid="ff-bar">
      <button
        className={`pixel-btn ${ff === 'running' ? '' : 'primary'}`}
        onClick={() => toggle()}
        disabled={ff === 'decision' || ff === 'done'}
        data-testid="play-button"
        data-tip="g:start_clock"
      >
        {label} <span className="kbd">Space</span>
      </button>
      <PaceControls />
      <span className="ff-state" data-testid="ff-state">
        {ff.toUpperCase()} · day {session?.dayIndex ?? 0}
      </span>
    </div>
  );
}

export function AnalyzePanel() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const whatIf = useTrading((s) => s.whatIf);
  const setWhatIf = useTrading((s) => s.setWhatIf);
  const builder = useTrading((s) => s.builder);
  const plan = useTrading((s) => s.plan)();
  useTrading((s) => s.version);
  const [heat, setHeat] = useState(true);
  if (!session || !cardId) return null;
  const chain = session.chain(cardId);
  const exp = builder.expiration;
  const view = session.view(cardId);
  const rows =
    chain && exp
      ? quotesFor(chain, exp, 'C').map((c) => ({
          c,
          p: chain.quotes.find((q) => q.expiration === exp && q.right === 'P' && q.strike === c.strike),
        }))
      : [];
  const env: PricingEnv | null = chain
    ? {
        date: view.now,
        rate: view.rate(),
        divYield: 0,
        ivOf: (l) =>
          chain.quotes.find(
            (q) => q.expiration === l.expiration && q.right === l.right && q.strike === l.strike,
          )?.iv ?? 0.3,
      }
    : null;
  const spot = chain?.spot ?? view.spot();
  const dte = exp ? diffDays(view.now, exp) : 30;
  return (
    <div className="analyze" data-testid="analyze-panel">
      <div className="whatif num">
        <div className="section-title">What-if</div>
        <label>
          Price {whatIf.pricePct > 0 ? '+' : ''}
          {whatIf.pricePct}%
          <input
            type="range"
            min={-20}
            max={20}
            step={0.5}
            value={whatIf.pricePct}
            onChange={(e) => setWhatIf({ pricePct: Number(e.target.value) })}
          />
        </label>
        <label>
          Days +{whatIf.days}
          <input
            type="range"
            min={0}
            max={Math.max(1, dte)}
            step={1}
            value={whatIf.days}
            onChange={(e) => setWhatIf({ days: Number(e.target.value) })}
          />
        </label>
        <label>
          IV {whatIf.ivPts > 0 ? '+' : ''}
          {whatIf.ivPts} pts
          <input
            type="range"
            min={-30}
            max={30}
            step={1}
            value={whatIf.ivPts}
            onChange={(e) => setWhatIf({ ivPts: Number(e.target.value) })}
          />
        </label>
        {plan?.mid !== null && plan?.mid !== undefined && env && (
          <div className="whatif-out">
            P/L then:{' '}
            <Pnl
              cents={Math.round(
                payoffNow(
                  plan.legs,
                  plan.mid,
                  spot * (1 + whatIf.pricePct / 100),
                  env,
                  whatIf.days,
                  whatIf.ivPts / 100,
                ) *
                  100 *
                  builder.qty *
                  100,
              )}
            />
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> P/L heat strip
        </label>
      </div>
      {heat && plan?.mid !== null && plan?.mid !== undefined && env && (
        <div className="heat num">
          {Array.from({ length: 6 }, (_, r) => {
            const d = Math.round((dte * r) / 5);
            return (
              <div key={r} className="heat-row">
                <span className="heat-lbl">+{d}d</span>
                {Array.from({ length: 13 }, (_, c) => {
                  const px = spot * (1 + (c - 6) * 0.02);
                  const v = payoffNow(plan.legs, plan.mid as number, px, env, d, 0) * 100 * builder.qty;
                  const a = Math.min(1, Math.abs(v) / Math.max(1, plan.maxLossCents / 100));
                  return (
                    <span
                      key={c}
                      className="heat-cell"
                      title={`${px.toFixed(2)} → ${v.toFixed(0)}`}
                      style={{
                        background:
                          v >= 0 ? `rgba(77,255,154,${0.1 + a * 0.6})` : `rgba(255,79,109,${0.1 + a * 0.6})`,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          <div className="heat-row">
            <span className="heat-lbl" />
            {Array.from({ length: 13 }, (_, c) => (
              <span key={c} className="heat-x">
                {c % 3 === 0 ? `${(c - 6) * 2}%` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="chain-table-wrap">
        <table className="chain-table num" data-testid="chain-table">
          <thead>
            <tr>
              <th>C bid</th>
              <th>C ask</th>
              <th>C Δ</th>
              <th>IV</th>
              <th>Strike</th>
              <th>P bid</th>
              <th>P ask</th>
              <th>P Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, p }) => (
              <tr key={c.strike} className={Math.abs(c.strike - spot) < spot * 0.01 ? 'atm' : ''}>
                <td>{price(c.bid)}</td>
                <td>{price(c.ask)}</td>
                <td>{c.delta.toFixed(2)}</td>
                <td>{(c.iv * 100).toFixed(1)}</td>
                <td className="strike">{c.strike}</td>
                <td>{price(p?.bid)}</td>
                <td>{price(p?.ask)}</td>
                <td>{p?.delta.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
