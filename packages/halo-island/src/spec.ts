/**
 * The island contract. A template is plain JSON, so the same object is rendered by the
 * in-app renderer, the Android overlay, the Android Live Update and the iOS Live Activity.
 *
 * Any string may contain `{key}` placeholders that are filled from the activity's state, e.g.
 * `text('{eta} min')` or `ring('{progress}')`. Only state travels on update, never the template.
 */

/** A number, or a `{key}` placeholder that resolves to one. */
export type Num = number | string;
export type Color = string;

export interface TextStyle {
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';
  color?: Color;
  /** Tabular digits; changes roll in like a counter. */
  mono?: boolean;
  /** A font the app already ships (Expo font name / Android res/font or assets/fonts file name). */
  font?: string;
  lines?: number;
  align?: 'start' | 'center' | 'end';
}

export interface BoxStyle {
  gap?: number;
  padding?: number;
  /** Cross-axis. Rows default to center, columns to stretch. `baseline` lines up mixed text sizes ($104.02). */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  background?: Color;
  /** Linear gradient, top-left to bottom-right. Overrides background. */
  gradient?: Color[];
  radius?: number;
  border?: { width: number; color: Color };
  /** Fixed size, like a Figma frame set to Fixed. */
  width?: number;
  height?: number;
  opacity?: number;
  /** Take the remaining space in the parent row/column. */
  grow?: boolean;
}

/** Looping motion for any node. Respects reduced motion. */
export type Effect = 'pulse' | 'bounce' | 'spin' | 'wiggle' | 'shimmer';

export type IslandNode = NodeBody & {
  effect?: Effect;
  /** Render only while this state key is set — the island grows as details arrive. */
  show?: string;
};

type NodeBody =
  | { type: 'row' | 'column'; children: IslandNode[]; style?: BoxStyle }
  | { type: 'text'; text: string; style?: TextStyle }
  /**
   * `name`: built-in (see README), an SF Symbol on iOS, or an Android drawable name.
   * `path`: SVG path data — any icon from Figma ("Copy as SVG" after Flatten), Lucide, Material.
   */
  | { type: 'icon'; name?: string; path?: string; viewBox?: number; stroke?: number; size?: number; width?: number; color?: Color }
  /** `uri`: http(s), file, or `asset(require('./logo.png'))`. `width` for wordmarks; `fit: 'contain'` keeps them whole. */
  | { type: 'image'; uri: string; size?: number; width?: number; radius?: number; fit?: 'cover' | 'contain'; glow?: boolean }
  | { type: 'ring'; value: Num; size?: number; thickness?: number; color?: Color; track?: Color }
  | { type: 'bar'; value: Num; height?: number; color?: Color; track?: Color }
  /** A bar with a marker riding along it at `value` — a rider heading to your door. No marker draws a dot. */
  | { type: 'track'; value: Num; marker?: string; height?: number; color?: Color; track?: Color }
  /**
   * A Rive file (.riv) by URL or `asset(require(...))`. `trigger` fires that state machine input
   * whenever its filled value changes — a character that reacts to state. Needs `rive: true` in the
   * config plugin.
   */
  | { type: 'rive'; uri: string; size?: number; width?: number; artboard?: string; stateMachine?: string; trigger?: string }
  /** Lottie from a URL. Needs `lottie-react-native` in the app; renders nothing without it. */
  | { type: 'lottie'; uri: string; size?: number; loop?: boolean }
  /**
   * Rounded bars, each 0–1: a histogram (UV, speed), timer ticks, or `animate` for a live waveform.
   * `values` is an array or a comma list like '{uv}'. Bars past `active` use the track color.
   */
  | { type: 'bars'; values: Num[] | string; active?: Num; height?: number; gap?: number; color?: Color; track?: Color; animate?: boolean }
  /** A shallow arc across the width — sun path, gauge, journey — with a glowing marker at `value`. */
  | { type: 'arc'; value: Num; height?: number; thickness?: number; colors?: Color[]; track?: Color; glow?: boolean }
  /** Stages as icon nodes on a line. `value` counts reached stages (2.5 = halfway to the third). */
  | { type: 'timeline'; value: Num; icons: string[]; size?: number; color?: Color; track?: Color; ink?: Color }
  /** `count` segments; `value` is how many are done (fractions fill part of one). Order stages, journeys, onboarding. */
  | { type: 'steps'; value: Num; count: number; height?: number; color?: Color; track?: Color }
  /** Counts down to (or up from) an epoch-millis timestamp. Runs natively, no updates needed. */
  | { type: 'timer'; to: Num; countUp?: boolean; style?: TextStyle }
  /** `tint`: accent-tinted fill with accent content, the way system Live Activity buttons look. */
  | { type: 'button'; action: string; label?: string; icon?: string; color?: Color; textColor?: Color; tint?: boolean }
  | { type: 'spacer'; size?: number };

export interface IslandTheme {
  background?: Color;
  foreground?: Color;
  secondary?: Color;
  accent?: Color;
  border?: Color;
  /** Expanded corner radius. Compact is always a full pill. */
  radius?: number;
  /** Border breathes in this color. */
  glow?: Color;
  /** Island fill as a gradient (overrides background). */
  gradient?: Color[];
  /**
   * The island's typeface, per weight: `{ regular: 'Figtree_500Medium', bold: 'Figtree_700Bold' }`.
   * Fonts the app ships (expo-font plugin or res/font). Missing weights fall back to the nearest one.
   */
  fonts?: Partial<Record<Weight, string>>;
  /** Overrides applied in the system's light or dark appearance (lock screen, notification, in-app). */
  light?: Omit<IslandTheme, 'light' | 'dark'>;
  dark?: Omit<IslandTheme, 'light' | 'dark'>;
}

/** Picks the light/dark overrides for the current appearance. */
export function resolveTheme(theme: IslandTheme | undefined, scheme: 'light' | 'dark' | null | undefined): IslandTheme | undefined {
  if (!theme) return theme;
  const { light, dark, ...base } = theme;
  return { ...base, ...(scheme === 'dark' ? dark : scheme === 'light' ? light : undefined) };
}

export type Weight = NonNullable<TextStyle['weight']>;

/** Font for a weight from theme.fonts, falling back to the closest weight that is set. */
export function fontFor(fonts: IslandTheme['fonts'], weight: Weight = 'regular'): string | undefined {
  if (!fonts) return undefined;
  const order: Weight[] = ['regular', 'medium', 'semibold', 'bold', 'heavy'];
  const i = order.indexOf(weight);
  const nearest = [...order].sort((a, b) => Math.abs(order.indexOf(a) - i) - Math.abs(order.indexOf(b) - i) || order.indexOf(b) - order.indexOf(a));
  return nearest.map((w) => fonts[w]).find(Boolean);
}

export type MotionPreset = 'bouncy' | 'snappy' | 'smooth' | 'none';
export type Motion = MotionPreset | { stiffness: number; damping: number };

export interface IslandTemplate {
  compact: { leading?: IslandNode; trailing?: IslandNode };
  /** Shown when another island owns the space (iOS) — defaults to compact.leading. */
  minimal?: IslandNode;
  expanded?: IslandNode;
  /** iOS Lock Screen / Android notification body — defaults to expanded. */
  lockScreen?: IslandNode;
  theme?: IslandTheme;
  motion?: Motion;
  /** Deep link opened when the island body is tapped. */
  link?: string;
}

export type IslandState = Record<string, string | number | boolean | null | undefined>;

export const DEFAULT_THEME: Required<Omit<IslandTheme, 'light' | 'dark'>> = {
  background: '#000000',
  foreground: '#F7F7F2',
  secondary: '#9AA09A',
  accent: '#5FCB9C',
  /** Empty = the key line takes the accent color, as Apple recommends. */
  border: '',
  radius: 40,
  glow: '',
  gradient: [],
  fonts: {},
};

// region Builders — sugar for the JSON above, so apps and agents write less.

type Kids = (IslandNode | false | null | undefined)[];
const kids = (c: Kids) => c.filter(Boolean) as IslandNode[];
const isNode = (v: unknown): v is IslandNode => typeof v === 'object' && v !== null && 'type' in v;

export function row(style: BoxStyle | IslandNode, ...children: Kids): IslandNode {
  return isNode(style) ? { type: 'row', children: kids([style, ...children]) } : { type: 'row', style, children: kids(children) };
}
export function column(style: BoxStyle | IslandNode, ...children: Kids): IslandNode {
  return isNode(style) ? { type: 'column', children: kids([style, ...children]) } : { type: 'column', style, children: kids(children) };
}
export const text = (value: string, style?: TextStyle): IslandNode => ({ type: 'text', text: value, style });
export const icon = (name: string, opts?: { size?: number; color?: Color }): IslandNode => ({ type: 'icon', name, ...opts });
/**
 * An icon from raw SVG path data. `stroke` draws outlines (Lucide-style) instead of fills.
 * `width` > `size` suits wordmarks: the path fits the width and centers vertically.
 */
export const svg = (path: string, opts?: { size?: number; width?: number; color?: Color; viewBox?: number; stroke?: number }): IslandNode =>
  ({ type: 'icon', path: expandArcFlags(path), ...opts });

/**
 * Minified SVGs pack arc flags against the next number ("a1 1 0 0124 12" means flags 0,1 then 24).
 * Android's path parser reads "0124" as one number, so spell the flags out.
 */
export function expandArcFlags(d: string): string {
  const out: string[] = [];
  const re = /([MmZzLlHhVvCcSsQqTtAa])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g;
  let command = '';
  let arcIndex = 0;
  for (let i = 0; i < d.length; ) {
    const ch = d[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (/[A-Za-z]/.test(ch)) { command = ch; arcIndex = 0; out.push(ch); i++; continue; }
    if ((command === 'a' || command === 'A') && (arcIndex % 7 === 3 || arcIndex % 7 === 4)) {
      out.push(ch); i++; arcIndex++; continue; // a flag is exactly one digit
    }
    re.lastIndex = i;
    const m = re.exec(d);
    if (!m || m.index !== i) { i++; continue; }
    out.push(m[0]);
    i += m[0].length;
    if (command === 'a' || command === 'A') arcIndex++;
  }
  return out.join(' ');
}
export const image = (uri: string, opts?: { size?: number; width?: number; radius?: number; fit?: 'cover' | 'contain'; glow?: boolean }): IslandNode => ({ type: 'image', uri, ...opts });
export const ring = (value: Num, opts?: { size?: number; thickness?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'ring', value, ...opts });
export const bar = (value: Num, opts?: { height?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'bar', value, ...opts });
export const steps = (value: Num, count: number, opts?: { height?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'steps', value, count, ...opts });
export const timer = (to: Num, opts?: { countUp?: boolean; style?: TextStyle }): IslandNode => ({ type: 'timer', to, ...opts });
export const button = (action: string, label?: string, opts?: { icon?: string; color?: Color; textColor?: Color; tint?: boolean }): IslandNode => ({ type: 'button', action, label, ...opts });
export const bars = (values: Num[] | string, opts?: { active?: Num; height?: number; gap?: number; color?: Color; track?: Color; animate?: boolean }): IslandNode => ({ type: 'bars', values, ...opts });
export const arc = (value: Num, opts?: { height?: number; thickness?: number; colors?: Color[]; track?: Color; glow?: boolean }): IslandNode => ({ type: 'arc', value, ...opts });
export const timeline = (value: Num, icons: string[], opts?: { size?: number; color?: Color; track?: Color; ink?: Color }): IslandNode => ({ type: 'timeline', value, icons, ...opts });
export const spacer = (size?: number): IslandNode => ({ type: 'spacer', size });
export const track = (value: Num, marker?: string, opts?: { height?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'track', value, marker, ...opts });
export const lottie = (uri: string, opts?: { size?: number; loop?: boolean }): IslandNode => ({ type: 'lottie', uri, ...opts });
export const rive = (uri: string, opts?: { size?: number; width?: number; artboard?: string; stateMachine?: string; trigger?: string }): IslandNode => ({ type: 'rive', uri, ...opts });
/** Adds looping motion: `fx(text('LIVE'), 'pulse')`. */
export const fx = (node: IslandNode, effect: Effect): IslandNode => ({ ...node, effect });
/** Shows `node` only while `state[key]` is set: `when('driver', text('{driver}'))`. */
export const when = (key: string, node: IslandNode): IslandNode => ({ ...node, show: key });

/** True when a `show` key is satisfied. */
export const visible = (node: IslandNode, state: IslandState) => !node.show || !!state[node.show];

/** Large text reads better slightly tightened (-2%), the way display type is set. */
export const tracking = (size: number) => (size >= 20 ? -0.02 * size : 0);

// endregion

// region Binding

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{key}` placeholders. Missing keys render as empty, never as "{key}". */
export function fill(value: string, state: IslandState): string {
  return value.replace(PLACEHOLDER, (_, key) => {
    const v = state[key];
    return v == null ? '' : String(v);
  });
}

/** Resolves a Num. A lone placeholder keeps the state's number; anything else is parsed. */
export function num(value: Num, state: IslandState): number {
  if (typeof value === 'number') return value;
  const n = Number(fill(value, state));
  return Number.isFinite(n) ? n : 0;
}

// endregion

/** Bytes of JSON native receives per update; iOS caps an ActivityKit update at 4KB. */
export function payloadSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
