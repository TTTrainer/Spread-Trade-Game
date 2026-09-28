import type { VixBar } from '../src/engine/market/types';

export const VIX_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';

/** Parse Cboe's VIX_History.csv (DATE,OPEN,HIGH,LOW,CLOSE with MM/DD/YYYY dates). */
export function parseVixCsv(text: string): VixBar[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: VixBar[] = [];
  for (const line of lines.slice(1)) {
    const [d, o, h, l, c] = line.split(',');
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d?.trim() ?? '');
    const iso = m
      ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
      : /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')
        ? d
        : null;
    const nums = [o, h, l, c].map(Number);
    if (!iso || nums.some((x) => !Number.isFinite(x))) continue;
    out.push({ date: iso, open: nums[0], high: nums[1], low: nums[2], close: nums[3] });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function downloadVix(): Promise<VixBar[]> {
  const res = await fetch(VIX_URL);
  if (!res.ok) throw new Error(`VIX download failed: HTTP ${res.status}`);
  return parseVixCsv(await res.text());
}
