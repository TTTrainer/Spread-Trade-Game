/**
 * Schwab's OAuth login for a personal developer app: the player logs in on Schwab's site, pastes
 * back the address it lands on, and the code in it is traded for tokens. The access token lasts
 * 30 minutes and is refreshed silently; the refresh token lasts 7 days, after which Schwab asks
 * for the login again. The app secret and tokens only ever live on the player's computer.
 */

import { SCHWAB_TOKEN_URL } from './map';

export interface SchwabTokens {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

/** Schwab's refresh tokens expire 7 days after the login, whatever the refreshes do. */
export const REFRESH_LIFETIME_MS = 7 * 24 * 3600 * 1000;

async function tokenCall(
  appKey: string,
  appSecret: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const basic = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
  const r = await fetchImpl(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await r.text();
  if (!r.ok) {
    // Schwab's error bodies say what went wrong (an expired code, a callback mismatch); keep them short.
    const why = text.replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`Schwab login failed (${r.status})${why ? `: ${why}` : ''}`);
  }
  const json = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Schwab login failed: no access token in the answer.');
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(opts: {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
  code: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<SchwabTokens> {
  const now = opts.now ?? Date.now();
  const j = await tokenCall(
    opts.appKey,
    opts.appSecret,
    { grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.callbackUrl },
    opts.fetchImpl ?? fetch,
  );
  if (!j.refresh_token) throw new Error('Schwab login failed: no refresh token in the answer.');
  return {
    accessToken: j.access_token,
    accessExpiresAt: now + (j.expires_in ?? 1800) * 1000,
    refreshToken: j.refresh_token,
    refreshExpiresAt: now + REFRESH_LIFETIME_MS,
  };
}

export async function refreshTokens(opts: {
  appKey: string;
  appSecret: string;
  tokens: SchwabTokens;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<SchwabTokens> {
  const now = opts.now ?? Date.now();
  const j = await tokenCall(
    opts.appKey,
    opts.appSecret,
    { grant_type: 'refresh_token', refresh_token: opts.tokens.refreshToken },
    opts.fetchImpl ?? fetch,
  );
  return {
    accessToken: j.access_token,
    accessExpiresAt: now + (j.expires_in ?? 1800) * 1000,
    refreshToken: j.refresh_token ?? opts.tokens.refreshToken,
    // Refreshing doesn't extend the 7 days: only a new login does.
    refreshExpiresAt: opts.tokens.refreshExpiresAt,
  };
}

/** Whether the saved tokens can be used as they are, need a refresh, or need a new login. */
export function tokenState(t: SchwabTokens | null, now = Date.now()): 'fresh' | 'refresh' | 'login' {
  if (!t) return 'login';
  if (t.accessExpiresAt - now > 60_000) return 'fresh';
  if (t.refreshExpiresAt - now > 60_000) return 'refresh';
  return 'login';
}
