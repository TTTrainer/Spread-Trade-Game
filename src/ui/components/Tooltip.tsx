/**
 * Balatro-style hover explanations. Any element can opt in with `data-tip`:
 *   data-tip="g:pop"           a glossary entry (src/content/glossary.ts)
 *   data-tip="cart:theta_engine" (also memo:, voucher:, analyst:, tag:, review:, family:,
 *                              desk:, struct:, client:) content generated from the item itself
 *   data-tip-title / data-tip-body   one-off text
 * Plain `title` attributes are picked up too (and the browser's own tooltip is suppressed), so
 * every older hint in the game gets the same styled panel. One listener on the document handles
 * all of it; mouse hover and keyboard focus both work.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ANALYSTS } from '../../content/analysts';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { CLIENT_BY_ID } from '../../content/clients';
import { DESKS } from '../../content/desks';
import { FAMILY_NAMES, FAMILY_TEXT } from '../../content/families';
import { GLOSSARY } from '../../content/glossary';
import { MEMOS, TAGS, VOUCHERS } from '../../content/items';
import { REVIEWS } from '../../content/reviews';
import type { AnalystId, DeskId, Family, MemoId, ReviewId, TagId, VoucherId } from '../../content/types';
import type { ArtCategory } from '../../content/art';
import { STRUCTURES } from '../../engine/strategies/structures';
import { RR_RULES } from '../../content/structureRules';
import type { StructureId } from '../../engine/strategies/types';
import { ArtIcon } from '../art';

export interface TipContent {
  title: string;
  body: string;
  /** Small caps line under the title (rarity, families, tags). */
  meta?: string;
  real?: string;
  tone?: 'C' | 'U' | 'R' | 'L' | 'good' | 'bad' | 'info';
  art?: { category: ArtCategory; id: string };
}

const RAR: Record<string, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', L: 'Legendary' };

/** Turn a tip key into its content (null if it isn't known). */
export function resolveTip(key: string): TipContent | null {
  const i = key.indexOf(':');
  const kind = i < 0 ? 'g' : key.slice(0, i);
  const id = i < 0 ? key : key.slice(i + 1);
  switch (kind) {
    case 'g': {
      const g = GLOSSARY[id];
      return g ? { title: g.title, body: g.body, real: g.real, tone: 'info' } : null;
    }
    case 'cart': {
      const c = CARTRIDGE_BY_ID[id];
      if (!c) return null;
      return {
        title: c.name,
        body: c.text,
        meta: `${RAR[c.rarity]} · ${c.families.map((f) => FAMILY_NAMES[f]).join(' / ')} · ${c.tag}`,
        real:
          c.tag === 'REAL'
            ? 'REAL: mirrors an edge real traders have.'
            : c.tag === 'ARCADE'
              ? 'ARCADE: a game-only bonus; it never changes the market.'
              : 'REAL + ARCADE: a real edge with a game bonus on top.',
        tone: c.rarity,
        art: { category: 'cartridge', id },
      };
    }
    case 'memo': {
      const m = MEMOS[id as MemoId];
      return m
        ? { title: m.name, body: m.text, meta: 'Memo · one use', art: { category: 'memo', id }, tone: 'info' }
        : null;
    }
    case 'voucher': {
      const v = VOUCHERS[id as VoucherId];
      return v
        ? {
            title: v.name,
            body: v.text,
            meta: 'Voucher · the whole run',
            art: { category: 'voucher', id },
            tone: 'L',
          }
        : null;
    }
    case 'analyst': {
      const a = ANALYSTS[id as AnalystId];
      return a
        ? {
            title: a.name,
            body: a.reveals,
            meta: 'Analyst · information only',
            real: a.level2 ? `Level 2: ${a.level2}` : undefined,
            art: { category: 'analyst', id },
            tone: 'U',
          }
        : null;
    }
    case 'tag': {
      const t = TAGS[id as TagId];
      return t
        ? {
            title: t.name,
            body: t.text,
            meta: 'Tag · reward for skipping',
            art: { category: 'tag', id },
            tone: 'info',
          }
        : null;
    }
    case 'review': {
      const r = REVIEWS[id as ReviewId];
      return r
        ? {
            title: r.name,
            body: `${r.filterText} ${r.ruleText}`,
            meta: 'Review · boss round',
            art: { category: 'review', id },
            tone: 'bad',
          }
        : null;
    }
    case 'family': {
      const f = id as Family;
      const lines = FAMILY_TEXT[f]
        ?.map((t, n) => (t ? `${n + 2} of a kind: ${t}.` : ''))
        .filter(Boolean)
        .join(' ');
      return FAMILY_NAMES[f]
        ? { title: `${FAMILY_NAMES[f]} family`, body: lines || '', meta: 'Family bonus', tone: 'info' }
        : null;
    }
    case 'desk': {
      const d = DESKS[id as DeskId];
      return d
        ? {
            title: `${d.name} desk`,
            body: d.blurb,
            meta: `Passive: ${d.passiveText}`,
            art: { category: 'desk', id },
            tone: 'info',
          }
        : null;
    }
    case 'struct': {
      const s = STRUCTURES[id as StructureId];
      if (!s) return null;
      const bias =
        { bull: 'bullish', bear: 'bearish', neutral: 'neutral', long_vol: 'wants a big move' }[s.bias] ??
        s.bias;
      return {
        title: s.name,
        body: `${s.credit ? 'Collects a credit' : 'Costs a debit'}, ${bias}. ${RR_RULES[s.id as StructureId]?.text ?? ''}`,
        meta: s.credit ? 'Credit structure' : 'Debit structure',
        art: { category: 'page', id },
        tone: 'info',
      };
    }
    case 'client': {
      const c = CLIENT_BY_ID[id];
      return c
        ? { title: c.name, body: c.ask, meta: c.persona, art: { category: 'client', id }, tone: 'info' }
        : null;
    }
    default:
      return null;
  }
}

function contentOf(el: Element): TipContent | null {
  const key = el.getAttribute('data-tip');
  if (key) {
    const r = resolveTip(key);
    if (r) return r;
  }
  const title = el.getAttribute('data-tip-title');
  const body = el.getAttribute('data-tip-body');
  if (!title && !body) return null;
  const [first, ...rest] = (body ?? '').split('\n');
  return title
    ? { title, body: body ?? '' }
    : rest.length
      ? { title: first, body: rest.join(' ') }
      : { title: '', body: first };
}

const SELECTOR = '[data-tip],[data-tip-title],[data-tip-body],[title]';

export function TooltipLayer() {
  const [tip, setTip] = useState<{ content: TipContent; rect: DOMRect } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let current: Element | null = null;
    let timer = 0;
    const show = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest(SELECTOR) : null;
      if (el === current) return;
      current = el;
      window.clearTimeout(timer);
      if (!el) {
        setTip(null);
        return;
      }
      // Take over the browser's plain tooltip.
      const t = el.getAttribute('title');
      if (t) {
        if (!el.hasAttribute('data-tip-body') && !el.hasAttribute('data-tip'))
          el.setAttribute('data-tip-body', t);
        el.removeAttribute('title');
      }
      timer = window.setTimeout(() => {
        const content = contentOf(el);
        if (content && el.isConnected) setTip({ content, rect: el.getBoundingClientRect() });
      }, 140);
    };
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => show(e.target);
    const focus = (e: FocusEvent) => show(e.target);
    document.addEventListener('pointerover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Place it above the element (below if there's no room), kept on screen.
  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setPos(null);
      return;
    }
    const b = box.current.getBoundingClientRect();
    const r = tip.rect;
    const gap = 10;
    let top = r.top - b.height - gap;
    if (top < 6) top = r.bottom + gap;
    if (top + b.height > window.innerHeight - 6) top = Math.max(6, window.innerHeight - b.height - 6);
    let left = r.left + r.width / 2 - b.width / 2;
    left = Math.max(6, Math.min(window.innerWidth - b.width - 6, left));
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  const c = tip.content;
  return (
    <div
      ref={box}
      className={`tooltip tone-${c.tone ?? 'info'}`}
      role="tooltip"
      data-testid="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {c.art && (
        <ArtIcon
          category={c.art.category}
          id={c.art.id}
          name={c.title}
          tone={c.tone}
          className="tip-art"
          style={{ width: 48, height: 48, fontSize: 18 }}
        />
      )}
      <div className="tip-text">
        {c.title && <div className="tip-title">{c.title}</div>}
        {c.meta && <div className="tip-meta num">{c.meta}</div>}
        {c.body && <div className="tip-body">{c.body}</div>}
        {c.real && <div className="tip-real">{c.real}</div>}
      </div>
    </div>
  );
}
