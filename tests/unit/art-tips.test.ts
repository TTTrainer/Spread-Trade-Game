import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_SIZES, ART_SLOTS } from '../../src/content/art';
import { CARTRIDGES } from '../../src/content/cartridges';
import { MEMOS, TAGS, VOUCHERS } from '../../src/content/items';
import { ANALYSTS } from '../../src/content/analysts';
import { REVIEWS } from '../../src/content/reviews';
import { CLIENTS } from '../../src/content/clients';
import { GLOSSARY } from '../../src/content/glossary';
import { STRUCTURES } from '../../src/engine/strategies/structures';
import { resolveTip } from '../../src/ui/components/Tooltip';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('art slots', () => {
  it('cover every powerup, page, review and client, with unique file names', () => {
    const files = new Set(ART_SLOTS.map((s) => s.file));
    expect(files.size).toBe(ART_SLOTS.length);
    for (const c of CARTRIDGES) expect(files).toContain(`cartridge-${c.id}.png`);
    for (const id of Object.keys(MEMOS)) expect(files).toContain(`memo-${id}.png`);
    for (const id of Object.keys(VOUCHERS)) expect(files).toContain(`voucher-${id}.png`);
    for (const id of Object.keys(TAGS)) expect(files).toContain(`tag-${id}.png`);
    for (const id of Object.keys(ANALYSTS)) expect(files).toContain(`analyst-${id}.png`);
    for (const id of Object.keys(STRUCTURES)) expect(files).toContain(`page-${id}.png`);
    for (const id of Object.keys(REVIEWS)) expect(files).toContain(`review-${id}.png`);
    for (const c of CLIENTS) expect(files).toContain(`client-${c.id}.png`);
    for (const s of ART_SLOTS) {
      expect(s.file).toMatch(/^[a-z]+-[a-zA-Z0-9_]+\.png$/);
      expect(ART_SIZES[s.category].w).toBeGreaterThan(0);
    }
  });

  it('gives every first-priority powerup a drawing idea', () => {
    const p1 = ART_SLOTS.filter((s) =>
      ['cartridge', 'memo', 'voucher', 'analyst', 'tag', 'page'].includes(s.category),
    );
    for (const s of p1) expect(s.idea, s.file).not.toBe('');
  });
});

describe('hover explanations', () => {
  it('resolve for every content item', () => {
    for (const c of CARTRIDGES) expect(resolveTip(`cart:${c.id}`)?.body).toBeTruthy();
    for (const id of Object.keys(MEMOS)) expect(resolveTip(`memo:${id}`)).not.toBeNull();
    for (const id of Object.keys(VOUCHERS)) expect(resolveTip(`voucher:${id}`)).not.toBeNull();
    for (const id of Object.keys(TAGS)) expect(resolveTip(`tag:${id}`)).not.toBeNull();
    for (const id of Object.keys(ANALYSTS)) expect(resolveTip(`analyst:${id}`)).not.toBeNull();
    for (const id of Object.keys(REVIEWS)) expect(resolveTip(`review:${id}`)).not.toBeNull();
    for (const id of Object.keys(STRUCTURES)) expect(resolveTip(`struct:${id}`)).not.toBeNull();
    for (const c of CLIENTS) expect(resolveTip(`client:${c.id}`)).not.toBeNull();
    expect(resolveTip('cart:nope')).toBeNull();
  });

  it('every data-tip key written in the UI exists (no typos)', () => {
    const keys = new Set<string>();
    for (const f of sources(join(process.cwd(), 'src', 'ui'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/data-tip="([a-z]+:[a-zA-Z0-9_]+)"/g)) keys.add(m[1]);
      for (const m of readFileSync(f, 'utf8').matchAll(/tip="(g:[a-z0-9_]+)"/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(20);
    for (const k of keys) expect(resolveTip(k), k).not.toBeNull();
  });

  it('keeps explanations short enough to read at a glance', () => {
    for (const [k, g] of Object.entries(GLOSSARY)) {
      expect(g.body.length, k).toBeLessThan(260);
      expect(g.title.length, k).toBeLessThan(48);
    }
  });
});
