import { describe, expect, it } from 'vitest';
import {
  closedThrough,
  codeFromRedirect,
  mapCandles,
  mapChain,
  schwabAuthUrl,
} from '../../data-pipeline/schwab/map';
import {
  exchangeCode,
  REFRESH_LIFETIME_MS,
  refreshTokens,
  tokenState,
} from '../../data-pipeline/schwab/auth';

describe('Schwab market data mapping (read-only)', () => {
  it('builds the login address and reads the code back from the pasted redirect', () => {
    const url = schwabAuthUrl('KEY123', 'https://127.0.0.1');
    expect(url).toContain('https://api.schwabapi.com/v1/oauth/authorize?');
    expect(url).toContain('client_id=KEY123');
    expect(url).toContain('redirect_uri=https%3A%2F%2F127.0.0.1');
    expect(codeFromRedirect('https://127.0.0.1/?code=C0.abc%40&session=xyz')).toBe('C0.abc@');
    expect(codeFromRedirect('  C0.abc%40 ')).toBe('C0.abc@');
    expect(codeFromRedirect('https://127.0.0.1/?error=denied')).toBeNull();
    expect(codeFromRedirect('')).toBeNull();
  });

  it("knows which close is final: never today's forming candle", () => {
    // 2026-09-29 is a Tuesday; late September New York is UTC-4.
    expect(closedThrough(new Date('2026-09-30T00:00:00Z'))).toEqual({
      date: '2026-09-29',
      chainIsClose: true,
    });
    expect(closedThrough(new Date('2026-09-29T15:00:00Z'))).toEqual({
      date: '2026-09-28',
      chainIsClose: false,
    });
    expect(closedThrough(new Date('2026-09-29T12:00:00Z'))).toEqual({
      date: '2026-09-28',
      chainIsClose: true,
    });
    // Saturday: Friday's close.
    expect(closedThrough(new Date('2026-10-03T16:00:00Z'))).toEqual({
      date: '2026-10-02',
      chainIsClose: true,
    });
  });

  it('maps daily candles to New York trading days', () => {
    const bars = mapCandles({
      candles: [
        {
          open: 10,
          high: 11,
          low: 9,
          close: 10.5,
          volume: 1000,
          datetime: Date.parse('2026-09-28T04:00:00Z'),
        },
        {
          open: 10.5,
          high: 12,
          low: 10,
          close: 11,
          volume: 900,
          datetime: Date.parse('2026-09-29T04:00:00Z'),
        },
        { open: 11, high: 11, low: 11, close: 11, volume: 0, datetime: Date.parse('2026-09-27T04:00:00Z') },
      ],
    });
    expect(bars.map((b) => b.date)).toEqual(['2026-09-28', '2026-09-29']);
    expect(bars[1]).toMatchObject({ close: 11, source: 'real' });
  });

  it('maps a chain: percent IV, puts and calls, near strikes and expirations only', () => {
    const c = (
      putCall: 'PUT' | 'CALL',
      strike: number,
      exp: string,
      bid: number,
      ask: number,
      vol: number,
    ) => ({
      putCall,
      bid,
      ask,
      volatility: vol,
      strikePrice: strike,
      expirationDate: `${exp}T20:00:00.000+00:00`,
    });
    const chain = mapChain(
      {
        callExpDateMap: {
          '2026-10-30:31': { '105.0': [c('CALL', 105, '2026-10-30', 1.2, 1.3, 25)] },
          '2027-03-19:171': { '105.0': [c('CALL', 105, '2027-03-19', 5, 5.5, 25)] },
        },
        putExpDateMap: {
          '2026-10-30:31': {
            '95.0': [c('PUT', 95, '2026-10-30', 1.0, 1.1, -999)],
            '60.0': [c('PUT', 60, '2026-10-30', 0.01, 0.02, 60)],
          },
        },
      },
      'TEST',
      '2026-09-29',
      100,
      0.04,
      0,
    );
    expect(chain?.quotes.map((q) => `${q.right}${q.strike}`)).toEqual(['P95', 'C105']);
    const call = chain?.quotes.find((q) => q.right === 'C');
    expect(call?.iv).toBeCloseTo(0.25, 4);
    // No IV from Schwab: solved from the mid like the pipeline does.
    const put = chain?.quotes.find((q) => q.right === 'P');
    expect(put?.iv).toBeGreaterThan(0.1);
    expect(put?.delta).toBeLessThan(0);
  });
});

describe('Schwab login tokens', () => {
  const fake = (status: number, body: unknown, seen: { url?: string; init?: RequestInit }[]) =>
    (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  it('trades the pasted code for tokens with Basic auth, then refreshes within the 7 days', async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const t0 = 1_000_000;
    const tokens = await exchangeCode({
      appKey: 'KEY',
      appSecret: 'SECRET',
      callbackUrl: 'https://127.0.0.1',
      code: 'C0.abc@',
      now: t0,
      fetchImpl: fake(200, { access_token: 'A1', refresh_token: 'R1', expires_in: 1800 }, seen),
    });
    expect(seen[0].url).toBe('https://api.schwabapi.com/v1/oauth/token');
    const headers = seen[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('KEY:SECRET').toString('base64')}`);
    expect(String(seen[0].init?.body)).toContain('grant_type=authorization_code');
    expect(String(seen[0].init?.body)).toContain('code=C0.abc%40');
    expect(tokens).toEqual({
      accessToken: 'A1',
      accessExpiresAt: t0 + 1_800_000,
      refreshToken: 'R1',
      refreshExpiresAt: t0 + REFRESH_LIFETIME_MS,
    });
    expect(tokenState(tokens, t0 + 60_000)).toBe('fresh');
    expect(tokenState(tokens, t0 + 1_790_000)).toBe('refresh');
    expect(tokenState(tokens, t0 + REFRESH_LIFETIME_MS)).toBe('login');
    const next = await refreshTokens({
      appKey: 'KEY',
      appSecret: 'SECRET',
      tokens,
      now: t0 + 3_600_000,
      fetchImpl: fake(200, { access_token: 'A2', expires_in: 1800 }, seen),
    });
    expect(next.accessToken).toBe('A2');
    expect(next.refreshToken).toBe('R1');
    expect(next.refreshExpiresAt).toBe(tokens.refreshExpiresAt);
  });

  it('explains a refused login', async () => {
    await expect(
      exchangeCode({
        appKey: 'KEY',
        appSecret: 'SECRET',
        callbackUrl: 'https://127.0.0.1',
        code: 'old',
        fetchImpl: fake(400, '{"error":"invalid_grant"}', []),
      }),
    ).rejects.toThrow(/Schwab login failed \(400\).*invalid_grant/);
  });
});
