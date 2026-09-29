/**
 * The Schwab connection: read-only market data from the player's own Schwab developer app.
 * The App Key, App Secret and login tokens are kept in one file in the game's user-data folder,
 * encrypted with the operating system's key store (Windows DPAPI, the macOS Keychain) through
 * Electron's safeStorage. Nothing is sent anywhere but Schwab, and only market data is asked for.
 */
import { safeStorage, shell } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exchangeCode, refreshTokens, tokenState, type SchwabTokens } from '../../data-pipeline/schwab/auth';
import { codeFromRedirect, DEFAULT_CALLBACK, schwabAuthUrl } from '../../data-pipeline/schwab/map';
import type { SchwabSettings, SchwabStatus } from '../../src/shared/rpc';
import { addHandlers } from './ipc';
import { log } from './log';
import { userDataDir } from './paths';

interface Stored {
  appKey: string;
  callbackUrl: string;
  /** The App Secret and tokens, encrypted (base64). */
  secret: string | null;
  tokens: string | null;
  /** True only where the OS offers no key store (then the file is plain; the status says so). */
  plain?: boolean;
  connectedAt?: number;
}

const file = () => join(userDataDir(), 'schwab.json');

function load(): Stored | null {
  if (!existsSync(file())) return null;
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Stored;
  } catch {
    return null;
  }
}

function save(s: Stored): void {
  writeFileSync(file(), JSON.stringify(s), { encoding: 'utf8', mode: 0o600 });
}

const canEncrypt = () => safeStorage.isEncryptionAvailable();

function seal(text: string): { value: string; plain: boolean } {
  if (canEncrypt()) return { value: safeStorage.encryptString(text).toString('base64'), plain: false };
  return { value: Buffer.from(text, 'utf8').toString('base64'), plain: true };
}

function open(value: string | null, plain: boolean | undefined): string | null {
  if (!value) return null;
  try {
    const buf = Buffer.from(value, 'base64');
    return plain ? buf.toString('utf8') : safeStorage.decryptString(buf);
  } catch (e) {
    log('warn', 'schwab: could not read the saved keys', e);
    return null;
  }
}

function tokensOf(s: Stored): SchwabTokens | null {
  const raw = open(s.tokens, s.plain);
  return raw ? (JSON.parse(raw) as SchwabTokens) : null;
}

function storeTokens(s: Stored, t: SchwabTokens | null): Stored {
  const next = { ...s, tokens: t ? seal(JSON.stringify(t)).value : null };
  save(next);
  return next;
}

export function schwabStatus(): SchwabStatus {
  const s = load();
  const t = s ? tokensOf(s) : null;
  const state = tokenState(t);
  return {
    configured: !!s?.appKey && !!s.secret,
    connected: state !== 'login',
    appKeyHint: s?.appKey ? `…${s.appKey.slice(-4)}` : null,
    callbackUrl: s?.callbackUrl ?? DEFAULT_CALLBACK,
    loginExpiresAt: state === 'login' ? null : (t?.refreshExpiresAt ?? null),
    encrypted: s ? !s.plain : canEncrypt(),
  };
}

/** A fresh access token (refreshed when needed), or null when Schwab isn't connected. */
export async function schwabAccessToken(): Promise<string | null> {
  const s = load();
  if (!s) return null;
  const t = tokensOf(s);
  const state = tokenState(t);
  if (!t || state === 'login') return null;
  if (state === 'fresh') return t.accessToken;
  const secret = open(s.secret, s.plain);
  if (!secret) return null;
  const next = await refreshTokens({ appKey: s.appKey, appSecret: secret, tokens: t });
  storeTokens(s, next);
  return next.accessToken;
}

export function registerSchwabHandlers(): void {
  addHandlers({
    'schwab.status': () => schwabStatus(),
    'schwab.save': (x: SchwabSettings) => {
      const prev = load();
      const appKey = x.appKey.trim() || prev?.appKey || '';
      const callbackUrl = x.callbackUrl.trim() || DEFAULT_CALLBACK;
      if (!appKey) throw new Error('Enter the App Key from your Schwab developer app.');
      const sealed = x.appSecret.trim() ? seal(x.appSecret.trim()) : null;
      const changedApp = !!prev && (prev.appKey !== appKey || prev.callbackUrl !== callbackUrl);
      save({
        appKey,
        callbackUrl,
        secret: sealed?.value ?? prev?.secret ?? null,
        // A different app or callback needs a new login.
        tokens: changedApp || sealed ? null : (prev?.tokens ?? null),
        plain: sealed ? sealed.plain : prev?.plain,
      });
      return schwabStatus();
    },
    'schwab.login': () => {
      const s = load();
      if (!s?.appKey || !s.secret) throw new Error('Save your App Key and App Secret first.');
      const url = schwabAuthUrl(s.appKey, s.callbackUrl);
      void shell.openExternal(url);
      return url;
    },
    'schwab.finish': async (pasted: string) => {
      const s = load();
      if (!s?.appKey || !s.secret) throw new Error('Save your App Key and App Secret first.');
      const code = codeFromRedirect(pasted);
      if (!code) throw new Error('No login code in that address. Copy the whole address after logging in.');
      const secret = open(s.secret, s.plain);
      if (!secret) throw new Error('The saved App Secret could not be read. Enter it again.');
      const tokens = await exchangeCode({
        appKey: s.appKey,
        appSecret: secret,
        callbackUrl: s.callbackUrl,
        code,
      });
      storeTokens({ ...s, connectedAt: Date.now() }, tokens);
      log('info', 'schwab: connected (read-only market data)');
      return schwabStatus();
    },
    'schwab.disconnect': (forget: boolean) => {
      const s = load();
      if (forget) {
        if (existsSync(file())) rmSync(file());
      } else if (s) storeTokens(s, null);
      return schwabStatus();
    },
  });
}
