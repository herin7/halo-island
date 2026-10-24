#!/usr/bin/env node
/**
 * Island bridge: Claude Code → your phone's island, and your answer back.
 *
 * Claude Code hooks and the statusline (hook.mjs) post what Claude is doing and your real usage
 * limits here; the example app long-polls this state and shows it in the island. Permission
 * requests wait here until you tap Allow or Deny on the island — or time out, and Claude Code
 * asks in the terminal as usual.
 *
 *   node tools/island-bridge/bridge.mjs            # localhost only (Android emulator: 10.0.2.2)
 *   node tools/island-bridge/bridge.mjs --lan      # reachable from a phone on your Wi-Fi
 *
 * No dependencies. Every request needs the token printed at start (or HALO_BRIDGE_TOKEN).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.HALO_BRIDGE_PORT ?? 7337);
const LAN = process.argv.includes('--lan');
const TOKEN = process.env.HALO_BRIDGE_TOKEN ?? randomBytes(16).toString('hex');
/** How long a permission request waits for the island before Claude Code falls back to asking. */
const DECISION_MS = Number(process.env.HALO_BRIDGE_WAIT_MS ?? 90_000);

const state = {
  version: 0,
  connected: false,
  model: '',
  project: '',
  task: 'Waiting for Claude Code',
  tools: 0,
  costUsd: 0,
  /** From Claude Code's statusline: real rate-limit usage (0–100) and reset times (epoch ms). */
  fiveHourPct: null,
  fiveHourResetsAt: 0,
  weekPct: null,
  weekResetsAt: 0,
  contextPct: null,
  /** The permission request waiting for you, if any: { id, tool }. */
  pending: null,
  lastEventAt: 0,
};
/** id → settle(decision) for requests still waiting. */
const waiting = new Map();
const listeners = new Set();

function changed(patch) {
  Object.assign(state, patch, { version: state.version + 1, lastEventAt: Date.now() });
  for (const fn of listeners) fn();
  listeners.clear();
}

/** One line describing a tool call: "Bash: git push", "Edit: src/host.tsx". */
function describe(tool = 'Tool', input = {}) {
  const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  if (input.command) return `${tool}: ${short(String(input.command))}`;
  if (input.file_path) return `${tool}: ${short(String(input.file_path).split(/[\\/]/).slice(-2).join('/'))}`;
  if (input.pattern) return `${tool}: ${short(String(input.pattern))}`;
  if (input.url) return `${tool}: ${short(String(input.url))}`;
  return tool;
}

function onHook(event) {
  const base = { connected: true, project: event.cwd ? String(event.cwd).split(/[\\/]/).pop() : state.project };
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      return changed({ ...base, task: `Thinking: ${String(event.prompt ?? '').slice(0, 70)}` });
    case 'PreToolUse':
      return changed({ ...base, task: describe(event.tool_name, event.tool_input), tools: state.tools + 1 });
    case 'PostToolUse':
      return changed({ ...base, task: `Done · ${describe(event.tool_name, event.tool_input)}` });
    case 'Notification':
      return changed({ ...base, task: String(event.message ?? 'Claude needs you') });
    case 'Stop':
      return changed({ ...base, task: 'Finished — waiting for your next prompt', pending: null });
    default:
      return changed(base);
  }
}

/** A permission request: show it on the island and wait for a decision (or time out). */
function ask(event) {
  // Claude asks one thing at a time; a newer request replaces one still showing.
  for (const settle of waiting.values()) settle('ask');
  const id = randomBytes(6).toString('hex');
  changed({ connected: true, pending: { id, tool: describe(event.tool_name, event.tool_input) } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => settle('ask'), DECISION_MS);
    function settle(decision) {
      clearTimeout(timer);
      waiting.delete(id);
      if (state.pending?.id === id) changed({ pending: null, task: decision === 'ask' ? state.task : `${decision === 'allow' ? 'Allowed' : 'Denied'} · ${describe(event.tool_name, event.tool_input)}` });
      resolve(decision);
    }
    waiting.set(id, settle);
  });
}

function authorized(req, url) {
  const given = Buffer.from(String(req.headers['x-halo-token'] ?? url.searchParams.get('token') ?? ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256_000) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://bridge');
  if (!authorized(req, url)) return json(res, 401, { error: 'bad token' });
  try {
    if (req.method === 'POST' && url.pathname === '/hook') {
      const event = await body(req);
      if (url.searchParams.get('ask') === '1') return json(res, 200, { decision: await ask(event) });
      onHook(event);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/status') {
      const s = await body(req);
      const num = (v, fallback) => (typeof v === 'number' ? v : fallback);
      const at = (secs, fallback) => (typeof secs === 'number' ? secs * 1000 : fallback);
      changed({
        connected: true,
        model: s.model?.display_name ?? state.model,
        costUsd: num(s.cost?.total_cost_usd, state.costUsd),
        contextPct: num(s.context_window?.used_percentage, state.contextPct),
        fiveHourPct: num(s.rate_limits?.five_hour?.used_percentage, state.fiveHourPct),
        fiveHourResetsAt: at(s.rate_limits?.five_hour?.resets_at, state.fiveHourResetsAt),
        weekPct: num(s.rate_limits?.seven_day?.used_percentage, state.weekPct),
        weekResetsAt: at(s.rate_limits?.seven_day?.resets_at, state.weekResetsAt),
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/decide') {
      const { id, decision } = await body(req);
      const settle = waiting.get(id);
      if (!settle || !['allow', 'deny'].includes(decision)) return json(res, 404, { error: 'no such request' });
      settle(decision);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      // Long-poll: answer now if the app is behind, otherwise when something changes (≤ 25s).
      const since = Number(url.searchParams.get('since') ?? -1);
      if (state.version !== since) return json(res, 200, state);
      const reply = () => { clearTimeout(timer); json(res, 200, state); };
      const timer = setTimeout(() => { listeners.delete(reply); json(res, 200, state); }, 25_000);
      listeners.add(reply);
      req.on('close', () => { clearTimeout(timer); listeners.delete(reply); });
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: String(e?.message ?? e) });
  }
}).listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  const lan = Object.values(networkInterfaces()).flat().find((n) => n?.family === 'IPv4' && !n.internal)?.address;
  console.log(`\n  Halo island bridge on :${PORT}${LAN ? ` (LAN ${lan})` : ' (localhost)'}`);
  console.log(`  Token  ${TOKEN}`);
  console.log(`  App    ${LAN ? lan : '10.0.2.2 (Android emulator)'}:${PORT}`);
  console.log(`  Hooks  export HALO_BRIDGE_TOKEN=${TOKEN}   (see tools/island-bridge/README.md)\n`);
});
