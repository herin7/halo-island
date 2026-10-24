/** Small UI kit for the example: aurora wallpaper, glows, springy pressables, segmented + switch. */
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useId, useState } from 'react';
import { Image, ImageStyle, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';

const GLOW = require('./assets/textures/glow.png');
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, F } from './theme';

// region Haptics

let hapticsOn = true;
export const setHaptics = (on: boolean) => { hapticsOn = on; };
export const tick = (kind: 'light' | 'select' | 'success' = 'light') => {
  if (!hapticsOn || Platform.OS === 'web') return;
  const p = kind === 'select' ? Haptics.selectionAsync()
    : kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
};

// endregion

/** A soft radial light: color at the center fading to nothing. */
/**
 * A soft radial light: color at the center fading to nothing. A tinted texture rather than an SVG
 * gradient, so it costs nothing when something animates on top of it.
 */
export function Glow({ color, size, opacity = 1, style }: { color: string; size: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      source={GLOW}
      pointerEvents="none"
      resizeMode="stretch"
      tintColor={color}
      style={[{ width: size, height: size, opacity, tintColor: color } as ImageStyle, style as StyleProp<ImageStyle>]}
    />
  );
}

const BLOBS = [
  { color: '#5B3DF5', x: -0.35, y: -0.12, s: 1.25, dx: 0.22, dy: 0.08, ms: 15000 },
  { color: '#FF3D8B', x: 0.45, y: 0.05, s: 1.0, dx: -0.2, dy: 0.12, ms: 12000 },
  { color: '#12C9A0', x: -0.2, y: 0.55, s: 1.1, dx: 0.25, dy: -0.1, ms: 17000 },
  { color: '#FF9F2E', x: 0.5, y: 0.9, s: 0.9, dx: -0.18, dy: -0.12, ms: 13000 },
];

/** A vertical fade of the background color — SVG, so it renders the same on iOS, Android and web. */
export function Fade({ stops, style }: { stops: [offset: number, opacity: number][]; style?: StyleProp<ViewStyle> }) {
  const id = 'f' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={style}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map(([o, a]) => <Stop key={o} offset={o} stopColor={C.bg} stopOpacity={a} />)}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Slow drifting light behind everything. Transform-only animation, so it stays on the UI thread. */
export function Aurora() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, overflow: 'hidden' }]}>
      {BLOBS.map((b, i) => <Blob key={i} {...b} width={width} height={height} />)}
      {/* Keep the top dark so the black island reads, and the bottom calm for text. */}
      <Fade style={StyleSheet.absoluteFill} stops={[[0, 0.92], [0.22, 0.25], [0.6, 0.35], [1, 0.9]]} />
    </View>
  );
}

function Blob({ color, x, y, s, dx, dy, ms, width, height }: (typeof BLOBS)[number] & { width: number; height: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced]);
  const size = width * 1.5 * s;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: width / 2 - size / 2 + (x + dx * t.value) * width },
      { translateY: (y + dy * t.value) * height - size / 2 + height * 0.1 },
      { scale: interpolate(t.value, [0, 1], [1, 1.12]) },
    ],
  }));
  return (
    <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <Glow color={color} size={size} opacity={0.55} />
    </Animated.View>
  );
}

/** Pressable with a springy squish and a haptic tick. */
export function Press({ onPress, style, children, scale = 0.96, haptic = 'light', label, disabled }: {
  onPress?: () => void; style?: StyleProp<ViewStyle>; children: ReactNode; scale?: number; haptic?: 'light' | 'select' | 'success' | null; label?: string; disabled?: boolean;
}) {
  const p = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - scale) * p.value }] }));
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => { p.value = withSpring(1, { duration: 160, dampingRatio: 1 }); }}
      onPressOut={() => { p.value = withSpring(0, { duration: 420, dampingRatio: 0.5 }); }}
      onPress={() => { if (haptic) tick(haptic); onPress?.(); }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<T, string> }) {
  const [w, setW] = useState(0);
  const i = Math.max(0, options.indexOf(value));
  const x = useSharedValue(0);
  const seg = w ? (w - 8) / options.length : 0;
  useEffect(() => { x.value = withSpring(i * seg, { duration: 450, dampingRatio: 0.8 }); }, [i, seg]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={s.seg}>
      {seg ? <Animated.View style={[s.thumb, { width: seg }, thumb]} /> : null}
      {options.map((o) => (
        <Pressable key={o} onPress={() => { tick('select'); onChange(o); }} style={s.segItem} accessibilityRole="button" accessibilityState={{ selected: o === value }}>
          <Text style={[s.segText, o === value && { color: C.bg }]}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Switch({ value, onChange, color = C.violet, label }: { value: boolean; onChange: (v: boolean) => void; color?: string; label?: string }) {
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => { t.value = withSpring(value ? 1 : 0, { duration: 420, dampingRatio: 0.7 }); }, [value]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0.12)', color]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 20 }, { scale: 1 + Math.sin(t.value * Math.PI) * 0.12 }] }));
  return (
    <Pressable onPress={() => { tick('select'); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} hitSlop={10}>
      <Animated.View style={[s.switch, track]}>
        <Animated.View style={[s.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

export function Kicker({ children, color = C.ink3 }: { children: ReactNode; color?: string }) {
  return <Text style={[s.kicker, { color }]}>{children}</Text>;
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 12, backgroundColor: C.ink },
  segItem: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.semibold, fontSize: 13.5, color: C.ink2, letterSpacing: -0.1 },
  switch: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
  kicker: { fontFamily: F.semibold, fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase' },
});

// region Lazy — heavy previews mount only near the viewport, so off-screen pets and waveforms cost nothing.

const scroll = { y: 0, subs: new Set<() => void>() };
export const onScrollY = (y: number) => { scroll.y = y; scroll.subs.forEach((f) => f()); };

export function Lazy({ children, estimate }: { children: ReactNode; estimate: number }) {
  const { height } = useWindowDimensions();
  const [top, setTop] = useState<number | null>(null);
  const [h, setH] = useState(estimate);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (top == null) return;
    const check = () => setOn(top < scroll.y + height * 1.5 && top + h > scroll.y - height * 0.5);
    scroll.subs.add(check);
    check();
    return () => { scroll.subs.delete(check); };
  }, [top, h, height]);
  return (
    <View onLayout={(e) => setTop(e.nativeEvent.layout.y)} style={{ minHeight: h }}>
      {on ? <View onLayout={(e) => setH(e.nativeEvent.layout.height)}>{children}</View> : null}
    </View>
  );
}

// endregion
