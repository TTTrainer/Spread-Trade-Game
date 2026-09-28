/**
 * The shop between rounds: cartridge offers weighted by rarity (60/28/10/2) and 60/40 toward the
 * desk's own cartridges, duo Legendaries only once both parents are owned, analysts, boosters
 * (memos and Playbook Pages) and one voucher. Rerolls get pricier each time within a shop.
 */

import { ANALYSTS, ANALYST_IDS } from '../../content/analysts';
import { BALANCE } from '../../content/balance';
import { CARTRIDGES } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { MEMO_IDS, VOUCHER_IDS } from '../../content/items';
import type { CartridgeDef, DeskId, Rarity } from '../../content/types';
import type { Rng } from '../rng';
import type { RunState, ShopItem } from './types';

export interface ShopMods {
  priceMult: number;
  cartridgeOffers: number;
  analystOffers: number;
}

export function cartridgePrice(c: CartridgeDef, priceMult = 1): number {
  return Math.max(1, Math.round(BALANCE.shop.prices[c.rarity] * priceMult));
}

export function sellPrice(c: CartridgeDef): number {
  return Math.floor(BALANCE.shop.prices[c.rarity] * BALANCE.cash.sellBackFraction);
}

/** Cartridges this run could be offered (desk fit, Pure Market, duos, not owned). */
export function cartridgePool(
  state: Pick<RunState, 'cartridges' | 'parachuteUsed' | 'config'>,
): CartridgeDef[] {
  const desk: DeskId = state.config.deskId;
  return CARTRIDGES.filter((c) => {
    if (state.cartridges.includes(c.id)) return false;
    if (state.config.cartridgePool && !state.config.cartridgePool.includes(c.id)) return false;
    if (c.desks !== 'any' && !c.desks.includes(desk)) return false;
    if (state.config.pureMarket && c.tag === 'ARCADE') return false;
    if (c.duoOf && !(state.cartridges.includes(c.duoOf[0]) && state.cartridges.includes(c.duoOf[1])))
      return false;
    if (c.savesRun && state.parachuteUsed) return false;
    return true;
  });
}

export function pickCartridge(
  pool: CartridgeDef[],
  rng: Rng,
  desk: DeskId,
  forceRarity?: Rarity,
): CartridgeDef | null {
  if (!pool.length) return null;
  const affinity = pool.filter((c) => c.desks !== 'any' && c.desks.includes(desk));
  const general = pool.filter((c) => c.desks === 'any');
  let bucket =
    affinity.length && general.length ? (rng.chance(BALANCE.shop.deskAffinity) ? affinity : general) : pool;
  // Owning both parents of a duo makes it a real possibility, not a 2% lottery ticket.
  const duos = pool.filter((c) => c.duoOf);
  if (!forceRarity && duos.length && rng.chance(0.15)) return rng.pick(duos);
  if (forceRarity) {
    const r = pool.filter((c) => c.rarity === forceRarity && !c.duoOf);
    return r.length ? rng.pick(r) : null;
  }
  const weights = BALANCE.shop.rarityWeights;
  const rarities = (['C', 'U', 'R', 'L'] as Rarity[]).filter((r) =>
    bucket.some((c) => c.rarity === r && !c.duoOf),
  );
  if (!rarities.length) bucket = pool;
  const rar = rng.weighted(
    rarities.length ? rarities : (['C', 'U', 'R', 'L'] as Rarity[]),
    (r) => weights[r],
  );
  const inRar = bucket.filter((c) => c.rarity === rar && !c.duoOf);
  return inRar.length ? rng.pick(inRar) : rng.pick(bucket);
}

export function generateShop(state: RunState, rng: Rng, mods: ShopMods): ShopItem[] {
  const items: ShopItem[] = [];
  const pool = cartridgePool(state).slice();
  for (let i = 0; i < mods.cartridgeOffers; i++) {
    const c = pickCartridge(pool, rng, state.config.deskId);
    if (!c) break;
    pool.splice(pool.indexOf(c), 1);
    items.push({ kind: 'cartridge', id: c.id, price: cartridgePrice(c, mods.priceMult), sold: false });
  }
  const owned = new Map(state.analysts.map((a) => [a.id, a.level]));
  const analystPool = ANALYST_IDS.filter((id) => (owned.get(id) ?? 0) < 2);
  for (let i = 0; i < mods.analystOffers && analystPool.length; i++) {
    const id = rng.pick(analystPool);
    analystPool.splice(analystPool.indexOf(id), 1);
    const level = (owned.get(id) ?? 0) + 1;
    items.push({
      kind: 'analyst',
      id,
      level,
      price: Math.max(1, Math.round((ANALYSTS[id].price + (level > 1 ? 2 : 0)) * mods.priceMult)),
      sold: false,
    });
  }
  const deskStructures = DESKS[state.config.deskId].structures;
  for (let i = 0; i < BALANCE.shop.boosterOffers; i++) {
    if (rng.chance(0.5))
      items.push({
        kind: 'memo',
        id: rng.pick(MEMO_IDS),
        price: Math.max(1, Math.round(BALANCE.shop.memoPrice * mods.priceMult)),
        sold: false,
      });
    else
      items.push({
        kind: 'page',
        id: rng.pick(deskStructures),
        price: Math.max(1, Math.round(BALANCE.shop.pagePrice * mods.priceMult)),
        sold: false,
      });
  }
  const vouchers = VOUCHER_IDS.filter((v) => !state.vouchers.includes(v));
  if (vouchers.length)
    items.push({
      kind: 'voucher',
      id: rng.pick(vouchers),
      price: Math.max(1, Math.round(BALANCE.shop.voucherPrice * mods.priceMult)),
      sold: false,
    });
  return items;
}

export function rerollCost(rerollsThisShop: number, delta: number): number {
  return Math.max(0, BALANCE.shop.rerollBase + BALANCE.shop.rerollStep * rerollsThisShop + delta);
}

export function interestFor(cash: number, capAdd: number): number {
  const c = BALANCE.cash;
  return Math.max(0, Math.min(c.interestCap + capAdd, Math.floor(Math.max(0, cash) / c.interestPer)));
}
