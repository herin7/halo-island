# Halo Island website

The launch site. Vite + React 19 + `motion`, plain CSS. It renders the library's own templates with a DOM port of the island renderer (`src/island/`), so every demo on the page is real `IslandTemplate` JSON.

`halo-island` resolves to `../packages/halo-island/src/spec.ts` (Vite alias + tsconfig `paths`), and the gallery imports `../example/showcase.ts` unchanged. The site is its own package with its own lockfile; it is not a root workspace.

## Commands

```sh
bun install
bun run dev        # http://localhost:5173
bun run build      # tsc + vite build → dist/
bun run preview    # serves dist/ on http://localhost:4173
```

Visual checks (with `bun run preview` running; first time: `bunx playwright install chromium-headless-shell`):

```sh
node scripts/shots.mjs   # every section, desktop 1440 + phone 390 → shots/
node scripts/flows.mjs   # drives Island OS, gallery modal, playground → shots/flow-*.png
node scripts/og.mjs      # regenerates public/og.jpg and public/apple-touch-icon.png
```

## Deploy (Vercel)

The build reads `../packages` and `../example`, so deploy from the repo with **Root Directory = `website`** (Vercel uploads the whole repo and builds inside `website/`). `vercel.json` sets the Vite framework, `bun run build`, `dist/`, and an SPA rewrite.

```sh
# from the repo root, once: vercel link  (set Root Directory to "website")
vercel          # preview
vercel --prod   # production
```

Set `VITE_SITE_URL` (e.g. `https://halo-island.dev`) at build time; share-card URLs default to `https://halo-island.vercel.app`.

## Map

- `src/island/` — the web renderer: `Island.tsx` (pill, morph, screens, confirm), `nodes.tsx` (every node type + inputs), `graphics.tsx` (ring, bars, sparkline, arc, timeline, track, and the pet with the native eye math), `util.ts`, `look.ts` (shared cursor for pets).
- `src/sections/` — Hero, FiveLines (hover code → island), Gallery (+ modal with template source), IslandOS, Playground, Surfaces (iPhone + Pixel + limits), Primitives, Footer.
- `src/demos/os.ts` + `useOS.ts` — Island OS template (launcher + six apps as `screens`) and its action handler.
