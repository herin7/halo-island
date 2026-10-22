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
  /** Tabular digits, so counting numbers don't jitter. */
  mono?: boolean;
  lines?: number;
  align?: 'start' | 'center' | 'end';
}

export interface BoxStyle {
  gap?: number;
  padding?: number;
  /** Cross-axis. Rows default to center, columns to stretch. */
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  background?: Color;
  radius?: number;
  /** Take the remaining space in the parent row/column. */
  grow?: boolean;
}

export type IslandNode =
  | { type: 'row' | 'column'; children: IslandNode[]; style?: BoxStyle }
  | { type: 'text'; text: string; style?: TextStyle }
  /** Built-in name (see ICONS), an SF Symbol on iOS, or an Android drawable name. */
  | { type: 'icon'; name: string; size?: number; color?: Color }
  | { type: 'image'; uri: string; size?: number; radius?: number }
  | { type: 'ring'; value: Num; size?: number; thickness?: number; color?: Color; track?: Color }
  | { type: 'bar'; value: Num; height?: number; color?: Color; track?: Color }
  /** `count` segments; `value` is how many are done (fractions fill part of one). Order stages, journeys, onboarding. */
  | { type: 'steps'; value: Num; count: number; height?: number; color?: Color; track?: Color }
  /** Counts down to (or up from) an epoch-millis timestamp. Runs natively, no updates needed. */
  | { type: 'timer'; to: Num; countUp?: boolean; style?: TextStyle }
  | { type: 'button'; action: string; label?: string; icon?: string; color?: Color; textColor?: Color }
  | { type: 'spacer'; size?: number };

export interface IslandTheme {
  background?: Color;
  foreground?: Color;
  secondary?: Color;
  accent?: Color;
  border?: Color;
  /** Expanded corner radius. Compact is always a full pill. */
  radius?: number;
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

export const DEFAULT_THEME: Required<IslandTheme> = {
  background: '#000000',
  foreground: '#F7F7F2',
  secondary: '#9AA09A',
  accent: '#5FCB9C',
  border: 'rgba(255,255,255,0.10)',
  radius: 32,
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
export const image = (uri: string, opts?: { size?: number; radius?: number }): IslandNode => ({ type: 'image', uri, ...opts });
export const ring = (value: Num, opts?: { size?: number; thickness?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'ring', value, ...opts });
export const bar = (value: Num, opts?: { height?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'bar', value, ...opts });
export const steps = (value: Num, count: number, opts?: { height?: number; color?: Color; track?: Color }): IslandNode => ({ type: 'steps', value, count, ...opts });
export const timer = (to: Num, opts?: { countUp?: boolean; style?: TextStyle }): IslandNode => ({ type: 'timer', to, ...opts });
export const button = (action: string, label?: string, opts?: { icon?: string; color?: Color; textColor?: Color }): IslandNode => ({ type: 'button', action, label, ...opts });
export const spacer = (size?: number): IslandNode => ({ type: 'spacer', size });

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
