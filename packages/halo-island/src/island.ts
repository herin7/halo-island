import { requireOptionalNativeModule } from 'expo';
import { AppRegistry, Appearance, Image, Platform, processColor } from 'react-native';

import { IslandState, IslandTemplate, Motion, payloadSize, resolveTheme } from './spec';

export interface Capabilities {
  /** iOS: Live Activities allowed on this device and enabled by the user. */
  liveActivities: boolean;
  /** Android 16+: notifications may be promoted to Live Updates (status bar chip). */
  liveUpdates: boolean;
  notifications: boolean;
  /** Android: overlay permission granted and the overlay service declared (config plugin `overlay: true`). */
  overlay: boolean;
}

interface NativeHaloIsland {
  start(id: string, template: string, state: string, options: { overlay: boolean; notification: boolean }): void;
  update(id: string, state: string, alert: boolean): void;
  end(id: string): void;
  endAll(): void;
  capabilities(): Capabilities;
  requestNotificationPermission(): Promise<unknown>;
  requestOverlayPermission?(): Promise<boolean>;
  openLiveUpdateSettings?(): void;
  consumePendingActions(): { id: string; action: string }[];
  getCutout(): Cutout | null;
  addListener?(event: 'onAction', listener: (e: { id: string; action: string }) => void): { remove(): void };
}

/** The camera hole in window dp; `safeTop` is the line below which nothing touches it. */
export interface Cutout { x: number; y: number; width: number; height: number; safeTop?: number }

/** Missing in Expo Go and on web: the in-app island still works, system surfaces no-op. */
export const native = requireOptionalNativeModule<NativeHaloIsland>('HaloIsland');

export interface StartOptions {
  /** Stable id — starting again with the same id replaces that island. */
  id?: string;
  /** Android: draw the island over other apps. Needs overlay permission + config plugin `overlay: true`. */
  overlay?: boolean;
  /** iOS Live Activity / Android notification. Default true. */
  system?: boolean;
  /** Show inside the app while it's open. Default true. */
  inApp?: boolean;
  /** In-app only: open expanded. */
  expanded?: boolean;
  /** In-app only: end automatically after this many ms (toasts). */
  duration?: number;
}

export interface LiveIsland {
  readonly id: string;
  readonly state: IslandState;
  /**
   * Merges into the current state; only changed keys need to be sent.
   * `alert: true` pops the island open for a moment — for moments that matter ("Rider arrived").
   */
  update(patch: IslandState, options?: { alert?: boolean }): void;
  end(): void;
  /** Subscribe to a button action of this island. Returns an unsubscribe function. */
  on(action: string, handler: (state: IslandState) => void): () => void;
}

export interface Active {
  id: string;
  template: IslandTemplate;
  state: IslandState;
  options: StartOptions;
  /** Bumped on each start so the host can replay the appear animation. */
  key: number;
  /** Bumped on each alerting update. */
  alert: number;
  /** Mirrored to a system surface (Live Activity, notification or overlay). */
  system: boolean;
}

// region Store

const islands = new Map<string, Active>();
const subscribers = new Set<() => void>();
/** In-app islands, oldest first; the last one owns the island, the one before it gets the bubble. */
let snapshot: Active[] = [];
let counter = 0;

function changed() {
  // Fresh objects each time, so useSyncExternalStore sees state updates.
  snapshot = [...islands.values()].filter(showsInApp).map((a) => ({ ...a }));
  subscribers.forEach((fn) => fn());
}

/** Android's overlay already covers the app, so the in-app copy would be a duplicate. */
function showsInApp(a: Active) {
  if (a.options.inApp === false) return false;
  return !(Platform.OS === 'android' && a.options.overlay && native?.capabilities().overlay);
}

export const store = {
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => void subscribers.delete(fn);
  },
  all: () => snapshot,
};

/** Moves an island to the front: it takes the island, the previous one becomes the bubble. */
export function focus(id: string) {
  const entry = islands.get(id);
  if (!entry || [...islands.keys()].pop() === id) return;
  islands.delete(id);
  islands.set(id, entry);
  changed();
}

/** Writes in-island input (chips, sliders, toggles) into an island's state, on every surface. */
export function setState(id: string, patch: IslandState) {
  const entry = islands.get(id);
  if (!entry || !changes(entry.state, patch)) return;
  entry.state = { ...entry.state, ...patch };
  if (native && entry.system) native.update(id, JSON.stringify(entry.state), false);
  changed();
}

// endregion

// region Actions

/** `state` is the island's state at the time of the tap — what the chips and sliders were set to. */
type ActionHandler = (id: string, action: string, state: IslandState) => void;
const actionHandlers = new Set<ActionHandler>();

export function emitAction(id: string, action: string) {
  const state = islands.get(id)?.state ?? {};
  actionHandlers.forEach((fn) => fn(id, action, state));
}

/** Every button tap from every surface. Returns an unsubscribe function. */
export function onAction(handler: ActionHandler): () => void {
  actionHandlers.add(handler);
  // Taps made while the app was dead were kept natively; replay them once someone listens.
  if (actionHandlers.size === 1) {
    setTimeout(() => native?.consumePendingActions().forEach((a) => emitAction(a.id, a.action)), 0);
  }
  return () => void actionHandlers.delete(handler);
}

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('HaloIslandAction', () => async (data: { id: string; action: string }) => emitAction(data.id, data.action));
} else {
  native?.addListener?.('onAction', (e) => emitAction(e.id, e.action));
}

// endregion

// region Normalization — native receives one color format and one motion format.

const COLOR_KEYS = new Set(['color', 'track', 'background', 'foreground', 'secondary', 'accent', 'border', 'textColor', 'glow', 'ink']);

export const MOTION = {
  /** Critically damped: glides to size with no overshoot and nothing extra. Calm, product-grade. */
  minimal: { stiffness: 160, damping: 25 },
  /** The default: a touch of overshoot, like the system island. */
  island: { stiffness: 340, damping: 30 },
  bouncy: { stiffness: 380, damping: 28 },
  snappy: { stiffness: 700, damping: 45 },
  smooth: { stiffness: 260, damping: 32 },
} as const;

export function springOf(motion: Motion | undefined) {
  if (motion === 'none') return null;
  if (typeof motion === 'object') return motion;
  return MOTION[motion ?? 'island'];
}

export function hex(color: string): string {
  const n = processColor(color);
  if (typeof n !== 'number') return color;
  return '#' + (n >>> 0).toString(16).padStart(8, '0');
}

function normalize(value: unknown, key?: string): unknown {
  if (typeof value === 'string' && key && COLOR_KEYS.has(key)) return hex(value);
  // Registered images and .riv files become loadable uris for native views.
  if (typeof value === 'string' && key === 'uri') {
    const src = assets.get(value);
    if (typeof src === 'number') return asset(src);
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v, key === 'gradient' || key === 'colors' ? 'color' : undefined));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, k)]));
  }
  return value;
}

/** JSON for native views: colors normalized the same way as templates. */
export const nativeJson = (value: unknown) => JSON.stringify(normalize(value));

export function toNative(template: IslandTemplate) {
  const spring = springOf(template.motion);
  const theme = resolveTheme(template.theme, Appearance.getColorScheme());
  // Screens are in-app flows; system surfaces show the main layout and stay under the 4KB cap.
  const { screens: _, ...rest } = template;
  return JSON.stringify({ ...(normalize({ ...rest, theme }) as object), motion: spring ?? 'none' });
}

// endregion

/** Starts an island on every surface the device supports. */
export function start(template: IslandTemplate, state: IslandState = {}, options: StartOptions = {}): LiveIsland {
  const id = options.id ?? `island-${Date.now().toString(36)}-${(counter++).toString(36)}`;
  const system = options.system !== false && options.duration == null;
  // Starting an id that is already live takes it over in place: same key, so the island morphs to
  // the new content instead of popping as if it were new.
  const previous = islands.get(id);
  const entry: Active = { id, template, state: { ...state }, options, key: previous?.key ?? counter++, alert: previous?.alert ?? 0, system: system || !!options.overlay };
  islands.delete(id);
  islands.set(id, entry);

  if (native && entry.system) {
    const json = toNative(template);
    if (__DEV__ && json.length + payloadSize(state) > 4096) {
      console.warn(`[halo-island] "${id}" is over 4KB; iOS will refuse to start it. Trim the template or state.`);
    }
    native.start(id, json, JSON.stringify(state), { overlay: !!options.overlay, notification: system });
  }
  changed();

  // Every handle acts on whatever currently owns the id, so a stale handle from an earlier start
  // can't write to an island nobody sees — and a handle whose island was replaced stays useful.
  const live: LiveIsland = {
    id,
    get state() { return islands.get(id)?.state ?? entry.state; },
    update(patch, opts) {
      const current = islands.get(id);
      if (!current || !changes(current.state, patch)) return;
      current.state = { ...current.state, ...patch };
      if (opts?.alert) current.alert++;
      if (native && current.system) native.update(id, JSON.stringify(current.state), !!opts?.alert);
      changed();
    },
    end() {
      if (!islands.delete(id)) return;
      native?.end(id);
      changed();
    },
    on(action, handler) {
      return onAction((from, a, s) => from === id && a === action && handler(s));
    },
  };
  // Ends this start only: if the id was started again meanwhile, the newer island stays.
  if (options.duration != null) setTimeout(() => islands.get(id) === entry && live.end(), options.duration);
  return live;
}

/** True when `patch` would change `state` — repeated identical updates cost nothing. */
const changes = (state: IslandState, patch: IslandState) => Object.keys(patch).some((k) => state[k] !== patch[k]);

/** The live island with this id, if any — for code that didn't keep the handle. */
export const get = (id: string): IslandState | null => islands.get(id)?.state ?? null;

/** A reusable template: `const ride = island({...}); const live = ride.start({ eta: '4 min' })`. */
export function island(template: IslandTemplate) {
  return {
    template,
    start: (state?: IslandState, options?: StartOptions) => start(template, state, options),
    /** In-app only, ends itself — for toasts and confirmations. */
    show: (state?: IslandState, options?: Omit<StartOptions, 'system' | 'overlay'>) =>
      start(template, state, { duration: 3000, ...options, system: false }),
  };
}

export function endAll() {
  islands.clear();
  native?.endAll();
  changed();
}

/** The camera hole at the top of the app window (dp), as this device reports it. Handy in bug reports. */
export const getCutout = (): Cutout | null => native?.getCutout() ?? null;

export const capabilities = (): Capabilities =>
  native?.capabilities() ?? { liveActivities: false, liveUpdates: false, notifications: false, overlay: false };

/** Asks for everything `start` needs: notifications, and the overlay permission when requested. */
export async function requestPermissions(opts: { overlay?: boolean } = {}): Promise<Capabilities> {
  await native?.requestNotificationPermission();
  if (opts.overlay && Platform.OS === 'android') await native?.requestOverlayPermission?.();
  return capabilities();
}

export const openLiveUpdateSettings = () => native?.openLiveUpdateSettings?.();

// region Assets

/** What `require()` returns for images/.riv (a number) or Lottie JSON (an object), or a URL. */
export type AssetSource = number | string | object;
const assets = new Map<string, AssetSource>();

/**
 * Names for bundled media, so templates stay plain JSON: `registerAssets({ scooter:
 * require('./scooter.png'), ride: require('./ride.json') })`, then `image('scooter')`,
 * `lottie('ride')`, `rive('car')` — or `image('{vehicle}')` to pick one from state.
 */
export function registerAssets(map: Record<string, AssetSource>) {
  for (const [name, source] of Object.entries(map)) assets.set(name, source);
}

/** A registered asset by name; anything else is treated as a URL. */
export const resolveAsset = (nameOrUri: string): AssetSource => assets.get(nameOrUri) ?? nameOrUri;

// endregion

/**
 * A bundled image as a uri every surface can load: `image(asset(require('./logo.png')))`.
 * Dev builds serve it from Metro; release builds resolve to the packaged resource.
 */
export const asset = (module: number): string => Image.resolveAssetSource(module)?.uri ?? '';
