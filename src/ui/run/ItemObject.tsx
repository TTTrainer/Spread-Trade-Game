/**
 * Shop items as objects instead of boxes: a cartridge is a game cartridge, a memo a clipped office
 * memo, a voucher a coupon, a playbook page a game manual, an analyst an ID badge. Each object has
 * a window where the item's own art sits. Height comes from the --io-h custom property on any
 * parent (the shop, YOUR DESK and the spoils screen set their own).
 */

import type { CSSProperties } from 'react';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import type { ShopItem } from '../../engine/run/types';
import memoShell from '../../../assets/ui/memo-shell.png';
import voucherShell from '../../../assets/ui/voucher-shell.png';
import pageShell from '../../../assets/ui/page-shell.png';
import analystShell from '../../../assets/ui/analyst-shell.png';
import { ArtIcon, artUrl } from '../art';
import { CartridgeDevice } from './JokerRow';

type ShellKind = Exclude<ShopItem['kind'], 'cartridge'>;

/** Each shell's size and the art window inside it (fractions: left, top, width, height). */
const SHELLS: Record<
  ShellKind,
  { src: string; w: number; h: number; win: [number, number, number, number] }
> = {
  memo: { src: memoShell, w: 173, h: 200, win: [0.2873, 0.3843, 0.41, 0.3542] },
  voucher: { src: voucherShell, w: 200, h: 121, win: [0.3394, 0.2331, 0.3224, 0.5338] },
  page: { src: pageShell, w: 176, h: 216, win: [0.25, 0.2963, 0.5455, 0.4444] },
  analyst: { src: analystShell, w: 176, h: 248, win: [0.25, 0.3871, 0.5, 0.3548] },
};

export function ItemObject({
  kind,
  id,
  name,
  className = '',
}: {
  kind: ShopItem['kind'];
  id: string;
  name: string;
  className?: string;
}) {
  if (kind === 'cartridge') {
    const def = CARTRIDGE_BY_ID[id];
    return def ? <CartridgeDevice def={def} className={className} /> : null;
  }
  const s = SHELLS[kind];
  const art = artUrl(kind, id);
  const [l, t, w, h] = s.win;
  return (
    <span
      className={`item-obj k-${kind} ${className}`}
      style={{ aspectRatio: `${s.w} / ${s.h}` } as CSSProperties}
      data-io={`${kind}:${id}`}
    >
      <img className="io-shell" src={s.src} alt="" draggable={false} />
      <span
        className="io-win"
        style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
      >
        {art ? <img src={art} alt="" draggable={false} /> : <ArtIcon category={kind} id={id} name={name} />}
      </span>
    </span>
  );
}
