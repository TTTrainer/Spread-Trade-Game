import { useEffect, useMemo, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { closeQuote, lastMark, optionLegsOf, stockRatio } from '../../engine/lifecycle/position';
import { BUCKET_GLYPHS } from '../../engine/scoring/calls';
import { expirationsOf, quotesFor, stepStrike, STRUCTURES, mid } from '../../engine/strategies/structures';
import { payoffNow, type PricingEnv } from '../../engine/strategies/metrics';
import type { DecisionAction, DecisionPoint, Position } from '../../engine/lifecycle/types';
import type { OptionLeg } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { Kbd, Modal, Pnl, TiltCard } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { useTrading } from '../store/trading';

function Sparkline({ closes, w = 150, h = 36 }: { closes: number[]; w?: number; h?: number }) {
  if (closes.length < 2) return null;
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - ((c - lo) / (hi - lo || 1)) * h).toFixed(1)}`).join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.5} />
    </svg>
  );
}

export function LineupColumn({ extra }: { extra?: React.ReactNode }) {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const selected = useTrading((s) => s.selectedCardId);
  const select = useTrading((s) => s.select);
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
        const pl = pos ? (lastMark(pos)?.plCents ?? 0) : closed.reduce((a, p) => a + (p?.realizedCents ?? 0), 0);
        const earnDays = ctx.nextEarnings ? diffDays(view.now, ctx.nextEarnings.date) : null;
        return (
          <TiltCard key={c.id} selected={selected === c.id} onClick={() => select(c.id)} className="lineup-card" testId={`card-${i}`}>
            <div className="lc-top">
              <span className="lc-sym">{c.displaySymbol}</span>
              <span className="lc-px num">{view.spot().toFixed(2)}</span>
            </div>
            {!session.config.blind && c.realSymbol !== c.displaySymbol && <div className="lc-name">{c.realSymbol}</div>}
            <Sparkline closes={bars.slice(-60).map((b) => b.close)} />
            <div className="lc-badges">
              <span className="chip">{view.dayLabel()}</span>
              {ctx.ivr !== null && <span className={`chip ${ctx.ivr >= 50 ? 'magenta' : ''}`}>IVR {ctx.ivr.toFixed(0)}</span>}
              {earnDays !== null && earnDays <= 45 && <span className="chip warn">ERN {earnDays}d</span>}
              {bars[bars.length - 1]?.source !== 'real' && <span className="chip model">{bars[bars.length - 1]?.source === 'synthetic' ? 'SIM' : 'MODEL'}</span>}
              <span className="chip">{bars.length - 1}d hist</span>
            </div>
            <div className="lc-bottom num">
              {c.call ? <span className="lc-call">{BUCKET_GLYPHS[c.call.bucket]} {Math.round(c.call.confidence * 100)}%</span> : <span className="dim">no call</span>}
              {(pos || closed.length > 0) && <Pnl cents={pl} />}
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
  return { atr: p.entry.atr ? d / p.entry.atr : null, em: p.entry.expectedMove ? d / p.entry.expectedMove : null };
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
            <th>Structure</th>
            <th>Qty</th>
            <th>Open</th>
            <th>Mark</th>
            <th>P/L</th>
            <th>% risk</th>
            <th>DTE</th>
            <th>Δ</th>
            <th>Θ/day</th>
            <th>Vega</th>
            <th>Brackets</th>
            <th>To short</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const view = session.view(p.cardId);
            const m = lastMark(p);
            const pl = p.status === 'open' ? (m?.plCents ?? 0) : (p.realizedCents ?? 0);
            const dte = optionLegsOf(p.legs).length ? Math.min(...optionLegsOf(p.legs).map((l) => diffDays(view.now, l.expiration))) : null;
            const dist = distanceToShort(p, view.spot());
            return (
              <tr key={p.id} className={`${p.status} ${selectedPos === p.id ? 'sel' : ''}`} onClick={() => selectPosition(p.id)} data-testid={`pos-${p.id}`}>
                <td>{p.symbol}</td>
                <td>
                  {STRUCTURES[p.structureId].short}
                  {stockRatio(p.legs) !== 0 && <span className="chip warn"> SHARES</span>}
                  {m?.modeled && <span className="chip model"> MODEL</span>}
                </td>
                <td>{p.qty}</td>
                <td>{price(Math.abs(p.openNet))}</td>
                <td>{p.status === 'open' ? price(Math.abs(m?.value ?? 0)) : p.exitReason}</td>
                <td>
                  <Pnl cents={pl} />
                </td>
                <td>{pct(pl / Math.max(1, p.entry.maxLossCents), 0)}</td>
                <td>{p.status === 'open' ? (dte ?? '—') : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.delta ?? 0).toFixed(0) : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.theta ?? 0).toFixed(1) : '—'}</td>
                <td>{p.status === 'open' ? (m?.greeks.vega ?? 0).toFixed(1) : '—'}</td>
                <td>
                  {p.brackets.targetPl !== null ? `T+${money(Math.round(p.brackets.targetPl * 100 * p.qty * 100))}` : 'T—'} {p.brackets.stopPl !== null ? `S−${money(Math.round(p.brackets.stopPl * 100 * p.qty * 100))}` : p.flags.stopDeclined ? <span className="down">STOP DECLINED</span> : 'S—'}
                </td>
                <td>{dist.atr === null ? '—' : `${dist.atr.toFixed(1)} ATR · ${dist.em?.toFixed(2) ?? '—'} EM`}</td>
                <td>
                  {p.status === 'open' && (
                    <>
                      <button className="mini-btn" onClick={() => void closePosition(p.id)} data-testid={`close-${p.id}`}>
                        CLOSE
                      </button>
                      <button className="mini-btn" onClick={() => setRolling(p)}>
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

/** Pick a new expiration and strikes; shows the net credit or debit of the roll. */
export function RollDialog({ pos, onClose, onRoll }: { pos: Position; onClose: () => void; onRoll?: (legs: OptionLeg[]) => void }) {
  const session = useTrading((s) => s.session);
  const rollPosition = useTrading((s) => s.rollPosition);
  const [exp, setExp] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const view = session?.view(pos.cardId);
  const [chain, setChain] = useState<Awaited<ReturnType<NonNullable<typeof view>['loadChain']>> | null>(null);
  useEffect(() => {
    if (!view) return;
    // Rolling needs today's full chain, fetched on demand (today is the clock, so it's allowed).
    void view.loadChain().then((c) => {
      setChain(c);
      const current = optionLegsOf(pos.legs)[0]?.expiration;
      setExp(expirationsOf(c).find((e) => current && diffDays(current, e) >= 7) ?? expirationsOf(c).at(-1) ?? null);
    });
  }, [view, pos.id]);
  const legs = useMemo(() => {
    if (!chain || !exp) return null;
    const out: OptionLeg[] = [];
    for (const l of optionLegsOf(pos.legs)) {
      const listed = quotesFor(chain, exp, l.right).map((q) => q.strike);
      if (!listed.length) return null;
      let k = listed.reduce((best, x) => (Math.abs(x - l.strike) < Math.abs(best - l.strike) ? x : best), listed[0]);
      if (shift) k = stepStrike(chain, exp, l.right, k, shift) ?? k;
      out.push({ ...l, expiration: exp, strike: k });
    }
    return out;
  }, [chain, exp, shift]);
  const net = useMemo(() => {
    if (!chain || !legs || !view) return null;
    const find = (l: OptionLeg) => chain.quotes.find((q) => q.expiration === l.expiration && q.right === l.right && Math.abs(q.strike - l.strike) < 1e-6);
    let open = 0;
    for (const l of legs) {
      const q = find(l);
      if (!q) return null;
      open += l.ratio * mid(q);
    }
    const close = closeQuote(pos.legs, { date: view.now, spot: view.spot(), open: view.spot(), rate: view.rate(), divYield: 0, quote: (k) => view.quote(k), earningsTomorrow: false, exDivToday: null, exDivTomorrow: null, gapDay: false, atr: null }, pos.lastLegs).mid;
    return close + open;
  }, [chain, legs]);
  const exps = chain ? expirationsOf(chain).filter((e) => view && diffDays(view.now, e) >= 1) : [];
  return (
    <Modal onClose={onClose} testId="roll-dialog">
      <h2>Roll {pos.symbol}</h2>
      <div className="section-title">New expiration</div>
      <div className="chip-row">
        {exps.map((e) => (
          <button key={e} className={`exp-chip num ${exp === e ? 'sel' : ''}`} onClick={() => setExp(e)}>
            {view ? diffDays(view.now, e) : 0}d
          </button>
        ))}
      </div>
      <div className="section-title">Move strikes</div>
      <div className="stepper num">
        <button onClick={() => setShift(shift - 1)}>−</button>
        <span>{shift > 0 ? `+${shift}` : shift} strikes</span>
        <button onClick={() => setShift(shift + 1)}>+</button>
      </div>
      <div className="num roll-legs">
        {legs?.map((l, i) => (
          <div key={i}>
            {l.ratio < 0 ? 'SELL' : 'BUY'} {l.strike} {l.right === 'C' ? 'call' : 'put'} {view ? `${diffDays(view.now, l.expiration)}d` : ''}
          </div>
        ))}
        <div className={net !== null && net < 0 ? 'up' : 'down'}>{net === null ? '—' : net < 0 ? `Net credit ${price(-net)}` : `Net debit ${price(net)} (rolling for a debit)`}</div>
      </div>
      <div className="modal-actions">
        <button
          className="pixel-btn primary"
          disabled={!legs}
          data-testid="roll-confirm"
          onClick={() => {
            if (!legs) return;
            if (onRoll) onRoll(legs);
            else void rollPosition(pos.id, legs);
            onClose();
          }}
        >
          ROLL
        </button>
        <button className="pixel-btn" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </Modal>
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
const ACTION_KEY: Partial<Record<DecisionAction, string>> = { close: 'C', hold: 'H', roll: 'R', sell_shares: 'S' };

export function DecisionModal() {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const ff = useTrading((s) => s.ff);
  const decide = useTrading((s) => s.decide);
  const [rolling, setRolling] = useState<DecisionPoint | null>(null);
  const dp = ff === 'decision' ? session?.decisions[0] : undefined;
  const pos = dp ? session?.position(dp.positionId) : undefined;
  const act = (a: DecisionAction) => {
    if (!dp) return;
    if (a === 'roll') {
      setRolling(dp);
      return;
    }
    sfx(a === 'close' ? 'stamp' : 'click');
    void decide(dp.id, a);
  };
  useHotkeys(
    dp
      ? {
          confirm: () => act(dp.planned ?? 'hold'),
        }
      : {},
  );
  if (!dp || !pos || !session) return null;
  const m = lastMark(pos);
  const view = session.view(pos.cardId);
  return (
    <Modal testId="decision-modal">
      <div className={`dp-kind kind-${dp.kind}`}>DECISION POINT · {view.dayLabel()}</div>
      <h2>
        {dp.title}: {pos.symbol}
      </h2>
      <p className="dp-msg">{dp.message}</p>
      <div className="num dp-facts">
        <span>
          P/L <Pnl cents={m?.plCents ?? 0} />
        </span>
        <span>spot {view.spot().toFixed(2)}</span>
        <span>short {pos.entry.shortStrikes.join('/') || '—'}</span>
      </div>
      <div className="modal-actions dp-actions">
        {dp.options.map((o) => (
          <button
            key={o}
            className={`pixel-btn ${dp.planned === o ? 'primary' : ''}`}
            onClick={() => act(o)}
            data-testid={`dp-${o}`}
            title={ACTION_KEY[o] ? `Hotkey ${ACTION_KEY[o]}` : undefined}
          >
            {ACTION_LABEL[o]} {dp.planned === o && <span className="chip good">PLAN</span>}
          </button>
        ))}
      </div>
      {dp.kind === 'stop_hit' && <p className="dp-warn">Holding past your own stop is how small losses become big ones. It will cost stress.</p>}
      <p className="dim num">
        <Kbd>Enter</Kbd> follows the plan
      </p>
      {rolling && (
        <RollDialog
          pos={pos}
          onClose={() => setRolling(null)}
          onRoll={(legs) => {
            void decide(rolling.id, 'roll', legs);
          }}
        />
      )}
    </Modal>
  );
}

export function FastForwardBar() {
  const ff = useTrading((s) => s.ff);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const toggle = useTrading((s) => s.toggle);
  const step = useTrading((s) => s.step);
  useHotkeys({ playPause: () => toggle() });
  return (
    <div className="ffbar num" data-testid="ff-bar">
      <button className={`pixel-btn ${ff === 'running' ? '' : 'primary'}`} onClick={() => toggle()} disabled={ff === 'decision' || ff === 'done'} data-testid="play-button">
        {ff === 'running' ? '❚❚ PAUSE' : '▶ START CLOCK'} <span className="kbd">Space</span>
      </button>
      <button className="pixel-btn" onClick={() => void step()} disabled={ff === 'running' || ff === 'decision' || ff === 'done' || !session?.clockStarted}>
        STEP 1 DAY
      </button>
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
  const rows = chain && exp ? quotesFor(chain, exp, 'C').map((c) => ({ c, p: chain.quotes.find((q) => q.expiration === exp && q.right === 'P' && q.strike === c.strike) })) : [];
  const env: PricingEnv | null = chain ? { date: view.now, rate: view.rate(), divYield: 0, ivOf: (l) => chain.quotes.find((q) => q.expiration === l.expiration && q.right === l.right && q.strike === l.strike)?.iv ?? 0.3 } : null;
  const spot = chain?.spot ?? view.spot();
  const dte = exp ? diffDays(view.now, exp) : 30;
  return (
    <div className="analyze" data-testid="analyze-panel">
      <div className="whatif num">
        <div className="section-title">What-if</div>
        <label>
          Price {whatIf.pricePct > 0 ? '+' : ''}
          {whatIf.pricePct}%
          <input type="range" min={-20} max={20} step={0.5} value={whatIf.pricePct} onChange={(e) => setWhatIf({ pricePct: Number(e.target.value) })} />
        </label>
        <label>
          Days +{whatIf.days}
          <input type="range" min={0} max={Math.max(1, dte)} step={1} value={whatIf.days} onChange={(e) => setWhatIf({ days: Number(e.target.value) })} />
        </label>
        <label>
          IV {whatIf.ivPts > 0 ? '+' : ''}
          {whatIf.ivPts} pts
          <input type="range" min={-30} max={30} step={1} value={whatIf.ivPts} onChange={(e) => setWhatIf({ ivPts: Number(e.target.value) })} />
        </label>
        {plan?.mid !== null && plan?.mid !== undefined && env && (
          <div className="whatif-out">
            P/L then: <Pnl cents={Math.round(payoffNow(plan.legs, plan.mid, spot * (1 + whatIf.pricePct / 100), env, whatIf.days, whatIf.ivPts / 100) * 100 * builder.qty * 100)} />
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
                  return <span key={c} className="heat-cell" title={`${px.toFixed(2)} → ${v.toFixed(0)}`} style={{ background: v >= 0 ? `rgba(77,255,154,${0.1 + a * 0.6})` : `rgba(255,79,109,${0.1 + a * 0.6})` }} />;
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
