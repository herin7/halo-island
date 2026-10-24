<div align="center">
  <img src="https://raw.githubusercontent.com/herin7/halo-island/main/packages/halo-island/docs/media/logo.svg" alt="Halo Island logo" width="112"/>
  <h1>Halo Island</h1>
  <p><strong>A Dynamic Island for every React Native app: one JSON design, on iOS, Android and the web.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/halo-island"><img src="https://img.shields.io/npm/v/halo-island?style=flat-square&color=5E8BFF" alt="npm"></a>
    <a href="https://github.com/herin7/halo-island/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/herin7/halo-island/ci.yml?branch=main&style=flat-square&label=ci" alt="CI"></a>
    <img src="https://img.shields.io/badge/platforms-iOS_·_Android_·_web-000?style=flat-square" alt="Platforms">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT">
  </p>
</div>

<p align="center"><img src="https://raw.githubusercontent.com/herin7/halo-island/main/packages/halo-island/docs/media/hero.png" alt="The IndiGo island" width="100%"/></p>

Flights, rides, timers, music, payments and tiny in-island apps grow out of the camera cutout, morph with spring physics, and can float over other apps on Android, all from one template.

<p align="center"><img src="https://raw.githubusercontent.com/herin7/halo-island/main/packages/halo-island/docs/media/gallery-1.png" alt="Live activities" width="100%"/></p>

- **One design, every surface.** The same template runs the in-app island (iOS, Android, web), the Android island over other apps, and the Android notification or Live Update.
- **Plain data.** A template is JSON, so you can store it, send it from a server, or let an AI agent write it.
- **Island apps.** Screens, buttons, chips, sliders and toggles let you build a whole flow inside the island.
- **Alive.** A pet with eyes that blink and follow your finger, glass material, aura light, a sparkline, live waveforms and rolling numbers.
- **Works without the native module.** The in-app renderer is pure JS (react-native-svg + Reanimated), so it runs in Expo Go and on the web.

---

## Install

```sh
npx expo install halo-island react-native-reanimated react-native-worklets react-native-svg
# optional extras
npx expo install expo-haptics expo-blur expo-glass-effect lottie-react-native
```

| Optional package | What it adds |
|---|---|
| `expo-haptics` | Haptic ticks on expand, button taps and confirmations |
| `expo-glass-effect` | Liquid Glass for `material: 'glass'` on iOS 26 |
| `expo-blur` | Blurred glass where Liquid Glass isn't available |
| `lottie-react-native` | `lottie` nodes (on web it also needs `@lottiefiles/dotlottie-react`) |

Mount the host once, at the root of your app:

```tsx
import { HaloIslandHost } from 'halo-island';

export default function App() {
  return (
    <>
      <Navigation />
      <HaloIslandHost />
    </>
  );
}
```

## Quick start

```tsx
import { island, presets, useIslandAction } from 'halo-island';

const ride = island(presets.ride);

const live = ride.start({ title: 'Asha is on the way', driver: 'White Swift', eta: '6 min', progress: 0.1 });
live.update({ eta: '2 min', progress: 0.7 });          // send only what changed
live.update({ title: 'Asha is here' }, { alert: true }); // pops open for a moment
live.end();

useIslandAction('cancel', (islandId, state) => cancelRide());
```

For a toast that stays in the app and ends on its own, use `island(presets.toast).show({ title: 'Saved', message: 'Done', icon: 'check' })`.

## Keep the island and the screen in sync

`useIsland` makes the island a view of your React state. It starts when `state` becomes non-null, sends only the keys that differ from what the island shows (removed keys are cleared), and ends on `null` or unmount. The island can't drift from your screen: if anything else changed it, the next render corrects it.

```tsx
import { useIsland } from 'halo-island';

const order = { compact: { … }, expanded: … }; // define templates outside components

function OrderScreen({ order: o }) {
  const [tracking, setTracking] = useState(true);
  useIsland(orderTemplate, tracking ? { status: o.status, eta: o.eta, rider: o.rider } : null, {
    id: `order-${o.id}`,
    alertOn: ['rider'],                      // pop open when a rider is assigned
    onAction: (action) => action === 'call' && call(o.rider),
    onChange: (patch) => setTip(patch.tip),  // chips/sliders write back to your state
  });
  return <OrderCard order={o} />;
}
```

Starting with an id that's already showing replaces that island in place (same position, no re-entry animation), and handles from the old one keep working on the new one.

Built-in presets: `ride`, `timer`, `media`, `goal`, `progress`, `call`, `score` and `toast`. Each one lists the state keys it reads. To change a preset, spread it: `island({ ...presets.timer, theme: { accent: '#f0f' } })`.

## Design your own

A template is plain JSON. Any string can hold `{key}` placeholders, which are filled from the island's state. Builders such as `row()` and `text()` are only shorthand for that JSON.

```tsx
import { island, row, column, text, icon, ring, bar, button } from 'halo-island';

const order = island({
  compact: {
    leading: icon('bag', { color: '#FF7657' }),
    trailing: text('{eta}', { weight: 'bold', mono: true }),
  },
  expanded: column(
    row({ justify: 'between' }, text('{status}', { size: 17, weight: 'bold' }), ring('{progress}')),
    bar('{progress}', { height: 6 }),
    row(button('call', 'Call', { icon: 'phone' }), button('help', 'Help', { tint: true })),
  ),
  theme: { accent: '#FF7657', radius: 32 },
  link: 'myapp://orders/42', // tapping the island body opens this
});
```

Compact is `leading · (camera) · trailing`. When the island expands, that same row becomes the header and `expanded` goes below it. iOS uses this layout, and Halo Island uses it on every surface.

### Design like the system island

The templates that look native follow Apple's Live Activity anatomy:

- **Compact** is one glyph on the left and one value on the right (`12 min`, `62%`, a timer). No titles.
- **Expanded** keeps that glyph as its header. Under it: a title and a muted line on the left, the key value large on the right, then at most one visual (a bar, a track, a sparkline) and one row of buttons.
- Use the accent for the value and the main button, white for titles, the theme's secondary grey for everything else. Semibold, not heavy.
- Add a character or an animation only when it carries meaning: a pet that reacts to answers, confetti on a six.

`show` renders a node only while a state key is set, so the island grows as details arrive. A `!` in front inverts it:

```ts
when('driver', text('{driver}'))           // only once a driver is assigned
when('!driver', text('Finding a driver…'))  // until then
```

A state key counts as off when it is `''`, `0`, `false`, `null`, `'false'` or `'0'`.

## Island apps: screens and inputs

Add `screens` and the island becomes a small app. Buttons with `go:<screen>` open a screen, and the island resizes to fit it. `back` (or a swipe right) returns, and `close` collapses the island.

```tsx
import { island, column, row, text, button, chips, slider, toggle } from 'halo-island';

const home = island({
  compact: { leading: icon('home'), trailing: text('{temp}°') },
  expanded: row(
    { wrap: true, gap: 8 },
    toggle('lights', 'Lights', { icon: 'bulb' }),
    toggle('lock', 'Door', { icon: 'lock' }),
    button('go:climate', 'Climate', { icon: 'thermo', shape: 'tile' }),
  ),
  screens: {
    climate: column(
      text('Climate', { size: 17, weight: 'bold' }),
      slider('fan', { icon: 'tune' }),
      chips('mode', ['Cool', 'Heat', 'Auto']),
      row(button('back', 'Back', { tint: true }), button('apply', 'Apply')),
    ),
  },
});

useIslandAction('apply', (id, state) => api.setClimate(state.mode, state.fan));
useIslandAction('change:lights', (id, state) => api.lights(state.lights));
```

- Inputs write straight into the island's state: `chips` writes the chosen option (or `values[i]`), `slider` writes 0–1 and `toggle` writes a boolean. Each change also fires `change:<bind>`.
- Writing to state yourself works the same way: `setState(id, { mode: 'Auto' })`.
- `button(action, label, { confirm: 'Pay ₹200?' })` turns into its own confirmation on the first tap and fires on the second. Use it for anything that costs money or can't be undone.
- `shape: 'tile'` stacks the icon over the label, like a control-center tile. `shape: 'circle'` is a round, icon-only button.
- `screens` stay inside the app. They're removed before a template goes to a system surface, which keeps those payloads small.

## Icons, images and animations

The built-in icons cover common cases. Register your own glyph set once and use the names anywhere an icon goes: `icon`, button `icon`, `track` and `arc` markers, tiles.

```ts
import { registerIcons, registerAssets } from 'halo-island';

registerIcons({ moped: 'M…', 'cooking-pot': 'M…' });  // path data on a 24-unit grid
registerAssets({
  logo: require('./assets/logo.png'),                  // image('logo')
  'lottie:confetti': require('./assets/confetti.json'), // lottie('lottie:confetti')
  'rive:car': require('./assets/car.riv'),              // rive('rive:car')
});
```

Templates stay plain JSON (names, not `require` calls), and the example app ships [Phosphor](https://phosphoricons.com) fill glyphs (MIT) rescaled to that grid. Registered icons draw in the in-app renderer; the Android overlay knows the built-ins and Android drawable names.

## The pet

`pet()` draws two eyes that blink, follow the user's finger and morph between moods. Put one in `compact.leading` and the island becomes a character.

```tsx
import { island, pet, text, lookAt } from 'halo-island';

const buddy = island({
  compact: { leading: pet('{mood}', { color: '#fff', cheeks: '#FF7A9A' }), trailing: text('{status}') },
});
const live = buddy.start({ mood: 'idle', status: 'Ready' });
live.update({ mood: 'thinking', status: 'Working…' });
live.update({ mood: 'happy', status: 'Done' });
```

Moods: `idle`, `happy`, `love`, `sleepy`, `surprised`, `thinking`, `wink`, `sad` and `focused`. Any change morphs smoothly from the current face.

When nothing is pointing, the eyes glance around on their own. To point every pet at a screen position, call `lookAt(x, y, { width, height })` from any touch or pointer handler:

```tsx
<View onTouchMove={(e) => lookAt(e.nativeEvent.pageX, e.nativeEvent.pageY, Dimensions.get('window'))} />
```

## Glass and aura

```ts
theme: {
  material: 'glass',   // translucent, blurred, with a lit edge (Liquid Glass on iOS 26)
  aura: '#7C5CFF',     // light pooling at the bottom of the expanded island
}
```

Glass uses `expo-glass-effect` when the device supports it, then `expo-blur`, and falls back to a translucent fill when neither is installed.

## Several islands at once

Every `start()` is its own island. The newest one owns the island, and the one before it shrinks to a round **bubble** beside it, the way iOS shows two Live Activities. Tap the bubble to swap them, or call `focus(id)`. When an island ends, the previous one takes its place again.

## Primitives

| Node | Builder | Fields |
|---|---|---|
| `row` / `column` | `row(style?, ...children)` | `style: { gap, padding, align: start\|center\|end\|stretch\|baseline, justify: start\|center\|end\|between, background, gradient, radius, border, width, height, opacity, grow, wrap }` |
| `text` | `text(value, style?)` | `size, weight: regular\|medium\|semibold\|bold\|heavy, color, mono, font, lines, align` |
| `icon` | `icon(name, opts?)` / `svg(path, opts?)` | built-in `name`, any SVG `path` (`viewBox`, `stroke`), `size`, `width`, `color` |
| `image` | `image(uri, opts?)` | `uri` (http, file or `asset(require(...))`), `size`, `width`, `radius`, `fit`, `glow` |
| `ring` | `ring(value, opts?)` | `value` 0–1, `size`, `thickness`, `color`, `track` |
| `bar` | `bar(value, opts?)` | `value` 0–1, `height`, `color`, `track` |
| `track` | `track(value, marker?, opts?)` | a bar with a marker riding along it: an icon name (drawn on a puck) or a registered image/Lottie; `end` icon at the finish, `flip`, `markerSize`, `height`, `color`, `track` |
| `steps` | `steps(value, count, opts?)` | `count` segments, `value` done (fractions fill part of one) |
| `bars` | `bars(values, opts?)` | values 0–1 as an array or `'{list}'`, `active`, `gap`, `animate` (live waveform) |
| `line` | `line(values, opts?)` | sparkline, values 0–1, `height`, `color`, `fill`, `thickness` |
| `arc` | `arc(value, opts?)` | shallow arc, `colors`, `thickness`, `glow`; `marker` rides the curve and turns with it |
| `timeline` | `timeline(value, icons, opts?)` | stages as icons on a line, `value` counts reached stages |
| `timer` | `timer(to, opts?)` | counts down to (or `countUp` from) epoch ms, ticking on its own with no updates |
| `button` | `button(action, label?, opts?)` | `icon`, `color`, `textColor`, `tint`, `confirm`, `shape: pill\|tile\|circle` |
| `chips` | `chips(bind, options, opts?)` | one choice written to `state[bind]`, `values`, `color` |
| `slider` | `slider(bind, opts?)` | drag to set `state[bind]` between 0 and 1, `icon`, `color`, `track`, `height` |
| `toggle` | `toggle(bind, label, opts?)` | a tile that flips `state[bind]`, `icon`, `color` |
| `pet` | `pet(mood?, opts?)` | `mood` (or `'{mood}'`), `size`, `color`, `cheeks` |
| `lottie` | `lottie(uri, opts?)` | needs `lottie-react-native`, `size`, `width`, `loop`, `speed` |
| `rive` | `rive(uri, opts?)` | `.riv` file, `artboard`, `stateMachine`, `trigger` (fires when its value changes), `inputs` |
| `stack` | `stack(style?, ...children)` | layers children: the first sets the size, the rest center on it (a value inside a ring) |
| `spacer` | `spacer(size?)` | a fixed gap, or leave out `size` to fill the space |

Any node can also take `effect: 'pulse'|'bounce'|'spin'|'wiggle'|'shimmer'` (`fx(node, 'pulse')`) and `show: 'key'|'!key'` (`when('key', node)`).

Built-in icons (add more with `registerIcons`): `apps back bag bell bolt bulb car chat check close coffee download eye fire flight forward headphones heart home like location lock map mic minus moon music navigate next pause phone play plus previous refresh rupee send share shield sparkle star stop sun thermo timer trend tune volume walk`. Any SVG path works too, and Android drawable names work on Android surfaces.

Helpers: `fill(str, state)`, `num(value, state)`, `nums(values, state)`, `on(value)` and `visible(node, state)`. These are the same rules the renderers use.

## Actions

Actions are plain strings, and button taps reach JS from every surface: in-app, the overlay and notification buttons. That includes taps made while the app is in the background (through a headless task) or killed (they replay on the next launch).

```ts
useIslandAction('cancel', (islandId, state) => cancelRide(islandId));
live.on('cancel', (state) => …);                     // a single island
onAction((islandId, action, state) => log(action));  // every action
```

| Built-in action | Does |
|---|---|
| `go:<screen>` | Opens `screens[screen]` |
| `back` | Returns to the previous screen |
| `close` | Collapses the island |
| `change:<bind>` | Fired by chips, sliders and toggles after they write state |

## Theming

```ts
theme: {
  background: '#000', foreground: '#FFFFFF', secondary: '#98989F', accent: '#5FCB9C',
  border: '',            // empty: the key line takes the accent
  radius: 40,            // expanded corner radius; compact is always a pill
  glow: '#5FCB9C',       // the border breathes in this color
  gradient: ['#1a1a2e', '#16213e'],
  material: 'solid',     // or 'glass'
  aura: '',              // light pooling at the bottom when expanded
  fonts: { regular: 'Figtree_500Medium', bold: 'Figtree_700Bold' },
  light: { background: '#fff', foreground: '#111' },  // per-appearance overrides
  dark: {},
}
```

Missing font weights fall back to the nearest one that's set. To set base defaults for every island, pass `<HaloIslandHost theme={…} />`. Each template's own `theme` is applied on top.

## Motion

`motion: 'island' | 'bouncy' | 'snappy' | 'smooth' | 'none' | { stiffness, damping }`. The default is `island`, a touch of overshoot like the system island. Reduced-motion settings are respected everywhere. `<HaloIslandHost motion={…} />` overrides it for every island.

## HaloIslandHost

| Prop | Default | |
|---|---|---|
| `placement` | `'auto'` | `'cutout'` grows from the camera cutout, `'below'` sits under the status bar, `'auto'` picks for the device |
| `theme` | | Base theme under every template's theme |
| `motion` | | Overrides every template's motion |
| `haptics` | `true` | Uses `expo-haptics` when installed |
| `dim` | `true` | Dims the app behind the expanded island. Tapping outside collapses it |
| `blurTarget` | | Android glass: a ref to the `BlurTargetView` (expo-blur) wrapping your screen, so the island blurs what's under it |

`<IslandPreview>` renders a template statically, for galleries and design tools.

## Start options

`start(state, { id, overlay, system, inApp, expanded, duration })`

- `id`: a stable id. Starting again with the same id replaces that island.
- `overlay`: Android only. Draws the island over other apps (needs the config plugin and permission).
- `system`: sends the island to the notification or Live Update. Defaults to `true`.
- `inApp`: shows the island inside the app. Defaults to `true`.
- `expanded`: opens the island expanded.
- `duration`: ends the island after this many ms (toasts).

Permissions: `await requestPermissions({ overlay: true })` returns `capabilities()` → `{ liveActivities, liveUpdates, notifications, overlay }`.

## Surfaces and limits

Being clear about limits is part of the design. Every surface renders the same template, as far as that surface allows.

| | In-app (iOS, Android, web) | Android island over apps | Android notification / Live Update | iOS Live Activity |
|---|---|---|---|---|
| Layout, text, icons, images | ✅ | ✅ | Title, text and icon taken from the tree | 🚧 in progress |
| ring, bar, steps, track | ✅ animated | ✅ animated | First one becomes the progress bar (segments on Android 16) | 🚧 |
| bars, arc, timeline, line | ✅ | ✅ | ✗ | 🚧 |
| timer | ✅ | ✅ | ✅ chronometer | 🚧 |
| pet | ✅ blinks, follows `lookAt`, morphs moods | ✅ blinks and morphs, no finger tracking | ✗ | 🚧 |
| chips, slider, toggle | ✅ | ✗ not rendered | ✗ | 🚧 |
| button | ✅ every shape, `confirm` | ✅ every shape, `confirm` | Up to 3 actions. `confirm` and `go:`/`back`/`close` buttons are left out | 🚧 |
| screens (`go:`, `back`) | ✅ | ✗ main layout only | ✗ | 🚧 |
| `show: '!key'` | ✅ | ✅ | ✗ every node counts | 🚧 |
| material `glass` | ✅ (with expo-glass-effect / expo-blur) | Solid | System style | 🚧 |
| aura | ✅ | ✅ | ✗ | 🚧 |
| row `wrap` | ✅ | ✗ ignored (one line) | — | 🚧 |
| lottie / rive | ✅ when installed | ✅ when the app ships them | ✗ | 🚧 |
| Multiple islands | ✅ newest + bubble | Newest one | One notification each | 🚧 |
| Needs the native module | No (Expo Go, web) | Yes (dev build) | Yes (dev build) | — |

Other limits:

- **iOS Live Activities are not in 0.2.0.** On iOS, `start()` shows the in-app island only.
- The Android island needs `SYSTEM_ALERT_WINDOW` and a `specialUse` foreground service. Google Play asks you to justify both. It sits just below the status bar, because overlays can't take touches there.
- Live Updates need Android 16+, and users can turn promotion off. `openLiveUpdateSettings()` links straight to that setting.
- Templates plus state should stay under 4KB, which is the ActivityKit cap. The library warns in dev builds.

## Expo config plugin

```json
{
  "plugins": [
    ["halo-island", { "overlay": true, "overlayReason": "Shows your active ride over other apps.", "rive": false }]
  ]
}
```

| Option | Default | |
|---|---|---|
| `overlay` | `false` | Adds the Android over-other-apps island (permissions + foreground service) |
| `overlayReason` | generic text | The `specialUse` explanation Google Play reviews |
| `rive` | `false` | Bundles rive-android so `rive` nodes render on Android surfaces |

The in-app island needs no plugin.

## For AI agents

- The whole contract is `src/spec.ts`: one file, JSON types and builders. [`llms.txt`](./llms.txt) is a compact guide to it.
- Start from the closest preset, then change text, colors and icons. Keep state flat (`{ eta: '4 min' }`) and send only what changed.
- Use `{key}` placeholders for anything that changes. Use `when()` for details that arrive later.
- Actions are strings. Handle them with `useIslandAction(name, (id, state) => …)`.
- When the island mirrors screen state, use `useIsland(template, state | null, { id })` instead of start/update by hand.
- Compact: one glyph, one value. Expanded: title + muted line, value large on the right, one visual, one button row.
- Put `confirm` on anything destructive or paid.
- Stay under 4KB for system surfaces. Inputs and `screens` stay in-app.

## License

MIT © Herin Soni
