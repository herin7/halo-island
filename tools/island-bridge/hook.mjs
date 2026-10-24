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
const PORT = process.env.HALO_BRIDGE_PORT ?? 7337;
const TOKEN = process.env.HALO_BRIDGE_TOKEN ?? '';
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
    const { decision } = await res.json();
    // "ask" (timed out) prints nothing: Claude Code then prompts in the terminal as usual.
    if (decision === 'allow' || decision === 'deny') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied from the Halo island' },
        },
      }));
    }
  }
} catch {
  // Bridge not running or unreachable: never block Claude Code.
}
if (status) process.stdout.write('◉ island');
