/**
 * Rolling, shown rather than described: the candles with the old strikes (faint) and the new ones,
 * and the two payoffs side by side, "stay" against "roll", counting what closing the old trade
 * locks in. Sliders pick the new expiration and how far to move the strikes.
 */

import { useEffect, useMemo, useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { closeQuote, optionLegsOf } from '../../engine/lifecycle/position';
import type { Position } from '../../engine/lifecycle/types';
import type { Chain } from '../../engine/market/types';
import { atmIv, envFromChain, payoffAtExpiry, probabilityOfProfit } from '../../engine/strategies/metrics';
import { expirationsOf, mid, quotesFor, stepStrike } from '../../engine/strategies/structures';
import type { OptionLeg } from '../../engine/strategies/types';
import { money, pct, price } from '../format';
import { SnapSlider } from '../components/SnapSlider';
import { Modal } from '../components/ui';
import { useTrading } from '../store/trading';
import { MiniCandles } from './DayRecap';

const SHIFTS = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

interface Curve {
  fn: (s: number) => number;
  cls: string;
  label: string;
}

/** Stay against roll: dollars at each expiration price, with the price today marked. */
function RollPayoff({ curves, spot, lo, hi }: { curves: Curve[]; spot: number; lo: number; hi: number }) {
  const W = 440;
  const H = 190;
  const N = 120;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = curves.map((c) => xs.map((x) => c.fn(x)));
  const all = ys.flat();
  const top = Math.max(1, ...all);
  const bot = Math.min(-1, ...all);
  const pad = (top - bot) * 0.08;
  const X = (s: number) => ((s - lo) / (hi - lo)) * W;
  const Y = (v: number) => H - ((v - (bot - pad)) / (top - bot + 2 * pad)) * H;
  return (
    <svg className="roll-payoff" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} data-testid="roll-payoff">
      <rect x={0} y={0} width={W} height={Y(0)} className="rp-win" />
      <rect x={0} y={Y(0)} width={W} height={H - Y(0)} className="rp-lose" />
      <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="rp-zero" />
      <line x1={X(spot)} x2={X(spot)} y1={0} y2={H} className="rp-spot" />
      <text x={X(spot) + 3} y={12} className="rp-t">
        NOW {spot.toFixed(2)}
      </text>
      {curves.map((c, i) => (
        <polyline
          key={c.label}
          className={`rp-line ${c.cls}`}
          points={xs.map((x, j) => `${X(x).toFixed(1)},${Y(ys[i][j]).toFixed(1)}`).join(' ')}
        />
      ))}
      <text x={3} y={H - 4} className="rp-t">
        {lo.toFixed(0)}
      </text>
      <text x={W - 3} y={H - 4} className="rp-t" textAnchor="end">
        {hi.toFixed(0)}
      </text>
    </svg>
  );
}

/** The nearest zero crossing to the price today (the line that matters). */
function breakevenNear(fn: (s: number) => number, spot: number, lo: number, hi: number): number | null {
  let best: number | null = null;
  const N = 400;
  let px = lo;
  let pv = fn(lo);
  for (let i = 1; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const v = fn(x);
    if (v > 0 !== pv > 0) {
      const z = px + ((x - px) * Math.abs(pv)) / (Math.abs(pv) + Math.abs(v) || 1);
      if (best === null || Math.abs(z - spot) < Math.abs(best - spot)) best = z;
    }
    px = x;
    pv = v;
  }
  return best;
}

export function RollDialog({
  pos,
  onClose,
  onRoll,
}: {
  pos: Position;
  onClose: () => void;
  onRoll?: (legs: OptionLeg[]) => void;
}) {
  const session = useTrading((s) => s.session);
  const rollPosition = useTrading((s) => s.rollPosition);
  const [exp, setExp] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const view = session?.view(pos.cardId);
  const [chain, setChain] = useState<Chain | null>(null);
  const old = optionLegsOf(pos.legs);
  useEffect(() => {
    if (!view) return;
    // Rolling needs today's full chain, fetched on demand (today is the clock, so it's allowed).
    void view.loadChain().then((c) => {
      setChain(c);
      const current = old[0]?.expiration;
      setExp(
        expirationsOf(c).find((e) => current && diffDays(current, e) >= 7) ?? expirationsOf(c).at(-1) ?? null,
      );
    });
  }, [view, pos.id]);
  const legs = useMemo(() => {
    if (!chain || !exp) return null;
    const out: OptionLeg[] = [];
    for (const l of old) {
      const listed = quotesFor(chain, exp, l.right).map((q) => q.strike);
      if (!listed.length) return null;
      let k = listed.reduce(
        (best, x) => (Math.abs(x - l.strike) < Math.abs(best - l.strike) ? x : best),
        listed[0],
      );
      if (shift) k = stepStrike(chain, exp, l.right, k, shift) ?? k;
      out.push({ ...l, expiration: exp, strike: k });
    }
    return out;
  }, [chain, exp, shift]);
  const calc = useMemo(() => {
    if (!chain || !legs || !view) return null;
    let openNew = 0;
    for (const l of legs) {
      const q = chain.quotes.find(
        (x) => x.expiration === l.expiration && x.right === l.right && Math.abs(x.strike - l.strike) < 1e-6,
      );
      if (!q) return null;
      openNew += l.ratio * mid(q);
    }
    const close = closeQuote(
      pos.legs,
      {
        date: view.now,
        spot: view.spot(),
        open: view.spot(),
        rate: view.rate(),
        divYield: 0,
        quote: (k) => view.quote(k),
        earningsTomorrow: false,
        exDivToday: null,
        exDivTomorrow: null,
        gapDay: false,
        atr: null,
      },
      pos.lastLegs,
    ).mid;
    // What closing the old trade today locks in, per share (+ is a gain).
    const locked = -pos.openNet - close;
    const env = envFromChain(chain, view.rate());
    const units = 100 * pos.qty;
    const stay = (s: number) => payoffAtExpiry(pos.legs, pos.openNet, s, env) * units;
    const roll = (s: number) => payoffAtExpiry(legs, openNew - locked, s, env) * units;
    const spot = view.spot();
    const ks = [...old, ...legs].map((l) => l.strike);
    const lo = Math.min(spot, ...ks) * 0.92;
    const hi = Math.max(spot, ...ks) * 1.08;
    const sigma = (e: string) => atmIv(chain, e) ?? 0.3;
    const oldExp = old[0]?.expiration ?? view.now;
    const range = (fn: (s: number) => number) => {
      const vs = Array.from({ length: 200 }, (_, i) => fn(lo + ((hi - lo) * i) / 199));
      return { best: Math.max(...vs), worst: Math.min(...vs) };
    };
    return {
      net: close + openNew,
      locked: Math.round(locked * units * 100),
      stay,
      roll,
      spot,
      lo,
      hi,
      stayBe: breakevenNear(stay, spot, lo, hi),
      rollBe: breakevenNear(roll, spot, lo, hi),
      stayPop: probabilityOfProfit(pos.legs, pos.openNet, env, spot, sigma(oldExp)),
      rollPop: probabilityOfProfit(legs, openNew - locked, env, spot, sigma(legs[0].expiration)),
      stayRange: range(stay),
      rollRange: range(roll),
    };
  }, [chain, legs]);
  const exps =
    chain && view
      ? expirationsOf(chain).filter((e) => diffDays(view.now, e) >= 1 && diffDays(view.now, e) <= 90)
      : [];
  const bars = view ? view.bars().slice(-45) : [];
  const shortsOf = (ls: OptionLeg[]) => ls.filter((l) => l.ratio < 0).map((l) => l.strike);
  const longsOf = (ls: OptionLeg[]) => ls.filter((l) => l.ratio > 0).map((l) => l.strike);
  const dte = (e: string) => (view ? diffDays(view.now, e) : 0);
  const cents = (x: number) => Math.round(x * 100);
  return (
    <Modal onClose={onClose} wide testId="roll-dialog">
      <h2>Roll {pos.symbol}</h2>
      <div className="roll-grid">
        <div className="roll-col">
          <div className="section-title">Where the strikes go</div>
          <MiniCandles
            bars={bars}
            shorts={legs ? shortsOf(legs) : []}
            longs={legs ? longsOf(legs) : []}
            ghost={{ shorts: shortsOf(old), longs: longsOf(old) }}
            width={440}
            height={190}
            tags
          />
          <div className="roll-key num">
            <span className="rk-old">┄ now</span>
            <span className="rk-new">━ after the roll</span>
          </div>
          <SnapSlider
            label="Expires"
            testId="roll-exp"
            byValue
            options={exps.map((e) => ({ value: dte(e) }))}
            index={Math.max(0, exps.indexOf(exp ?? ''))}
            onIndex={(i) => setExp(exps[i])}
            readout={exp ? `${dte(exp)} days` : '—'}
            disabled={exps.length === 0}
          />
          <SnapSlider
            label="Strikes"
            testId="roll-shift"
            accent="magenta"
            options={SHIFTS.map((s) => ({
              value: s,
              major: s === 0,
              mark: s === 0 ? '0' : s % 4 === 0 ? `${s > 0 ? '+' : ''}${s}` : undefined,
            }))}
            index={SHIFTS.indexOf(shift)}
            onIndex={(i) => setShift(SHIFTS[i])}
            readout={shift === 0 ? 'same strikes' : `${shift > 0 ? '▲ up' : '▼ down'} ${Math.abs(shift)}`}
          />
          <div className="num roll-legs">
            {old.map((l, i) => {
              const n = legs?.[i];
              return (
                <div key={i}>
                  {l.ratio < 0 ? 'SELL' : 'BUY'} {l.strike}
                  {l.right} <span className="dim">{dte(l.expiration)}d</span>{' '}
                  <span className="amber-text">→</span>{' '}
                  {n ? (
                    <>
                      {n.strike}
                      {n.right} <span className="dim">{dte(n.expiration)}d</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="roll-col">
          <div className="section-title">Stay or roll: P/L at expiration</div>
          {calc && (
            <RollPayoff
              spot={calc.spot}
              lo={calc.lo}
              hi={calc.hi}
              curves={[
                { fn: calc.stay, cls: 'stay', label: 'stay' },
                { fn: calc.roll, cls: 'roll', label: 'roll' },
              ]}
            />
          )}
          {calc && (
            <table className="roll-compare num" data-testid="roll-compare">
              <thead>
                <tr>
                  <th />
                  <th className="rk-old">STAY</th>
                  <th className="rk-new">ROLL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-tip="g:pop">Chance of profit</td>
                  <td>{pct(calc.stayPop, 0)}</td>
                  <td className={calc.rollPop > calc.stayPop ? 'up' : 'down'}>{pct(calc.rollPop, 0)}</td>
                </tr>
                <tr>
                  <td>Breakeven</td>
                  <td>{calc.stayBe !== null ? price(calc.stayBe) : '—'}</td>
                  <td>{calc.rollBe !== null ? price(calc.rollBe) : '—'}</td>
                </tr>
                <tr>
                  <td>Best case</td>
                  <td>{money(cents(calc.stayRange.best))}</td>
                  <td>{money(cents(calc.rollRange.best))}</td>
                </tr>
                <tr>
                  <td>Worst case</td>
                  <td className="down">{money(cents(calc.stayRange.worst))}</td>
                  <td className={calc.rollRange.worst < calc.stayRange.worst ? 'down' : ''}>
                    {money(cents(calc.rollRange.worst))}
                  </td>
                </tr>
                <tr>
                  <td>Days left</td>
                  <td>{old[0] ? dte(old[0].expiration) : '—'}</td>
                  <td>{exp ? dte(exp) : '—'}</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="roll-net num">
            {calc === null ? (
              '—'
            ) : (
              <>
                <div>
                  Closing now locks in{' '}
                  <b className={calc.locked >= 0 ? 'up' : 'down'}>
                    {calc.locked >= 0 ? '▲' : '▼'} {money(calc.locked)}
                  </b>
                </div>
                <div className={calc.net < 0 ? 'up' : 'down'}>
                  {calc.net < 0
                    ? `▲ Net credit ${price(-calc.net)} per share: you are paid to roll`
                    : `▼ Net debit ${price(calc.net)} per share: rolling for a debit adds risk (and stress)`}
                </div>
              </>
            )}
          </div>
        </div>
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
