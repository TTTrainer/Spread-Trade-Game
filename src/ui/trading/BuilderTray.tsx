import { useState } from 'react';
import { diffDays } from '../../engine/calendar';
import { limitFillProbability } from '../../engine/orders/fill';
import {
  BUCKET_GLYPHS,
  BUCKET_NAMES,
  CONFIDENCES,
  cutoffLabels,
  type Bucket,
} from '../../engine/scoring/calls';
import { expirationsOf, STRUCTURES } from '../../engine/strategies/structures';
import type { StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { Kbd, Modal, TiltCard } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { useTrading } from '../store/trading';

export function CallCards() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  useTrading((s) => s.version);
  const confidence = useTrading((s) => s.confidence);
  const setCall = useTrading((s) => s.setCall);
  const setConfidence = useTrading((s) => s.setConfidence);
  const plan = useTrading((s) => s.plan)();
  const ff = useTrading((s) => s.ff);
  const card = session && cardId ? session.card(cardId) : null;
  const emPct =
    plan?.entry?.expectedMovePct ??
    (session && cardId ? (session.context(cardId).iv30 ?? 0.3) * Math.sqrt(30 / 365) * 0.8 : 0.05);
  const labels = cutoffLabels({ emPct, mode: session?.config.callMode ?? 'em' });
  const locked = ff !== 'idle' || !!card?.positionIds.length;
  return (
    <div className="tray-section calls" data-testid="call-cards">
      <div className="section-title">
        Call your shot <Kbd>1-5</Kbd> <Kbd>Shift+1-5</Kbd>
      </div>
      <div className="call-row">
        {([0, 1, 2, 3, 4] as Bucket[]).map((b) => (
          <TiltCard
            key={b}
            className={`call-card b${b}`}
            selected={card?.call?.bucket === b}
            onClick={() => !locked && void setCall(b)}
            testId={`call-${b}`}
            disabled={locked && card?.call?.bucket !== b}
          >
            <div className="call-glyph">{BUCKET_GLYPHS[b]}</div>
            <div className="call-name">{BUCKET_NAMES[b]}</div>
            <div className="call-cut num">{labels[b]}</div>
          </TiltCard>
        ))}
      </div>
      <div
        className="conf-row"
        onWheel={(e) =>
          !locked &&
          void setConfidence(
            Math.max(0.5, Math.min(0.9, Math.round((confidence + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)),
          )
        }
      >
        {CONFIDENCES.map((c) => (
          <button
            key={c}
            className={`conf-btn num ${Math.abs(confidence - c) < 1e-6 ? 'sel' : ''}`}
            onClick={() => !locked && void setConfidence(c)}
            data-testid={`conf-${Math.round(c * 100)}`}
          >
            {Math.round(c * 100)}%
          </button>
        ))}
      </div>
    </div>
  );
}

export function StructureCards({
  allowed,
  levels,
}: {
  allowed?: StructureId[];
  levels?: Partial<Record<StructureId, number>>;
}) {
  const builder = useTrading((s) => s.builder);
  const setStructure = useTrading((s) => s.setStructure);
  const ids = allowed ?? (Object.keys(STRUCTURES) as StructureId[]);
  return (
    <div className="tray-section structures" data-testid="structure-cards">
      <div className="section-title">
        Structure <Kbd>Alt+R</Kbd> reverse
      </div>
      <div className="structure-row">
        {ids.map((id) => (
          <TiltCard
            key={id}
            className="structure-card"
            selected={builder.structureId === id}
            onClick={() => setStructure(id)}
            testId={`structure-${id}`}
            title={STRUCTURES[id].blurb}
          >
            <div className="st-name">{STRUCTURES[id].short}</div>
            <div className={`st-kind num ${STRUCTURES[id].credit ? 'credit' : 'debit'}`}>
              {STRUCTURES[id].credit ? 'CREDIT' : 'DEBIT'}
            </div>
            {levels && <div className="st-level num">LV {levels[id] ?? 1}</div>}
          </TiltCard>
        ))}
      </div>
    </div>
  );
}

export function ExpiryChips() {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  if (!session || !cardId) return null;
  const chain = session.chain(cardId);
  const now = session.view(cardId).now;
  const exps = chain ? expirationsOf(chain) : [];
  const shown = exps.filter((e) => {
    const d = diffDays(now, e);
    return (d >= 1 && d <= 10) || (d >= 28 && d <= 47) || e === builder.expiration;
  });
  const two = STRUCTURES[builder.structureId].twoExpiries;
  const backs = exps.filter((e) => builder.expiration && diffDays(builder.expiration, e) >= 14);
  return (
    <div className="tray-section expiries" data-testid="expiry-chips">
      <div className="section-title">Expiration</div>
      <div className="chip-row">
        {shown.map((e) => {
          const d = diffDays(now, e);
          return (
            <button
              key={e}
              className={`exp-chip num ${builder.expiration === e ? 'sel' : ''} ${d <= 10 ? 'weekly' : 'monthly'}`}
              onClick={() => {
                sfx('click');
                setBuilder({
                  expiration: e,
                  legs: null,
                  backExpiration: exps.find((x) => diffDays(e, x) >= 21) ?? null,
                });
              }}
              data-testid={`exp-${d}`}
            >
              {d}d{session.config.blind ? '' : ` ${e.slice(5)}`}
            </button>
          );
        })}
      </div>
      {two && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>
            Back month
          </div>
          <div className="chip-row">
            {backs.map((e) => (
              <button
                key={e}
                className={`exp-chip num ${builder.backExpiration === e ? 'sel' : ''}`}
                onClick={() => setBuilder({ backExpiration: e, legs: null })}
              >
                {diffDays(now, e)}d
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SizeControls() {
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const session = useTrading((s) => s.session);
  const plan = useTrading((s) => s.plan)();
  const hasWidth = ![
    'long_straddle',
    'long_strangle',
    'covered_call',
    'cash_secured_put',
    'calendar',
    'double_calendar',
  ].includes(builder.structureId);
  const cap = session?.config.riskCapPct ?? 0.1;
  const risk = plan?.riskPct ?? 0;
  return (
    <div className="tray-section size" data-testid="size-controls">
      <div className="section-title">Build</div>
      <div className="ctl-grid num">
        <label>Δ short</label>
        <input
          type="range"
          min={0.1}
          max={0.5}
          step={0.01}
          value={builder.delta}
          onChange={(e) => setBuilder({ delta: Number(e.target.value), anchor: null, legs: null })}
          data-testid="delta-slider"
        />
        <span>{builder.anchor !== null ? `K ${builder.anchor}` : builder.delta.toFixed(2)}</span>
        {hasWidth && (
          <>
            <label>Width</label>
            <div
              className="stepper"
              onWheel={(e) =>
                setBuilder({
                  width: Math.max(1, Math.min(12, builder.width + (e.deltaY < 0 ? 1 : -1))),
                  legs: null,
                })
              }
            >
              <button onClick={() => setBuilder({ width: Math.max(1, builder.width - 1), legs: null })}>
                −
              </button>
              <span data-testid="width-value">
                {plan?.metrics ? `$${price(plan.metrics.width)}` : builder.width}
              </span>
              <button
                onClick={() => setBuilder({ width: Math.min(12, builder.width + 1), legs: null })}
                data-testid="width-plus"
              >
                +
              </button>
            </div>
            <span>{builder.width} str</span>
          </>
        )}
        <label>Contracts</label>
        <div className="stepper">
          <button onClick={() => setBuilder({ qty: Math.max(1, builder.qty - 1) })} data-testid="qty-minus">
            −
          </button>
          <span data-testid="qty-value">{builder.qty}</span>
          <button onClick={() => setBuilder({ qty: Math.min(50, builder.qty + 1) })} data-testid="qty-plus">
            +
          </button>
        </div>
        <span
          className={risk > cap ? 'down' : risk > cap * 0.6 ? 'warn-text' : ''}
          data-testid="risk-readout"
        >
          {pct(risk)} / {pct(cap, 0)}
        </span>
      </div>
      {plan && !plan.ok && plan.reason && (
        <div className="build-error" data-testid="build-error">
          {plan.reason}
        </div>
      )}
    </div>
  );
}

export function OrderTicket() {
  const builder = useTrading((s) => s.builder);
  const setBuilder = useTrading((s) => s.setBuilder);
  const place = useTrading((s) => s.place);
  const plan = useTrading((s) => s.plan)();
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  const ff = useTrading((s) => s.ff);
  const [confirm, setConfirm] = useState<null | 'buy' | 'sell'>(null);
  const card = session && cardId ? session.card(cardId) : null;
  const hasPosition =
    !!card?.positionIds.some((id) => session?.position(id)?.status === 'open') || !!card?.orderIds.length;
  const mid = plan?.mid ?? null;
  const nat = plan?.natural ?? null;
  const credit = mid !== null && mid < 0;
  const limit = mid !== null && nat !== null ? mid + (nat - mid) * builder.limitFrac : null;
  const prob =
    mid !== null && nat !== null && limit !== null
      ? builder.orderType === 'market'
        ? 1
        : limitFillProbability({ mid, natural: nat }, limit, session?.config.execution)
      : 0;
  const disabled = !plan?.ok || ff !== 'idle' || hasPosition;
  const earnings = plan?.entry?.earningsInside;

  const go = (side: 'buy' | 'sell') => {
    if (disabled) {
      sfx('error');
      return;
    }
    if (builder.autoSend) void place(side);
    else {
      sfx('select');
      setConfirm(side);
    }
  };

  useHotkeys({
    sell: () => go('sell'),
    buy: () => go('buy'),
    autoSend: () => {
      sfx('click');
      setBuilder({ autoSend: !builder.autoSend });
    },
    confirm: () => {
      if (confirm) {
        const side = confirm;
        setConfirm(null);
        void place(side);
      }
    },
  });

  return (
    <div className="tray-section ticket" data-testid="order-ticket">
      <div className="section-title">
        Order <Kbd>Alt+S</Kbd> sell <Kbd>Alt+B</Kbd> buy <Kbd>Alt+A</Kbd> auto-send{' '}
        {builder.autoSend ? 'ON' : 'off'}
      </div>
      <div className="ticket-grid num">
        <div className="seg">
          <button
            className={builder.orderType === 'limit' ? 'sel' : ''}
            onClick={() => setBuilder({ orderType: 'limit' })}
          >
            LIMIT
          </button>
          <button
            className={builder.orderType === 'market' ? 'sel' : ''}
            onClick={() => setBuilder({ orderType: 'market' })}
            data-testid="order-market"
          >
            MARKET
          </button>
        </div>
        <div className="limit-box">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={builder.limitFrac}
            disabled={builder.orderType === 'market'}
            onChange={(e) => setBuilder({ limitFrac: Number(e.target.value) })}
            data-testid="limit-slider"
          />
          <div className="limit-labels">
            <span>MID {price(mid !== null ? Math.abs(mid) : null)}</span>
            <span className="limit-now">
              {builder.orderType === 'market'
                ? 'NATURAL'
                : `LMT ${price(limit !== null ? Math.abs(limit) : null)}`}{' '}
              · fill {Math.round(prob * 100)}%
            </span>
            <span>NAT {price(nat !== null ? Math.abs(nat) : null)}</span>
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={builder.bracketsOn}
            onChange={(e) => setBuilder({ bracketsOn: e.target.checked })}
          />{' '}
          Brackets
          {builder.bracketsOn && credit && (
            <span className="bracket-edit">
              target
              <select
                value={builder.targetPct}
                onChange={(e) => setBuilder({ targetPct: Number(e.target.value) })}
              >
                {[0.25, 0.4, 0.5, 0.65, 0.75].map((x) => (
                  <option key={x} value={x}>
                    {Math.round(x * 100)}%
                  </option>
                ))}
              </select>
              stop
              <select
                value={builder.stopMult}
                onChange={(e) => setBuilder({ stopMult: Number(e.target.value) })}
              >
                {[1, 1.5, 2, 3].map((x) => (
                  <option key={x} value={x}>
                    {x}x
                  </option>
                ))}
              </select>
            </span>
          )}
        </label>
        {earnings && (
          <label className="toggle warn-text" data-testid="earnings-ack">
            <input
              type="checkbox"
              checked={builder.earningsAck}
              onChange={(e) => setBuilder({ earningsAck: e.target.checked })}
            />{' '}
            Earnings inside: holding through on purpose
          </label>
        )}
        <div className="ticket-buttons">
          <button
            className="pixel-btn sell"
            disabled={disabled || !credit}
            onClick={() => go('sell')}
            data-testid="sell-button"
          >
            SELL {credit && mid !== null ? `+${price(-mid)}` : ''}
          </button>
          <button
            className="pixel-btn buy"
            disabled={disabled || credit}
            onClick={() => go('buy')}
            data-testid="buy-button"
          >
            BUY {!credit && mid !== null ? `−${price(mid)}` : ''}
          </button>
        </div>
      </div>
      {confirm && plan && (
        <Modal onClose={() => setConfirm(null)} testId="confirm-order">
          <h2>Confirm {confirm === 'sell' ? 'sell' : 'buy'}</h2>
          <div className="num confirm-body">
            <div>
              {builder.qty} × {STRUCTURES[builder.structureId].name} on {card?.displaySymbol}
            </div>
            <div>
              {builder.orderType === 'market'
                ? 'Market (natural)'
                : `Limit ${price(limit !== null ? Math.abs(limit) : null)}`}{' '}
              · fill chance {Math.round(prob * 100)}%
            </div>
            <div>
              Max loss {money(plan.maxLossCents)} · max profit{' '}
              {plan.maxProfitCents === null ? 'unlimited' : money(plan.maxProfitCents)} · POP{' '}
              {pct(plan.metrics?.pop ?? 0, 0)}
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="pixel-btn primary"
              data-testid="confirm-send"
              onClick={() => {
                const side = confirm;
                setConfirm(null);
                void place(side);
              }}
            >
              SEND <Kbd>Enter</Kbd>
            </button>
            <button className="pixel-btn" onClick={() => setConfirm(null)}>
              CANCEL
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
