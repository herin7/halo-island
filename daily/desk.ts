/**
 * Your desk, live: long-polls tools/island-bridge for Claude Code, GitHub and files from the PC,
 * and sends answers, clipboard and shared files back.
 */
import { useEffect, useState } from 'react';

import { native, Shared } from './modules/halo-native';

export interface Ci { repo: string; branch: string; title: string; workflow?: string; status: 'queued' | 'in_progress' | 'completed'; conclusion: string; startedAt: number; url: string; done: number; total: number }
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
  pending: { id: string; tool: string; project?: string } | null;
  lastEventAt: number;
  usage: { todayTokens: number; todayOutput: number; todayMessages: number; sessions: number; activeMin: number; week: number[] } | null;
  gh: { login: string; today: number; streak: number; week: number[]; reviews: number; ci: Ci | null } | null;
  drop: { id: string; name: string; size: number; kind: 'file' | 'text'; text: string; mime: string; at: number } | null;
}

export type DeskStatus = 'off' | 'connecting' | 'live' | 'error';
export interface DeskLink { addr: string; token: string }

const base = (addr: string) => `http://${addr.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

export function useDesk({ addr, token }: DeskLink) {
  const [status, setStatus] = useState<DeskStatus>('off');
  const [desk, setDesk] = useState<Desk | null>(null);

  useEffect(() => {
    if (!addr || !token) { setStatus('off'); setDesk(null); return; }
    let alive = true;
    let since = -1;
    let controller: AbortController | undefined;
    setStatus('connecting');
    (async () => {
      while (alive) {
        // The bridge answers within 25 s; past 30 s the address is wrong or the PC is asleep.
        const request = (controller = new AbortController());
        const stall = setTimeout(() => request.abort(), 30_000);
        try {
          const res = await fetch(`${base(addr)}/state?since=${since}`, { headers: { 'x-halo-token': token }, signal: request.signal });
          if (!res.ok) throw new Error(String(res.status));
          const next: Desk = await res.json();
          since = next.version;
          setDesk(next);
          setStatus('live');
        } catch {
          if (!alive) return;
          setStatus('error');
          await new Promise((r) => setTimeout(r, 5000));
        } finally {
          clearTimeout(stall);
        }
      }
    })();
    return () => { alive = false; controller?.abort(); };
  }, [addr, token]);

  return { status, desk };
}

const post = (link: DeskLink, path: string, body: unknown) =>
  fetch(`${base(link.addr)}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-halo-token': link.token }, body: JSON.stringify(body) });

export const decide = (link: DeskLink, id: string, decision: 'allow' | 'deny') => post(link, '/decide', { id, decision }).catch(() => {});

export async function sendClipboard(link: DeskLink): Promise<string> {
  const text = await native?.paste();
  if (!text) return 'Clipboard is empty';
  const res = await post(link, '/clip', { text }).catch(() => null);
  return res?.ok ? 'Copied to your PC' : 'PC not reachable';
}

/** Something shared to Halo from another app: text goes to the PC clipboard, files to ~/Downloads/Halo. */
export async function sendShared(link: DeskLink, s: Shared): Promise<string> {
  if (!link.addr || !link.token) return 'Pair with your PC first';
  try {
    if (s.uri && native) {
      const name = s.name || `shared-${Date.now()}`;
      await native.upload(s.uri, `${base(link.addr)}/upload?name=${encodeURIComponent(name)}`, link.token);
      return `Sent ${name} to your PC`;
    }
    if (s.text) {
      const res = await post(link, '/clip', { text: s.text });
      return res.ok ? 'Copied to your PC' : 'PC not reachable';
    }
  } catch {}
  return 'PC not reachable';
}

export const saveDrop = (link: DeskLink, d: NonNullable<Desk['drop']>) =>
  native!.download(`${base(link.addr)}/drop?id=${d.id}`, link.token, d.name, d.mime);

/** `halodaily://pair?addr=…&token=…` from the bridge's QR page. */
export function parsePair(url: string): DeskLink | null {
  const m = url.match(/^halodaily:\/\/pair\?(.*)$/);
  if (!m) return null;
  const q = Object.fromEntries(m[1].split('&').map((p) => p.split('=').map(decodeURIComponent)));
  return q.addr && q.token ? { addr: q.addr, token: q.token } : null;
}
