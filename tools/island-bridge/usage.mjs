/**
 * Claude Code usage from its own transcripts (~/.claude/projects/**\/*.jsonl), the way ccusage
 * counts it: tokens per assistant message, deduped, by local day. Reads only what was appended
 * since the last scan, so rescanning every minute is cheap.
 */
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(homedir(), '.claude', 'projects');
const WEEK = 7 * 864e5;
/** Gaps longer than this end a stretch of active work. */
const IDLE_MS = 5 * 60_000;

const offsets = new Map(); // file → bytes already read
const seen = new Set(); // message ids already counted
const days = new Map(); // 'YYYY-MM-DD' → { tokens, output, messages }
const sessions = new Map(); // 'day|session' → { last, active }

const dayOf = (ms) => new Date(ms).toLocaleDateString('en-CA');

function files() {
  const out = [];
  let dirs = [];
  try { dirs = readdirSync(ROOT); } catch { return out; }
  for (const d of dirs) {
    let names = [];
    try { names = readdirSync(join(ROOT, d)); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const path = join(ROOT, d, n);
      try {
        const s = statSync(path);
        if (Date.now() - s.mtimeMs < WEEK) out.push({ path, size: s.size });
      } catch {}
    }
  }
  return out;
}

function count(line) {
  if (!line.includes('"usage"')) return;
  let e;
  try { e = JSON.parse(line); } catch { return; }
  const u = e.message?.usage;
  const at = Date.parse(e.timestamp);
  if (!u || !at) return;
  const key = `${e.message.id}:${e.requestId ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  const day = dayOf(at);
  const d = days.get(day) ?? { tokens: 0, output: 0, messages: 0 };
  d.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  d.output += u.output_tokens ?? 0;
  d.messages++;
  days.set(day, d);
  const sk = `${day}|${e.sessionId}`;
  const s = sessions.get(sk) ?? { last: at, active: 0 };
  if (at > s.last && at - s.last <= IDLE_MS) s.active += at - s.last;
  s.last = Math.max(s.last, at);
  sessions.set(sk, s);
}

async function read({ path, size }) {
  const from = offsets.get(path) ?? 0;
  if (size <= from) return;
  let rest = '';
  // ponytail: reads appended bytes only; a rewritten (shorter) transcript is simply skipped.
  for await (const chunk of createReadStream(path, { start: from, end: size - 1, encoding: 'utf8' })) {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    lines.forEach(count);
  }
  // A half-written last line is read again next time.
  offsets.set(path, size - Buffer.byteLength(rest));
}

/** Today's numbers plus a 7-day token series, oldest first. */
export async function scanUsage() {
  for (const f of files()) await read(f);
  const today = dayOf(Date.now());
  const t = days.get(today) ?? { tokens: 0, output: 0, messages: 0 };
  let count = 0;
  let active = 0;
  for (const [k, s] of sessions) if (k.startsWith(today)) { count++; active += s.active; }
  const week = [6, 5, 4, 3, 2, 1, 0].map((n) => days.get(dayOf(Date.now() - n * 864e5))?.tokens ?? 0);
  return { todayTokens: t.tokens, todayOutput: t.output, todayMessages: t.messages, sessions: count, activeMin: Math.round(active / 60_000), week };
}

if (process.argv[1]?.endsWith('usage.mjs')) console.log(await scanUsage());

/**
 * Real 5-hour / weekly limits from your account, with the token Claude Code keeps in
 * ~/.claude/.credentials.json (Claude Code refreshes it; this only reads). Null when signed out
 * or on macOS, where the token lives in the Keychain; the statusline hook covers that case.
 */
export async function accountLimits() {
  let token;
  try { token = JSON.parse(readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')).claudeAiOauth?.accessToken; } catch { return null; }
  if (!token) return null;
  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const r = await res.json();
  const at = (w) => (w?.resets_at ? Date.parse(w.resets_at) : 0);
  return {
    fiveHourPct: r.five_hour?.utilization ?? null,
    fiveHourResetsAt: at(r.five_hour),
    weekPct: r.seven_day?.utilization ?? null,
    weekResetsAt: at(r.seven_day),
  };
}
