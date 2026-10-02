/**
 * The shop, as an old trading terminal's desktop: every category gets its own window (cartridges,
 * analysts, memos, playbook pages, the voucher), the last round's receipt sits in a log window and
 * your loadout fills the bottom. Windows pop open one by one when the shop boots. Every card reads
 * at a glance: picture, WHEN it fires, what you GET, and the catch.
 */

import { motion } from 'motion/react';
import { Fragment, useEffect, type ReactNode } from 'react';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { ALL_FAMILIES, FAMILY_NAMES, FAMILY_TEXT } from '../../content/families';
import { MEMOS, VOUCHERS } from '../../content/items';
import {
  ANALYST_SHORT,
  CARTRIDGE_SUMMARY,
  EFFECT_GLYPH,
  EFFECT_LABEL,
  FAMILY_GLYPH,
  MEMO_KIND,
  MEMO_WHEN,
  VOUCHER_KIND,
  type EffectKind,
} from '../../content/summaries';
import { BALANCE } from '../../content/balance';
import { ROUND_NAMES, computeTarget, quarterLabel, sellPrice, type RunEngine } from '../../engine/run/engine';
import type { ShopItem } from '../../engine/run/types';
import { STRUCTURES } from '../../engine/strategies/structures';
import { sfx } from '../../audio/sfx';
import { burstAt } from '../../fx/overlay';
import { ArtIcon } from '../art';
import { Kbd, TiltCard } from '../components/ui';
import { money } from '../format';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useRun } from '../store/run';
import { Primer } from './Primer';

export function itemTitle(it: ShopItem): string {
  switch (it.kind) {
    case 'cartridge':
      return CARTRIDGE_BY_ID[it.id].name;
    case 'analyst':
      return `${ANALYSTS[it.id].name}${it.level > 1 ? ' (level 2)' : ''}`;
    case 'memo':
      return MEMOS[it.id].name;
    case 'page':
      return `Playbook: ${STRUCTURES[it.id].name}`;
    case 'voucher':
      return VOUCHERS[it.id].name;
  }
}

interface CardFace {
  whenK: string;
  when: string;
  get: string;
  kind: EffectKind;
  catch?: string;
  chips: ReactNode[];
}

function faceOf(e: RunEngine, it: ShopItem): CardFace {
  switch (it.kind) {
    case 'cartridge': {
      const c = CARTRIDGE_BY_ID[it.id];
      const s = CARTRIDGE_SUMMARY[c.id];
      return {
        whenK: 'WHEN',
        when: s.when,
        get: s.get,
        kind: s.kind,
        catch: s.catch,
        chips: [
          ...c.families.map((f) => (
            <span key={f} className="sc-fam" data-tip={`family:${f}`}>
              {FAMILY_GLYPH[f]} {FAMILY_NAMES[f].toUpperCase()}
            </span>
          )),
          <span
            key="tag"
            className={`sc-tag ${c.tag.includes('REAL') ? 'real' : 'arcade'}`}
            data-tip={`tag:${c.tag}`}
          >
            {c.tag.includes('REAL') ? '◎ REAL' : '✦ ARCADE'}
          </span>,
        ],
      };
    }
    case 'analyst':
      return {
        whenK: 'SEES',
        when: it.level > 1 ? 'Level 2 upgrade' : 'Every card, every day',
        get: it.level > 1 ? ANALYSTS[it.id].level2 : ANALYST_SHORT[it.id],
        kind: 'info',
        chips: [
          <span key="seat" className="sc-fam">
            ◧ TAKES A SEAT
          </span>,
        ],
      };
    case 'memo':
      return {
        whenK: 'USE',
        when: MEMO_WHEN[MEMOS[it.id].when],
        get: MEMOS[it.id].text,
        kind: MEMO_KIND[it.id],
        chips: [
          <span key="one" className="sc-fam">
            ✉ ONE USE
          </span>,
        ],
      };
    case 'page': {
      const lv = e.state.levels[it.id] ?? 1;
      return {
        whenK: 'WHEN',
        when: `${STRUCTURES[it.id].short} winners`,
        get: '+10 chips, +0.5 mult',
        kind: 'mult',
        chips: [
          <span key="lv" className="sc-fam">
            LV {lv} ▶ {lv + 1}
          </span>,
        ],
      };
    }
    case 'voucher':
      return {
        whenK: 'FOR',
        when: 'The whole run',
        get: VOUCHERS[it.id].text,
        kind: VOUCHER_KIND[it.id],
        chips: [
          <span key="run" className="sc-fam">
            ∞ PERMANENT
          </span>,
        ],
      };
  }
}

function ShopCard({ e, it, index }: { e: RunEngine; it: ShopItem; index: number }) {
  const act = useRun((s) => s.act);
  const cash = e.state.cash;
  const rarity =
    it.kind === 'cartridge'
      ? CARTRIDGE_BY_ID[it.id].rarity
      : it.kind === 'voucher'
        ? 'L'
        : it.kind === 'analyst'
          ? 'U'
          : undefined;
  const f = faceOf(e, it);
  const afford = cash >= it.price;
  const buy = (target: HTMLElement) => {
    sfx(afford ? 'buy' : 'error');
    if (afford) burstAt(target, rarity === 'L' ? 'sparkle' : 'coins', rarity === 'L' ? 50 : 14);
    void act({ t: 'buy', index });
  };
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay: 0.25 + index * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
    >
      <TiltCard
        className={`shop-card kind-${it.kind} ${it.sold ? 'sold' : ''}`}
        rarity={rarity}
        disabled={it.sold}
        testId={`shop-item-${index}`}
        tip={
          it.kind === 'cartridge'
            ? `cart:${it.id}`
            : it.kind === 'page'
              ? `struct:${it.id}`
              : `${it.kind}:${it.id}`
        }
      >
        <span className={`sc-price num ${afford ? '' : 'short'}`}>
          {it.price === 0 ? 'FREE' : `$${it.price}`}
        </span>
        <div className="sc-art">
          <ArtIcon
            category={it.kind === 'page' ? 'page' : it.kind}
            id={it.id}
            name={itemTitle(it)}
            tone={rarity ?? it.kind}
            scale={2}
          />
        </div>
        <div className="sc-name">{itemTitle(it)}</div>
        <div className="sc-chips num">{f.chips}</div>
        <div className="sc-when">
          <span className="sc-k num">{f.whenK}</span> {f.when}
        </div>
        <div className={`sc-get fx-${f.kind}`}>
          <span className="sc-glyph" aria-hidden="true">
            {EFFECT_GLYPH[f.kind]}
          </span>
          <span className="sc-get-t">
            <span className="sc-k num">{EFFECT_LABEL[f.kind]}</span>
            {f.get}
          </span>
        </div>
        {f.catch && <div className="sc-catch">⚠ {f.catch}</div>}
        <div className="sc-buy">
          {it.sold ? (
            <span className="sc-sold num">SOLD</span>
          ) : (
            <span
              role="button"
              className={`pixel-btn ${afford ? 'primary' : ''}`}
              onClick={(ev) => {
                ev.stopPropagation();
                buy(ev.currentTarget);
              }}
              data-testid={`buy-${index}`}
            >
              {afford ? '▼ BUY' : 'NEED $'}
            </span>
          )}
        </div>
      </TiltCard>
    </motion.div>
  );
}

/** One window on the shop's desktop. */
function Win({
  title,
  sub: purpose,
  icon,
  className = '',
  delay = 0,
  children,
  testId,
}: {
  title: string;
  /** What the window is for, in a few plain words. */
  sub: string;
  icon: string;
  className?: string;
  delay?: number;
  children: ReactNode;
  testId?: string;
}) {
  const reduced = useApp((s) => s.settings.display.reducedMotion);
  return (
    <motion.section
      className={`os-win ${className}`}
      data-testid={testId}
      initial={reduced ? false : { scale: 0.4, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 24 }}
    >
      <header className="os-title num">
        <span className="os-ico">{icon}</span>
        <span className="os-name">{title}</span>
        <span className="os-sub">{purpose}</span>
        <span className="os-ctl" aria-hidden="true">
          <i>_</i>
          <i>□</i>
          <i>×</i>
        </span>
      </header>
      <div className="os-body">{children}</div>
    </motion.section>
  );
}

/**
 * Your build at a glance: each family you own (or could buy), pips toward its 2/3/4 bonuses, and
 * what the next pip unlocks. Offers on the shelf show as hollow pips, so combos are visible.
 */
function BuildPanel({ e }: { e: RunEngine }) {
  const fam = e.families();
  const offered: Record<string, number> = {};
  for (const it of e.state.shop?.items ?? [])
    if (it.kind === 'cartridge' && !it.sold)
      for (const f of CARTRIDGE_BY_ID[it.id].families) offered[f] = (offered[f] ?? 0) + 1;
  const shown = ALL_FAMILIES.filter((f) => fam[f] > 0 || offered[f]);
  if (shown.length === 0) return <div className="dim num">Buy cartridges to start a build.</div>;
  return (
    <div className="build-list">
      {shown.map((f) => {
        const n = fam[f];
        const on = f === 'CHAOS' ? n >= 1 : n >= 2;
        // The next bonus to reach (families pay at 2, 3 and 4 owned; Chaos pays per cartridge).
        const next =
          f === 'CHAOS'
            ? `each: ${FAMILY_TEXT.CHAOS[0]}`
            : n >= 4
              ? `★ MAX: ${FAMILY_TEXT[f][2]}`
              : `at ${Math.max(2, n + 1)}: ${FAMILY_TEXT[f][Math.max(0, n - 1)]}`;
        return (
          <div
            key={f}
            className={`build-row ${on ? 'on' : ''}`}
            data-tip={`family:${f}`}
            data-testid={`build-${f}`}
          >
            <span className="br-glyph">{FAMILY_GLYPH[f]}</span>
            <span className="br-name num">{FAMILY_NAMES[f].toUpperCase()}</span>
            <span className="br-pips">
              {[1, 2, 3, 4].map((i) => (
                <i key={i} className={i <= n ? 'full' : i <= n + (offered[f] ?? 0) ? 'offer' : ''} />
              ))}
            </span>
            <span className="br-next">{next}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The cartridges you own, big: one card per slot in firing order, with its picture, what it gives
 * and its controls (fire earlier or later, sell). Empty slots show as open card outlines.
 */
function DeskCartridges({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  const st = e.state;
  const slots = e.cartridgeSlots();
  const owned = st.cartridges;
  return (
    <div className="desk-carts" data-testid="desk-carts" data-tip="g:cartridge_rail">
      {Array.from({ length: slots }, (_, i) => {
        const id = owned[i];
        const arrow = i < slots - 1 && <span className="dk-arrow">▸</span>;
        if (!id)
          return (
            <Fragment key={`empty-${i}`}>
              <div className="dk-cart empty num">
                <span className="dk-n">{i + 1}</span>
                <span className="dk-empty-plus">+</span>
                <span>EMPTY SLOT</span>
              </div>
              {arrow}
            </Fragment>
          );
        const def = CARTRIDGE_BY_ID[id];
        const sum = CARTRIDGE_SUMMARY[id];
        return (
          <Fragment key={id}>
            <div
              className={`dk-cart rar-${def.rarity}`}
              data-tip={`cart:${id}`}
              data-testid={`desk-cart-${id}`}
            >
              <span className="dk-n num">{i + 1}</span>
              <ArtIcon category="cartridge" id={id} name={def.name} tone={def.rarity} scale={0.85} />
              <span className="dk-name">{def.name}</span>
              {sum && (
                <span className={`dk-get num fx-${sum.kind}`}>
                  {EFFECT_GLYPH[sum.kind]} {sum.get}
                </span>
              )}
              <span className="dk-acts">
                <button
                  className="dk-move"
                  disabled={i === 0}
                  onClick={() => (sfx('click'), void act({ t: 'move', from: i, to: i - 1 }))}
                  aria-label="Fire earlier"
                  title="Fire earlier"
                >
                  ◀
                </button>
                <button
                  className="dk-sell num"
                  onClick={() => (sfx('coin'), void act({ t: 'sell', cartridgeId: id }))}
                  data-testid={`sell-${id}`}
                  data-tip-title={`Sell ${def.name}`}
                  data-tip-body={`Frees its slot and pays back $${sellPrice(def)}.`}
                >
                  SELL ${sellPrice(def)}
                </button>
                <button
                  className="dk-move"
                  disabled={i >= owned.length - 1}
                  onClick={() => (sfx('click'), void act({ t: 'move', from: i, to: i + 1 }))}
                  aria-label="Fire later"
                  title="Fire later"
                >
                  ▶
                </button>
              </span>
            </div>
            {arrow}
          </Fragment>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="shop-card empty-card num">
      <span>{text}</span>
    </div>
  );
}

export function ShopView({ e }: { e: RunEngine }) {
  const act = useRun((s) => s.act);
  useRun((s) => s.version);
  const st = e.state;
  const shop = st.shop;
  const r = st.round;
  useHotkeys({ reroll: () => void act({ t: 'rerollShop' }), confirm: () => void act({ t: 'leaveShop' }) });
  // The desk boots: a click per window as they pop open.
  useEffect(() => {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      setTimeout(() => sfx('tick', 1 + i * 0.12, 0.6), 60 + i * 65),
    );
    return () => ids.forEach(clearTimeout);
  }, []);
  if (!shop) return null;
  const nextIndex = (st.roundIndex + 1) % 3;
  const nextQ = st.roundIndex === 2 ? st.quarter + 1 : st.quarter;
  const nextName = nextIndex === 2 ? 'the Review' : `${quarterLabel(nextQ)} ${ROUND_NAMES[nextIndex]}`;
  const annual = st.endless ? nextQ % 4 === 0 : nextQ >= st.config.quarters;
  const nextTarget = computeTarget(
    nextQ,
    nextIndex,
    nextIndex === 2 && annual ? 'annual_review' : null,
    st.config,
    e.writtenUp(nextQ),
  );
  const payout = r.payouts.reduce((a, p) => a + p.cash, 0);
  const cost = e.shopRerollCost();
  const byKind = (k: ShopItem['kind']) =>
    shop.items.map((it, i) => ({ it, i })).filter((x) => x.it.kind === k);
  const card = ({ it, i }: { it: ShopItem; i: number }) => (
    <ShopCard key={`${it.kind}-${it.id}-${i}-${shop.rerolls}`} e={e} it={it} index={i} />
  );
  const carts = byKind('cartridge');
  const analysts = byKind('analyst');
  const memos = byKind('memo');
  const pages = byKind('page');
  const vouchers = byKind('voucher');
  const seats = e.analystSeats();
  const slots = e.cartridgeSlots();
  return (
    <div className="screen run-shop os" data-testid="shop-screen">
      <div className="os-desktop">
        <Win
          title="CARTRIDGES"
          sub="powerups: boost how your trades score"
          icon="▣"
          className="w-carts"
          delay={0.05}
          testId="win-carts"
        >
          <div className="os-shelf">
            {carts.map(card)}
            {carts.length === 0 && <Empty text="SOLD OUT" />}
          </div>
          <div className="os-foot dim num">
            {st.cartridges.length}/{slots} slots used · effects fire left to right
          </div>
        </Win>
        <div className="os-side">
          <Win
            title="LAST ROUND"
            sub="what you earned"
            icon="▤"
            className="w-log"
            delay={0.12}
            testId="win-log"
          >
            <div className={`log-stamp ${r.status === 'passed' ? 'ok' : 'miss'}`}>
              {r.status === 'passed' ? '✔ TARGET MET' : '✖ MISSED (saved)'}
            </div>
            <div className="log-meter num">
              {r.meter.toLocaleString()} <span className="dim">/ {r.target.toLocaleString()}</span>
            </div>
            {r.payouts.map((p, i) => (
              <div key={i} className="payout num">
                <span>{p.label}</span>
                <span className={p.cash >= 0 ? 'amber-text' : 'down-text'}>
                  {p.cash >= 0 ? '+' : '−'}${Math.abs(p.cash)}
                </span>
              </div>
            ))}
            <div className="payout num total">
              <span>Total</span>
              <span className="amber-text">${payout}</span>
            </div>
            {r.taxCents > 0 && <div className="dim num">Taxes set aside: {money(r.taxCents)}</div>}
            <div className="dim num small">
              Interest: $1 per ${BALANCE.cash.interestPer} held (up to ${BALANCE.cash.interestCap})
            </div>
          </Win>
          <Win
            title="YOUR BUILD"
            sub="family bonuses"
            icon="⚙"
            className="w-build"
            delay={0.16}
            testId="win-build"
          >
            <BuildPanel e={e} />
            <Primer compact />
          </Win>
        </div>
        <Win
          title="ANALYSTS"
          sub="hire extra information"
          icon="◧"
          className="w-analyst"
          delay={0.19}
          testId="win-analysts"
        >
          <div className="os-shelf">
            {analysts.map(card)}
            {analysts.length === 0 && <Empty text="ALL HIRED" />}
          </div>
        </Win>
        <div className="os-pair">
          <Win title="MEMOS" sub="one-use tricks" icon="✉" className="w-memo" delay={0.24} testId="win-memos">
            <div className="os-shelf">
              {memos.map(card)}
              {memos.length === 0 && <Empty text="SOLD OUT" />}
            </div>
          </Win>
          <Win
            title="PLAYBOOK"
            sub="level up a trade type"
            icon="▦"
            className="w-page"
            delay={0.29}
            testId="win-pages"
          >
            <div className="os-shelf">
              {pages.map(card)}
              {pages.length === 0 && <Empty text="SOLD OUT" />}
            </div>
          </Win>
        </div>
        <Win
          title="VOUCHERS"
          sub="permanent upgrades"
          icon="✦"
          className="w-voucher"
          delay={0.34}
          testId="win-voucher"
        >
          <div className="os-shelf">
            {vouchers.map(card)}
            {vouchers.length === 0 && <Empty text="ALL OWNED" />}
          </div>
        </Win>
        <Win
          title="YOUR DESK"
          sub="what you own · powerups fire left to right"
          icon="⌂"
          className="w-loadout"
          delay={0.4}
          testId="win-loadout"
        >
          <DeskCartridges e={e} />
          <div className="ld-tiles">
            <div className="ld-group">
              <div className="ld-k num">ANALYSTS</div>
              <div className="ld-row">
                {Array.from({ length: seats }, (_, i) => {
                  const a = st.analysts[i];
                  if (!a)
                    return (
                      <span key={i} className="ld-slot vacant" title="Empty seat">
                        +
                      </span>
                    );
                  return (
                    <span key={a.id} className="ld-slot" data-tip={`analyst:${a.id}`}>
                      <ArtIcon category="analyst" id={a.id} name={ANALYSTS[a.id].name} scale={0.75} />
                      {a.level > 1 && <i className="ld-lv">L2</i>}
                      <button
                        className="ld-x"
                        onClick={() => void act({ t: 'fire', analyst: a.id })}
                        title={`Let ${ANALYSTS[a.id].name} go`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="ld-group">
              <div className="ld-k num">MEMOS</div>
              <div className="ld-row">
                {Array.from({ length: BALANCE.shop.memoSlots }, (_, i) => {
                  const m = st.memos[i];
                  return m ? (
                    <span key={i} className="ld-slot" data-tip={`memo:${m}`}>
                      <ArtIcon category="memo" id={m} name={MEMOS[m].name} scale={0.75} />
                    </span>
                  ) : (
                    <span key={i} className="ld-slot vacant">
                      +
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="ld-group">
              <div className="ld-k num">PLAYBOOK</div>
              <div className="ld-row">
                {DESKS[st.config.deskId].structures.map((s) => (
                  <span key={s} className="ld-slot page" data-tip={`struct:${s}`}>
                    <ArtIcon category="page" id={s} name={STRUCTURES[s].name} scale={0.75} />
                    <i className="ld-lv">LV {st.levels[s] ?? 1}</i>
                  </span>
                ))}
              </div>
            </div>
            <div className="ld-group">
              <div className="ld-k num">VOUCHERS</div>
              <div className="ld-row">
                {st.vouchers.length === 0 && <span className="ld-slot vacant">·</span>}
                {st.vouchers.map((v) => (
                  <span key={v} className="ld-slot" data-tip={`voucher:${v}`}>
                    <ArtIcon category="voucher" id={v} name={VOUCHERS[v].name} scale={0.75} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Win>
      </div>
      <div className="os-taskbar num">
        <span className="os-start">◈ DESK/OS</span>
        <span className="os-cash" data-testid="shop-cash-wrap">
          <span className="coin">$</span>
          <span className="big-cash" data-testid="shop-cash">
            {st.cash}
          </span>
        </span>
        <span className="os-stat">
          <span className="dim">EQUITY</span> {money(st.equityCents)}
        </span>
        <span className="os-stat" data-tip="g:stress">
          <span className="dim">STRESS</span> {st.stress}
        </span>
        <span className="os-spacer" />
        <button
          className="os-btn reroll"
          onClick={() => (sfx('deal'), void act({ t: 'rerollShop' }))}
          disabled={st.cash < cost}
          data-testid="shop-reroll"
          data-tip="g:shop_reroll"
        >
          <span className="reroll-ico">⟳</span> {cost === 0 ? 'FREE' : `$${cost}`} <Kbd>R</Kbd>
        </button>
        <button
          className="os-btn next"
          onClick={() => (sfx('whoosh'), void act({ t: 'leaveShop' }))}
          data-testid="leave-shop"
          data-tip-title="Next round"
          data-tip-body={`${nextName}: score ${nextTarget.toLocaleString()} points to clear it.`}
        >
          ▶ {nextName.toUpperCase()}{' '}
          <span className="os-target">
            ◎ {nextTarget.toLocaleString()}
            {nextIndex === 2 && nextQ < st.config.quarters ? '+' : ''}
          </span>{' '}
          <Kbd>Enter</Kbd>
        </button>
      </div>
    </div>
  );
}

/** A cartridge as a compact card: picture, name, WHEN and GET. Used before a run starts. */
export function CartridgeMini({ id }: { id: string }) {
  const c = CARTRIDGE_BY_ID[id];
  const s = CARTRIDGE_SUMMARY[id];
  return (
    <div className={`cart-mini rar-${c.rarity}`} data-tip={`cart:${id}`} data-testid={`kit-cart-${id}`}>
      <ArtIcon category="cartridge" id={id} name={c.name} tone={c.rarity} />
      <div className="cm-body">
        <div className="cm-name">{c.name}</div>
        <div className="sc-when">
          <span className="sc-k num">WHEN</span> {s.when}
        </div>
        <div className={`cm-get fx-${s.kind}`}>
          <span className="sc-glyph">{EFFECT_GLYPH[s.kind]}</span> {s.get}
        </div>
        {s.catch && <div className="sc-catch">⚠ {s.catch}</div>}
      </div>
    </div>
  );
}
