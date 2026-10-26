#!/usr/bin/env node
/**
 * The command Claude Code runs for each hook. It forwards the hook's JSON to the bridge and, for
 * permission requests (`--ask`), prints the decision you made on the island. If the bridge isn't
 * running it stays silent, so Claude Code behaves exactly as without it.
 *
 *   node tools/island-bridge/hook.mjs          # report only (UserPromptSubmit, PostToolUse, Stop…)
 *   node tools/island-bridge/hook.mjs --ask    # PermissionRequest: wait for Allow / Deny from the island
 *   node tools/island-bridge/hook.mjs --status # statusLine: forward model, cost, context
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.HALO_BRIDGE_PORT ?? 7337;
// The bridge keeps its token in ~/.halo/bridge.json, so hooks need no environment setup.
let TOKEN = process.env.HALO_BRIDGE_TOKEN ?? '';
if (!TOKEN) try { TOKEN = JSON.parse(readFileSync(join(homedir(), '.halo', 'bridge.json'), 'utf8')).token; } catch {}
const ask = process.argv.includes('--ask');
const status = process.argv.includes('--status');

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/${status ? 'status' : 'hook'}${ask ? '?ask=1' : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-halo-token': TOKEN },
    body: raw || '{}',
    signal: AbortSignal.timeout(ask ? 100_000 : 2_000),
  });
  if (ask && res.ok) {
    const { decision, answers } = await res.json();
    const event = JSON.parse(raw || '{}');
    // A question needs its answers echoed back with the original input; "allow" alone answers nothing.
    const question = event.tool_name === 'AskUserQuestion';
    const allow = answers ? { behavior: 'allow', updatedInput: { ...event.tool_input, answers } } : question ? null : { behavior: 'allow' };
    // "ask" (timed out, or "On PC" from the island) prints nothing: Claude Code then prompts in the terminal as usual.
    const out = decision === 'allow' ? allow : decision === 'deny' ? { behavior: 'deny', message: 'Denied from the Halo island' } : null;
    if (out) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: out } }));
  }
} catch {
  // Bridge not running or unreachable: never block Claude Code.
}
if (status) process.stdout.write('◉ island');
