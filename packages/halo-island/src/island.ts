import { requireOptionalNativeModule } from 'expo';
import { AppRegistry, Platform, processColor } from 'react-native';

import { IslandState, IslandTemplate, Motion, payloadSize } from './spec';

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
  update(id: string, state: string): void;
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

export interface Cutout { x: number; y: number; width: number; height: number }

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
  /** Merges into the current state; only changed keys need to be sent. */
  update(patch: IslandState): void;
  end(): void;
  /** Subscribe to a button action of this island. Returns an unsubscribe function. */
  on(action: string, handler: () => void): () => void;
}

export interface Active {
  id: string;
  template: IslandTemplate;
  state: IslandState;
  options: StartOptions;
  /** Bumped on each start so the host can replay the appear animation. */
  key: number;
}

// region Store

const islands = new Map<string, Active>();
const subscribers = new Set<() => void>();
let snapshot: Active | null = null;
let counter = 0;

function changed() {
  const top = [...islands.values()].reverse().find(showsInApp);
  // A fresh object each time, so useSyncExternalStore sees state updates.
  snapshot = top ? { ...top } : null;
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
  current: () => snapshot,
};

// endregion

// region Actions

type ActionHandler = (id: string, action: string) => void;
const actionHandlers = new Set<ActionHandler>();

export function emitAction(id: string, action: string) {
  actionHandlers.forEach((fn) => fn(id, action));
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

const COLOR_KEYS = new Set(['color', 'track', 'background', 'foreground', 'secondary', 'accent', 'border', 'textColor']);

export const MOTION = {
  bouncy: { stiffness: 380, damping: 24 },
  snappy: { stiffness: 700, damping: 45 },
  smooth: { stiffness: 220, damping: 30 },
} as const;

export function springOf(motion: Motion | undefined) {
  if (motion === 'none') return null;
  if (typeof motion === 'object') return motion;
  return MOTION[motion ?? 'bouncy'];
}

export function hex(color: string): string {
  const n = processColor(color);
  if (typeof n !== 'number') return color;
  return '#' + (n >>> 0).toString(16).padStart(8, '0');
}

function normalize(value: unknown, key?: string): unknown {
  if (typeof value === 'string' && key && COLOR_KEYS.has(key)) return hex(value);
  if (Array.isArray(value)) return value.map((v) => normalize(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, k)]));
  }
  return value;
}

export function toNative(template: IslandTemplate) {
  const spring = springOf(template.motion);
  return JSON.stringify({ ...(normalize(template) as object), motion: spring ?? 'none' });
}

// endregion

/** Starts an island on every surface the device supports. */
export function start(template: IslandTemplate, state: IslandState = {}, options: StartOptions = {}): LiveIsland {
  const id = options.id ?? `island-${Date.now().toString(36)}-${(counter++).toString(36)}`;
  const entry: Active = { id, template, state: { ...state }, options, key: counter++ };
  islands.delete(id);
  islands.set(id, entry);

  const system = options.system !== false && options.duration == null;
  if (native && (system || options.overlay)) {
    const json = toNative(template);
    if (__DEV__ && json.length + payloadSize(state) > 4096) {
      console.warn(`[halo-island] "${id}" is over 4KB; iOS will refuse to start it. Trim the template or state.`);
    }
    native.start(id, json, JSON.stringify(state), { overlay: !!options.overlay, notification: system });
  }
  changed();

  const live: LiveIsland = {
    id,
    get state() { return entry.state; },
    update(patch) {
      if (!islands.has(id)) return;
      entry.state = { ...entry.state, ...patch };
      if (native && (system || options.overlay)) native.update(id, JSON.stringify(entry.state));
      changed();
    },
    end() {
      if (!islands.delete(id)) return;
      native?.end(id);
      changed();
    },
    on(action, handler) {
      return onAction((from, a) => from === id && a === action && handler());
    },
  };
  if (options.duration != null) setTimeout(() => live.end(), options.duration);
  return live;
}

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

export const capabilities = (): Capabilities =>
  native?.capabilities() ?? { liveActivities: false, liveUpdates: false, notifications: false, overlay: false };

/** Asks for everything `start` needs: notifications, and the overlay permission when requested. */
export async function requestPermissions(opts: { overlay?: boolean } = {}): Promise<Capabilities> {
  await native?.requestNotificationPermission();
  if (opts.overlay && Platform.OS === 'android') await native?.requestOverlayPermission?.();
  return capabilities();
}

export const openLiveUpdateSettings = () => native?.openLiveUpdateSettings?.();
