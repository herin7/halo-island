import { requireNativeView } from 'expo';
import { ComponentType, ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Linking, PanResponder, Platform, Pressable, StatusBar, StyleSheet, Text, TextStyle as RNTextStyle, View, ViewStyle, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Active, Cutout, emitAction, hex, native, springOf, store } from './island';
import { DEFAULT_THEME, Effect, IslandNode, IslandState, IslandTheme, TextStyle, fill, num } from './spec';

let NativeIcon: ComponentType<{ name: string; color?: string; style?: ViewStyle }> | null = null;
try {
  if (native) NativeIcon = requireNativeView('HaloIsland');
} catch {}

// Optional: only apps that install lottie-react-native pay for it.
let LottieView: ComponentType<{ source: { uri: string }; autoPlay?: boolean; loop?: boolean; style?: ViewStyle }> | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {}

const WEIGHT = { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' } as const;
const COMPACT_HEIGHT = 37;

// region Nodes

interface Ctx { state: IslandState; theme: Required<IslandTheme>; onAction: (action: string) => void }

function Node(props: { node: IslandNode; ctx: Ctx; inRow?: boolean }): ReactNode {
  return props.node.effect ? <Motion effect={props.node.effect}><Body {...props} /></Motion> : <Body {...props} />;
}

function Body({ node, ctx, inRow }: { node: IslandNode; ctx: Ctx; inRow?: boolean }): ReactNode {
  const { state, theme } = ctx;
  switch (node.type) {
    case 'row':
    case 'column': {
      const s = node.style ?? {};
      const row = node.type === 'row';
      return (
        <View
          style={{
            flexDirection: row ? 'row' : 'column',
            gap: s.justify === 'between' ? undefined : s.gap ?? 8,
            padding: s.padding,
            alignItems: flex(s.align ?? (row ? 'center' : 'stretch')),
            justifyContent: s.justify === 'between' ? 'space-between' : flex(s.justify ?? 'start'),
            backgroundColor: s.background,
            borderRadius: s.radius,
            flexGrow: s.grow ? 1 : undefined,
            flexShrink: s.grow ? 1 : undefined,
          }}
        >
          {node.children.map((child, i) => <Node key={i} node={child} ctx={ctx} inRow={row} />)}
        </View>
      );
    }
    case 'text':
      return <Text style={textStyle(node.style, theme)} numberOfLines={node.style?.lines ?? 1}>{fill(node.text, state)}</Text>;
    case 'icon': {
      const size = node.size ?? 18;
      return NativeIcon ? <NativeIcon name={fill(node.name, state)} color={hex(node.color ?? theme.foreground)} style={{ width: size, height: size }} /> : null;
    }
    case 'image': {
      const size = node.size ?? 32;
      return <Image source={{ uri: fill(node.uri, state) }} style={{ width: size, height: size, borderRadius: node.radius ?? 8 }} />;
    }
    case 'ring': {
      const color = node.color ?? theme.accent;
      return <Ring value={num(node.value, state)} size={node.size ?? 22} thickness={node.thickness ?? 3} color={color} track={node.track ?? alpha(color)} />;
    }
    case 'bar': {
      const color = node.color ?? theme.accent;
      return <Bar value={num(node.value, state)} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow={inRow} />;
    }
    case 'steps': {
      const color = node.color ?? theme.accent;
      const v = num(node.value, state);
      return (
        <View style={{ flexDirection: 'row', gap: 4, flexGrow: inRow ? 1 : undefined }}>
          {Array.from({ length: node.count }, (_, i) => (
            <Bar key={i} value={v - i} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow />
          ))}
        </View>
      );
    }
    case 'track': {
      const color = node.color ?? theme.accent;
      return <Track value={num(node.value, state)} marker={fill(node.marker, state)} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow={inRow} />;
    }
    case 'lottie': {
      const size = node.size ?? 28;
      return LottieView ? <LottieView source={{ uri: fill(node.uri, state) }} autoPlay loop={node.loop ?? true} style={{ width: size, height: size }} /> : null;
    }
    case 'timer':
      return <Timer to={num(node.to, state)} countUp={node.countUp} style={textStyle(node.style, theme)} />;
    case 'button': {
      const ink = node.textColor ?? theme.background;
      const label = node.label ? fill(node.label, state) : undefined;
      return (
        <Pressable
          onPress={() => ctx.onAction(node.action)}
          accessibilityRole="button"
          accessibilityLabel={label ?? node.action}
          style={({ pressed }) => [styles.button, { backgroundColor: node.color ?? theme.accent, paddingHorizontal: label ? 16 : 10, opacity: pressed ? 0.75 : 1 }]}
        >
          {node.icon && NativeIcon ? <NativeIcon name={fill(node.icon, state)} color={hex(ink)} style={{ width: 16, height: 16 }} /> : null}
          {label ? <Text style={{ color: ink, fontWeight: '700', fontSize: 14 }}>{label}</Text> : null}
        </Pressable>
      );
    }
    case 'spacer':
      return node.size != null ? <View style={inRow ? { width: node.size } : { height: node.size }} /> : <View style={{ flexGrow: 1 }} />;
  }
}

const flex = (v: string) => (v === 'start' ? 'flex-start' : v === 'end' ? 'flex-end' : v) as 'flex-start';

function textStyle(s: TextStyle | undefined, theme: Required<IslandTheme>): RNTextStyle {
  return {
    color: s?.color ?? theme.foreground,
    fontSize: s?.size ?? 14,
    fontWeight: WEIGHT[s?.weight ?? 'regular'],
    fontVariant: s?.mono ? ['tabular-nums'] : undefined,
    textAlign: s?.align === 'end' ? 'right' : s?.align === 'center' ? 'center' : undefined,
    includeFontPadding: false,
  };
}

/** Clockwise ring from 12 o'clock, drawn as two clipped half-rings — no SVG dependency. */
function Ring({ value, size, thickness, color, track }: { value: number; size: number; thickness: number; color: string; track: string }) {
  const p = useSharedValue(clamp(value));
  useEffect(() => { p.value = withTiming(clamp(value), { duration: 600 }); }, [value]);
  const half = size / 2;
  const circle: ViewStyle = { position: 'absolute', width: size, height: size, borderRadius: half, borderWidth: thickness };
  const arc: ViewStyle = { ...circle, borderColor: 'transparent', borderTopColor: color, borderRightColor: color };
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${-135 + Math.min(p.value, 0.5) * 360}deg` }] }));
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 + Math.max(p.value - 0.5, 0) * 360}deg` }] }));
  return (
    <View style={{ width: size, height: size }}>
      <View style={[circle, { borderColor: track }]} />
      <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={[arc, { left: -half }, right]} />
      </View>
      <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={[arc, left]} />
      </View>
    </View>
  );
}

function Bar({ value, height, color, track, grow }: { value: number; height: number; color: string; track: string; grow?: boolean }) {
  const p = useSharedValue(clamp(value));
  useEffect(() => { p.value = withTiming(clamp(value), { duration: 600 }); }, [value]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden', flexGrow: grow ? 1 : undefined }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fillStyle]} />
    </View>
  );
}

/** Looping motion. Each effect is one Reanimated loop; reduced motion turns them all off. */
function Motion({ effect, children }: { effect: Effect; children: ReactNode }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const easing = Easing.inOut(Easing.quad);
    t.value = effect === 'spin'
      ? withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1)
      : effect === 'wiggle'
        ? withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 140 }), withTiming(1, { duration: 140 }), withTiming(0, { duration: 70 }), withDelay(1400, withTiming(0, { duration: 0 }))), -1)
        : withRepeat(withTiming(1, { duration: effect === 'bounce' ? 420 : 900, easing }), -1, true);
  }, [effect, reduced]);
  const style = useAnimatedStyle(() => {
    switch (effect) {
      case 'pulse': return { transform: [{ scale: 1 + t.value * 0.14 }] };
      case 'bounce': return { transform: [{ translateY: -t.value * 4 }] };
      case 'spin': return { transform: [{ rotate: `${t.value * 360}deg` }] };
      case 'wiggle': return { transform: [{ rotate: `${t.value * 10}deg` }] };
      case 'shimmer': return { opacity: 1 - t.value * 0.5 };
    }
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A bar with a marker riding on it; the marker eases to each new value. */
function Track({ value, marker, height, color, track, grow }: { value: number; marker: string; height: number; color: string; track: string; grow?: boolean }) {
  const p = useSharedValue(clamp(value));
  const [width, setWidth] = useState(0);
  useEffect(() => { p.value = withTiming(clamp(value), { duration: 900, easing: Easing.out(Easing.cubic) }); }, [value]);
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * Math.max(0, width - 22) }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height: 24, justifyContent: 'center', flexGrow: grow ? 1 : undefined }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
        <Animated.View style={[{ height, backgroundColor: color, borderRadius: height / 2 }, fillStyle]} />
      </View>
      <Animated.Text style={[{ position: 'absolute', left: 0, width: 22, textAlign: 'center', fontSize: 16 }, markerStyle]}>{marker}</Animated.Text>
    </View>
  );
}

function Timer({ to, countUp, style }: { to: number; countUp?: boolean; style: RNTextStyle }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={[style, { fontVariant: ['tabular-nums'] }]}>{clock(countUp ? now - to : to - now)}</Text>;
}

export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const alpha = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}38` : 'rgba(255,255,255,0.18)');

// endregion

// region Host

export type Placement = 'auto' | 'cutout' | 'below';

/**
 * Where the island lives: wrapped around a centered camera cutout, or under the status bar.
 * `auto` wraps the cutout on iOS only — on Android the status bar window swallows touches in its
 * band, so an island there would look right but never respond. Use `cutout` there only when your
 * app hides the status bar.
 */
function useGeometry(placement: Placement) {
  const { width } = useWindowDimensions();
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const wrap = placement === 'cutout' || (placement === 'auto' && Platform.OS === 'ios');
  useEffect(() => { setCutout(wrap ? native?.getCutout() ?? null : null); }, [wrap]);
  const centered = cutout && Math.abs(cutout.x + cutout.width / 2 - width / 2) < 40 ? cutout : null;
  const height = Math.max(COMPACT_HEIGHT, (centered?.height ?? 0) + 8);
  return {
    cutout: centered,
    height,
    top: centered ? centered.y + centered.height / 2 - height / 2 : (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 50) + 6,
    /** Space kept free in the compact row so content never sits under the camera. */
    gap: centered ? centered.width + 12 : 16,
    expandedWidth: Math.min(width - 16, 400),
  };
}

/**
 * Renders the active island inside the app. Mount once at the root, above navigation:
 * `<HaloIslandHost />`.
 */
export function HaloIslandHost({ placement = 'auto' }: { placement?: Placement }) {
  const active = useSyncExternalStore(store.subscribe, store.current, store.current);
  const [shown, setShown] = useState<Active | null>(active);
  useEffect(() => {
    if (active) return setShown(active);
    const t = setTimeout(() => setShown(null), 320); // let the exit animation finish
    return () => clearTimeout(t);
  }, [active]);
  if (!shown) return null;
  return <Island key={shown.key} entry={shown} leaving={!active} placement={placement} />;
}

function Island({ entry, leaving, placement }: { entry: Active; leaving: boolean; placement: Placement }) {
  const geo = useGeometry(placement);
  const reduced = useReducedMotion();
  const theme = { ...DEFAULT_THEME, ...entry.template.theme };
  const spring = reduced ? null : springOf(entry.template.motion);
  const [expanded, setExpanded] = useState(!!entry.options.expanded);
  const [compact, setCompact] = useState({ width: 0, height: 0 });
  const [bodyHeight, setBodyHeight] = useState(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasBody = !!entry.template.expanded;
  const isOpen = expanded && hasBody;
  /** Grows with the system font size so large text never clips. */
  const rowHeight = Math.max(geo.height, compact.height);

  const ctx: Ctx = {
    state: entry.state,
    theme,
    onAction: (action) => { emitAction(entry.id, action); bump(); },
  };

  const bump = () => {
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 8000);
  };
  useEffect(() => { if (isOpen) bump(); return () => clearTimeout(collapseTimer.current); }, [isOpen]);
  useEffect(() => setExpanded(!!entry.options.expanded), [entry.key]);
  useEffect(() => {
    if (!entry.alert || !hasBody) return;
    setExpanded(true);
    bump();
    if (!reduced) shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 120 }), withTiming(1, { duration: 120 }), withTiming(0, { duration: 60 }));
  }, [entry.alert]);

  // Born from the camera cutout (or a dot), then springs to its real size.
  const seed = { w: geo.cutout?.width ?? 40, h: geo.cutout?.height ?? geo.height };
  const w = useSharedValue(seed.w);
  const h = useSharedValue(seed.h);
  const radius = useSharedValue(geo.height / 2);
  const opacity = useSharedValue(0);
  const bodyOpacity = useSharedValue(0);
  const drag = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (theme.glow && !reduced) glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [theme.glow, reduced]);

  const go = (v: number) => (spring ? withSpring(v, spring) : withTiming(v, { duration: 0 }));
  const fade = (v: number, delay = 0) => (reduced ? withTiming(v, { duration: 0 }) : withDelay(delay, withTiming(v, { duration: 180 })));

  useEffect(() => {
    if (!compact.width) return;
    if (leaving) {
      w.value = go(seed.w);
      h.value = go(seed.h);
      opacity.value = fade(0, 80);
      bodyOpacity.value = fade(0);
      return;
    }
    const targetW = isOpen ? geo.expandedWidth : Math.min(geo.expandedWidth, Math.max(compact.width, geo.gap + 2 * rowHeight));
    const targetH = isOpen ? rowHeight + bodyHeight + 20 : rowHeight;
    w.value = go(targetW);
    h.value = go(targetH);
    radius.value = go(isOpen ? theme.radius : rowHeight / 2);
    opacity.value = fade(1);
    bodyOpacity.value = fade(isOpen ? 1 : 0, isOpen ? 90 : 0);
  }, [compact, bodyHeight, isOpen, leaving, geo.expandedWidth, rowHeight]);

  const islandStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: h.value,
    borderRadius: radius.value,
    opacity: opacity.value,
    borderColor: theme.glow ? interpolateColor(glow.value, [0, 1], [theme.border, theme.glow]) : theme.border,
    borderWidth: theme.glow ? 1.5 : StyleSheet.hairlineWidth,
    transform: [{ translateY: drag.value }, { rotate: `${shake.value * 2.5}deg` }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOpacity.value }));

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
    onPanResponderMove: (_, g) => { drag.value = Math.max(-40, Math.min(40, g.dy)) * 0.4; },
    onPanResponderRelease: (_, g) => {
      drag.value = go(0);
      if (g.dy > 24) setExpanded(true);
      else if (g.dy < -24) setExpanded(false);
    },
    onPanResponderTerminate: () => { drag.value = go(0); },
  }), [spring]);

  const onPress = () => {
    const link = entry.template.link;
    if (!isOpen && hasBody) return setExpanded(true);
    if (link) Linking.openURL(link).catch(() => {});
    setExpanded(false);
  };

  const compactRow = (
    <View style={[styles.compactRow, { minHeight: rowHeight }]}>
      {entry.template.compact.leading ? <Node node={entry.template.compact.leading} ctx={ctx} inRow /> : null}
      <View style={{ minWidth: geo.gap, flexGrow: 1 }} />
      {entry.template.compact.trailing ? <Node node={entry.template.compact.trailing} ctx={ctx} inRow /> : null}
    </View>
  );
  const body = entry.template.expanded ? <Node node={entry.template.expanded} ctx={ctx} /> : null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
      {/* Off-screen copies measure natural sizes; the visible island animates between them. */}
      <View pointerEvents="none" style={styles.measure}>
        <View style={{ alignSelf: 'flex-start' }} onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCompact({ width: Math.ceil(width), height: Math.ceil(height) });
        }}>{compactRow}</View>
        <View style={{ width: geo.expandedWidth - 24 }} onLayout={(e) => setBodyHeight(Math.ceil(e.nativeEvent.layout.height))}>{body}</View>
      </View>

      <Animated.View
        {...pan.panHandlers}
        style={[styles.island, { top: geo.top, backgroundColor: theme.background }, islandStyle]}
      >
        <Pressable
          onPress={onPress}
          onLongPress={() => hasBody && setExpanded(true)}
          accessibilityRole="button"
          accessibilityHint={hasBody ? (isOpen ? 'Collapses the island' : 'Expands the island') : undefined}
          style={styles.fill}
        >
          <View style={{ width: '100%' }}>{compactRow}</View>
          {isOpen || bodyHeight ? (
            <Animated.View pointerEvents={isOpen ? 'auto' : 'none'} style={[{ width: geo.expandedWidth - 24, alignSelf: 'center' }, bodyStyle]}>
              {body}
            </Animated.View>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  island: { position: 'absolute', alignSelf: 'center', overflow: 'hidden' },
  fill: { flex: 1, alignItems: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  measure: { position: 'absolute', top: -10000, left: 0, opacity: 0 },
  button: { height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});

// endregion
