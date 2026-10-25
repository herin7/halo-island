#!/usr/bin/env node
/**
 * Island bridge: your desk → your phone's island, and your answers back.
 *
 * Claude Code hooks and the statusline (hook.mjs) post what Claude is doing and your real usage
 * limits here; it also scans Claude Code's transcripts for today's tokens, follows GitHub (CI for
 * what you just pushed, reviews, contributions) and passes files and text between desk and phone.
 * The apps long-poll this state. Permission requests wait here until you tap Allow or Deny on the
 * island, or time out and Claude Code asks in the terminal as usual.
 *
 *   node tools/island-bridge/bridge.mjs            # localhost only (USB/emulator: adb reverse tcp:7337 tcp:7337)
 *   node tools/island-bridge/bridge.mjs --lan      # reachable from a phone on your Wi-Fi
 *   node tools/island-bridge/bridge.mjs send <file | text>   # to the phone
 *
 * No dependencies. Every request needs the token (kept in ~/.halo/bridge.json, or HALO_BRIDGE_TOKEN).
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, networkInterfaces, platform } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { pushedFrom, startGitHub } from './github.mjs';
import { accountLimits, scanUsage } from './usage.mjs';

const PORT = Number(process.env.HALO_BRIDGE_PORT ?? 7337);
const LAN = process.argv.includes('--lan');
/** How long a permission request waits for the island before Claude Code falls back to asking. */
const DECISION_MS = Number(process.env.HALO_BRIDGE_WAIT_MS ?? 90_000);
/** A phone that hasn't polled for this long isn't listening; permission requests go straight to the terminal. */
const PHONE_GONE_MS = 40_000;

// The token survives restarts, so a paired phone stays paired.
const CONFIG = join(homedir(), '.halo', 'bridge.json');
function loadToken() {
  if (process.env.HALO_BRIDGE_TOKEN) return process.env.HALO_BRIDGE_TOKEN;
  try { return JSON.parse(readFileSync(CONFIG, 'utf8')).token; } catch {}
  const token = randomBytes(16).toString('hex');
  mkdirSync(join(homedir(), '.halo'), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ token }));
  return token;
}
const TOKEN = loadToken();

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', apk: 'application/vnd.android.package-archive', mp4: 'video/mp4', mp3: 'audio/mpeg', txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv' };
const mimeOf = (name) => MIME[extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';

// region send — `bridge.mjs send <file | text>` hands something to the phone through the running bridge.

if (process.argv[2] === 'send') {
  const what = process.argv.slice(3).join(' ');
  if (!what) { console.log('usage: bridge.mjs send <file | text>'); process.exit(1); }
  const file = existsSync(what) && statSync(what).isFile();
  const query = file ? `name=${encodeURIComponent(basename(what))}` : 'kind=text';
  const res = await fetch(`http://127.0.0.1:${PORT}/drop?${query}`, {
    method: 'POST',
    headers: { 'x-halo-token': TOKEN },
    body: file ? readFileSync(what) : what,
  }).catch(() => null);
  console.log(res?.ok ? `Sent to your phone: ${file ? basename(what) : 'text'}` : 'Bridge not running. Start it with: node tools/island-bridge/bridge.mjs --lan');
  process.exit(res?.ok ? 0 : 1);
}

// endregion

const state = {
  version: 0,
  connected: false,
  model: '',
  project: '',
  task: 'Waiting for Claude Code',
  /** Between a prompt and Claude stopping. */
  working: false,
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
  /** Today's Claude Code usage from the transcripts (usage.mjs). */
  usage: null,
  /** Contributions, reviews and the CI run you're waiting on (github.mjs). */
  gh: null,
  /** The latest thing sent from the desk: { id, name, size, kind: 'file' | 'text', text, mime, at }. */
  drop: null,
};
/** id → settle(decision) for requests still waiting. */
const waiting = new Map();
const listeners = new Set();
/** Files sent to the phone, kept in memory until fetched (the last few only). */
const drops = new Map();
let lastPollAt = 0;

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

const rescan = () => scanUsage().then((usage) => changed({ usage })).catch(() => {});
/** Limits straight from your account, so they show up even without the statusline hook. */
const limits = () => accountLimits().then((l) => l && changed({ connected: true, ...l })).catch(() => {});

function onHook(event) {
  const base = { connected: true, project: event.cwd ? String(event.cwd).split(/[\\/]/).pop() : state.project };
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      return changed({ ...base, working: true, task: `Thinking: ${String(event.prompt ?? '').slice(0, 70)}` });
    case 'PreToolUse':
      return changed({ ...base, working: true, task: describe(event.tool_name, event.tool_input), tools: state.tools + 1 });
    case 'PostToolUse':
      if (event.tool_name === 'Bash' && /\bgit\s+push\b/.test(String(event.tool_input?.command ?? '')) && event.cwd) pushedFrom(event.cwd);
      return changed({ ...base, task: `Done · ${describe(event.tool_name, event.tool_input)}` });
    case 'Notification':
      return changed({ ...base, task: String(event.message ?? 'Claude needs you') });
    case 'Stop':
      rescan();
      return changed({ ...base, working: false, task: 'Finished — waiting for your next prompt', pending: null });
    default:
      return changed(base);
  }
}

/** A permission request: show it on the island and wait for a decision (or time out). */
function ask(event) {
  // Nobody's phone is listening: don't make Claude Code wait for an answer that won't come.
  if (Date.now() - lastPollAt > PHONE_GONE_MS) return Promise.resolve('ask');
  // Claude asks one thing at a time; a newer request replaces one still showing.
  for (const settle of waiting.values()) settle('ask');
  const id = randomBytes(6).toString('hex');
  changed({ connected: true, pending: { id, tool: describe(event.tool_name, event.tool_input), project: state.project } });
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

const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req, limit = 256_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('too large');
  }
  return raw;
}

async function bytes(req, limit = 512 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/** Puts text on this computer's clipboard. */
function setClipboard(text) {
  const os = platform();
  if (os === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', '[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())'], { input: text });
  else if (os === 'darwin') execFileSync('pbcopy', { input: text });
  else try { execFileSync('wl-copy', { input: text }); } catch { execFileSync('xclip', ['-selection', 'clipboard'], { input: text }); }
}

/** A name in ~/Downloads/Halo that doesn't overwrite anything. */
function inbox(name) {
  const dir = join(homedir(), 'Downloads', 'Halo');
  mkdirSync(dir, { recursive: true });
  const clean = basename(name).replace(/[<>:"/\\|?*]/g, '_') || 'file';
  const ext = extname(clean);
  let path = join(dir, clean);
  for (let i = 2; existsSync(path); i++) path = join(dir, `${clean.slice(0, clean.length - ext.length)} (${i})${ext}`);
  return path;
}

const lan = () => Object.values(networkInterfaces()).flat().find((n) => n?.family === 'IPv4' && !n.internal)?.address;

/** A QR code the phone's camera opens straight into the app, already paired. Served to this computer only. */
const pairPage = (link) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pair Halo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f5f5f7;font:15px system-ui}main{text-align:center}#q{background:#fff;padding:18px;border-radius:24px;display:inline-block}p{color:#98989f}</style>
<main><div id="q"></div><h2>Scan with your phone's camera</h2><p>Opens Halo, paired with this computer.${LAN ? '' : '<br>Started without --lan: your phone can only reach it over USB (adb reverse).'}</p></main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('q'),{text:${JSON.stringify(link)},width:280,height:280})</script>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://bridge');
  if (req.method === 'GET' && url.pathname === '/pair' && local(req)) {
    const addr = LAN ? `${lan()}:${PORT}` : `localhost:${PORT}`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(pairPage(`halodaily://pair?addr=${addr}&token=${TOKEN}`));
  }
  if (!authorized(req, url)) return json(res, 401, { error: 'bad token' });
  try {
    if (req.method === 'POST' && url.pathname === '/hook') {
      const event = JSON.parse((await body(req)) || '{}');
      if (url.searchParams.get('ask') === '1') return json(res, 200, { decision: await ask(event) });
      onHook(event);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/status') {
      const s = JSON.parse((await body(req)) || '{}');
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
      const { id, decision } = JSON.parse((await body(req)) || '{}');
      const settle = waiting.get(id);
      if (!settle || !['allow', 'deny'].includes(decision)) return json(res, 404, { error: 'no such request' });
      settle(decision);
      return json(res, 200, { ok: true });
    }
    // Desk → phone: a file or text from `bridge.mjs send`.
    if (req.method === 'POST' && url.pathname === '/drop') {
      const data = await bytes(req);
      const id = randomBytes(6).toString('hex');
      const name = url.searchParams.get('name') ?? '';
      const text = url.searchParams.get('kind') === 'text' ? data.toString('utf8').slice(0, 4000) : '';
      if (!text) {
        drops.set(id, { data, name, mime: mimeOf(name) });
        for (const old of [...drops.keys()].slice(0, -5)) drops.delete(old);
      }
      changed({ drop: { id, name: text ? 'Text' : name, size: data.length, kind: text ? 'text' : 'file', text, mime: text ? 'text/plain' : mimeOf(name), at: Date.now() } });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/drop') {
      const d = drops.get(url.searchParams.get('id') ?? '');
      if (!d) return json(res, 404, { error: 'gone' });
      res.writeHead(200, { 'content-type': d.mime, 'content-length': d.data.length });
      return res.end(d.data);
    }
    // Phone → desk: anything shared to Halo lands in ~/Downloads/Halo.
    if (req.method === 'POST' && url.pathname === '/upload') {
      const path = inbox(url.searchParams.get('name') ?? 'from-phone');
      await pipeline(req, createWriteStream(path));
      console.log(`  ⇣ from phone  ${path}`);
      return json(res, 200, { ok: true, path });
    }
    if (req.method === 'POST' && url.pathname === '/clip') {
      const { text } = JSON.parse((await body(req)) || '{}');
      if (typeof text !== 'string' || !text) return json(res, 400, { error: 'no text' });
      setClipboard(text);
      console.log(`  ⇣ clipboard   ${text.length > 60 ? text.slice(0, 59) + '…' : text}`);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      lastPollAt = Date.now();
      // Long-poll: answer now if the app is behind, otherwise when something changes (≤ 25s).
      const since = Number(url.searchParams.get('since') ?? -1);
      if (state.version !== since) return json(res, 200, state);
      const reply = () => { clearTimeout(timer); json(res, 200, state); };
      const timer = setTimeout(() => { listeners.delete(reply); lastPollAt = Date.now(); json(res, 200, state); }, 25_000);
      listeners.add(reply);
      req.on('close', () => { clearTimeout(timer); listeners.delete(reply); });
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: String(e?.message ?? e) });
  }
}).listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  const github = startGitHub((gh) => changed({ gh }));
  rescan();
  limits();
  setInterval(rescan, 60_000);
  setInterval(limits, 3 * 60_000);
  console.log(`\n  Halo island bridge on :${PORT}${LAN ? ` (LAN ${lan()})` : ' (localhost)'}`);
  console.log(`  Pair   open http://localhost:${PORT}/pair and scan it with your phone`);
  console.log(`  Token  ${TOKEN}`);
  console.log(`  App    ${LAN ? `${lan()}:${PORT}` : `localhost:${PORT}  (Android: adb reverse tcp:${PORT} tcp:${PORT})`}`);
  console.log(`  GitHub ${github ? 'on (gh auth token)' : 'off: set GITHUB_TOKEN or run gh auth login'}`);
  console.log(`  Send   node tools/island-bridge/bridge.mjs send <file | text>\n`);
});
