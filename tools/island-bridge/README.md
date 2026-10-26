# Your desk → your island

The bridge runs on your computer and feeds the island on your phone:

- **Claude Code**: your real 5-hour and weekly limits, today's tokens, sessions and active time
  (from Claude Code's own transcripts), what Claude is doing, and permission requests you
  **Allow / Deny** from the island.
- **GitHub**: the CI run for what you just pushed (live, then passed/failed), PRs waiting for your
  review, today's contributions and your streak. Uses `gh auth token` or `GITHUB_TOKEN`.
- **Files and text**: `bridge.mjs send <file | text>` puts it on the phone's island (Save / Copy /
  Open). Share anything to Halo on the phone and it lands in `~/Downloads/Halo` (text goes to
  your clipboard).

```
Claude Code ──hooks + statusline──▶ bridge.mjs (your machine) ◀──long-poll── phone ──▶ island
GitHub API ─────────────────────────────▲  │                                   │
                                        └──┴────── Allow / Deny, files ◀──────┘
```

No dependencies.

## 1. Start the bridge

```sh
node tools/island-bridge/bridge.mjs --lan    # phone on the same Wi-Fi
node tools/island-bridge/bridge.mjs          # localhost only: emulator or USB (adb reverse tcp:7337 tcp:7337)
```

The token is created once and kept in `~/.halo/bridge.json`, so a paired phone stays paired and
the hooks need no environment variables.

## 2. Pair the phone

Open `http://localhost:7337/pair` on the computer and scan the QR code with the phone's camera.
It opens Halo already paired. (Or type the address and token into Halo → Settings.)

## 3. Tell Claude Code about it

Merge into `~/.claude/settings.json` (absolute path to `hook.mjs`):

```json
{
  "statusLine": { "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs --status" },
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs" }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "node /path/to/tools/island-bridge/hook.mjs --ask", "timeout": 120 }] }]
  }
}
```

- The statusline feeds the **real** limits Claude Code reports (`rate_limits.five_hour`,
  `seven_day`). Without it the island still shows today's tokens from the transcripts.
- `PostToolUse` lets the island follow CI the moment Claude runs `git push`.
- `PermissionRequest` waits for the island only while a phone is connected; otherwise Claude Code
  asks in the terminal right away. No answer in 90 s → the terminal asks as usual. If the bridge
  isn't running, every hook is a silent no-op.

## Send things to the phone

```sh
node tools/island-bridge/bridge.mjs send build/app.apk
node tools/island-bridge/bridge.mjs send "https://github.com/herin7/halo-island/pull/12"
```

## Away from home: three ways to connect

Halo → Settings → Connection picks one. **Auto** tries the direct address first and falls back to the relay.

1. **Local:** same Wi-Fi, `bridge.mjs --lan`.
2. **Tailscale:** install Tailscale on PC and phone, run `bridge.mjs --lan`, and use the PC's Tailscale address (100.x.y.z:7337). WireGuard-encrypted, nothing exposed to the internet.
3. **AWS relay:** works from anywhere, no VPN on the phone.

```sh
aws login                                   # once
node tools/island-bridge/relay/deploy.mjs   # Lambda + DynamoDB + S3 in ap-south-1, ~free
node tools/island-bridge/bridge.mjs --lan   # restart: prints "Relay on"
# then open http://localhost:7337/pair and scan again
```

The relay is a blind mailbox. Every message and file is sealed on one device and opened on the
other with AES-256-GCM (`relay/seal.mjs`, the same bytes as `daily/seal.ts`), keyed from a 32-byte
secret that exists only in `~/.halo/bridge.json` and on your phone. It reaches the phone only
through the pairing QR, which is served to this computer only. AWS stores ciphertext under an
unguessable channel, behind a relay key, and forgets it after a day (DynamoDB TTL, S3 lifecycle,
1-day logs that never contain bodies). Tampered or replayed commands are rejected. Files over the
relay are capped at 4 MB. Zerodha never goes through the bridge or the relay: the phone talks to
Kite directly.

`relay/deploy.mjs --update` ships handler changes. To remove it, delete the `halo-relay-*` Lambda,
table, bucket and role.

## Security

The token is the only thing standing between the network and "Allow". It's random, compared in
constant time, and the bridge listens on localhost unless you pass `--lan`. The pairing page is
served to the computer itself only. Use `--lan` on networks you trust, and stop the bridge when
you're done.
