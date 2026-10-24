/** Small UI kit for the example: glyphs, fades, springy pressables, segmented + switch. */
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useId, useState } from 'react';
import { ICONS } from 'halo-island';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

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

/** A named icon (built-in or registered with registerIcons), outside the island. */
export function Glyph({ name, size, color }: { name: string; size: number; color: string }) {
  const d = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d ? <Path d={d} fill={color} /> : null}
    </Svg>
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
