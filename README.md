# Halo Island

**A Dynamic Island for every React Native app: one JSON design, on iOS, Android and the web.**

<p align="center"><img src="packages/halo-island/docs/media/hero.gif" width="360" alt="Halo Island expanding from the camera cutout" /></p>

Live rides, timers, music, payments, small in-island apps and a pet that watches your finger. The island grows out of the camera cutout, morphs with spring physics, floats over other apps on Android, and mirrors itself into the Android notification and Live Update.

```tsx
import { island, presets } from 'halo-island';

const live = island(presets.ride).start({ title: 'Asha is on the way', eta: '6 min', progress: 0.1 });
live.update({ eta: '2 min', progress: 0.7 });
```

## In this repo

| | |
|---|---|
| [`packages/halo-island`](packages/halo-island) | The library: [README](packages/halo-island/README.md), [llms.txt](packages/halo-island/llms.txt) for AI agents |
| [`example`](example) | The showcase app (Expo). Run it with `cd example && bunx expo run:android` or `run:ios` |
| [`website`](website) | The docs site, with a live in-browser island |
| [`tools/island-bridge`](tools/island-bridge) | Your real Claude Code limits and permission prompts on the island ([setup](tools/island-bridge/README.md)) |

## Develop

```sh
bun install
cd packages/halo-island && bun test
```

## License

[MIT](LICENSE) © Herin Soni
