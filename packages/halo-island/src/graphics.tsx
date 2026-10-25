/**
 * Graphics for the in-app renderer, drawn with react-native-svg and Reanimated so they run the
 * same on iOS, Android and web. The Android overlay draws its own natively (Graphics.kt).
 */
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SharedValue, makeMutable, useAnimatedProps, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ICONS } from './icons';
import { Mood } from './spec';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AG = Animated.createAnimatedComponent(G);

export function clamp(v: number, lo = 0, hi = 1) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

/** `color` at `a` opacity. Hex in, hex or rgba out. */
export function alpha(color: string, a = 0.22) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + Math.round(a * 255).toString(16).padStart(2, '0');
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0');
  return `rgba(255,255,255,${a})`;
}

// region Icon

/** A built-in icon by name, or any SVG path. Unknown names render as an empty box of the same size. */
export function Icon({ name, path, viewBox = 24, stroke, size = 18, width, color }: { name?: string; path?: string; viewBox?: number; stroke?: number; size?: number; width?: number; color: string }) {
  const d = path ?? (name ? ICONS[name] : undefined);
  const w = width ?? size;
  if (!d) return <View style={{ width: w, height: size }} />;
  // Wordmarks (width > size) keep their aspect: the path fits the width, centered vertically.
  const vbH = w > size ? (viewBox * size) / w : viewBox;
  return (
    <Svg width={w} height={size} viewBox={`0 ${(viewBox - vbH) / 2} ${viewBox} ${vbH}`}>
      {stroke ? <Path d={d} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <Path d={d} fill={color} />}
    </Svg>
  );
}

// endregion

// region Ring, bars, sparkline, arc

export function Ring({ value, size, thickness, color, track }: { value: number; size: number; thickness: number; color: string; track: string }) {
  const p = useSharedValue(clamp(value));
  useEffect(() => { p.value = withSpring(clamp(value), { duration: 900, dampingRatio: 0.9 }); }, [value]);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
      <ACircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={props} />
    </Svg>
  );
}

/** One shared clock for every live waveform, so they move in step. */
const wave = makeMutable(0);
let waveStarted = false;

function Bar({ value, active, color, track, width, height, live, index }: { value: number; active: boolean; color: string; track: string; width: number; height: number; live: boolean; index: number }) {
  const v = useSharedValue(clamp(value));
  useEffect(() => { v.value = withSpring(clamp(value), { duration: 700, dampingRatio: 0.75 }); }, [value]);
  const r = Math.min(width / 2, 4);
  // A full-height bar slid down inside a clipped slot: only a transform changes per frame, no layout.
  const style = useAnimatedStyle(() => {
    const k = live ? 0.55 + 0.45 * ((Math.sin(wave.value * Math.PI * 2 + index * 0.9) + 1) / 2) : 1;
    const shown = Math.max(2 * r, height * clamp(v.value * k, 0.06, 1));
    return { transform: [{ translateY: height - shown }] };
  });
  return (
    <View style={{ flex: 1, height, borderRadius: r, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: r, backgroundColor: active ? color : track }, style]} />
    </View>
  );
}

export function Bars({ values, active, height, gap, color, track, live }: { values: number[]; active: number; height: number; gap: number; color: string; track: string; live: boolean }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!live || reduced || waveStarted) return;
    waveStarted = true;
    wave.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1);
  }, [live, reduced]);
  const [w, setW] = useState(0);
  const barW = values.length ? (w - gap * (values.length - 1)) / values.length : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap, alignSelf: 'stretch' }}>
      {values.map((v, i) => <Bar key={i} index={i} value={v} active={i < active} color={color} track={track} width={barW} height={height} live={live && !reduced} />)}
    </View>
  );
}

/** Points to a smooth path (Catmull-Rom as cubic Béziers). Runs on the UI thread too. */
function smooth(xs: number[], ys: number[]) {
  'worklet';
  if (!xs.length) return '';
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)], y0 = ys[Math.max(0, i - 1)];
    const x3 = xs[Math.min(xs.length - 1, i + 2)], y3 = ys[Math.min(xs.length - 1, i + 2)];
    const c1x = xs[i] + (xs[i + 1] - x0) / 6, c1y = ys[i] + (ys[i + 1] - y0) / 6;
    const c2x = xs[i + 1] - (x3 - xs[i]) / 6, c2y = ys[i + 1] - (y3 - ys[i]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

let gradientIds = 0;

/** A sparkline that eases from its old shape to the new one, with a glowing head. */
export function Sparkline({ values, height, color, fill, thickness }: { values: number[]; height: number; color: string; fill: boolean; thickness: number }) {
  const [w, setW] = useState(0);
  const id = useMemo(() => `halo-line-${gradientIds++}`, []);
  const from = useSharedValue(values);
  const to = useSharedValue(values);
  const t = useSharedValue(1);
  useEffect(() => {
    const cur = to.value.map((v, i) => from.value[i] == null ? v : from.value[i] + (v - from.value[i]) * t.value);
    from.value = cur.length === values.length ? cur : values;
    to.value = values;
    t.value = 0;
    t.value = withSpring(1, { duration: 800, dampingRatio: 0.85 });
  }, [values.join(',')]);
  const pad = thickness + 3;
  const geo = useDerivedValue(() => {
    const n = to.value.length;
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = from.value[i] == null ? to.value[i] : from.value[i] + (to.value[i] - from.value[i]) * t.value;
      xs.push(n > 1 ? pad + (i / (n - 1)) * (w - pad * 2) : w / 2);
      ys.push(pad + (1 - clamp(v)) * (height - pad * 2));
    }
    return { xs, ys };
  });
  const lineProps = useAnimatedProps(() => ({ d: smooth(geo.value.xs, geo.value.ys) }));
  const areaProps = useAnimatedProps(() => {
    const { xs, ys } = geo.value;
    if (!xs.length) return { d: '' };
    return { d: `${smooth(xs, ys)} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z` };
  });
  const head = useAnimatedProps(() => ({ cx: geo.value.xs[geo.value.xs.length - 1] ?? 0, cy: geo.value.ys[geo.value.ys.length - 1] ?? 0 }));
  return (
    <View style={{ height, alignSelf: 'stretch' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {fill ? <APath animatedProps={areaProps} fill={`url(#${id})`} /> : null}
          <APath animatedProps={lineProps} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <ACircle animatedProps={head} r={thickness * 2.6} fill={color} opacity={0.25} />
          <ACircle animatedProps={head} r={thickness * 1.3} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Point, tangent and sub-curves of the quadratic an Arc draws. */
function quad(x0: number, y0: number, cx: number, cy: number, x1: number) {
  'worklet';
  const at = (t: number) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y0];
  const slope = (t: number) => [2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), 2 * (1 - t) * (cy - y0) + 2 * t * (y0 - cy)];
  return {
    at,
    slope,
    /** The piece of the curve between t = a and t = b, as path data. */
    segment(a: number, b: number) {
      const [ax, ay] = at(a), [bx, by] = at(b), [sx, sy] = slope(a);
      const k = (b - a) / 2;
      return `M${ax},${ay} Q${ax + sx * k},${ay + sy * k} ${bx},${by}`;
    },
  };
}

/** Comet tail behind a rider: stacked strokes, shorter ones on top, so it brightens toward the head. */
const TAIL = [
  { length: 1, width: 0.6, opacity: 0.14 },
  { length: 0.62, width: 1, opacity: 0.22 },
  { length: 0.36, width: 1.5, opacity: 0.36 },
  { length: 0.16, width: 2, opacity: 0.6 },
];
/** How much of the route the comet tail covers. */
const REACH = 0.28;

/**
 * A shallow arc (sun path, journey) with a glowing marker riding it to `value`. With a `marker`
 * (a plane), the route ahead is dotted, a comet tail trails behind, and the marker flies the curve
 * nose-first inside a halo, with speed streaks rushing past.
 */
export function Arc({ value, height, thickness, colors, track, glow, marker, markerSize = 28 }: { value: number; height: number; thickness: number; colors: string[]; track: string; glow: boolean; marker?: ReactNode; markerSize?: number }) {
  const [w, setW] = useState(0);
  const id = useMemo(() => `halo-arc-${gradientIds++}`, []);
  const p = useSharedValue(clamp(value));
  useEffect(() => { p.value = withSpring(clamp(value), { duration: 1400, dampingRatio: 0.92 }); }, [value]);
  const last = colors[colors.length - 1];
  // A rider needs room: half its size at the ends and above the peak, so it never clips.
  const pad = marker ? markerSize * 0.5 : thickness * 2 + 6;
  const top = marker ? markerSize * 0.6 : thickness;
  const y0 = height - (marker ? markerSize * 0.3 : thickness);
  const x0 = pad, x1 = w - pad, cx = w / 2, cy = 2 * top - y0;
  const d = `M${x0},${y0} Q${cx},${cy} ${x1},${y0}`;
  const len = useMemo(() => {
    const q = quad(x0, y0, cx, cy, x1);
    let l = 0, [px, py] = q.at(0);
    for (let i = 1; i <= 40; i++) { const [x, y] = q.at(i / 40); l += Math.hypot(x - px, y - py); px = x; py = y; }
    return l;
  }, [w, height, markerSize]);
  const progress = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  const markerProps = useAnimatedProps(() => {
    const [x, y] = quad(x0, y0, cx, cy, x1).at(p.value);
    return { cx: x, cy: y };
  });

  return (
    <View style={{ height, alignSelf: 'stretch' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w && marker ? <Flight {...{ w, height, x0, y0, cx, cy, x1, p, thickness, track, color: last, glow, marker, markerSize, id }} /> : null}
      {w && !marker ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {colors.map((c, i) => <Stop key={i} offset={colors.length > 1 ? i / (colors.length - 1) : 0} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <Path d={d} stroke={track} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray="0.1 8" />
          <APath d={d} stroke={`url(#${id})`} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={progress} />
          {glow ? <ACircle animatedProps={markerProps} r={thickness * 3.4} fill={last} opacity={0.22} /> : null}
          <ACircle animatedProps={markerProps} r={thickness * 1.5} fill="#FFFFFF" stroke={last} strokeWidth={thickness * 0.8} />
        </Svg>
      ) : null}
    </View>
  );
}

function Flight({ w, height, x0, y0, cx, cy, x1, p, thickness, track, color, glow, marker, markerSize, id }: {
  w: number; height: number; x0: number; y0: number; cx: number; cy: number; x1: number; p: SharedValue<number>;
  thickness: number; track: string; color: string; glow: boolean; marker: ReactNode; markerSize: number; id: string;
}) {
  const reduced = useReducedMotion();
  // Idle life: the plane rides the air, the halo breathes, streaks stream past.
  const idle = useSharedValue(0.5);
  const wind = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    idle.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    wind.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1);
  }, [reduced]);

  const ahead = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(p.value, 1) }));
  const flown = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(0, Math.max(p.value, 0.0001)) }));
  const tail0 = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(Math.max(0, p.value - REACH * TAIL[0].length), Math.max(p.value, 0.0001)) }));
  const tail1 = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(Math.max(0, p.value - REACH * TAIL[1].length), Math.max(p.value, 0.0001)) }));
  const tail2 = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(Math.max(0, p.value - REACH * TAIL[2].length), Math.max(p.value, 0.0001)) }));
  const tail3 = useAnimatedProps(() => ({ d: quad(x0, y0, cx, cy, x1).segment(Math.max(0, p.value - REACH * TAIL[3].length), Math.max(p.value, 0.0001)) }));
  const tails = [tail0, tail1, tail2, tail3];
  const q = quad(x0, y0, cx, cy, x1);
  const [sx, sy] = q.at(0);
  const [ex, ey] = q.at(1);

  const box = { w: markerSize * 3.4, h: markerSize * 1.8 };
  const rider = useAnimatedStyle(() => {
    const curve = quad(x0, y0, cx, cy, x1);
    const [x, y] = curve.at(p.value);
    const [dx, dy] = curve.slope(p.value);
    return { transform: [{ translateX: x - box.w / 2 }, { translateY: y - box.h / 2 }, { rotate: `${Math.atan2(dy, dx)}rad` }] };
  });
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: (idle.value - 0.5) * 1.6 }, { rotate: `${(idle.value - 0.5) * 3}deg` }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.7 + idle.value * 0.3, transform: [{ scale: 0.92 + idle.value * 0.12 }] }));

  return (
    <>
      <Svg width={w} height={height}>
        <Defs>
          <RadialGradient id={`${id}-end`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Ahead: dotted. Behind: a faint solid route under the comet tail. */}
        <APath animatedProps={ahead} stroke={track} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`0.1 ${thickness * 3.2}`} />
        <APath animatedProps={flown} stroke={color} strokeOpacity={0.18} strokeWidth={thickness * 0.6} fill="none" strokeLinecap="round" />
        {tails.map((props, i) => (
          <APath key={i} animatedProps={props} stroke={color} strokeOpacity={TAIL[i].opacity} strokeWidth={thickness * TAIL[i].width} fill="none" strokeLinecap="round" />
        ))}
        <Circle cx={sx} cy={sy} r={thickness * 1.1} fill={color} />
        {/* Clamped to the room below the end, or the glow would be cut square at the edge. */}
        <Circle cx={ex} cy={ey} r={Math.min(thickness * 4.5, height - ey)} fill={`url(#${id}-end)`} />
        <Circle cx={ex} cy={ey} r={thickness * 1.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={thickness * 0.6} />
      </Svg>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h }, rider]}>
        {[-0.3, 0, 0.3].map((lane, i) => <Streak key={i} lane={lane} index={i} wind={wind} size={markerSize} box={box} still={reduced} />)}
        {glow ? (
          <Animated.View style={[{ position: 'absolute', left: box.w / 2 - markerSize, top: box.h / 2 - markerSize, width: markerSize * 2, height: markerSize * 2 }, halo]}>
            <Svg width={markerSize * 2} height={markerSize * 2}>
              <Defs>
                <RadialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
                  {/* Bloom: a white-hot core bleeding into the brand color, then nothing. */}
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
                  <Stop offset="0.22" stopColor={color} stopOpacity={0.55} />
                  <Stop offset="0.55" stopColor={color} stopOpacity={0.16} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={markerSize} cy={markerSize} r={markerSize} fill={`url(#${id}-halo)`} />
            </Svg>
          </Animated.View>
        ) : null}
        <Animated.View style={[{ position: 'absolute', left: (box.w - markerSize) / 2, top: (box.h - markerSize) / 2, width: markerSize, height: markerSize }, body]}>{marker}</Animated.View>
      </Animated.View>
    </>
  );
}

/** A line of rushing air behind the rider: born at its tail, it streams back and fades. */
function Streak({ lane, index, wind, size, box, still }: { lane: number; index: number; wind: SharedValue<number>; size: number; box: { w: number; h: number }; still: boolean }) {
  const length = size * (index === 1 ? 1.3 : 0.85);
  const id = useMemo(() => `halo-streak-${gradientIds++}`, []);
  const style = useAnimatedStyle(() => {
    // Lanes run out of phase so the air never pulses in step.
    const t = still ? 0.35 : (wind.value + index * 0.37) % 1;
    return { opacity: Math.sin(t * Math.PI) * 0.9, transform: [{ translateX: -t * size * 0.6 }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: box.w / 2 - size * 0.4 - length, top: box.h / 2 + lane * size - 1, width: length, height: 2 }, style]}>
      <Svg width={length} height={2}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Path d={`M1,1 L${length - 1},1`} stroke={`url(#${id})`} strokeWidth={1.4} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// endregion

// region Timeline

/** Stages as icon nodes on a line; the line fills between reached stages and the next one pulses. */
export function Timeline({ value, icons, size, color, track, ink }: { value: number; icons: string[]; size: number; color: string; track: string; ink: string }) {
  const n = icons.length;
  const p = useSharedValue(value);
  useEffect(() => { p.value = withSpring(value, { duration: 900, dampingRatio: 0.9 }); }, [value]);
  const [w, setW] = useState(0);
  const span = n > 1 ? (w - size) / (n - 1) : 0;
  const fill = useAnimatedStyle(() => ({ width: clamp((p.value - 1) / Math.max(1, n - 1)) * (w - size) }));
  return (
    <View style={{ height: size, alignSelf: 'stretch', justifyContent: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ position: 'absolute', left: size / 2, right: size / 2, height: 3, borderRadius: 2, backgroundColor: track }} />
      <Animated.View style={[{ position: 'absolute', left: size / 2, height: 3, borderRadius: 2, backgroundColor: color }, fill]} />
      {w ? icons.map((name, i) => {
        const reached = value >= i + 1;
        const next = !reached && value > i;
        return (
          <Pulse key={i} on={next} style={{ position: 'absolute', left: i * span, width: size, height: size }}>
            <View style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: reached ? color : '#1C1C1E', borderWidth: next ? 2 : 0, borderColor: color }}>
              <Icon name={name} size={size * 0.52} color={reached ? ink : next ? color : alpha('#FFFFFF', 0.45)} />
            </View>
          </Pulse>
        );
      }) : null}
    </View>
  );
}

function Pulse({ on, style, children }: { on: boolean; style: ViewStyle; children: ReactNode }) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    s.value = on && !reduced ? withRepeat(withSequence(withTiming(1.12, { duration: 600 }), withTiming(1, { duration: 600 })), -1) : withTiming(1);
  }, [on, reduced]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// endregion

// region Pet

/**
 * Where pets look, -1…1 on each axis. `lookAt(x, y)` points every pet at a screen position (a
 * finger, the cursor); without input they glance around on their own.
 */
export const lookX = makeMutable(0);
export const lookY = makeMutable(0);
let lastLook = 0;
let wandering: ReturnType<typeof setInterval> | null = null;

const LOOK_SPRING = { stiffness: 220, damping: 22 };

/** Points every pet's eyes at a screen position. Call it from a touch or pointer handler. */
export function lookAt(x: number, y: number, screen: { width: number; height: number }) {
  lastLook = Date.now();
  lookX.value = withSpring(clamp((x - screen.width / 2) / (screen.width / 2), -1, 1), LOOK_SPRING);
  lookY.value = withSpring(clamp((y - 40) / (screen.height * 0.5), -1, 1), LOOK_SPRING);
}

function startWandering() {
  if (wandering) return;
  wandering = setInterval(() => {
    if (Date.now() - lastLook < 2500) return;
    // Mostly glance and return to center, like something idly alive.
    const center = Math.random() < 0.4;
    lookX.value = withSpring(center ? 0 : Math.random() * 1.6 - 0.8, LOOK_SPRING);
    lookY.value = withSpring(center ? 0 : Math.random() * 1.2 - 0.5, LOOK_SPRING);
  }, 3200);
}

/** Eye shape in units of the pet's size: width, top bulge, bottom bulge, outer/inner corner lift, drop. */
type Eye = [w: number, top: number, bottom: number, outer: number, inner: number, dy: number];
const IDLE: Eye = [0.2, 0.34, 0.34, 0, 0, 0];
const HAPPY: Eye = [0.3, 0.3, -0.13, 0, 0, 0.05];
const EYES: Record<Mood, [Eye, Eye]> = {
  idle: [IDLE, IDLE],
  happy: [HAPPY, HAPPY],
  love: [HAPPY, HAPPY],
  sleepy: [[0.3, 0.04, 0.07, 0.02, 0, 0.1], [0.3, 0.04, 0.07, 0.02, 0, 0.1]],
  surprised: [[0.34, 0.26, 0.26, 0, 0, -0.02], [0.34, 0.26, 0.26, 0, 0, -0.02]],
  thinking: [[0.18, 0.3, 0.3, 0, 0, 0], [0.18, 0.24, 0.3, 0, 0, 0]],
  wink: [HAPPY, IDLE],
  sad: [[0.24, 0.24, 0.3, 0.06, -0.08, 0.04], [0.24, 0.24, 0.3, 0.06, -0.08, 0.04]],
  focused: [[0.26, 0.12, 0.3, -0.03, 0.07, 0.02], [0.26, 0.12, 0.3, -0.03, 0.07, 0.02]],
};
const flat = (m: string) => { const e = EYES[m as Mood] ?? EYES.idle; return [...e[0], ...e[1]]; };

function eyePath(e: number[], o: number, s: number, cx: number, cy: number, mirror: boolean, blink: number) {
  'worklet';
  const w = e[o] * s, top = e[o + 1] * s * blink, bottom = e[o + 2] * s * (blink < 1 ? blink : 1);
  // Outer and inner corners: the outer side is away from the face's center.
  const outer = e[o + 3] * s, inner = e[o + 4] * s, y = cy + e[o + 5] * s;
  const lx = cx - w / 2, rx = cx + w / 2;
  const ly = y - (mirror ? inner : outer), ry = y - (mirror ? outer : inner);
  return `M${lx},${ly} C${lx},${y - top} ${rx},${y - top} ${rx},${ry} C${rx},${y + bottom} ${lx},${y + bottom} ${lx},${ly} Z`;
}

/**
 * Two eyes that blink, follow `lookAt`, and morph between moods. In the compact island this
 * turns the island itself into a character.
 */
export function Pet({ mood = 'idle', size, color, cheeks, still }: { mood?: string; size: number; color: string; cheeks: string; still?: boolean }) {
  const reduced = useReducedMotion();
  const width = size * 1.5;
  const from = useSharedValue(flat(mood));
  const to = useSharedValue(flat(mood));
  const t = useSharedValue(1);
  const blink = useSharedValue(1);
  const bob = useSharedValue(0);
  const cheek = useSharedValue(0);

  useEffect(() => { if (!still) startWandering(); }, [still]);
  useEffect(() => {
    const now = to.value.map((v, i) => from.value[i] + (v - from.value[i]) * t.value);
    from.value = now;
    to.value = flat(mood);
    t.value = 0;
    t.value = reduced ? withTiming(1, { duration: 0 }) : withSpring(1, { duration: 520, dampingRatio: 0.55 });
    bob.value = mood === 'love' && !reduced ? withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 420 })), -1) : withTiming(0);
    cheek.value = withTiming(mood === 'love' || mood === 'happy' || mood === 'wink' ? 0.55 : 0, { duration: 300 });
  }, [mood, reduced]);
  useEffect(() => {
    if (reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        // Sometimes a double blink.
        const once = withSequence(withTiming(0.05, { duration: 70 }), withTiming(1, { duration: 120 }));
        blink.value = Math.random() < 0.2 ? withSequence(once, withDelay(80, once)) : once;
        loop();
      }, 1800 + Math.random() * 3200);
    };
    loop();
    return () => { alive = false; clearTimeout(timer); };
  }, [reduced]);

  const sleepy = mood === 'sleepy';
  const thinking = mood === 'thinking';
  // Paths only change while a mood morphs, a blink runs or love bobs; gaze is a cheap transform.
  const eyes = useDerivedValue(() => {
    const e = to.value.map((v, i) => from.value[i] + (v - from.value[i]) * t.value);
    const cy = size / 2 - bob.value * size * 0.05;
    return {
      left: eyePath(e, 0, size, width / 2 - size * 0.3, cy, false, blink.value),
      right: eyePath(e, 6, size, width / 2 + size * 0.3, cy, true, blink.value),
    };
  });
  const leftEye = useAnimatedProps(() => ({ d: eyes.value.left }));
  const rightEye = useAnimatedProps(() => ({ d: eyes.value.right }));
  const cheekProps = useAnimatedProps(() => ({ opacity: cheek.value }));
  const gaze = useAnimatedStyle(() => {
    // Thinking looks up and away; sleepy stops following; previews hold still.
    const lx = thinking ? 0.6 : sleepy || still ? 0 : lookX.value;
    const ly = thinking ? -0.8 : sleepy ? 0.2 : still ? 0 : lookY.value;
    return { transform: [{ translateX: lx * size * 0.14 }, { translateY: ly * size * 0.1 }] };
  });
  const ink = mood === 'love' ? cheeks : color;
  return (
    <View style={{ width, height: size }}>
      <Animated.View style={gaze}>
        <Svg width={width} height={size}>
          <AG animatedProps={cheekProps}>
            <Ellipse cx={width / 2 - size * 0.52} cy={size * 0.74} rx={size * 0.11} ry={size * 0.06} fill={cheeks} />
            <Ellipse cx={width / 2 + size * 0.52} cy={size * 0.74} rx={size * 0.11} ry={size * 0.06} fill={cheeks} />
          </AG>
          <APath animatedProps={leftEye} fill={ink} />
          <APath animatedProps={rightEye} fill={ink} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// endregion

export type { SharedValue };

// region Sky

export type SkyCondition = 'clear' | 'partly' | 'cloudy' | 'rain' | 'storm';

/** Cloud puffs on a 100×70 grid: [cx, cy, r]. Back row first, so the front row overlaps it. */
const PUFFS: [number, number, number][] = [[34, 38, 17], [70, 36, 19], [52, 28, 24], [27, 48, 15], [50, 50, 17], [76, 48, 15]];
const CLOUD = {
  light: ['#FFFFFF', '#DCE1E9', '#8A92A1'],
  rain: ['#E6E9EF', '#9DA5B4', '#4B5262'],
  storm: ['#B9C0CC', '#6B7385', '#2C313D'],
};

/**
 * A weather illustration drawn from light, not pasted in: clouds are top-lit puffs with a shaded
 * underside, the sun blooms, rain falls and storms flash. `condition` swaps with a cross-fade.
 */
export function Sky({ condition, size }: { condition: string; size: number }) {
  const width = Math.round(size * 1.15);
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced]);
  const c = (['clear', 'partly', 'cloudy', 'rain', 'storm'].includes(condition) ? condition : 'cloudy') as SkyCondition;
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: (t.value - 0.5) * size * 0.05 }, { scale: 1 + t.value * 0.015 }] }));
  const k = width / 100;
  return (
    <View style={{ width, height: size }}>
      <Animated.View key={c} entering={FadeIn.duration(600)} exiting={FadeOut.duration(400)} style={StyleSheet.absoluteFill}>
        {c === 'clear' || c === 'partly' ? <Sun x={c === 'clear' ? 50 : 66} y={c === 'clear' ? 35 : 24} r={c === 'clear' ? 20 : 15} k={k} t={t} /> : null}
        {c !== 'clear' ? (
          <Animated.View style={[StyleSheet.absoluteFill, drift]}>
            <Cloud k={k} width={width} height={size} tone={c === 'rain' || c === 'storm' ? c : 'light'} small={c === 'partly'} />
          </Animated.View>
        ) : null}
        {c === 'rain' || c === 'storm' ? [22, 34, 46, 58, 70, 82, 40, 64].map((x, i) => <Drop key={i} x={x * k} top={60 * k} index={i} size={size} still={reduced} />) : null}
        {c === 'storm' ? <Bolt k={k} still={reduced} /> : null}
      </Animated.View>
    </View>
  );
}

function Cloud({ k, width, height, tone, small }: { k: number; width: number; height: number; tone: keyof typeof CLOUD; small: boolean }) {
  const id = useMemo(() => `halo-cloud-${gradientIds++}`, []);
  const [hi, mid, lo] = CLOUD[tone];
  const dark = tone !== 'light';
  // A partly cloudy sky shows a smaller cloud, low and left, so the sun stays visible.
  const s = small ? 0.78 : 1;
  const ox = small ? -4 : 0, oy = small ? 10 : 0;
  const P = (n: number) => n * k;
  const puffs = PUFFS.map(([x, y, r]) => [P(x * s + ox + (1 - s) * 50), P(y * s + oy + (1 - s) * 35), P(r * s)] as const);
  const base = { x: P(16 * s + ox + (1 - s) * 50), y: P(46 * s + oy + (1 - s) * 35), w: P(70 * s), h: P(18 * s) };
  return (
    <Svg width={width} height={height}>
      <Defs>
        {/* One light field across the whole cloud, so puffs merge into a single volume. */}
        <RadialGradient id={`${id}-puff`} gradientUnits="userSpaceOnUse" cx={P(50)} cy={P(36)} r={P(46 * s)} fx={P(40)} fy={P(16 + oy)}>
          <Stop offset="0" stopColor={hi} />
          <Stop offset="0.55" stopColor={mid} />
          <Stop offset="1" stopColor={lo} />
        </RadialGradient>
        <RadialGradient id={`${id}-lit`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.28 : 0.5} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.45" stopColor="#0B0E14" stopOpacity={0} />
          <Stop offset="1" stopColor="#0B0E14" stopOpacity={dark ? 0.55 : 0.4} />
        </LinearGradient>
        {/* A mask, not a clipPath: Android clips overlapping shapes even-odd, a mask unions them. */}
        <Mask id={`${id}-clip`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          {puffs.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" />)}
          <Rect x={base.x} y={base.y} width={base.w} height={base.h} rx={base.h / 2} fill="#FFFFFF" />
        </Mask>
        <RadialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={hi} stopOpacity={dark ? 0.1 : 0.18} />
          <Stop offset="1" stopColor={hi} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Light scattered around the cloud, then the puffs, then shade pooling underneath. */}
      <Ellipse cx={P(52)} cy={P(42)} rx={P(52 * s)} ry={P(34 * s)} fill={`url(#${id}-glow)`} />
      {/* Filled once through the union of puffs: one seamless volume. */}
      <G mask={`url(#${id}-clip)`}>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-puff)`} />
        {/* Each puff catches light on its crown: soft, edgeless, so the surface billows. */}
        {puffs.map(([x, y, r], i) => <Circle key={i} cx={x - r * 0.18} cy={y - r * 0.32} r={r * 0.72} fill={`url(#${id}-lit)`} />)}
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-shade)`} />
      </G>
    </Svg>
  );
}

function Sun({ x, y, r, k, t }: { x: number; y: number; r: number; k: number; t: SharedValue<number> }) {
  const id = useMemo(() => `halo-sun-${gradientIds++}`, []);
  const bloom = useAnimatedStyle(() => ({ opacity: 0.75 + t.value * 0.25, transform: [{ scale: 0.95 + t.value * 0.1 }] }));
  const R = r * k * 2.6;
  return (
    <>
      <Animated.View style={[{ position: 'absolute', left: x * k - R, top: y * k - R, width: R * 2, height: R * 2 }, bloom]}>
        <Svg width={R * 2} height={R * 2}>
          <Defs>
            <RadialGradient id={`${id}-bloom`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFD84D" stopOpacity={0.55} />
              <Stop offset="0.4" stopColor="#FF9F0A" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#FF9F0A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={R} cy={R} r={R} fill={`url(#${id}-bloom)`} />
        </Svg>
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}-disc`} cx="50%" cy="50%" r="50%" fx="40%" fy="35%">
            <Stop offset="0" stopColor="#FFFCEB" />
            <Stop offset="0.45" stopColor="#FFD84D" />
            <Stop offset="1" stopColor="#FF9F0A" />
          </RadialGradient>
        </Defs>
        <Circle cx={x * k} cy={y * k} r={r * k} fill={`url(#${id}-disc)`} />
      </Svg>
    </>
  );
}

/** A raindrop: falls a short way under the cloud, fading in and out, out of step with the others. */
function Drop({ x, top, index, size, still }: { x: number; top: number; index: number; size: number; still: boolean }) {
  const id = useMemo(() => `halo-drop-${gradientIds++}`, []);
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) { p.value = 0.5; return; }
    p.value = withDelay(index * 130, withRepeat(withTiming(1, { duration: 820, easing: Easing.in(Easing.quad) }), -1));
  }, [still]);
  const fall = size * 0.26;
  const len = size * 0.12;
  const style = useAnimatedStyle(() => ({ opacity: Math.sin(p.value * Math.PI), transform: [{ translateX: -p.value * fall * 0.18 }, { translateY: p.value * fall }, { rotate: '10deg' }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top, width: 2, height: len }, style]}>
      <Svg width={2} height={len}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#9FD3FF" stopOpacity={0} />
            <Stop offset="1" stopColor="#CFE9FF" stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={2} height={len} rx={1} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Lightning: dark, then a double flash every few seconds. */
function Bolt({ k, still }: { k: number; still: boolean }) {
  const f = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    f.value = withRepeat(withSequence(withDelay(2600, withTiming(1, { duration: 60 })), withTiming(0.2, { duration: 90 }), withTiming(1, { duration: 50 }), withTiming(0, { duration: 260 })), -1);
  }, [still]);
  const style = useAnimatedStyle(() => ({ opacity: f.value }));
  const d = `M${56 * k},${50 * k} L${46 * k},${66 * k} L${53 * k},${66 * k} L${47 * k},${80 * k} L${62 * k},${61 * k} L${55 * k},${61 * k} L${61 * k},${50 * k} Z`;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Path d={d} fill="#FFE27A" stroke="#FFF6CC" strokeWidth={0.8} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

// endregion
