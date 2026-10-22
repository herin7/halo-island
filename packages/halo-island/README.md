# Halo Island

Live UI in the Dynamic Island, on every phone. One JSON design renders as:

| Surface | Where |
|---|---|
| **In-app island** | iOS + Android, while your app is open. Grows out of the real camera cutout. |
| **Android island** | Floats over other apps (opt-in, `overlay: true`). |
| **Android Live Update** | Android 16+ promoted notification + status-bar chip; ongoing notification below 16. |
| **iOS Live Activity** | Dynamic Island + Lock Screen. _In progress._ |

## Install

```sh
npx expo install halo-island react-native-reanimated react-native-worklets
```

```json
// app.json — only needed for the Android over-other-apps island
{ "plugins": [["halo-island", { "overlay": true }]] }
```

Mount the in-app renderer once, at the root:

```tsx
import { HaloIslandHost } from 'halo-island';

export default function App() {
  return (<><Navigation /><HaloIslandHost /></>);
}
```

## Use

```tsx
import { island, presets, useIslandAction } from 'halo-island';

const ride = island(presets.ride);

const live = ride.start({ title: 'Asha is on the way', driver: 'White Swift', eta: '6 min', progress: 0.1 });
live.update({ eta: '2 min', progress: 0.7 });   // send only what changed
live.end();

useIslandAction('cancel', (islandId) => cancelRide());   // buttons work from every surface
```

Toast-style, in-app only, ends itself: `island(presets.toast).show({ title: 'Saved', message: 'Done', icon: 'check' })`.

Options for `start(state, options)`: `id` (stable, replaces), `overlay` (Android over other apps), `system` (Live Activity / notification, default `true`), `inApp` (default `true`), `expanded`, `duration`.

Permissions: `await requestPermissions({ overlay: true })` → returns `capabilities()`.

## Design your own

A template is plain JSON. Strings take `{key}` placeholders filled from state.

```tsx
import { island, row, column, text, icon, ring, bar, timer, button, image, spacer } from 'halo-island';

const order = island({
  compact: {
    leading: icon('bag', { color: '#FF7657' }),
    trailing: text('{eta}', { weight: 'bold', mono: true }),
  },
  expanded: column(
    row({ justify: 'between' }, text('{status}', { size: 17, weight: 'bold' }), ring('{progress}')),
    bar('{progress}', { height: 6 }),
    row(button('call', 'Call', { icon: 'phone' }), button('help', 'Help', { color: '#222', textColor: '#fff' })),
  ),
  theme: { background: '#000', foreground: '#F7F7F2', accent: '#FF7657', radius: 32 },
  motion: 'bouncy',               // 'snappy' | 'smooth' | 'none' | { stiffness, damping }
  link: 'myapp://orders/42',      // tapping the island body opens this
});
```

Layout: compact = `leading · (camera) · trailing`. Expanded = that same row as a header, then `expanded` below — the layout iOS uses, kept identical everywhere.

### Primitives

| Node | Fields |
|---|---|
| `row` / `column` | `style: { gap, padding, align: start\|center\|end\|stretch, justify: start\|center\|end\|between, background, radius, grow }` |
| `text` | `text`, `style: { size, weight: regular\|medium\|semibold\|bold\|heavy, color, mono, lines, align }` |
| `icon` | `name`, `size`, `color`. Built-in: play pause stop check close mic music bolt heart bell location timer phone car bag walk. Or any Android drawable / iOS SF Symbol name. |
| `image` | `uri` (http, file), `size`, `radius` |
| `ring` / `bar` | `value` 0–1, `color`, `track`, ring: `size`, `thickness`; bar: `height` |
| `timer` | `to` epoch ms, `countUp`, `style` — ticks natively, no updates needed |
| `button` | `action`, `label`, `icon`, `color`, `textColor` |
| `spacer` | `size` (omit to fill) |

Presets: `ride`, `timer`, `media`, `goal`, `progress`, `call`, `score`, `toast`. Each lists the state keys it reads. Override anything: `island({ ...presets.timer, theme: { accent: '#f0f' } })`.

## For AI agents

- Everything is a JSON-serializable `IslandTemplate` (`src/spec.ts` is the full contract, ~100 lines).
- Start from the closest preset; change text/colors/icons; keep state keys flat (`{ eta: '4 min' }`).
- iOS caps template + state at 4KB; the library warns in dev.
- Actions are strings; handle them with `useIslandAction(name, fn)`.

## Android notes

- The over-other-apps island needs `SYSTEM_ALERT_WINDOW` and a `specialUse` foreground service. Google Play asks you to justify both; set the text with `["halo-island", { "overlay": true, "overlayReason": "…" }]`.
- Live Updates need Android 16+ and the user can turn promotion off; `openLiveUpdateSettings()` deep-links there.
- Button taps reach JS even when the app is backgrounded (headless task) or killed (replayed on next launch).
