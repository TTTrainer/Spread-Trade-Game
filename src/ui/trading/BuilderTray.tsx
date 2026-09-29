import { useState } from 'react';
import { limitFillProbability } from '../../engine/orders/fill';
import { STRUCTURES } from '../../engine/strategies/structures';
import type { StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { Kbd, Modal, TiltCard } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { tradeOpen, useTrading } from '../store/trading';
import { useApp } from '../store/app';

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
      <div className="section-title" data-tip="g:structure">
        Structure
      </div>
      <div className="structure-row">
        {ids.map((id) => (
          <TiltCard
            key={id}
            className="structure-card"
            selected={builder.structureId === id}
            onClick={() => setStructure(id)}
            testId={`structure-${id}`}
            tip={`struct:${id}`}
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

/** One-key setups: a weekly, a 30-45 day swing, and the player's own saved setup. */
export function SetupPresets() {
  const applyPreset = useTrading((s) => s.applyPreset);
  const saveMySetup = useTrading((s) => s.saveMySetup);
  const open = useTrading(tradeOpen);
  const mine = useApp((s) => s.settings.game.mySetup);
  const off = !open;
  return (
    <div className="presets num" data-testid="presets">
      <button
        className="preset"
        disabled={off}
        onClick={() => applyPreset('weekly')}
        data-tip="g:preset_weekly"
        data-testid="preset-weekly"
      >
        WEEKLY <span className="kbd">W</span>
      </button>
      <button
        className="preset"
        disabled={off}
        onClick={() => applyPreset('swing')}
        data-tip="g:preset_swing"
        data-testid="preset-swing"
      >
        SWING <span className="kbd">M</span>
      </button>
      <button
        className={`preset ${mine ? '' : 'unset'}`}
        disabled={off}
        onClick={() => applyPreset('mine')}
        data-tip="g:preset_mine"
        data-testid="preset-mine"
      >
        MINE <span className="kbd">Y</span>
      </button>
      <button
        className="preset save"
        disabled={off}
        onClick={() => saveMySetup()}
        data-tip="g:preset_save"
        data-testid="preset-save"
      >
        SAVE
      </button>
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
  const open = useTrading(tradeOpen);
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
  const disabled = !plan?.ok || !open || hasPosition;
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
        Order{' '}
        <span className="dim" data-tip="g:auto_send">
          {builder.autoSend ? 'sends at once' : 'confirms first'} <Kbd>Alt+A</Kbd>
        </span>
      </div>
      <div className="ticket-grid num">
        <div className="seg">
          <button
            className={builder.orderType === 'limit' ? 'sel' : ''}
            onClick={() => setBuilder({ orderType: 'limit' })}
            data-tip="g:order_limit"
          >
            LIMIT
          </button>
          <button
            className={builder.orderType === 'market' ? 'sel' : ''}
            onClick={() => setBuilder({ orderType: 'market' })}
            data-testid="order-market"
            data-tip="g:order_market"
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
            <span data-tip="g:mid">MID {price(mid !== null ? Math.abs(mid) : null)}</span>
            <span className="limit-now" data-tip="g:fill_chance">
              {builder.orderType === 'market'
                ? 'NATURAL'
                : `LMT ${price(limit !== null ? Math.abs(limit) : null)}`}{' '}
              · fill {Math.round(prob * 100)}%
            </span>
            <span data-tip="g:natural">NAT {price(nat !== null ? Math.abs(nat) : null)}</span>
          </div>
        </div>
        <div className="plan-chip" data-tip="g:plan_set">
          PLAN · take profit at {Math.round(builder.targetPct * 100)}% · stop at {builder.stopMult}× credit
        </div>
        {earnings && (
          <label className="toggle warn-text" data-testid="earnings-ack" data-tip="g:earnings_ack">
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
            data-tip="g:sell"
          >
            SELL {credit && mid !== null ? `+${price(-mid)}` : ''}
            {credit && plan?.ok && (
              <span className="btn-sub num">
                risk ${Math.round(plan.maxLossCents / 100).toLocaleString()} · POP{' '}
                {pct(plan.metrics?.pop ?? 0, 0)}
              </span>
            )}
          </button>
          <button
            className="pixel-btn buy"
            disabled={disabled || credit}
            onClick={() => go('buy')}
            data-testid="buy-button"
            data-tip="g:buy"
          >
            BUY {!credit && mid !== null ? `−${price(mid)}` : ''}
            {!credit && plan?.ok && (
              <span className="btn-sub num">
                risk ${Math.round(plan.maxLossCents / 100).toLocaleString()} · POP{' '}
                {pct(plan.metrics?.pop ?? 0, 0)}
              </span>
            )}
          </button>
        </div>
      </div>
      {confirm && plan && (
        <Modal onClose={() => setConfirm(null)} testId="confirm-order">
          <h2>Confirm {confirm === 'sell' ? 'sell' : 'buy'}</h2>
          <div className="num confirm-body">
            <div>
              {plan.qty} × {STRUCTURES[builder.structureId].name} on {card?.displaySymbol}
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
