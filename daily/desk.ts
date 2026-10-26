/**
 * Your desk, live: long-polls tools/island-bridge for Claude Code, GitHub and files from the PC,
 * and sends answers, clipboard and shared files back.
 */
import { useEffect, useState } from 'react';

import { native, Shared } from './modules/halo-native';
import { File } from 'expo-file-system';

import { keepFile, paste, random } from './platform';
import { bytesToB64url, keys, open, openJson, seal, sealJson } from './seal';

export interface Ci { repo: string; branch: string; title: string; workflow?: string; status: 'queued' | 'in_progress' | 'completed'; conclusion: string; startedAt: number; url: string; done: number; total: number }
/** One of Claude's AskUserQuestion questions, as the bridge forwards it. */
export interface Question { question: string; header: string; multiSelect: boolean; options: string[] }
export interface Desk {
  version: number;
  connected: boolean;
  model: string;
  project: string;
  task: string;
  working: boolean;
  fiveHourPct: number | null;
  fiveHourResetsAt: number;
  weekPct: number | null;
  weekResetsAt: number;
  contextPct: number | null;
  pending: { id: string; tool: string; project?: string; questions?: Question[] | null } | null;
  lastEventAt: number;
  usage: { todayTokens: number; todayOutput: number; todayMessages: number; sessions: number; activeMin: number; week: number[] } | null;
  gh: { login: string; today: number; streak: number; week: number[]; reviews: number; ci: Ci | null } | null;
  drop: { id: string; name: string; size: number; kind: 'file' | 'text'; text: string; mime: string; at: number } | null;
}

export type DeskStatus = 'off' | 'connecting' | 'live' | 'error';
/** How Halo reaches your PC: Wi-Fi or a Tailscale address (local), your AWS relay, or whichever works. */
export type Route = 'auto' | 'local' | 'relay';
export interface Relay { url: string; key: string; secret: string }
export interface DeskLink { addr: string; token: string; relay?: Relay; route?: Route }

const base = (addr: string) => `http://${addr.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

/** Which path is carrying the desk right now; commands follow it. */
let via: 'local' | 'relay' = 'local';
export const deskVia = () => via;

const relayBase = (r: Relay) => `${r.url}/${keys(r.secret).channel}`;
const relayHeaders = (r: Relay) => ({ 'x-relay-key': r.key });
const newId = () => bytesToB64url(random(9));

/** One sealed command to the PC through the relay. */
async function relaySend(r: Relay, cmd: object) {
  const res = await fetch(`${relayBase(r)}/in`, { method: 'POST', headers: relayHeaders(r), body: sealJson(keys(r.secret), 'in', { id: newId(), ...cmd }, random) });
  if (!res.ok) throw new Error(`Relay said ${res.status}`);
}

export function useDesk(link: DeskLink) {
  const { addr, token, relay } = link;
  const route = link.route ?? 'auto';
  const [status, setStatus] = useState<DeskStatus>('off');
  const [desk, setDesk] = useState<Desk | null>(null);

  useEffect(() => {
    const canLocal = !!addr && !!token && route !== 'relay';
    const canRelay = !!relay?.url && route !== 'local';
    if (!canLocal && !canRelay) { setStatus('off'); setDesk(null); return; }
    let alive = true;
    let controller: AbortController | undefined;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setStatus('connecting');

    /** Long-polls the bridge directly. Returns when it stops answering. */
    async function local() {
      let since = -1;
      let misses = 0;
      while (alive && misses < 2) {
        // The bridge answers within 25 s; past 30 s the address is wrong or the PC is asleep.
        const request = (controller = new AbortController());
        const stall = setTimeout(() => request.abort(), since < 0 ? 6_000 : 30_000);
        try {
          const res = await fetch(`${base(addr)}/state?since=${since}`, { headers: { 'x-halo-token': token }, signal: request.signal });
          if (!res.ok) throw new Error(String(res.status));
          const next: Desk = await res.json();
          since = next.version;
          misses = 0;
          via = 'local';
          setDesk(next);
          setStatus('live');
        } catch {
          misses++;
          if (alive && misses < 2) await wait(2000);
        } finally {
          clearTimeout(stall);
        }
      }
    }

    /** Polls the relay: sealed state in, a sealed ping out so the PC knows you're there. */
    async function remote(until: number) {
      const r = relay!;
      const k = keys(r.secret);
      let since = '';
      let lastPing = 0;
      while (alive && Date.now() < until) {
        try {
          if (Date.now() - lastPing > 25_000) { lastPing = Date.now(); relaySend(r, { type: 'ping' }).catch(() => {}); }
          const res = await fetch(`${relayBase(r)}/state?since=${since}`, { headers: relayHeaders(r) });
          if (res.status === 200) {
            const { ver, v } = await res.json();
            since = String(ver);
            const msg = openJson<{ state: Desk }>(k, 'state', v);
            via = 'relay';
            setDesk(msg.state);
            setStatus('live');
          } else if (res.status !== 304) throw new Error(String(res.status));
        } catch {
          setStatus('error');
        }
        await wait(4000);
      }
    }

    (async () => {
      while (alive) {
        if (canLocal) await local();
        if (!alive) return;
        // Wi-Fi didn't answer: use the relay for a minute, then check whether we're home again.
        if (canRelay) await remote(canLocal ? Date.now() + 60_000 : Infinity);
        else { setStatus('error'); await wait(5000); }
      }
    })();
    return () => { alive = false; controller?.abort(); };
  }, [addr, token, relay?.url, relay?.secret, route]);

  return { status, desk };
}

const post = (link: DeskLink, path: string, body: unknown) =>
  fetch(`${base(link.addr)}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-halo-token': link.token }, body: JSON.stringify(body) });

/** `answers` (question → chosen label) answers Claude's questions; "ask" leaves it to the PC. */
export function decide(link: DeskLink, id: string, decision: 'allow' | 'deny' | 'ask', answers?: Record<string, string>) {
  const sent = via === 'relay' && link.relay ? relaySend(link.relay, { type: 'decide', id, decision, answers }) : post(link, '/decide', { id, decision, answers });
  return Promise.resolve(sent).catch(() => {});
}

async function sendText(link: DeskLink, text: string): Promise<boolean> {
  if (via === 'relay' && link.relay) return relaySend(link.relay, { type: 'clip', text }).then(() => true, () => false);
  const res = await post(link, '/clip', { text }).catch(() => null);
  return !!res?.ok;
}

export async function sendClipboard(link: DeskLink): Promise<string> {
  const text = await paste();
  if (!text) return 'Clipboard is empty';
  return (await sendText(link, text)) ? 'Copied to your PC' : 'PC not reachable';
}

/** Something shared to Halo from another app: text goes to the PC clipboard, files to ~/Downloads/Halo. */
export async function sendShared(link: DeskLink, s: Shared): Promise<string> {
  if (!link.addr && !link.relay) return 'Pair with your PC first';
  try {
    if (s.uri) {
      const name = s.name || `shared-${Date.now()}`;
      if (via === 'relay' && link.relay) {
        // Sealed on the phone, opened on the PC: the relay holds ciphertext, for a day at most.
        const bytes = await new File(s.uri).bytes();
        if (bytes.length > 4 * 1024 * 1024) return 'Over 4 MB: send it on home Wi-Fi';
        const file = newId();
        const r = link.relay;
        const put = await fetch(`${relayBase(r)}/f/${file}`, { method: 'PUT', headers: { ...relayHeaders(r), 'content-type': 'application/octet-stream' }, body: seal(keys(r.secret), 'file', bytes, random) as unknown as BodyInit });
        if (!put.ok) return 'Relay not reachable';
        await relaySend(r, { type: 'upload', name, file });
        return `Sent ${name} to your PC`;
      }
      if (native) {
        await native.upload(s.uri, `${base(link.addr)}/upload?name=${encodeURIComponent(name)}`, link.token);
        return `Sent ${name} to your PC`;
      }
    }
    if (s.text) return (await sendText(link, s.text)) ? 'Copied to your PC' : 'PC not reachable';
  } catch {}
  return 'PC not reachable';
}

/**
 * A file from the PC. Over Wi-Fi on Android it streams into Downloads/Halo (returns its uri);
 * through the relay, or on iOS, it's fetched, opened if sealed, and handed to the share sheet ('').
 */
export async function saveDrop(link: DeskLink, d: NonNullable<Desk['drop']>): Promise<string> {
  if (via === 'relay' && link.relay) {
    const r = link.relay;
    const res = await fetch(`${relayBase(r)}/f/${d.id}`, { headers: relayHeaders(r) });
    if (!res.ok) throw new Error(res.status === 404 ? 'Too big for the relay: grab it on Wi-Fi' : `Relay said ${res.status}`);
    await keepFile(d.name, open(keys(r.secret), 'file', new Uint8Array(await res.arrayBuffer())), d.mime);
    return '';
  }
  const url = `${base(link.addr)}/drop?id=${d.id}`;
  if (native) return native.download(url, link.token, d.name, d.mime);
  const res = await fetch(url, { headers: { 'x-halo-token': link.token } });
  if (!res.ok) throw new Error(`Bridge answered ${res.status}`);
  await keepFile(d.name, new Uint8Array(await res.arrayBuffer()), d.mime);
  return '';
}

/** `halodaily://pair?addr=…&token=…[&relay=…&rk=…&s=…]` from the bridge's QR page. */
export function parsePair(url: string): DeskLink | null {
  const m = url.match(/^halodaily:\/\/pair\?(.*)$/);
  if (!m) return null;
  const q = Object.fromEntries(m[1].split('&').map((p) => p.split('=').map(decodeURIComponent)));
  if (!q.addr || !q.token) return null;
  return { addr: q.addr, token: q.token, relay: q.relay && q.rk && q.s ? { url: q.relay, key: q.rk, secret: q.s } : undefined, route: 'auto' };
}
