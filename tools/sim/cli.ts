/**
 * npm run sim -- the balance simulator.
 *
 * Plays headless Career runs through the real engine with four bots (Disciplined Seller,
 * Hold-to-Expiry, Random, Greedy), then checks the design's balance targets:
 *   run win rates 55-65% / 20-35% / <15% / <5%, no cartridge's win rate when picked more than
 *   15 points above average, every desk within 10 points of Verticals, and a run time of
 *   20-40 minutes. Writes sim/REPORT.md.
 *
 * Options:
 *   --runs N        runs per bot (default 200)
 *   --desk-runs N   runs per desk for the desk comparison (default 120)
 *   --cart-runs N   runs with random shopping for the cartridge check (default 500)
 *   --tier N        Risk Tier (default 0)
 *   --db PATH       use a built game.db instead of the SIM market
 *   --seed S        seed prefix (default "sim")
 *   --workers N     worker threads (default: CPU count)
 *   --only bots|desks|carts   run one section
 *   --bots a,b      only these bots (quick tuning runs; the report is partial)
 */

import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BALANCE } from '../../src/content/balance';
import { CARTRIDGE_BY_ID } from '../../src/content/cartridges';
import { DESK_ORDER, DESKS } from '../../src/content/desks';
import type { SimResult, SimSpec } from './runOne';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Number(arg('runs', '200'));
const DESK_RUNS = Number(arg('desk-runs', '120'));
const CART_RUNS = Number(arg('cart-runs', '500'));
/** Cartridges picked fewer times than this are listed but not judged: the noise is too large. */
const MIN_PICKS = 30;
/** Cards whose observed lift is above this get the switched-off check. */
const CAUSAL_FROM = 0.1;
const TIER = Number(arg('tier', '0'));
const DB = process.argv.includes('--db') ? resolve(arg('db', '')) : null;
const SEED = arg('seed', 'sim');
const WORKERS = Number(arg('workers', String(Math.max(1, cpus().length))));
const ONLY = arg('only', 'all');
/** Only these bots (comma list), for quick tuning runs. */
const BOTS = process.argv.includes('--bots') ? arg('bots', '').split(',') : null;

/**
 * Seconds a person spends on each action in the UI (for the run-time estimate). Two paces: a
 * player who knows the hotkeys and the builder defaults, and someone on their first runs.
 */
export const UI_SECONDS = {
  experienced: {
    call: 3,
    place: 30,
    reroll: 5,
    skip: 5,
    decide: 6,
    begin: 0.35, // one fast-forward day at the default speed
    end: 0,
    close: 4,
    finishTally: 15,
    buy: 6,
    leaveShop: 25,
    rerollShop: 4,
    startReview: 10,
    memo: 4,
    endRound: 3,
  } as Record<string, number>,
  firstRuns: {
    call: 5,
    place: 45,
    reroll: 8,
    skip: 8,
    decide: 8,
    begin: 0.35,
    end: 0,
    close: 5,
    finishTally: 25,
    buy: 8,
    leaveShop: 30,
    rerollShop: 5,
    startReview: 15,
    memo: 5,
    endRound: 3,
  } as Record<string, number>,
};

async function runAll(specs: SimSpec[], label: string): Promise<SimResult[]> {
  const out: SimResult[] = [];
  const n = Math.min(WORKERS, specs.length);
  const chunks: SimSpec[][] = Array.from({ length: n }, () => []);
  specs.forEach((s, i) => chunks[i % n].push(s));
  const t0 = Date.now();
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<void>((res, rej) => {
          const w = new Worker(join(here, 'worker-boot.mjs'), { workerData: { specs: chunk, db: DB } });
          w.on('message', (r: SimResult) => {
            out.push(r);
            if (out.length % 25 === 0 || out.length === specs.length)
              process.stdout.write(
                `\r  ${label}: ${out.length}/${specs.length} runs (${((Date.now() - t0) / 1000).toFixed(0)}s)   `,
              );
          });
          w.on('error', rej);
          w.on('exit', () => res());
        }),
    ),
  );
  process.stdout.write('\n');
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const winRate = (rs: SimResult[]) => (rs.length ? rs.filter((r) => r.completed).length / rs.length : 0);
const minutes = (r: SimResult, pace: keyof typeof UI_SECONDS = 'experienced') =>
  Object.entries(r.actions).reduce((a, [k, n]) => a + (UI_SECONDS[pace][k] ?? 3) * n, 0) / 60;
const money = (c: number) => `${c < 0 ? '−' : ''}$${Math.abs(c / 100).toFixed(0)}`;
/** 95% interval half-width for a win rate. */
const ci = (p: number, n: number) => (n ? 1.96 * Math.sqrt((p * (1 - p)) / n) : 0);

interface Check {
  name: string;
  target: string;
  actual: string;
  pass: boolean;
}

async function main(): Promise<void> {
  const market = DB ? `real data (${DB})` : 'the SIM market (synthetic companies)';
  console.log(`Balance simulator on ${market}, Tier ${TIER}, ${WORKERS} workers.`);
  const checks: Check[] = [];
  const lines: string[] = [];
  const started = Date.now();
  const bench = DB ? 'SPY' : 'MKTX';
  const spec = (
    seed: string,
    bot: SimSpec['bot'],
    desk: SimSpec['desk'],
    shop: SimSpec['shop'],
  ): SimSpec => ({ seed, bot, desk, tier: TIER, shop, benchmark: bench });

  // ---------------- bots ----------------
  const bots: { bot: SimSpec['bot']; label: string; range: [number, number] }[] = [
    { bot: 'active', label: 'Active Trader', range: [0.45, 0.65] },
    { bot: 'disciplined', label: 'Disciplined Seller', range: [0.55, 0.65] },
    { bot: 'hold', label: 'Hold-to-Expiry', range: [0.2, 0.35] },
    { bot: 'greedy', label: 'Greedy', range: [0, 0.15] },
    { bot: 'random', label: 'Random', range: [0, 0.05] },
  ];
  let disciplined: SimResult[] = [];
  if (ONLY === 'all' || ONLY === 'bots') {
    const results: Record<string, SimResult[]> = {};
    for (const b of bots.filter((x) => !BOTS || BOTS.includes(x.bot)))
      results[b.bot] = await runAll(
        Array.from({ length: RUNS }, (_, i) =>
          spec(`${SEED}-${b.bot}-${i}`, b.bot, 'verticals', b.bot === 'random' ? 'random' : 'families'),
        ),
        b.label,
      );
    disciplined = results.disciplined ?? [];
    lines.push('## Bots on the Verticals desk', '');
    lines.push(
      '| Bot | Runs | Run win rate (95% CI) | Beat SPY | Rounds cleared (mean) | Lost to the Max-Loss Line | Real P/L per run (mean) | Trades per run | Est. run time |',
    );
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const b of bots) {
      const rs = results[b.bot];
      if (!rs) continue;
      const w = winRate(rs);
      const breach = rs.filter((r) => r.failReason === 'breach').length / rs.length;
      lines.push(
        `| ${b.label} | ${rs.length} | ${pct(w)} ± ${pct(ci(w, rs.length))} | ${pct(rs.filter((r) => r.victory).length / rs.length)} | ${mean(rs.map((r) => r.cleared)).toFixed(1)} | ${pct(breach)} | ${money(mean(rs.map((r) => r.realizedCents)))} | ${mean(rs.map((r) => r.trades)).toFixed(1)} | ${mean(rs.map((r) => minutes(r))).toFixed(0)} min |`,
      );
      checks.push({
        name: `${b.label} run win rate`,
        target: `${pct(b.range[0])}–${pct(b.range[1])}`,
        actual: pct(w),
        pass: w >= b.range[0] - 1e-9 && w <= b.range[1] + 1e-9,
      });
      const errs = rs.filter((r) => r.error);
      if (errs.length) lines.push('', `> ${errs.length} ${b.label} runs hit an error: ${errs[0].error}`);
    }
    lines.push('');
    // Where runs end, and how scores compare with targets, for the two players the targets are tuned on.
    for (const who of ['active', 'disciplined'] as const) {
      const rs = results[who];
      if (!rs) continue;
      const label = bots.find((x) => x.bot === who)?.label ?? who;
      const byRound = Array.from({ length: 12 }, (_, i) => rs.filter((r) => r.failRound === i).length);
      lines.push(
        `### Where ${label} runs end`,
        '',
        '| Round | ' +
          [
            'Q1 M1',
            'Q1 M2',
            'Q1 Rev',
            'Q2 M1',
            'Q2 M2',
            'Q2 Rev',
            'Q3 M1',
            'Q3 M2',
            'Q3 Rev',
            'Q4 M1',
            'Q4 M2',
            'Q4 Annual',
          ].join(' | ') +
          ' |',
      );
      lines.push('|---|' + '---|'.repeat(12));
      lines.push('| Runs ending there | ' + byRound.join(' | ') + ' |');
      const reached = Array.from({ length: 12 }, (_, i) => rs.filter((r) => r.roundsPlayed > i).length);
      const passedAt = Array.from(
        { length: 12 },
        (_, i) => rs.filter((r) => r.rounds[i] && r.rounds[i].status !== 'failed').length,
      );
      lines.push(
        '| Pass rate when reached | ' +
          reached.map((n, i) => (n ? pct(passedAt[i] / n) : '—')).join(' | ') +
          ' |',
      );
      const ratio = Array.from({ length: 12 }, (_, i) =>
        mean(
          rs
            .filter((r) => r.rounds[i] && r.rounds[i].status !== 'skipped')
            .map((r) => r.rounds[i].meter / Math.max(1, r.rounds[i].target)),
        ),
      );
      lines.push('| Mean score / target | ' + ratio.map((x) => x.toFixed(2)).join(' | ') + ' |', '');
      // Does the score follow the money? Rounds passed while losing money, and the correlation.
      const played = rs.flatMap((r) => r.rounds.filter((x) => x.status !== 'skipped'));
      const passed = played.filter((x) => x.status === 'passed');
      const passedLosing = passed.filter((x) => x.realizedCents < 0).length;
      const losing = played.filter((x) => x.realizedCents < 0);
      const corr = correlation(
        played.map((x) => x.meter / Math.max(1, x.target)),
        played.map((x) => x.realizedCents),
      );
      lines.push(
        `Score and money: ${pct(passed.length ? passedLosing / passed.length : 0)} of passed rounds lost money; ${pct(losing.length ? losing.filter((x) => x.status === 'passed').length / losing.length : 0)} of money-losing rounds still passed; correlation between a round's score and its P/L ${corr.toFixed(2)}.`,
        '',
      );
      const q = (xs: number[], p: number) => {
        const v = [...xs].sort((a, b) => a - b);
        return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0;
      };
      for (const i of [0, 1, 2, 3, 6, 9, 11]) {
        const rr = rs.filter((r) => r.rounds[i] && r.rounds[i].status !== 'skipped').map((r) => r.rounds[i]);
        const ratios = rr.map((x) => x.meter / Math.max(1, x.target));
        console.log(
          `    round ${i}: n=${rr.length} score/target p10 ${q(ratios, 0.1).toFixed(2)} p25 ${q(ratios, 0.25).toFixed(2)} p50 ${q(ratios, 0.5).toFixed(2)} p90 ${q(ratios, 0.9).toFixed(2)} · P/L p50 ${money(
            q(
              rr.map((x) => x.realizedCents),
              0.5,
            ),
          )} · pass ${pct(rr.filter((x) => x.status === 'passed').length / Math.max(1, rr.length))}`,
        );
      }
      console.log(
        `  ${label}: passed-while-losing ${pct(passed.length ? passedLosing / passed.length : 0)}, losing-rounds-passed ${pct(losing.length ? losing.filter((x) => x.status === 'passed').length / losing.length : 0)}, score~P/L r=${corr.toFixed(2)}, score/target by quarter ${[0, 3, 6, 9].map((i) => mean(rs.filter((r) => r.rounds[i]).map((r) => r.rounds[i].meter / Math.max(1, r.rounds[i].target))).toFixed(1)).join('/')}`,
      );
    }
    const done = disciplined.filter((r) => r.completed);
    const set = done.length ? done : disciplined;
    const time = mean(set.map((r) => minutes(r)));
    const slow = mean(set.map((r) => minutes(r, 'firstRuns')));
    checks.push({
      name: 'Full-run time (Disciplined, completed runs, experienced pace)',
      target: '20–40 min',
      actual: `${time.toFixed(0)} min`,
      pass: time >= 20 && time <= 40,
    });
    lines.push(
      '### Run time estimate',
      '',
      `A completed Disciplined Seller run takes about **${time.toFixed(0)} minutes** at an experienced pace (hotkeys, builder defaults) and about **${slow.toFixed(0)} minutes** on your first runs (${done.length} completed runs). Each action is counted at a typical UI time:`,
      '',
      '| Action | Experienced (s) | First runs (s) |',
      '|---|---|---|',
      ...Object.keys(UI_SECONDS.experienced).map(
        (k) => `| ${k} | ${UI_SECONDS.experienced[k]} | ${UI_SECONDS.firstRuns[k]} |`,
      ),
      '',
      `Mean actions in a completed run: ${Object.entries(sumActions(done))
        .map(([k, v]) => `${k} ${(v / Math.max(1, done.length)).toFixed(0)}`)
        .join(', ')}.`,
      '',
    );
  }

  // ---------------- desks ----------------
  if (ONLY === 'all' || ONLY === 'desks') {
    const deskRes: Record<string, SimResult[]> = {};
    for (const d of DESK_ORDER)
      deskRes[d] = await runAll(
        Array.from({ length: DESK_RUNS }, (_, i) =>
          spec(`${SEED}-desk-${d}-${i}`, 'disciplined', d, 'families'),
        ),
        `desk ${d}`,
      );
    const base = winRate(deskRes.verticals);
    lines.push(
      '## Desks (Disciplined player on each desk)',
      '',
      '| Desk | Runs | Run win rate | vs Verticals | Rounds cleared | Real P/L per run |',
      '|---|---|---|---|---|---|',
    );
    for (const d of DESK_ORDER) {
      const w = winRate(deskRes[d]);
      lines.push(
        `| ${DESKS[d].name} | ${deskRes[d].length} | ${pct(w)} | ${d === 'verticals' ? '—' : `${w >= base ? '+' : ''}${((w - base) * 100).toFixed(1)} pts`} | ${mean(deskRes[d].map((r) => r.cleared)).toFixed(1)} | ${money(mean(deskRes[d].map((r) => r.realizedCents)))} |`,
      );
      if (d !== 'verticals')
        checks.push({
          name: `${DESKS[d].name} desk vs Verticals`,
          target: '±10 pts',
          actual: `${((w - base) * 100).toFixed(1)} pts`,
          pass: Math.abs(w - base) <= 0.1 + 1e-9,
        });
    }
    lines.push('');
  }

  // ---------------- cartridges ----------------
  if (ONLY === 'all' || ONLY === 'carts') {
    const all: SimResult[] = [];
    for (const d of DESK_ORDER)
      all.push(
        ...(await runAll(
          Array.from({ length: Math.ceil(CART_RUNS / DESK_ORDER.length) }, (_, i) =>
            spec(`${SEED}-cart-${d}-${i}`, 'disciplined', d, 'random'),
          ),
          `cartridges ${d}`,
        )),
      );
    lines.push('## Cartridges (Disciplined trading, random shopping, all desks)', '');
    lines.push(
      "Each cartridge's lift: the run win rate of runs that bought it, minus the win rate of all runs (same desks) that reached the same shop. Comparing at the same shop removes survivorship bias (a cartridge bought late only shows up in runs that already lasted). Starting cartridges are excluded.",
      '',
    );
    lines.push(
      '| Cartridge | Rarity | Runs picked | Win rate when picked | Expected at those shops | Lift | 95% CI |',
      '|---|---|---|---|---|---|---|',
    );
    const rows: { id: string; n: number; w: number; base: number; picked: SimResult[] }[] = [];
    for (const [id, c] of Object.entries(CARTRIDGE_BY_ID)) {
      const desks = DESK_ORDER.filter(
        (d) => (c.desks === 'any' || c.desks.includes(d)) && !DESKS[d].startingCartridges.includes(id),
      );
      const pool = all.filter((r) => desks.includes(r.spec.desk));
      if (!pool.length) continue;
      const picked = pool.filter((r) => r.ownedAt[id] !== undefined);
      const baseAt = (k: number) => winRate(pool.filter((r) => r.roundsPlayed >= k));
      const base = mean(picked.map((r) => baseAt(r.ownedAt[id])));
      rows.push({ id, n: picked.length, w: winRate(picked), base, picked });
    }
    rows.sort((a, b) => b.w - b.base - (a.w - a.base));
    for (const r of rows) {
      const c = CARTRIDGE_BY_ID[r.id];
      lines.push(
        `| ${c.name} | ${c.rarity} | ${r.n} | ${r.n ? pct(r.w) : '—'} | ${r.n ? pct(r.base) : '—'} | ${r.n ? `${r.w >= r.base ? '+' : ''}${((r.w - r.base) * 100).toFixed(1)} pts` : '—'} | ${r.n ? `± ${(ci(r.w, r.n) * 100).toFixed(1)}` : '—'} |`,
      );
    }
    const judged = rows.filter((r) => r.n >= MIN_PICKS);
    // A high lift can be selection, not power: the runs that happen to buy a card may be doing
    // well for other reasons. For any card that looks strong, replay exactly those runs with the
    // card owned but switched off (same seeds, same shops, same decisions up to the purchase).
    // The difference is what the card itself adds.
    const causal = new Map<string, { off: number }>();
    for (const r of judged.filter((x) => x.w - x.base > CAUSAL_FROM)) {
      const reruns = await runAll(
        r.picked.map((p) => ({ ...p.spec, inert: r.id })),
        `switched off: ${CARTRIDGE_BY_ID[r.id].name}`,
      );
      causal.set(r.id, { off: winRate(reruns) });
    }
    const effective = (r: (typeof rows)[number]) => {
      const c = causal.get(r.id);
      return c ? r.w - c.off : r.w - r.base;
    };
    const worst = judged.reduce((a, r) => Math.max(a, effective(r)), -1);
    const top = judged.find((r) => effective(r) === worst);
    const topCausal = top ? causal.get(top.id) : undefined;
    checks.push({
      name: `Strongest cartridge (picked ${MIN_PICKS}+ times)`,
      target: '≤ +15 pts',
      actual: top
        ? `${CARTRIDGE_BY_ID[top.id].name} ${(worst * 100).toFixed(1)} pts${topCausal ? ' (switched-off check)' : ''}`
        : 'n/a',
      pass: worst <= 0.15 + 1e-9,
    });
    if (causal.size) {
      lines.push(
        '',
        `### Switched-off check (cards with a lift over +${Math.round(CAUSAL_FROM * 100)} points)`,
        '',
        'The same runs replayed with the card owned but doing nothing. "What the card adds" is the difference; it is the number the ≤ +15 target is judged on for these cards.',
        '',
        '| Cartridge | Runs | Win rate with it | Same runs, switched off | What the card adds | Observed lift |',
        '|---|---|---|---|---|---|',
      );
      for (const [id, c] of causal) {
        const r = rows.find((x) => x.id === id);
        if (!r) continue;
        lines.push(
          `| ${CARTRIDGE_BY_ID[id].name} | ${r.n} | ${pct(r.w)} | ${pct(c.off)} | ${r.w - c.off >= 0 ? '+' : ''}${((r.w - c.off) * 100).toFixed(1)} pts | ${r.w >= r.base ? '+' : ''}${((r.w - r.base) * 100).toFixed(1)} pts |`,
        );
      }
    }
    lines.push(
      '',
      `Cartridges picked fewer than ${MIN_PICKS} times are listed but not judged: with that few runs the 95% interval is wider than ±17 points, so a lucky streak would look like an overpowered card. ${rows.filter((r) => r.n < MIN_PICKS).length} of ${rows.length} fall below that here (mostly rares and legendaries, which the shop rarely offers).`,
      '',
    );
  }

  // ---------------- report ----------------
  const header = [
    '# Balance report',
    '',
    `Generated by \`npm run sim\` on ${new Date().toISOString().slice(0, 10)} against ${market}, Risk Tier ${TIER}. ${RUNS} runs per bot, ${DESK_RUNS} per desk, ${CART_RUNS} for the cartridge check. Took ${((Date.now() - started) / 60000).toFixed(1)} minutes.`,
    '',
    'A "win" is a run that clears all 12 rounds (Victory, or "You survived" when SPY did better). "Beat SPY" counts only full victories.',
    '',
    '## Targets',
    '',
    '| Check | Target | Actual | |',
    '|---|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.target} | ${c.actual} | ${c.pass ? '✅' : '❌'} |`),
    '',
  ];
  const footer = [
    '## Balance values used',
    '',
    '```json',
    JSON.stringify(
      {
        targets: BALANCE.targets,
        scoring: BALANCE.scoring,
        risk: BALANCE.risk,
        brackets: BALANCE.brackets,
        cash: BALANCE.cash,
        stress: BALANCE.stress,
        run: BALANCE.run,
      },
      null,
      2,
    ),
    '```',
    '',
    'Desk adjustments:',
    '',
    '| Desk | Extra tickets | Extra cards | Share price range | Bracket defaults |',
    '|---|---|---|---|---|',
    ...DESK_ORDER.map((d) => {
      const k = DESKS[d];
      return `| ${k.name} | ${k.ticketsAdd ?? 0} | ${k.lineupAdd ?? 0} | ${k.priceRange ? `$${k.priceRange[0]}–$${k.priceRange[1]}` : 'default'} | ${
        k.brackets
          ? Object.entries(k.brackets)
              .map(([a, b]) => `${a} ${b}`)
              .join(', ')
          : 'default'
      } |`;
    }),
    '',
  ];
  const out = join(
    root,
    'sim',
    ONLY === 'all' && !BOTS ? 'REPORT.md' : `REPORT-${ONLY}${BOTS ? '-bots' : ''}.md`,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, [...header, ...lines, ...footer].join('\n'));
  console.log('');
  for (const c of checks)
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.actual} (target ${c.target})`);
  console.log(`\nWrote ${out}`);
}

function sumActions(rs: SimResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.actions)) out[k] = (out[k] ?? 0) + v;
  return out;
}

void main();
