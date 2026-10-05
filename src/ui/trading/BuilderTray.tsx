import { useState } from 'react';
import { premiumOf } from '../../engine/trading/plan';
import { limitFillProbability } from '../../engine/orders/fill';
import { STRUCTURES } from '../../engine/strategies/structures';
import type { StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money, pct, price } from '../format';
import { Kbd, Modal, TiltCard } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { liveCardId, orderTypeOf, tradeOpen, useTrading } from '../store/trading';
import { useApp } from '../store/app';
import { useSealed } from '../boss';

/** Structures that buy and sell options together: what approval levels call a spread. */
const SPREAD_FAMILIES = ['vertical', 'condor', 'calendar'];

export function StructureCards({
  allowed,
  levels,
}: {
  allowed?: StructureId[];
  levels?: Partial<Record<StructureId, number>>;
}) {
  const builder = useTrading((s) => s.builder);
  const setStructure = useTrading((s) => s.setStructure);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  const all = allowed ?? (Object.keys(STRUCTURES) as StructureId[]);
  // A structure the rules won't let you open isn't offered (less confusing than a dead card).
  const blocked = session?.spreadsBlocked() ?? false;
  const ids = blocked ? all.filter((id) => !SPREAD_FAMILIES.includes(STRUCTURES[id].family)) : all;
  return (
    <div className="tray-section structures" data-testid="structure-cards">
      <div className="section-title" data-tip="g:structure">
        Structure
      </div>
      {blocked && (
        <div className="market-off num" data-testid="spreads-blocked">
          Approval levels: spreads need a $2,000 account, so only single-leg trades are offered.
        </div>
      )}
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
  const cardId = useTrading(liveCardId);
  const open = useTrading(tradeOpen);
  const [confirm, setConfirm] = useState<null | 'buy' | 'sell'>(null);
  const card = session && cardId ? session.card(cardId) : null;
  const hasPosition =
    !!card?.positionIds.some((id) => session?.position(id)?.status === 'open') || !!card?.orderIds.length;
  const mid = plan?.mid ?? null;
  const nat = plan?.natural ?? null;
  const spot = plan?.entry?.spot ?? null;
  // Premium collected per share.
  const premium = premiumOf(mid, plan?.legs ?? [], spot);
  const credit = premium !== null;
  const limit = mid !== null && nat !== null ? mid + (nat - mid) * builder.limitFrac : null;
  // A round with market orders off takes limits only: the ticket shows just those.
  const marketOff = !!session?.config.execution.marketOrdersDisabled;
  const orderType = orderTypeOf(builder, session);
  const prob =
    mid !== null && nat !== null && limit !== null
      ? orderType === 'market'
        ? 1
        : limitFillProbability({ mid, natural: nat }, limit, session?.config.execution)
      : 0;
  const blockReason = useTrading((s) => s.blockReason);
  const maxPositions = useTrading((s) => s.maxPositions);
  const runBlock = cardId ? (blockReason?.(cardId, builder.structureId) ?? null) : null;
  // What to fix, in one line, when the buttons are greyed out.
  const reason: string | null =
    !session || !cardId
      ? null
      : hasPosition
        ? 'One trade per card: manage this one in Positions (Ctrl+1).'
        : !open
          ? 'Wait for the day to finish playing.'
          : runBlock
            ? runBlock
            : maxPositions !== null && session.positions.length + session.orders.length >= maxPositions
              ? `This one allows ${maxPositions} trade${maxPositions > 1 ? 's' : ''}. Manage the one you have.`
              : !builder.expiration
                ? 'Pick an expiration with the Expires slider.'
                : !plan
                  ? 'This build has no price today: try another expiration or strike.'
                  : !plan.ok
                    ? plan.reason
                    : cardId && session
                      ? session.realismBlock(cardId, plan.legs, plan.qty)
                      : null;
  const disabled = !plan?.ok || !open || hasPosition || !!runBlock || (!!plan && !!reason);
  const earnings = plan?.entry?.earningsInside;
  // With the Executor sealing the term, whether earnings fall inside it is sealed too: the toggle
  // is always there, worded for either case.
  const dteSealed = useSealed('dte');

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
        {orderType === 'market' ? (
          <div className="order-simple" data-testid="order-simple">
            <span className="os-market" data-tip="g:order_market">
              MARKET · fills now at {price(nat !== null ? Math.abs(nat) : null)}
            </span>
            <button
              className="linkish"
              onClick={() => setBuilder({ orderType: 'limit' })}
              data-testid="order-limit"
              data-tip="g:order_limit"
            >
              use a limit price ▸
            </button>
          </div>
        ) : (
          <>
            <div className="order-limit-head">
              <span className="dim">
                {marketOff ? (
                  <b className="warn-text" data-testid="market-off">
                    Market orders are off this round.{' '}
                  </b>
                ) : null}
                A limit names your price: between the middle (MID) and the price you'd get now (NAT). Closer
                to MID pays you better but may not fill today.
              </span>
              {!marketOff && (
                <button
                  className="linkish"
                  onClick={() => setBuilder({ orderType: 'market' })}
                  data-testid="order-market"
                  data-tip="g:order_market"
                >
                  ◂ back to market
                </button>
              )}
            </div>
            <div className="limit-box">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={builder.limitFrac}
                onChange={(e) => setBuilder({ limitFrac: Number(e.target.value) })}
                data-testid="limit-slider"
              />
              <div className="limit-labels">
                <span data-tip="g:mid">MID {price(mid !== null ? Math.abs(mid) : null)}</span>
                <span className="limit-now" data-tip="g:fill_chance">
                  LMT {price(limit !== null ? Math.abs(limit) : null)} · fill {Math.round(prob * 100)}%
                </span>
                <span data-tip="g:natural">NAT {price(nat !== null ? Math.abs(nat) : null)}</span>
              </div>
            </div>
          </>
        )}
        {builder.structureId === 'covered_call' ? (
          <div className="plan-chip auto-stop" data-tip="g:auto_stop" data-testid="auto-stop">
            <span>
              <b>AUTO STOP</b> × premium · TP {Math.round(builder.targetPct * 100)}%
            </span>
            <span className="auto-stop-picks">
              {[1, 1.5, 2, 3].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`seg-btn ${builder.stopMult === m ? 'on' : ''}`}
                  data-testid={`auto-stop-${m}`}
                  onClick={() => {
                    setBuilder({ stopMult: m });
                    sfx('click');
                  }}
                >
                  {m}×
                </button>
              ))}
            </span>
          </div>
        ) : (
          <div className="plan-chip" data-tip="g:plan_set">
            PLAN · take profit at {Math.round(builder.targetPct * 100)}% · stop at {builder.stopMult}× credit
          </div>
        )}
        {(earnings || dteSealed) && (
          <label className="toggle warn-text" data-testid="earnings-ack" data-tip="g:earnings_ack">
            <input
              type="checkbox"
              checked={builder.earningsAck}
              onChange={(e) => setBuilder({ earningsAck: e.target.checked })}
            />{' '}
            {dteSealed
              ? 'If earnings land inside: holding through on purpose'
              : 'Earnings inside: holding through on purpose'}
          </label>
        )}
        <div className="ticket-buttons">
          {reason && (
            <div className="ticket-block" data-testid="order-block" role="status">
              ⚠ {reason}
            </div>
          )}
          <button
            className="pixel-btn sell"
            disabled={disabled || !credit}
            onClick={() => go('sell')}
            data-testid="sell-button"
            data-tip="g:sell"
          >
            SELL {credit && premium !== null ? `+${price(premium)}` : ''}
            {credit && plan?.ok && (
              <span className="btn-sub num">
                {plan.structureId === 'covered_call'
                  ? `covers ${plan.qty * 100} of your 500 sh · `
                  : plan.structureId === 'cash_secured_put'
                    ? `sets aside $${Math.round(plan.collateralCents / 100).toLocaleString()} · `
                    : ''}
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
              {orderType === 'market'
                ? 'Market (natural)'
                : `Limit ${price(limit !== null ? Math.abs(limit) : null)}`}{' '}
              · fill chance {Math.round(prob * 100)}%
            </div>
            <div>
              {plan.structureId === 'covered_call' ? 'Risk at the auto stop' : 'Max loss'}{' '}
              {money(plan.maxLossCents)} · max profit{' '}
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
