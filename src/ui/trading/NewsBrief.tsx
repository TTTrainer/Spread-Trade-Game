import {
  briefFromView,
  FULL_ACCESS,
  type BriefAccess,
  type Lean,
  type NewsBrief,
} from '../../engine/news/brief';
import type { TradingSession } from '../../engine/trading/session';
import { useTrading } from '../store/trading';

const cache = new Map<string, NewsBrief | null>();

/** The brief for a card as of its current day (cached: it only changes when the day does). */
export function briefFor(
  session: TradingSession,
  cardId: string,
  access: BriefAccess = FULL_ACCESS,
): NewsBrief | null {
  const view = session.view(cardId);
  const key = `${session.config.seed}|${cardId}|${view.transform.displaySymbol}|${view.now}|${+access.earningsDetail}${+access.ivDetail}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (cache.size > 300) cache.clear();
  const bars = view.bars();
  let brief: NewsBrief | null = null;
  if (bars.length >= 2) {
    // Real companies by name get plain facts; codenames and invented companies get the satirical desk.
    const mode = session.config.blind || bars[bars.length - 1].source === 'synthetic' ? 'blind' : 'open';
    brief = briefFromView(view, { mode, access });
  }
  cache.set(key, brief);
  return brief;
}

const GLYPH: Record<Lean, string> = { 2: '▲▲', 1: '▲', 0: '◆', [-1]: '▼', [-2]: '▼▼' };
const SHORT: Record<Lean, string> = {
  2: 'BULLISH',
  1: 'LEANS BULL',
  0: 'MIXED',
  [-1]: 'LEANS BEAR',
  [-2]: 'BEARISH',
};
const leanClass = (l: Lean): string => (l > 0 ? 'up' : l < 0 ? 'down' : 'flat');
const why = (w: number): string => (w > 0 ? '▲' : '▼');

/** A lineup-card chip: the crowd's lean at a glance, with the reasons on hover. */
export function StreetChip({ brief }: { brief: NewsBrief }) {
  const s = brief.street;
  return (
    <span
      className={`chip street ${leanClass(s.lean)}`}
      data-testid="street-chip"
      data-tip-title={`Street read: ${s.label}`}
      data-tip-body={`${s.reasons.map((r) => `${why(r.weight)} ${r.text}.`).join(' ')} The crowd's view from the news, the trend and the market as of today. It is not a promise.`}
    >
      {GLYPH[s.lean]} {SHORT[s.lean]}
    </span>
  );
}

function agoText(n: number): string {
  return n === 0 ? 'TODAY' : `${n}D AGO`;
}

export function NewsBriefPanel({ access }: { access?: BriefAccess }) {
  const session = useTrading((s) => s.session);
  const cardId = useTrading((s) => s.selectedCardId);
  useTrading((s) => s.version);
  if (!session || !cardId) return null;
  const b = briefFor(session, cardId, access);
  if (!b) return <div className="brief dim num">No news yet.</div>;
  const s = b.street;
  return (
    <div className="brief" data-testid="news-brief">
      <div className={`brief-read ${leanClass(s.lean)}`} data-tip="g:street_read">
        <div className="brief-k">STREET READ · {b.symbol}</div>
        <div className="brief-lean">
          <span className="brief-glyph">{GLYPH[s.lean]}</span> {s.label}
        </div>
        <div className="lean-pips" aria-hidden="true">
          {([-2, -1, 0, 1, 2] as Lean[]).map((l) => (
            <span key={l} className={`pip ${l === s.lean ? 'on' : ''} ${leanClass(l)}`} />
          ))}
        </div>
      </div>
      <ul className="brief-reasons">
        {s.reasons.map((r) => (
          <li key={r.text} className={r.weight > 0 ? 'up' : 'down'}>
            <span className="rglyph">{why(r.weight)}</span> {r.text}
          </li>
        ))}
        {s.reasons.length === 0 && <li className="dim">Nothing stands out either way.</li>}
      </ul>

      {b.upcoming.length > 0 && (
        <div className="brief-sec" data-tip="g:brief_upcoming">
          <div className="brief-k">COMING UP</div>
          {b.upcoming.map((u) => (
            <div key={u.kind} className={`brief-ev ${u.kind === 'earnings' ? 'warn' : ''}`}>
              ◷ {u.text}
            </div>
          ))}
        </div>
      )}
      <div className="brief-sec">
        <div className="brief-k" data-tip="g:brief_news">
          NEWS · LAST 30 DAYS
        </div>
        {b.headlines.length === 0 && <div className="brief-v dim">A quiet month. No headlines.</div>}
        {b.headlines.map((h, i) => (
          <div
            key={`${h.ago}-${h.kind}-${i}`}
            className={`brief-news ${h.tone}`}
            data-testid="brief-headline"
          >
            <span className="news-ago num">
              {h.tone === 'up' ? '▲' : h.tone === 'down' ? '▼' : '•'} {agoText(h.ago)}
            </span>
            <span className="news-text">{h.text}</span>
          </div>
        ))}
      </div>
      <div className="brief-sec" data-tip="g:brief_market">
        <div className="brief-k">MARKET</div>
        <div className="brief-v">{b.market.text}</div>
      </div>
      <div className="brief-sec" data-tip="g:brief_tape">
        <div className="brief-k">THE STOCK</div>
        {b.trend.map((t) => (
          <div key={t} className="brief-v">
            · {t}
          </div>
        ))}
      </div>
      {b.options && (
        <div className="brief-sec" data-tip="g:expected_move">
          <div className="brief-k">OPTIONS</div>
          <div className="brief-v">{b.options}</div>
        </div>
      )}
    </div>
  );
}
