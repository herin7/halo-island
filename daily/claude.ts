/**
 * Claude usage straight from your Claude account, no PC needed: the same OAuth sign-in Claude Code
 * uses (PKCE, manual-code callback), asking only for `user:profile`, which reads usage and can't run
 * prompts. Endpoints taken from Claude Code itself; `/api/oauth/usage` is undocumented, so every
 * failure degrades to "unknown" instead of breaking the app.
 */
import { Linking } from 'react-native';

import { pkce } from './platform';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE = 'https://claude.com/cai/oauth/authorize';
const TOKEN = 'https://platform.claude.com/v1/oauth/token';
const REDIRECT = 'https://platform.claude.com/oauth/code/callback';
const USAGE = 'https://api.anthropic.com/api/oauth/usage';
const SCOPE = 'user:profile';

export interface ClaudeAuth { access: string; refresh: string; expiresAt: number }
export interface Window { pct: number; resetsAt: number }
export interface ClaudeUsage { five: Window | null; week: Window | null; opus: Window | null; sonnet: Window | null; at: number }

/** The sign-in that's waiting for its code. Kept in memory: a login is finished in one sitting. */
let pending: { verifier: string; state: string } | null = null;

export async function signIn() {
  const p = await pkce();
  pending = { verifier: p.verifier, state: p.state };
  const q = { code: 'true', client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE, code_challenge: p.challenge, code_challenge_method: 'S256', state: p.state };
  return Linking.openURL(`${AUTHORIZE}?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`);
}

export const signingIn = () => !!pending;

/**
 * The callback page shows `code#state` (and has it in its URL). Accepts either, so the user can
 * paste whatever they copied — or the app reads it off the clipboard on return.
 */
export function parseCode(text: string): { code: string; state: string } | null {
  const t = text.trim();
  const url = t.match(/[?&]code=([^&#\s]+).*?[?&]state=([^&#\s]+)/);
  if (url) return { code: decodeURIComponent(url[1]), state: decodeURIComponent(url[2]) };
  const pair = t.match(/^([\w-]{10,})#([\w-]{10,})$/);
  return pair ? { code: pair[1], state: pair[2] } : null;
}

const tokens = (r: { access_token: string; refresh_token?: string; expires_in: number }, refresh = ''): ClaudeAuth =>
  ({ access: r.access_token, refresh: r.refresh_token ?? refresh, expiresAt: Date.now() + r.expires_in * 1000 });

async function post(body: Record<string, string>) {
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 400 ? 'That code didn’t work. Sign in again.' : `Claude said ${res.status}`);
  return res.json();
}

export async function finish(text: string): Promise<ClaudeAuth> {
  const got = parseCode(text);
  if (!pending || !got) throw new Error('Copy the code from the Claude page, then come back');
  if (got.state !== pending.state) throw new Error('That code is from another sign-in. Try again.');
  const { verifier, state } = pending;
  const auth = tokens(await post({ grant_type: 'authorization_code', code: got.code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier, state }));
  pending = null;
  return auth;
}

const refresh = async (a: ClaudeAuth) => tokens(await post({ grant_type: 'refresh_token', refresh_token: a.refresh, client_id: CLIENT_ID, scope: SCOPE }), a.refresh);

const win = (w: { utilization?: number | null; resets_at?: string | null } | null | undefined): Window | null =>
  w && typeof w.utilization === 'number' ? { pct: w.utilization, resetsAt: w.resets_at ? Date.parse(w.resets_at) : 0 } : null;

/** Usage, refreshing the token first when it's (nearly) expired. Returns the auth to keep, which may be new. */
export async function fetchUsage(auth: ClaudeAuth): Promise<{ auth: ClaudeAuth; usage: ClaudeUsage }> {
  let a = auth.expiresAt - Date.now() < 5 * 60_000 ? await refresh(auth) : auth;
  const get = (token: string) => fetch(USAGE, { headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'content-type': 'application/json' } });
  let res = await get(a.access);
  if (res.status === 401) { a = await refresh(a); res = await get(a.access); }
  if (!res.ok) throw new Error(`Usage unavailable (${res.status})`);
  const r = await res.json();
  return { auth: a, usage: { five: win(r.five_hour), week: win(r.seven_day), opus: win(r.seven_day_opus), sonnet: win(r.seven_day_sonnet), at: Date.now() } };
}
