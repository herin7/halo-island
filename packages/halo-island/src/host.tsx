// HOST v2 READY — in-app renderer: JS-drawn graphics, screens, inputs, pet, glass, bubble.
import { requireNativeView } from 'expo';
import { ComponentType, ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Dimensions, Image, Linking, PanResponder, Platform, Pressable, StatusBar, StyleSheet, Text, TextStyle as RNTextStyle, View, ViewStyle, useColorScheme, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Arc, Bars, Icon, Pet, Ring, Sparkline, Timeline, alpha, clamp } from './graphics';
import { Active, Cutout, emitAction, focus, native, nativeJson, setState, springOf, store } from './island';
import { DEFAULT_THEME, Effect, IslandNode, IslandState, IslandTemplate, IslandTheme, Motion, TextStyle, fill, fontFor, num, nums, on, resolveTheme, tracking, visible } from './spec';

// region Optional modules — each is used only when the app already ships it.

function optional<T>(load: () => T): T | null {
  try { return load(); } catch { return null; }
}

/** Rive needs the native module (Android). Everything else here is drawn in JS. */
const NativeGraphic = native ? optional(() => requireNativeView<{ spec: string; style?: ViewStyle }>('HaloGraphic')) : null;
const LottieView = optional(() => require('lottie-react-native').default as ComponentType<{ source: { uri: string }; autoPlay?: boolean; loop?: boolean; style?: ViewStyle }>);
const Haptics = optional(() => require('expo-haptics') as typeof import('expo-haptics'));
const Blur = optional(() => require('expo-blur').BlurView as ComponentType<{ intensity?: number; tint?: string; style?: ViewStyle }>);
const Glass = optional(() => {
  const g = require('expo-glass-effect');
  return g.isLiquidGlassAvailable?.() ? (g.GlassView as ComponentType<{ glassEffectStyle?: string; tintColor?: string; style?: ViewStyle }>) : null;
});

// endregion

const WEIGHT = { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' } as const;
const COMPACT_HEIGHT = 37;
/** Compact pill side padding. */
const ROW_PAD = 14;
/**
 * Expanded margins, concentric with the island's large corner radius: content stays clear of the
 * curve on every side instead of running into it.
 */
const OPEN_INSET = 22;
const OPEN_TOP = 10;
const OPEN_BOTTOM = 22;
/** Collapse after this long without a touch, like the system island. */
const IDLE_MS = 12000;
const SNAP = { duration: 420, dampingRatio: 0.82 };

type Theme = typeof DEFAULT_THEME;

function themeOf(template: IslandTheme | undefined, base: IslandTheme | undefined, scheme: 'light' | 'dark' | null | undefined): Theme {
  // Keys set to undefined (`{ aura: on ? c : undefined }`) mean "not set", not "erase the default".
  const defined = (t?: IslandTheme) => Object.fromEntries(Object.entries(t ?? {}).filter(([, v]) => v != null));
  const merged = { ...DEFAULT_THEME, ...defined(resolveTheme(base, scheme)), ...defined(resolveTheme(template, scheme)) } as Theme;
  return { ...merged, border: merged.border || alpha(merged.accent, 0.3) };
}

// region Haptics

let hapticsOn = true;
const haptic = {
  tap: () => hapticsOn && Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  open: () => hapticsOn && Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  select: () => hapticsOn && Haptics?.selectionAsync().catch(() => {}),
  alert: () => hapticsOn && Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};

// endregion

// region Nodes

interface Ctx {
  state: IslandState;
  theme: Theme;
  onAction: (action: string) => void;
  /** Writes input values into the island's state. */
  set: (patch: IslandState) => void;
  /** Any touch inside the island: keeps it open. */
  touch: () => void;
  /** Previews: pets hold their gaze, so a gallery of them costs nothing while idle. */
  still?: boolean;
}

function Node(props: { node: IslandNode; ctx: Ctx; inRow?: boolean }): ReactNode {
  if (!visible(props.node, props.ctx.state)) return null;
  return props.node.effect ? <Loop effect={props.node.effect}><Body {...props} /></Loop> : <Body {...props} />;
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
            flexWrap: row && s.wrap ? 'wrap' : undefined,
            gap: s.justify === 'between' ? undefined : s.gap ?? 8,
            padding: s.padding,
            alignItems: s.align === 'baseline' ? 'baseline' : flex(s.align ?? (row ? 'center' : 'stretch')),
            justifyContent: s.justify === 'between' ? 'space-between' : flex(s.justify ?? 'start'),
            backgroundColor: s.background,
            experimental_backgroundImage: gradient(s.gradient),
            borderRadius: s.radius,
            borderWidth: s.border?.width,
            borderColor: s.border?.color,
            width: s.width,
            height: s.height,
            opacity: s.opacity,
            flexGrow: s.grow ? 1 : undefined,
            flexShrink: s.grow ? 1 : undefined,
            flexBasis: s.grow ? 0 : undefined,
          }}
        >
          {node.children.map((child, i) => <Node key={i} node={child} ctx={ctx} inRow={row} />)}
        </View>
      );
    }
    case 'text': {
      const value = fill(node.text, state);
      const style = textStyle(node.style, theme);
      if (!node.style?.mono) return <Text style={style} numberOfLines={node.style?.lines ?? 1} maxFontSizeMultiplier={1.3}>{value}</Text>;
      // Numbers roll: the new value slides up into place as the old one leaves.
      return (
        <Animated.View layout={LinearTransition.springify().dampingRatio(0.9)} style={{ overflow: 'hidden' }}>
          <Animated.Text key={value} entering={FadeInDown.duration(280).easing(Easing.out(Easing.cubic))} exiting={FadeOutUp.duration(180)} style={style} numberOfLines={1} maxFontSizeMultiplier={1.3}>{value}</Animated.Text>
        </Animated.View>
      );
    }
    case 'icon':
      return <Icon name={node.name ? fill(node.name, state) : undefined} path={node.path} viewBox={node.viewBox} stroke={node.stroke} size={node.size ?? 18} width={node.width} color={node.color ?? theme.foreground} />;
    case 'image': {
      const size = node.size ?? 32;
      const uri = fill(node.uri, state);
      const box = { width: node.width ?? size, height: size, borderRadius: node.radius ?? 8 };
      // An empty uri is a placeholder slot (e.g. a result that hasn't arrived yet).
      if (!uri) return <Shimmer style={box} />;
      const img = <Animated.Image entering={FadeIn.duration(400)} source={{ uri }} style={box} resizeMode={node.fit ?? 'cover'} />;
      // Android's blurRadius frosts the whole box grey instead of bleeding color, so no glow there.
      if (!node.glow || Platform.OS === 'android') return img;
      // Ambient light: a blurred, enlarged copy bleeds the artwork's color into the black.
      return (
        <View>
          <Image source={{ uri }} blurRadius={24} style={[box, StyleSheet.absoluteFill, { opacity: 0.8, transform: [{ scale: 1.7 }] }]} />
          {img}
        </View>
      );
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
      return <Track value={num(node.value, state)} marker={node.marker ? fill(node.marker, state) : ''} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow={inRow} />;
    }
    case 'bars': {
      const color = node.color ?? theme.accent;
      const values = nums(node.values, state);
      const active = node.active == null ? values.length : num(node.active, state);
      return <View style={{ flexGrow: inRow ? 1 : undefined, alignSelf: 'stretch' }}><Bars values={values} active={active} height={node.height ?? 40} gap={node.gap ?? 3} color={color} track={node.track ?? alpha(color, 0.18)} live={!!node.animate} /></View>;
    }
    case 'line':
      return <View style={{ flexGrow: inRow ? 1 : undefined, alignSelf: 'stretch' }}><Sparkline values={nums(node.values, state)} height={node.height ?? 40} color={node.color ?? theme.accent} fill={node.fill ?? true} thickness={node.thickness ?? 2} /></View>;
    case 'arc':
      return <Arc value={num(node.value, state)} height={node.height ?? 64} thickness={node.thickness ?? 5} colors={node.colors?.length ? node.colors : [theme.accent]} track={node.track ?? alpha(theme.foreground, 0.2)} glow={node.glow ?? true} />;
    case 'timeline':
      return <View style={{ flexGrow: inRow ? 1 : undefined, alignSelf: 'stretch' }}><Timeline value={num(node.value, state)} icons={node.icons.map((i) => fill(i, state))} size={node.size ?? 30} color={node.color ?? theme.accent} track={node.track ?? alpha(theme.foreground, 0.14)} ink={node.ink ?? theme.background} /></View>;
    case 'pet':
      return <Pet mood={node.mood ? fill(node.mood, state) : 'idle'} size={node.size ?? 22} color={node.color ?? theme.foreground} cheeks={node.cheeks ?? '#FF7AB6'} still={ctx.still} />;
    case 'lottie': {
      const size = node.size ?? 28;
      return LottieView ? <LottieView source={{ uri: fill(node.uri, state) }} autoPlay loop={node.loop ?? true} style={{ width: size, height: size }} /> : null;
    }
    case 'rive': {
      if (!NativeGraphic) return null;
      const size = node.size ?? 40;
      return <NativeGraphic spec={nativeJson({ node, theme, state })} style={{ width: node.width ?? size, height: size }} />;
    }
    case 'timer':
      return <Timer to={num(node.to, state)} countUp={node.countUp} style={textStyle(node.style, theme)} />;
    case 'button':
      return <Button node={node} ctx={ctx} />;
    case 'chips':
      return <Chips node={node} ctx={ctx} />;
    case 'slider':
      return <Slider node={node} ctx={ctx} />;
    case 'toggle':
      return <Toggle node={node} ctx={ctx} />;
    case 'spacer':
      return node.size != null ? <View style={inRow ? { width: node.size } : { height: node.size }} /> : <View style={{ flexGrow: 1 }} />;
  }
}

const gradient = (colors?: string[]) => (colors && colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : undefined);

const flex = (v: string) => (v === 'start' ? 'flex-start' : v === 'end' ? 'flex-end' : v) as 'flex-start';

function textStyle(s: TextStyle | undefined, theme: Theme): RNTextStyle {
  const family = s?.font ?? fontFor(theme.fonts, s?.weight ?? 'medium');
  return {
    color: s?.color ?? theme.foreground,
    fontSize: s?.size ?? 14,
    letterSpacing: tracking(s?.size ?? 14),
    // A font file already carries its weight; asking for another would fake-bold it.
    fontWeight: family ? undefined : WEIGHT[s?.weight ?? 'medium'],
    fontVariant: s?.mono ? ['tabular-nums'] : undefined,
    fontFamily: family,
    textAlign: s?.align === 'end' ? 'right' : s?.align === 'center' ? 'center' : undefined,
    includeFontPadding: false,
  };
}

/** Springy press feedback for anything tappable inside the island. */
function usePress(scale = 0.94) {
  const p = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - scale) * p.value }] }));
  return {
    style,
    onPressIn: () => { p.value = withSpring(1, { duration: 160, dampingRatio: 1 }); },
    onPressOut: () => { p.value = withSpring(0, { duration: 380, dampingRatio: 0.5 }); },
  };
}

type ButtonNode = Extract<IslandNode, { type: 'button' }>;

function Button({ node, ctx }: { node: ButtonNode; ctx: Ctx }) {
  const { state, theme } = ctx;
  const [armed, setArmed] = useState(false);
  const press = usePress(node.shape === 'tile' ? 0.9 : 0.94);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  const base = node.color ?? theme.accent;
  const tinted = node.tint && !armed;
  const ink = armed ? theme.background : node.textColor ?? (node.tint ? base : theme.background);
  const fillColor = tinted ? alpha(base, 0.2) : base;
  const label = armed ? fill(node.confirm!, state) : node.label ? fill(node.label, state) : undefined;
  const icon = node.icon ? fill(node.icon, state) : undefined;
  const onPress = () => {
    ctx.touch();
    // The button becomes its own confirmation: same place, more context, second tap commits.
    if (node.confirm && !armed) { haptic.select(); return setArmed(true); }
    setArmed(false);
    haptic.tap();
    ctx.onAction(node.action);
  };
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: label ?? node.action };

  if (node.shape === 'tile') {
    // Launcher tile: a squircle with the icon, the label under it.
    return (
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} {...a11y}>
        <Animated.View style={[{ alignItems: 'center', gap: 6, width: 62 }, press.style]}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: fillColor, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: tinted ? undefined : `linear-gradient(160deg, ${alpha('#FFFFFF', 0.28)}, ${alpha('#FFFFFF', 0)} 60%)` }}>
            {icon ? <Icon name={icon} size={26} color={tinted ? base : node.textColor ?? '#FFFFFF'} /> : null}
          </View>
          {node.label ? <Text style={[textStyle({ size: 11, weight: 'semibold', color: theme.foreground }, theme), { textAlign: 'center' }]} numberOfLines={1}>{fill(node.label, state)}</Text> : null}
        </Animated.View>
      </Pressable>
    );
  }

  const circle = node.shape === 'circle' || (!label && !!icon);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={{ flexGrow: 1 }} {...a11y}>
      <Animated.View
        layout={LinearTransition.springify().dampingRatio(0.75)}
        style={[styles.button, circle && !armed ? { width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, alignSelf: 'center' } : { paddingHorizontal: 18 }, { backgroundColor: fillColor }, press.style]}
      >
        {icon && !armed ? <Icon name={icon} size={circle ? 20 : 17} color={ink} /> : null}
        {label ? <Animated.Text key={label} entering={FadeIn.duration(200)} style={textStyle({ weight: 'bold', color: ink, size: 15 }, theme)} numberOfLines={1}>{label}</Animated.Text> : null}
      </Animated.View>
    </Pressable>
  );
}

type ChipsNode = Extract<IslandNode, { type: 'chips' }>;

/** A segmented choice; the selection slides between options like a physical knob. */
function Chips({ node, ctx }: { node: ChipsNode; ctx: Ctx }) {
  const values = node.values ?? node.options;
  const color = node.color ?? ctx.theme.accent;
  const index = values.indexOf(String(ctx.state[node.bind] ?? ''));
  const [layouts, setLayouts] = useState<{ x: number; w: number }[]>([]);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  useEffect(() => {
    const l = layouts[index];
    if (!l) { w.value = withTiming(0, { duration: 150 }); return; }
    if (!w.value) { x.value = l.x; w.value = withSpring(l.w, SNAP); return; }
    x.value = withSpring(l.x, SNAP);
    w.value = withSpring(l.w, SNAP);
  }, [index, layouts]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value, opacity: w.value ? 1 : 0 }));
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch', backgroundColor: alpha(ctx.theme.foreground, 0.06), borderRadius: 18, padding: 3 }}>
      <Animated.View style={[{ position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 15, backgroundColor: alpha(color, 0.22) }, knob]} />
      {node.options.map((label, i) => (
        <Pressable
          key={i}
          onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setLayouts((prev) => { const next = [...prev]; next[i] = { x: lx, w: width }; return next; }); }}
          onPress={() => { ctx.touch(); haptic.select(); ctx.set({ [node.bind]: values[i] }); ctx.onAction(`change:${node.bind}`); }}
          accessibilityRole="button"
          accessibilityState={{ selected: i === index }}
          style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={textStyle({ weight: 'bold', size: 14, color: i === index ? color : ctx.theme.secondary }, ctx.theme)} numberOfLines={1}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type SliderNode = Extract<IslandNode, { type: 'slider' }>;

/** Control Center style: the whole bar is the handle; drag anywhere. */
function Slider({ node, ctx }: { node: SliderNode; ctx: Ctx }) {
  const color = node.color ?? ctx.theme.foreground;
  const height = node.height ?? 40;
  const external = clamp(Number(ctx.state[node.bind]) || 0);
  const v = useSharedValue(external);
  const width = useRef(0);
  const start = useRef(0);
  const dragging = useRef(false);
  const latest = useRef(ctx);
  latest.current = ctx;
  useEffect(() => { if (!dragging.current) v.value = withSpring(external, SNAP); }, [external]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      dragging.current = true;
      start.current = clamp(e.nativeEvent.locationX / Math.max(1, width.current));
      v.value = withSpring(start.current, { duration: 200, dampingRatio: 1 });
      latest.current.touch();
    },
    onPanResponderMove: (_, g) => { v.value = clamp(start.current + g.dx / Math.max(1, width.current)); },
    onPanResponderRelease: () => {
      dragging.current = false;
      const value = Math.round(v.value * 100) / 100;
      if (value === 0 || value === 1) haptic.select();
      latest.current.set({ [node.bind]: value });
      latest.current.onAction(`change:${node.bind}`);
    },
    onPanResponderTerminate: () => { dragging.current = false; },
  }), [node.bind]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(external * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: node.track ?? alpha(ctx.theme.foreground, 0.1), overflow: 'hidden', justifyContent: 'center', alignSelf: 'stretch', flexGrow: 1 }}
    >
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color }, fillStyle]} />
      {node.icon ? <View pointerEvents="none" style={{ marginLeft: 14 }}><Icon name={node.icon} size={18} color={mixInk(color)} /></View> : null}
    </View>
  );
}

/** Dark ink on light fills, light ink on dark ones. */
function mixInk(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
  if (!m) return '#000000';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#FFFFFF';
}

type ToggleNode = Extract<IslandNode, { type: 'toggle' }>;

function Toggle({ node, ctx }: { node: ToggleNode; ctx: Ctx }) {
  const { theme } = ctx;
  const value = on(ctx.state[node.bind]);
  const color = node.color ?? theme.accent;
  const t = useSharedValue(value ? 1 : 0);
  const press = usePress(0.93);
  useEffect(() => { t.value = withSpring(value ? 1 : 0, SNAP); }, [value]);
  const off = alpha(theme.foreground, 0.08);
  const bg = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(t.value, [0, 1], [off, color]) }));
  const ink = value ? mixInk(color) : theme.foreground;
  return (
    <Pressable
      onPress={() => { ctx.touch(); haptic.tap(); ctx.set({ [node.bind]: !value }); ctx.onAction(`change:${node.bind}`); }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={node.label}
      style={{ flexGrow: 1, flexBasis: 0 }}
    >
      <Animated.View style={[{ height: 64, borderRadius: 20, padding: 12, justifyContent: 'space-between' }, bg, press.style]}>
        {node.icon ? <Icon name={node.icon} size={20} color={ink} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={textStyle({ size: 13, weight: 'bold', color: ink }, theme)} numberOfLines={1}>{node.label}</Text>
          <Text style={textStyle({ size: 11, weight: 'semibold', color: alpha(ink === '#000000' ? '#000000' : '#FFFFFF', 0.6) }, theme)}>{value ? 'On' : 'Off'}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function Bar({ value, height, color, track, grow }: { value: number; height: number; color: string; track: string; grow?: boolean }) {
  const p = useSharedValue(clamp(value));
  useEffect(() => { p.value = withSpring(clamp(value), { duration: 800, dampingRatio: 0.9 }); }, [value]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden', flexGrow: grow ? 1 : undefined }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fillStyle]} />
    </View>
  );
}

/** Placeholder that breathes while content is on its way. */
function Shimmer({ style }: { style: ViewStyle }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 900 }), -1, true); }, []);
  const a = useAnimatedStyle(() => ({ opacity: 0.06 + t.value * 0.08 }));
  return <Animated.View style={[style, { backgroundColor: '#FFFFFF' }, a]} />;
}

/** Looping motion. Each effect is one Reanimated loop; reduced motion turns them all off. */
function Loop({ effect, children }: { effect: Effect; children: ReactNode }) {
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
  useEffect(() => { p.value = withSpring(clamp(value), { duration: 1100, dampingRatio: 0.85 }); }, [value]);
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * Math.max(0, width - 22) }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height: 24, justifyContent: 'center', flexGrow: grow ? 1 : undefined }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
        <Animated.View style={[{ height, backgroundColor: color, borderRadius: height / 2 }, fillStyle]} />
      </View>
      {marker ? (
        <Animated.View style={[{ position: 'absolute', left: 0, width: 22, alignItems: 'center' }, markerStyle]}>
          <Icon name={marker} size={18} color={color} />
        </Animated.View>
      ) : (
        <Animated.View style={[{ position: 'absolute', left: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 3, borderColor: '#000' }, markerStyle]} />
      )}
    </View>
  );
}

function Timer({ to, countUp, style }: { to: number; countUp?: boolean; style: RNTextStyle }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={[style, { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.3}>{clock(countUp ? now - to : to - now)}</Text>;
}

export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// endregion

// region Surface

/**
 * The island's material: solid black (or a gradient), or glass — Liquid Glass on iOS 26, a blur on
 * older iOS and the web, a dark translucent fill on Android (no blur behind overlays there).
 */
function Surface({ theme, open, live = false }: { theme: Theme; open: { value: number }; live?: boolean }) {
  const glass = theme.material === 'glass';
  const breath = useSharedValue(0);
  const reduced = useReducedMotion();
  // Breathes only while it shows: a collapsed island runs no loops.
  useEffect(() => {
    breath.value = theme.aura && live && !reduced ? withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true) : withTiming(0);
  }, [theme.aura, live, reduced]);
  const auraStyle = useAnimatedStyle(() => ({ opacity: open.value * (0.75 + breath.value * 0.25) }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {glass ? (
        Glass && Platform.OS === 'ios' ? <Glass glassEffectStyle="regular" tintColor={alpha('#000000', 0.35)} style={StyleSheet.absoluteFill} />
          : Blur && Platform.OS !== 'android' ? <><Blur intensity={60} tint="dark" style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,16,20,0.45)' }]} /></>
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,30,0.86)' }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, experimental_backgroundImage: gradient(theme.gradient) }]} />
      )}
      {glass ? <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 42%)' }]} /> : null}
      {theme.aura ? (
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%', experimental_backgroundImage: `linear-gradient(180deg, ${alpha(theme.aura, 0)}, ${alpha(theme.aura, 0.18)} 55%, ${alpha(theme.aura, 0.7)})` }, auraStyle]} />
      ) : null}
    </View>
  );
}

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
  const { width, height: screenH } = useWindowDimensions();
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const wrap = placement === 'cutout' || (placement === 'auto' && Platform.OS === 'ios');
  useEffect(() => { setCutout(wrap ? native?.getCutout() ?? iosIsland(width, screenH) : null); }, [wrap, width, screenH]);
  const centered = cutout && Math.abs(cutout.x + cutout.width / 2 - width / 2) < 40 ? cutout : null;
  const height = Math.max(COMPACT_HEIGHT, (centered?.height ?? 0) + 8);
  return {
    cutout: centered,
    height,
    top: centered ? centered.y + centered.height / 2 - height / 2 : (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 50) + 6,
    /** Space kept free in the compact row so content never sits under the camera. */
    gap: centered ? centered.width + 12 : 16,
    expandedWidth: Math.min(width - 16, 400),
    width,
  };
}

/**
 * iPhones with a Dynamic Island have no native cutout API here; they are the tall, non-notched
 * screens (852pt and up). Its hardware pill is 126×37 at 11pt from the top.
 */
function iosIsland(width: number, height: number): Cutout | null {
  if (Platform.OS !== 'ios' || Platform.isPad || Math.max(width, height) < 852 || width > height) return null;
  return { x: width / 2 - 63, y: 11, width: 126, height: 37 };
}

export interface HostProps {
  placement?: Placement;
  /** Defaults under every template's theme — e.g. `{ material: 'glass' }` app-wide. */
  theme?: IslandTheme;
  /** Overrides every template's motion. */
  motion?: Motion;
  /** Taps, opens and alerts tick through expo-haptics when it's installed. Default true. */
  haptics?: boolean;
  /** Dims the app behind the expanded island; tapping outside collapses it. Default true. */
  dim?: boolean;
}

/**
 * Renders the active islands inside the app. Mount once at the root, above navigation:
 * `<HaloIslandHost />`.
 */
export function HaloIslandHost({ placement = 'auto', theme, motion, haptics = true, dim = true }: HostProps) {
  hapticsOn = haptics;
  const list = useSyncExternalStore(store.subscribe, store.all, store.all);
  const top = list[list.length - 1] ?? null;
  const [shown, setShown] = useState<Active | null>(top);
  useEffect(() => {
    if (top) return setShown(top);
    const t = setTimeout(() => setShown(null), 450); // let the exit animation finish
    return () => clearTimeout(t);
  }, [top]);
  if (!shown) return null;
  return <Island entry={top ?? shown} leaving={!top} bubble={list.length > 1 ? list[list.length - 2] : null} placement={placement} base={theme} motion={motion} dim={dim} />;
}

const screenIn = (dir: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: 32 * dir }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 220 }),
      transform: [{ translateX: withSpring(0, { duration: 460, dampingRatio: 0.86 }) }, { scale: withSpring(1, { duration: 460, dampingRatio: 0.86 }) }],
    },
  };
};
const screenOut = (dir: number) => () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 140 }),
      transform: [{ translateX: withTiming(-32 * dir, { duration: 220 }) }, { scale: withTiming(0.96, { duration: 220 }) }],
    },
  };
};

function Island({ entry, leaving, bubble, placement, base, motion, dim }: { entry: Active; leaving: boolean; bubble: Active | null; placement: Placement; base?: IslandTheme; motion?: Motion; dim: boolean }) {
  const geo = useGeometry(placement);
  const reduced = useReducedMotion();
  const scheme = useColorScheme();
  const theme = themeOf(entry.template.theme, base, scheme);
  const spring = reduced ? null : springOf(motion ?? entry.template.motion);
  const [expanded, setExpanded] = useState(!!entry.options.expanded);
  const [stack, setStack] = useState<string[]>([]);
  const [dir, setDir] = useState(1);
  const [compact, setCompact] = useState({ width: 0, height: 0 });
  const [bodyHeight, setBodyHeight] = useState(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const screen = stack[stack.length - 1];
  const bodyNode = (screen && entry.template.screens?.[screen]) || entry.template.expanded;
  const hasBody = !!entry.template.expanded;
  const isOpen = expanded && hasBody && !leaving;
  /** Grows with the system font size so large text never clips. */
  const rowHeight = Math.max(geo.height, compact.height);

  const bump = () => {
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), IDLE_MS);
  };
  const go = (to: boolean) => {
    if (to === isOpen) return;
    to ? haptic.open() : haptic.tap();
    setExpanded(to);
  };

  const ctx: Ctx = {
    state: entry.state,
    theme,
    touch: bump,
    set: (patch) => setState(entry.id, patch),
    onAction: (action) => {
      bump();
      if (action === 'back') { setDir(-1); setStack((s) => s.slice(0, -1)); }
      else if (action === 'close') setExpanded(false);
      else if (action.startsWith('go:')) { setDir(1); setStack((s) => [...s, action.slice(3)]); }
      emitAction(entry.id, action);
    },
  };

  useEffect(() => { if (isOpen) bump(); return () => clearTimeout(collapseTimer.current); }, [isOpen]);
  // A different activity took the island, or this one restarted: start from its own first screen.
  useEffect(() => { setExpanded(!!entry.options.expanded); setStack([]); }, [entry.id, entry.key]);
  // Closing forgets the screen it was on once the island has shrunk.
  useEffect(() => {
    if (isOpen || !stack.length) return;
    const t = setTimeout(() => setStack([]), 450);
    return () => clearTimeout(t);
  }, [isOpen]);
  useEffect(() => {
    if (!entry.alert || !hasBody) return;
    haptic.alert();
    pop();
    setExpanded(true);
    bump();
  }, [entry.alert]);

  // Born from the camera cutout (or a dot), then springs to its real size.
  const seed = { w: geo.cutout?.width ?? 40, h: geo.cutout?.height ?? geo.height };
  const w = useSharedValue(seed.w);
  const h = useSharedValue(seed.h);
  const radius = useSharedValue(geo.height / 2);
  const opacity = useSharedValue(0);
  const open = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const press = useSharedValue(0);
  const kick = useSharedValue(0);
  const glow = useSharedValue(0);
  const split = useSharedValue(0);
  useEffect(() => {
    if (theme.glow && !reduced) glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [theme.glow, reduced]);

  /** A quick swell when something happens, so the eye catches it. */
  const pop = () => {
    if (reduced) return;
    kick.value = withSequence(withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(0, { duration: 600, dampingRatio: 0.45 }));
  };
  useEffect(() => { if (entry.key) pop(); }, [entry.key]);

  const to = (v: number, opts?: { dampingRatio?: number }) => (spring ? withSpring(v, { ...spring, ...(opts?.dampingRatio ? { damping: 2 * Math.sqrt(spring.stiffness) * opts.dampingRatio } : null) }) : withTiming(v, { duration: 0 }));
  const fade = (v: number, delay = 0, duration = 200) => (reduced ? withTiming(v, { duration: 0 }) : withDelay(delay, withTiming(v, { duration })));

  useEffect(() => {
    if (!compact.width) return;
    if (leaving) {
      w.value = to(seed.w, { dampingRatio: 1 });
      h.value = to(seed.h, { dampingRatio: 1 });
      radius.value = to(seed.h / 2);
      opacity.value = fade(0, 120, 220);
      open.value = fade(0, 0, 120);
      return;
    }
    const targetW = isOpen ? geo.expandedWidth : Math.min(geo.expandedWidth, Math.max(compact.width, geo.gap + 2 * rowHeight));
    // Header padding + gap above the body + body + bottom margin.
    const targetH = isOpen ? rowHeight + OPEN_TOP * 2 + bodyHeight + OPEN_BOTTOM : rowHeight;
    w.value = to(targetW);
    h.value = to(targetH);
    radius.value = to(isOpen ? theme.radius : rowHeight / 2);
    opacity.value = fade(1);
    // Content follows the shape: it arrives as the island finishes growing and leaves before it shrinks.
    open.value = isOpen ? fade(1, 90, 260) : fade(0, 0, 130);
  }, [compact, bodyHeight, isOpen, leaving, geo.expandedWidth, rowHeight]);

  const showBubble = !!bubble && !isOpen && !leaving;
  useEffect(() => { split.value = reduced ? (showBubble ? 1 : 0) : withSpring(showBubble ? 1 : 0, { duration: 800, dampingRatio: 0.62 }); }, [showBubble]);

  const islandStyle = useAnimatedStyle(() => {
    const pull = Math.max(0, dragY.value);
    const squeeze = Math.min(0, dragY.value);
    return {
      // Pulling down stretches the island like something elastic; pushing up shrinks it.
      width: w.value + pull * 0.35 + kick.value * 14,
      height: h.value + pull * 0.45 + squeeze * 0.2 + kick.value * 3,
      borderRadius: radius.value,
      opacity: opacity.value,
      borderColor: theme.glow ? interpolateColor(glow.value, [0, 1], [theme.border, theme.glow]) : theme.material === 'glass' ? 'rgba(255,255,255,0.22)' : theme.border,
      borderWidth: theme.glow ? 1.5 : theme.material === 'glass' ? 1 : StyleSheet.hairlineWidth,
      transform: [{ translateX: dragX.value }, { scale: 1 - press.value * 0.035 }],
    };
  });
  const bodyStyle = useAnimatedStyle(() => ({ opacity: open.value, transform: [{ translateY: (1 - open.value) * -10 }, { scale: 0.94 + open.value * 0.06 }] }));
  const trailingStyle = useAnimatedStyle(() => ({ opacity: 1 - open.value, transform: [{ scale: 1 - open.value * 0.3 }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: open.value }));

  // The second activity splits off as a round bubble, pinching a liquid neck as it goes.
  const bubbleSize = rowHeight;
  const bubbleStyle = useAnimatedStyle(() => ({
    left: geo.width / 2 + w.value / 2 + 6 - (1 - split.value) * (bubbleSize + 6),
    opacity: split.value > 0.02 ? 1 : 0,
    transform: [{ scale: 0.55 + 0.45 * split.value }],
  }));
  const neckStyle = useAnimatedStyle(() => {
    const s = split.value;
    const neck = bubbleSize * 0.62 * Math.max(0, 1 - s * 1.25);
    return { left: geo.width / 2 + w.value / 2 - bubbleSize * 0.4, height: neck, top: geo.top + (bubbleSize - neck) / 2, opacity: s > 0.02 && neck > 1 ? 1 : 0 };
  });

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 || Math.abs(g.dx) > 12,
    onPanResponderGrant: () => { press.value = withSpring(0); },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > Math.abs(g.dy)) dragX.value = Math.max(-60, Math.min(60, g.dx)) * 0.3;
      else dragY.value = Math.max(-60, Math.min(90, g.dy)) * (g.dy > 0 ? 0.6 : 0.4);
    },
    onPanResponderRelease: (_, g) => {
      dragX.value = withSpring(0, { duration: 500, dampingRatio: 0.6 });
      dragY.value = withSpring(0, { duration: 500, dampingRatio: 0.6 });
      gesture.current(g.dx, g.dy);
    },
    onPanResponderTerminate: () => {
      dragX.value = withSpring(0);
      dragY.value = withSpring(0);
    },
  }), []);
  // The responder is created once; its decisions read the latest render through this ref.
  const gesture = useRef((_dx: number, _dy: number) => {});
  gesture.current = (dx, dy) => {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (isOpen && stack.length && dx > 0) return ctx.onAction('back');
      if (!isOpen && bubble) { haptic.tap(); return focus(bubble.id); }
      return;
    }
    if (dy > 24 && hasBody && !isOpen) go(true);
    else if (dy < -24 && isOpen) go(false);
  };

  const onHeaderPress = () => {
    if (!isOpen && hasBody) return go(true);
    const link = entry.template.link;
    if (link) Linking.openURL(link).catch(() => {});
    go(false);
  };

  const compactRow = (header: boolean) => (
    <View style={[styles.compactRow, { minHeight: rowHeight }]}>
      {entry.template.compact.leading ? <Node node={entry.template.compact.leading} ctx={ctx} inRow /> : null}
      <View style={{ minWidth: geo.gap, flexGrow: 1 }} />
      {entry.template.compact.trailing ? (
        // Expanded keeps only the leading mark as a header: the body restates the value, larger.
        <Animated.View style={header ? trailingStyle : undefined}><Node node={entry.template.compact.trailing} ctx={ctx} inRow /></Animated.View>
      ) : null}
    </View>
  );
  const body = bodyNode ? <Node node={bodyNode} ctx={ctx} /> : null;
  const bubbleTheme = bubble ? themeOf(bubble.template.theme, base, scheme) : theme;
  const bubbleNode = bubble ? bubble.template.minimal ?? bubble.template.compact.leading : undefined;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
      {dim ? (
        <Animated.View pointerEvents={isOpen ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => go(false)} accessibilityLabel="Collapse the island" />
        </Animated.View>
      ) : null}

      {/* Off-screen copies measure natural sizes; the visible island animates between them. */}
      <View pointerEvents="none" style={styles.measure}>
        <View style={{ alignSelf: 'flex-start' }} onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCompact({ width: Math.ceil(width), height: Math.ceil(height) });
        }}>{compactRow(false)}</View>
        <View style={{ width: geo.expandedWidth - OPEN_INSET * 2 }} onLayout={(e) => setBodyHeight(Math.ceil(e.nativeEvent.layout.height))}>{body}</View>
      </View>

      {bubble && bubbleNode ? (
        <>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: bubbleSize, borderRadius: bubbleSize / 2, backgroundColor: bubbleTheme.background }, neckStyle]} />
          <Animated.View style={[styles.bubble, { top: geo.top, width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2, borderColor: bubbleTheme.border }, bubbleStyle]}>
            <Surface theme={bubbleTheme} open={{ value: 0 }} />
            <Pressable onPress={() => { haptic.tap(); focus(bubble.id); }} accessibilityRole="button" accessibilityLabel="Switch to the other live activity" style={styles.center}>
              <Node node={bubbleNode} ctx={{ ...ctx, state: bubble.state, theme: bubbleTheme }} inRow />
            </Pressable>
          </Animated.View>
        </>
      ) : null}

      <Animated.View {...pan.panHandlers} style={[styles.island, { top: geo.top }, islandStyle]}>
        <Surface theme={theme} open={open} live={isOpen} />
        <Pressable
          onPress={onHeaderPress}
          onPressIn={() => { if (!isOpen) press.value = withSpring(1, { duration: 180, dampingRatio: 1 }); }}
          onPressOut={() => { press.value = withSpring(0, { duration: 500, dampingRatio: 0.45 }); }}
          onLongPress={() => hasBody && go(true)}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityHint={hasBody ? (isOpen ? 'Collapses the island' : 'Expands the island') : undefined}
          style={{ width: '100%', paddingHorizontal: isOpen ? OPEN_INSET - ROW_PAD : 0, paddingTop: isOpen ? OPEN_TOP : 0 }}
        >
          <Animated.View key={entry.id} entering={FadeIn.duration(240).delay(60)} exiting={FadeOut.duration(120)}>{compactRow(true)}</Animated.View>
        </Pressable>
        {isOpen || bodyHeight ? (
          <Animated.View pointerEvents={isOpen ? 'box-none' : 'none'} style={[{ width: geo.expandedWidth - OPEN_INSET * 2, alignSelf: 'center', marginTop: OPEN_TOP }, bodyStyle]}>
            <Animated.View key={`${entry.id}:${screen ?? ''}`} entering={reduced ? undefined : screenIn(dir)} exiting={reduced ? undefined : screenOut(dir)}>
              {body}
            </Animated.View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * A static island for galleries, docs and design reviews — same renderer, no live activity.
 * `expanded` shows the expanded layout (or `screen`); otherwise the compact pill. Inputs and
 * navigation work locally, so a gallery card is playable.
 */
export function IslandPreview({ template, state: initial = {}, expanded = false, screen: first, theme: base, onAction }: { template: IslandTemplate; state?: IslandState; expanded?: boolean; screen?: string; theme?: IslandTheme; onAction?: (action: string, state: IslandState) => void }) {
  const scheme = useColorScheme();
  const theme = themeOf(template.theme, base, scheme);
  const [local, setLocal] = useState<IslandState>({});
  const [stack, setStack] = useState<string[]>(first ? [first] : []);
  const state = { ...initial, ...local };
  const ctx: Ctx = {
    state,
    theme,
    still: true,
    touch: () => {},
    set: (patch) => setLocal((s) => ({ ...s, ...patch })),
    onAction: (action) => {
      if (action === 'back') setStack((s) => s.slice(0, -1));
      else if (action.startsWith('go:')) setStack((s) => [...s, action.slice(3)]);
      onAction?.(action, state);
    },
  };
  const name = stack[stack.length - 1];
  const bodyNode = (name && template.screens?.[name]) || template.expanded;
  const open = expanded && !!bodyNode;
  const row = (
    <View style={[styles.compactRow, { minHeight: COMPACT_HEIGHT }, open && { paddingHorizontal: OPEN_INSET, marginTop: OPEN_TOP }]}>
      {template.compact.leading ? <Node node={template.compact.leading} ctx={ctx} inRow /> : null}
      <View style={{ minWidth: 28, flexGrow: 1 }} />
      {template.compact.trailing && !open ? <Node node={template.compact.trailing} ctx={ctx} inRow /> : null}
    </View>
  );
  return (
    <View style={{ borderColor: theme.material === 'glass' ? 'rgba(255,255,255,0.22)' : theme.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: expanded ? theme.radius : 999, alignSelf: expanded ? 'stretch' : 'flex-start', overflow: 'hidden' }}>
      <Surface theme={theme} open={{ value: open ? 1 : 0 }} />
      {row}
      {open ? (
        <Animated.View key={name ?? ''} entering={FadeIn.duration(220)} style={{ paddingHorizontal: OPEN_INSET, paddingTop: OPEN_TOP, paddingBottom: OPEN_BOTTOM }}>
          <Node node={bodyNode!} ctx={ctx} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  island: { position: 'absolute', alignSelf: 'center', overflow: 'hidden' },
  bubble: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_PAD },
  measure: { position: 'absolute', top: -10000, left: 0, opacity: 0 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  button: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});

// endregion

// Screen size for lookAt() callers that don't have it handy.
export const screenSize = () => Dimensions.get('window');
