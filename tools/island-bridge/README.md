# Claude Code → your island

See your real Claude Code usage limits, what Claude is doing right now, and approve or deny its
permission requests — from the Dynamic Island on your phone.

```
Claude Code ──hooks + statusline──▶ bridge.mjs (your machine) ◀──long-poll── example app ──▶ island
                                         ▲                                         │
                                         └──────────── Allow / Deny ◀──────────────┘
```

## 1. Start the bridge

```sh
node tools/island-bridge/bridge.mjs          # localhost: emulator or USB phone via adb reverse
node tools/island-bridge/bridge.mjs --lan    # a phone on the same Wi-Fi
```

It prints a token. Export it where you run Claude Code: `export HALO_BRIDGE_TOKEN=<token>`
(PowerShell: `$env:HALO_BRIDGE_TOKEN="<token>"`).

## 2. Tell Claude Code about it

Add to `~/.claude/settings.json` (merge with what's there; use an absolute path to `hook.mjs`):

```json
{
  "statusLine": { "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs --status" },
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs --ask", "timeout": 120 }] }]
  }
}
```

- The statusline feeds the **real** limits Claude Code reports (`rate_limits.five_hour`,
  `seven_day`: percent used and reset time), plus model, cost and context window.
- `PermissionRequest` fires only when Claude Code would ask you. The island shows the command;
  Allow (with an in-place confirm) or Deny answers it. No answer in 90 s → Claude Code asks in the
  terminal as usual. If the bridge isn't running, every hook is a silent no-op.

## 3. Connect the app

Emulator or USB phone: run `adb reverse tcp:7337 tcp:7337` and keep the app's address at
`localhost:7337`. Phone on Wi-Fi: start the bridge with `--lan` and enter the address it printed.
Paste the token and flip **Connect**. The island appears with your limits and pops open when
Claude asks for permission.

## Security

The token is the only thing standing between the network and "Allow". It's random per run (or
`HALO_BRIDGE_TOKEN`), compared in constant time, and the bridge listens on localhost unless you pass
`--lan`. Only use `--lan` on a network you trust, and stop the bridge when you're done.
