/**
 * Live Claude Code on the island: long-polls tools/island-bridge and drives the Claude Code
 * template from catalog.ts with real data — usage limits, the current task, and permission
 * requests you answer from the island.
 */
import { IslandState, useIsland } from 'halo-island';
import { useEffect, useRef, useState } from 'react';

import { scenarios } from './catalog';

const CLAUDE = scenarios.find((s) => s.id === 'claude')!;

interface BridgeState {
  version: number;
  connected: boolean;
  model: string;
  project: string;
  task: string;
  fiveHourPct: number | null;
  fiveHourResetsAt: number;
  weekPct: number | null;
  contextPct: number | null;
  pending: { id: string; tool: string } | null;
}

export type BridgeStatus = 'off' | 'connecting' | 'live' | 'error';

/** Island state from bridge state. Falls back to context-window use when limits aren't reported. */
function toIsland(b: BridgeState): IslandState {
  const pct = Math.round(b.fiveHourPct ?? b.contextPct ?? 0);
  const week = Math.round(b.weekPct ?? 0);
  return {
    session: pct,
    sessionP: pct / 100,
    week,
    weekP: week / 100,
    resetsAt: b.fiveHourResetsAt || Date.now(),
    task: b.task,
    pending: !!b.pending,
    tool: b.pending?.tool ?? '',
  };
}

export function useClaudeBridge(address: string, token: string, enabled: boolean) {
  const [status, setStatus] = useState<BridgeStatus>('off');
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const pendingId = useRef<string | null>(null);
  pendingId.current = bridge?.pending?.id ?? null;
  const base = `http://${address.replace(/^https?:\/\//, '')}`;

  useEffect(() => {
    if (!enabled || !address || !token) { setStatus('off'); setBridge(null); return; }
    let alive = true;
    let since = -1;
    const controller = new AbortController();
    setStatus('connecting');
    (async () => {
      while (alive) {
        try {
          const res = await fetch(`${base}/state?since=${since}`, { headers: { 'x-halo-token': token }, signal: controller.signal });
          if (!res.ok) throw new Error(String(res.status));
          const next: BridgeState = await res.json();
          since = next.version;
          setBridge(next);
          setStatus('live');
        } catch {
          if (!alive) return;
          setStatus('error');
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [enabled, base, token]);

  const decide = (decision: 'allow' | 'deny') => {
    const id = pendingId.current;
    if (!id) return;
    fetch(`${base}/decide`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-halo-token': token }, body: JSON.stringify({ id, decision }) }).catch(() => {});
  };

  // The island is a view of the bridge: it appears when connected, pops open on a permission request.
  useIsland(CLAUDE.template, status === 'live' && bridge ? toIsland(bridge) : null, {
    id: 'claude-live',
    alertOn: ['pending'],
    onAction: (action) => {
      if (action === 'allow' || action === 'deny') decide(action);
    },
  });

  return { status, bridge };
}
