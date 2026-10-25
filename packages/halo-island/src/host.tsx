// HOST v2 READY — in-app renderer: JS-drawn graphics, screens, inputs, pet, glass, bubble.
import { requireNativeView } from 'expo';
import { ComponentRef, ComponentType, ReactNode, RefObject, createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Dimensions, Image, Linking, PanResponder, Platform, Pressable, StatusBar, StyleSheet, Text, TextStyle as RNTextStyle, View, ViewStyle, useColorScheme, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, cancelAnimation, interpolate, interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Arc, Bars, Icon, Pet, Quiet, Ring, Sky, Sparkline, Timeline, alpha, clamp, useQuiet } from './graphics';
import { placeIsland } from './geometry';
import { Active, AssetSource, Cutout, emitAction, focus, native, nativeJson, resolveAsset, setState, springOf, store } from './island';
import { DEFAULT_THEME, Effect, IslandNode, IslandState, IslandTemplate, IslandTheme, Motion, Num, TextStyle, fill, fontFor, num, nums, on, resolveTheme, tracking, visible } from './spec';

// region Optional modules — each is used only when the app already ships it.

function optional<T>(load: () => T): T | null {
  try { return load(); } catch { return null; }
}

/** Rive needs the native module (Android). Everything else here is drawn in JS. */
const NativeGraphic = native ? optional(() => requireNativeView<{ spec: string; style?: ViewStyle }>('HaloGraphic')) : null;
const LottieView = optional(() => require('lottie-react-native').default as ComponentType<{ source: object | number; autoPlay?: boolean; loop?: boolean; speed?: number; resizeMode?: string; style?: ViewStyle }>);
type RiveHandle = { fireState(stateMachine: string, input: string): void; setInputState(stateMachine: string, input: string, value: number | boolean): void };
const RiveView = optional(() => require('rive-react-native').default as ComponentType<{ ref?: React.Ref<RiveHandle>; source?: number | { uri: string }; url?: string; artboardName?: string; stateMachineName?: string; autoplay?: boolean; fit?: string; style?: ViewStyle }>);
const Haptics = optional(() => require('expo-haptics') as typeof import('expo-haptics'));
const Blur = optional(() => require('expo-blur').BlurView as ComponentType<{ intensity?: number; tint?: string; blurTarget?: RefObject<ComponentRef<typeof View> | null>; blurMethod?: string; style?: ViewStyle }>);
/** Android blurs only what's inside a BlurTargetView; the host gets that view's ref. */
let blurTarget: RefObject<ComponentRef<typeof View> | null> | undefined;
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
  /** Critically damped motion: controls settle without rebounding. */
  calm?: boolean;
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
    case 'stack': {
      const s = node.style ?? {};
      // The first child sets the size; the rest sit centered on top of it.
      return (
        <View style={{ alignItems: 'center', justifyContent: 'center', padding: s.padding, backgroundColor: s.background, borderRadius: s.radius, width: s.width, height: s.height, opacity: s.opacity }}>
          {node.children.map((child, i) => (
            <View key={i} style={i === 0 ? undefined : [StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">
              <Node node={child} ctx={ctx} />
            </View>
          ))}
        </View>
      );
    }
    case 'text': {
      const value = fill(node.text, state);
      // Colors may come from state too ('{tone}': green, then amber when credits run low).
      const style = textStyle(node.style?.color ? { ...node.style, color: fill(node.style.color, state) } : node.style, theme);
      if (!node.style?.mono) return <Text style={style} numberOfLines={node.style?.lines ?? 1} maxFontSizeMultiplier={1.3}>{value}</Text>;
      return <Rolling value={value} style={style} />;
    }
    case 'icon':
      return <Icon name={node.name ? fill(node.name, state) : undefined} path={node.path} viewBox={node.viewBox} stroke={node.stroke} size={node.size ?? 18} width={node.width} color={node.color ?? theme.foreground} />;
    case 'image': {
      const size = node.size ?? 32;
      const uri = fill(node.uri, state);
      const box = { width: node.width ?? size, height: size, borderRadius: node.radius ?? 8 };
      // An empty uri is a placeholder slot (e.g. a result that hasn't arrived yet).
      if (!uri) return <Shimmer style={box} />;
      const source = imageSource(resolveAsset(uri));
      const img = <Animated.Image key={uri} entering={FadeIn.duration(400)} source={source} style={box} resizeMode={node.fit ?? 'cover'} />;
      // Android's blurRadius frosts the whole box grey instead of bleeding color, so no glow there.
      if (!node.glow || Platform.OS === 'android') return img;
      // Ambient light: a blurred, enlarged copy bleeds the artwork's color into the black.
      return (
        <View>
          <Image source={source} blurRadius={24} style={[box, StyleSheet.absoluteFill, { opacity: 0.8, transform: [{ scale: 1.7 }] }]} />
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
      return <Track value={num(node.value, state)} marker={node.marker ? fill(node.marker, state) : ''} end={node.end ? fill(node.end, state) : ''} markerSize={node.markerSize} flip={node.flip} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} puck={theme.material === 'glass' ? 'transparent' : theme.background} grow={inRow} />;
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
      return <Arc value={num(node.value, state)} height={node.height ?? 64} thickness={node.thickness ?? 5} colors={node.colors?.length ? node.colors : [theme.accent]} track={node.track ?? alpha(theme.foreground, 0.2)} glow={node.glow ?? true} markerSize={node.markerSize ?? 28}
        marker={node.marker ? <Mark name={fill(node.marker, state)} size={node.markerSize ?? 28} color={theme.foreground} /> : undefined} />;
    case 'timeline':
      return <View style={{ flexGrow: inRow ? 1 : undefined, alignSelf: 'stretch' }}><Timeline value={num(node.value, state)} icons={node.icons.map((i) => fill(i, state))} size={node.size ?? 30} color={node.color ?? theme.accent} track={node.track ?? alpha(theme.foreground, 0.14)} ink={node.ink ?? theme.background} /></View>;
    case 'sky':
      return <Sky condition={fill(node.condition, state)} size={node.size ?? 72} />;
    case 'pet':
      return <Pet mood={node.mood ? fill(node.mood, state) : 'idle'} size={node.size ?? 22} color={node.color ?? theme.foreground} cheeks={node.cheeks ?? '#FF7AB6'} still={ctx.still} />;
    case 'lottie': {
      const size = node.size ?? 28;
      if (!LottieView) return null;
      const src = resolveAsset(fill(node.uri, state));
      // Keyed by source so swapping animations restarts cleanly instead of blending frames.
      return <LottieView key={fill(node.uri, state)} source={typeof src === 'string' ? { uri: src } : src} autoPlay loop={node.loop ?? true} speed={node.speed} resizeMode="contain" style={{ width: node.width ?? size, height: size }} />;
    }
    case 'rive':
      if (RiveView) return <RiveNode node={node} state={state} />;
      if (!NativeGraphic) return null;
      return <NativeGraphic spec={nativeJson({ node, theme, state })} style={{ width: node.width ?? node.size ?? 40, height: node.size ?? 40 }} />;
    case 'timer':
      return <Timer to={num(node.to, state)} countUp={node.countUp} style={textStyle(node.style?.color ? { ...node.style, color: fill(node.style.color, state) } : node.style, theme)} />;
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

function imageSource(src: AssetSource) {
  return typeof src === 'string' ? { uri: src } : (src as number);
}

type RiveNodeT = Extract<IslandNode, { type: 'rive' }>;

/** A Rive file whose state machine follows the island's state: triggers fire on change, inputs track values. */
function RiveNode({ node, state }: { node: RiveNodeT; state: IslandState }) {
  const ref = useRef<RiveHandle>(null);
  const size = node.size ?? 40;
  const src = resolveAsset(fill(node.uri, state));
  const trigger = node.trigger ? fill(node.trigger, state) : '';
  const lastTrigger = useRef(trigger);
  useEffect(() => {
    if (!node.stateMachine || !trigger || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    // The filled value is the trigger's name: '{event}' with event 'honk' fires 'honk'.
    ref.current?.fireState(node.stateMachine, trigger);
  }, [trigger]);
  const inputs = Object.entries(node.inputs ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? v : typeof v === 'string' && /^\{\w+\}$/.test(v) && typeof state[v.slice(1, -1)] === 'boolean' ? state[v.slice(1, -1)] as boolean : num(v as Num, state)] as const);
  useEffect(() => {
    if (!node.stateMachine) return;
    for (const [k, v] of inputs) ref.current?.setInputState(node.stateMachine, k, v);
  }, [JSON.stringify(inputs)]);
  const source = typeof src === 'number' ? { source: src } : typeof src === 'string' ? { url: src } : null;
  if (!source || !RiveView) return null;
  return <RiveView ref={ref} {...source} artboardName={node.artboard} stateMachineName={node.stateMachine} autoplay fit="contain" style={{ width: node.width ?? size, height: size }} />;
}

const gradient = (colors?: string[]) => (colors && colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : undefined);

const flex = (v: string) => (v === 'start' ? 'flex-start' : v === 'end' ? 'flex-end' : v) as 'flex-start';

function textStyle(s: TextStyle | undefined, theme: Theme): RNTextStyle {
  const family = (s?.font === 'monospace' && Platform.OS === 'ios' ? 'Menlo' : s?.font) ?? fontFor(theme.fonts, s?.weight ?? 'medium');
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

/** Press feedback for anything tappable inside the island: springy, or settled when `calm`. */
function usePress(scale = 0.94, calm = false) {
  const p = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - scale) * p.value }] }));
  return {
    style,
    onPressIn: () => { p.value = withSpring(1, { duration: 160, dampingRatio: 1 }); },
    onPressOut: () => { p.value = withSpring(0, { duration: 380, dampingRatio: calm ? 1 : 0.5 }); },
  };
}

/**
 * Depth for a filled control, so it reads as an object rather than a flat shape: light falling from
 * above, a lit hairline rim, and (when solid) a soft glow of its own color underneath.
 */
function depth(color: string, tinted: boolean): ViewStyle {
  return tinted
    ? {
        backgroundColor: alpha(color, 0.2),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: alpha(color, 0.42),
        experimental_backgroundImage: `linear-gradient(180deg, ${alpha(color, 0.2)}, ${alpha(color, 0)} 75%)`,
      }
    : {
        backgroundColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.3)',
        experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.26), rgba(255,255,255,0) 50%, rgba(0,0,0,0.12))',
        boxShadow: `0 6px 16px -4px ${alpha(color, 0.55)}`,
      };
}

type ButtonNode = Extract<IslandNode, { type: 'button' }>;

function Button({ node, ctx }: { node: ButtonNode; ctx: Ctx }) {
  const { state, theme } = ctx;
  const [armed, setArmed] = useState(false);
  const press = usePress(node.shape === 'tile' ? 0.9 : 0.94, ctx.calm);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  const base = node.color ?? theme.accent;
  const tinted = node.tint && !armed;
  const ink = armed ? theme.background : node.textColor ?? (node.tint ? base : theme.background);
  const fillColor = tinted ? alpha(base, 0.22) : base;
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
          {/* A 3D object sits on a lit, tinted glass squircle; a glyph sits on a solid one. */}
          <View style={icon && isAsset(icon)
            ? { width: 54, height: 54, borderRadius: 17, backgroundColor: alpha(base, 0.2), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(base, 0.45), alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: `linear-gradient(160deg, ${alpha('#FFFFFF', 0.16)}, ${alpha('#FFFFFF', 0)} 55%)` }
            : { width: 52, height: 52, borderRadius: 16, backgroundColor: fillColor, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: tinted ? undefined : `linear-gradient(160deg, ${alpha('#FFFFFF', 0.28)}, ${alpha('#FFFFFF', 0)} 60%)` }}>
            {icon ? <Mark name={icon} size={isAsset(icon) ? 34 : 26} color={tinted ? base : node.textColor ?? '#FFFFFF'} /> : null}
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
        style={[styles.button, circle && !armed ? { width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, alignSelf: 'center' } : { paddingHorizontal: 18 }, depth(base, !!tinted), press.style]}
      >
        {icon && !armed ? <Mark name={icon} size={isAsset(icon) ? (circle ? 26 : 22) : circle ? 20 : 17} color={ink} /> : null}
        {label ? <Animated.Text key={label} entering={FadeIn.duration(200)} style={textStyle({ weight: 'semibold', color: ink, size: 15 }, theme)} numberOfLines={1}>{label}</Animated.Text> : null}
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
    // A recessed track with a lit knob riding in it.
    <View style={{ flexDirection: 'row', alignSelf: 'stretch', backgroundColor: alpha(ctx.theme.foreground, 0.06), borderRadius: 18, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(ctx.theme.foreground, 0.08), experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0) 60%)' }}>
      <Animated.View style={[{ position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 15, boxShadow: `0 2px 10px ${alpha(color, 0.3)}` }, depth(color, true), knob]} />
      {node.options.map((option, i) => fill(option, ctx.state)).map((label, i) => (
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
  const press = usePress(0.93, ctx.calm);
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
  const quiet = useQuiet();
  useEffect(() => {
    if (quiet) return;
    t.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(t);
  }, [quiet]);
  const a = useAnimatedStyle(() => ({ opacity: 0.06 + t.value * 0.08 }));
  return <Animated.View style={[style, { backgroundColor: '#FFFFFF' }, a]} />;
}

/** Looping motion. Each effect is one Reanimated loop; reduced motion turns them all off. */
function Loop({ effect, children }: { effect: Effect; children: ReactNode }) {
  const reduced = useQuiet();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const easing = Easing.inOut(Easing.quad);
    t.value = effect === 'spin'
      ? withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1)
      : effect === 'wiggle'
        ? withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 140 }), withTiming(1, { duration: 140 }), withTiming(0, { duration: 70 }), withDelay(1400, withTiming(0, { duration: 0 }))), -1)
        : withRepeat(withTiming(1, { duration: effect === 'bounce' ? 420 : 900, easing }), -1, true);
    return () => cancelAnimation(t);
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

const isAsset = (name: string) => resolveAsset(name) !== name || /^(https?|file|data):/.test(name);

/** A registered asset (3D image or Lottie) or a built-in icon, at a size. */
function Mark({ name, size, color }: { name: string; size: number; color: string }) {
  const src = resolveAsset(name);
  if (src === name && !/^(https?|file|data):/.test(name)) return <Icon name={name} size={size} color={color} />;
  if (typeof src === 'object' && LottieView) return <LottieView source={src} autoPlay loop resizeMode="contain" style={{ width: size, height: size }} />;
  return <Image source={imageSource(src)} style={{ width: size, height: size }} resizeMode="contain" />;
}

/**
 * A bar with a marker riding on it — a scooter on its way to your door. The marker eases to each
 * new value and, when it's an object rather than an icon, bobs gently as if it were moving.
 */
function Track({ value, marker, end, markerSize, flip, height, color, track, puck, grow }: { value: number; marker: string; end: string; markerSize?: number; flip?: boolean; height: number; color: string; track: string; puck: string; grow?: boolean }) {
  const p = useSharedValue(clamp(value));
  const bob = useSharedValue(0);
  const reduced = useQuiet();
  const [width, setWidth] = useState(0);
  const isAsset = !!marker && resolveAsset(marker) !== marker;
  const m = markerSize ?? (isAsset ? 30 : 18);
  const endSize = end ? Math.round(m * 0.8) : 0;
  useEffect(() => { p.value = withSpring(clamp(value), { duration: 1400, dampingRatio: 0.85 }); }, [value]);
  useEffect(() => {
    if (isAsset && !reduced && value < 1) bob.value = withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 260 })), -1);
    else bob.value = withTiming(0);
  }, [isAsset, reduced, value >= 1]);
  const run = Math.max(0, width - m - endSize);
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * run }, { translateY: -bob.value * 1.5 }, { rotate: `${-bob.value * 2}deg` }, { scaleX: flip ? -1 : 1 }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: p.value * run + m / 2 }));
  return (
    <View style={{ height: Math.max(24, m + 4), justifyContent: 'center', flexGrow: grow ? 1 : undefined, alignSelf: grow ? undefined : 'stretch' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden', marginRight: endSize ? endSize / 2 : 0 }}>
        <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color, experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0) 70%)' }, fillStyle]} />
      </View>
      {end ? <View style={{ position: 'absolute', right: 0 }}><Mark name={end} size={endSize} color={color} /></View> : null}
      {marker ? (
        <Animated.View style={[{ position: 'absolute', left: 0, width: m, alignItems: 'center' }, !isAsset && { height: m + 8, justifyContent: 'center', borderRadius: (m + 8) / 2, backgroundColor: puck }, markerStyle]}>
          <Mark name={marker} size={m} color={color} />
        </Animated.View>
      ) : (
        <Animated.View style={[{ position: 'absolute', left: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 3, borderColor: '#000' }, markerStyle]} />
      )}
    </View>
  );
}

/** A paused preview: loops stop and timers hold their value. */
const Paused = createContext(false);

function Timer({ to, countUp, style }: { to: number; countUp?: boolean; style: RNTextStyle }) {
  const [now, setNow] = useState(Date.now);
  const paused = useContext(Paused);
  useEffect(() => {
    if (!Number.isFinite(to) || paused) return;
    // Tick on the second boundary of `to`, so every timer on screen flips together and on time.
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      t = setTimeout(tick, 1000 - (((n - to) % 1000) + 1000) % 1000 + 5);
    };
    tick();
    return () => clearTimeout(t);
  }, [to, paused]);
  return <Rolling value={clock(countUp ? now - to : to - now)} style={style} />;
}

/**
 * Text whose digits roll independently, like iOS's numeric content transition: only the digits
 * that change move, up when the number grows and down when it shrinks.
 */
function Rolling({ value, style }: { value: string; style: RNTextStyle }) {
  const prev = useRef(value);
  const up = useRef(true);
  if (prev.current !== value) {
    const a = parseFloat(prev.current.replace(/[^0-9.-]/g, ''));
    const b = parseFloat(value.replace(/[^0-9.-]/g, ''));
    up.current = !(Number.isFinite(a) && Number.isFinite(b)) || b >= a;
    prev.current = value;
  }
  const chars = [...value];
  const text = [style, { fontVariant: ['tabular-nums' as const] }];
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={value}>
      {chars.map((c, i) => (
        // Keyed from the right, so 10 → 9 keeps the ones digit in its slot.
        <Digit key={chars.length - i} char={c} up={up.current} style={text} />
      ))}
    </View>
  );
}

function Digit({ char, up, style }: { char: string; up: boolean; style: RNTextStyle[] }) {
  const size = StyleSheet.flatten(style)?.fontSize ?? 14;
  const h = Math.round(size * 1.22);
  const [pair, setPair] = useState({ prev: char, cur: char, up, n: 0 });
  // Derived during render, so the new digit never paints before its roll starts.
  if (char !== pair.cur) setPair({ prev: pair.cur, cur: char, up, n: pair.n + 1 });
  const text = [...style, { lineHeight: h }];
  if (!/[0-9]/.test(char) && !/[0-9]/.test(pair.prev)) return <Text style={text} maxFontSizeMultiplier={1.3}>{char}</Text>;
  return (
    <View style={{ height: h, overflow: 'hidden' }}>
      <Roll key={pair.n} prev={pair.prev} cur={pair.cur} up={pair.up} animate={pair.n > 0} h={h} text={text} />
    </View>
  );
}

/** One change of one digit. Mounted per change, so its progress starts at 0 on the first frame. */
function Roll({ prev, cur, up, animate, h, text }: { prev: string; cur: string; up: boolean; animate: boolean; h: number; text: RNTextStyle[] }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => { if (t.value < 1) t.value = withSpring(1, { duration: 340, dampingRatio: 0.9 }); }, []);
  // Growing numbers roll up (new digit from below), shrinking ones roll down.
  const d = up ? 1 : -1;
  const incoming = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * h * d }] }));
  const outgoing = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateY: -t.value * h * d }] }));
  return (
    <>
      {prev !== cur ? <Animated.Text style={[text, styles.ghost, outgoing]} maxFontSizeMultiplier={1.3}>{prev}</Animated.Text> : null}
      <Animated.Text style={[text, incoming]} maxFontSizeMultiplier={1.3}>{cur}</Animated.Text>
    </>
  );
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
          : Blur && (Platform.OS !== 'android' || blurTarget) ? (
            <>
              <Blur intensity={Platform.OS === 'android' ? 40 : 60} tint="dark" blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,14,18,0.42)' }]} />
            </>
          ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,30,0.88)' }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, experimental_backgroundImage: gradient(theme.gradient) }]} />
      )}
      {glass ? (
        // Lit from above, a faint refraction along the bottom: the edge reads as a thick lens.
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02) 38%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.07))' }]} />
      ) : null}
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
function useGeometry(placement: Placement, pill = COMPACT_HEIGHT) {
  const { width, height: screenH } = useWindowDimensions();
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const wrap = placement === 'cutout' || (placement === 'auto' && Platform.OS === 'ios');
  // Re-read on every size change: rotation, fold/unfold and split screen all move the camera.
  useEffect(() => { setCutout(wrap ? native?.getCutout() ?? iosIsland(width, screenH) : null); }, [wrap, width, screenH]);
  const placed = placeIsland({
    hole: cutout,
    screenWidth: width,
    // `cutout` means the app hides the status bar: with no camera to wrap, the island goes to the
    // top edge, clear of any cutout's safe inset (a corner camera), like a phone without a notch.
    statusBar: placement === 'cutout' && Platform.OS === 'android' ? 0 : Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 50,
    safeTop: cutout?.safeTop,
    pill,
  });
  return { ...placed, cutout: placed.hole, expandedWidth: Math.min(width - 16, 400), width };
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
  /**
   * Android glass: wrap your app in expo-blur's `<BlurTargetView ref={target}>` and pass the ref,
   * and `material: 'glass'` blurs what's behind the island (Android 12+). iOS and web need nothing.
   */
  blurTarget?: RefObject<ComponentRef<typeof View> | null>;
  /** Development aid: outlines the camera hole the island detected, for checking new devices. */
  debugCutout?: boolean;
}

/**
 * Renders the active islands inside the app. Mount once at the root, above navigation:
 * `<HaloIslandHost />`.
 */
export function HaloIslandHost({ placement = 'auto', theme, motion, haptics = true, dim = true, blurTarget: target, debugCutout }: HostProps) {
  hapticsOn = haptics;
  blurTarget = target;
  const list = useSyncExternalStore(store.subscribe, store.all, store.all);
  const top = list[list.length - 1] ?? null;
  const [shown, setShown] = useState<Active | null>(top);
  useEffect(() => {
    if (top) return setShown(top);
    const t = setTimeout(() => setShown(null), 450); // let the exit animation finish
    return () => clearTimeout(t);
  }, [top]);
  if (!shown) return null;
  return <Island entry={top ?? shown} leaving={!top} bubble={list.length > 1 ? list[list.length - 2] : null} placement={placement} base={theme} motion={motion} dim={dim} debugCutout={debugCutout} />;
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

function Island({ entry, leaving, bubble, placement, base, motion, dim, debugCutout }: { entry: Active; leaving: boolean; bubble: Active | null; placement: Placement; base?: IslandTheme; motion?: Motion; dim: boolean; debugCutout?: boolean }) {
  const scheme = useColorScheme();
  const theme = themeOf(entry.template.theme, base, scheme);
  const geo = useGeometry(placement, theme.compactHeight);
  const reduced = useReducedMotion();
  const spring = reduced ? null : springOf(motion ?? entry.template.motion);
  /** Near-critical damping: no overshoot anywhere, so flourishes settle instead of jiggling. */
  const calm = !spring || spring.damping / (2 * Math.sqrt(spring.stiffness)) >= 0.95;
  const [expanded, setExpanded] = useState(!!entry.options.expanded);
  const [stack, setStack] = useState<string[]>([]);
  const [dir, setDir] = useState(1);
  const [compact, setCompact] = useState({ width: 0, height: 0 });
  const [sides, setSides] = useState({ l: 0, r: 0 });
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
    calm,
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

  // Born from the camera hole (or a dot) and shrinks back into it: always a pill, never taller
  // than wide, whatever shape a device reports.
  const seed = geo.seed;
  const w = useSharedValue(seed.w);
  const h = useSharedValue(seed.h);
  const radius = useSharedValue(geo.height / 2);
  const opacity = useSharedValue(0);
  /** Open progress of the shape, 0..1, one per axis. Everything inside is keyed to these, never to its
   *  own timer, so content can't run ahead of the shape or blink out before it moves. */
  const down = useSharedValue(0);
  const across = useSharedValue(0);
  // The body arrives between 30% and 85% of the drop; closing plays the same keys backwards, so it is
  // drawn back into the pill while the pill can still hold it.
  const open = useDerivedValue(() => interpolate(down.value, [0.3, 0.85], [0, 1], 'clamp'));
  // The compact trailing value is gone once the island has widened 40%, and returns over the last 40%.
  const hide = useDerivedValue(() => interpolate(across.value, [0, 0.4], [0, 1], 'clamp'));
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
    kick.value = calm
      ? withSequence(withTiming(0.3, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 280, easing: Easing.inOut(Easing.quad) }))
      : withSequence(withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(0, { duration: 600, dampingRatio: 0.45 }));
  };
  useEffect(() => { if (entry.key) pop(); }, [entry.key]);

  // `quick`: 1.4x stiffer at the same damping ratio, so one axis leads without changing character.
  const to = (v: number, opts?: { dampingRatio?: number; quick?: boolean }) => {
    if (!spring) return withTiming(v, { duration: 0 });
    const stiffness = spring.stiffness * (opts?.quick ? 1.4 : 1);
    const ratio = opts?.dampingRatio ?? spring.damping / (2 * Math.sqrt(spring.stiffness));
    // `mass: 1`: Reanimated defaults it to 4, which would make every preset twice as slow and far bouncier.
    return withSpring(v, { ...spring, mass: 1, stiffness, damping: 2 * Math.sqrt(stiffness) * ratio });
  };
  const fade = (v: number, delay = 0, duration = 200) => (reduced ? withTiming(v, { duration: 0 }) : withDelay(delay, withTiming(v, { duration })));

  useEffect(() => {
    if (!compact.width) return;
    if (leaving) {
      w.value = to(seed.w, { dampingRatio: 1 });
      h.value = to(seed.h, { dampingRatio: 1, quick: true });
      radius.value = to(seed.h / 2);
      opacity.value = fade(0, 120, 220);
      down.value = to(0, { dampingRatio: 1, quick: true });
      across.value = to(0, { dampingRatio: 1 });
      return;
    }
    const targetW = isOpen ? geo.expandedWidth : Math.min(geo.expandedWidth, Math.max(compact.width, geo.gap + 2 * rowHeight));
    // Header padding + gap above the body + body + bottom margin.
    const targetH = isOpen ? rowHeight + OPEN_TOP * 2 + bodyHeight + OPEN_BOTTOM : rowHeight;
    // Opening widens a beat before it deepens; closing lifts the floor first and draws the sides in last.
    w.value = to(targetW, { quick: isOpen });
    h.value = to(targetH, { quick: !isOpen });
    radius.value = to(isOpen ? theme.radius : rowHeight / 2, { quick: !isOpen });
    opacity.value = fade(1);
    down.value = to(isOpen ? 1 : 0, { dampingRatio: 1, quick: !isOpen });
    across.value = to(isOpen ? 1 : 0, { dampingRatio: 1, quick: isOpen });
  }, [compact, bodyHeight, isOpen, leaving, geo.expandedWidth, rowHeight]);

  // A different activity took the island: its content fades in as the shape morphs to it.
  const swap = useSharedValue(1);
  const shownId = useRef(entry.id);
  useEffect(() => {
    if (shownId.current === entry.id) return;
    shownId.current = entry.id;
    swap.value = 0;
    swap.value = reduced ? 1 : withDelay(60, withTiming(1, { duration: 260 }));
  }, [entry.id]);
  const swapStyle = useAnimatedStyle(() => ({ opacity: swap.value, transform: [{ scale: 0.92 + swap.value * 0.08 }] }));

  const showBubble = !!bubble && !isOpen && !leaving;
  useEffect(() => { split.value = reduced ? (showBubble ? 1 : 0) : withSpring(showBubble ? 1 : 0, { duration: 800, dampingRatio: calm ? 1 : 0.62 }); }, [showBubble]);

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
  // Content grows out of the header, anchored at the top, scaling with the shape as it opens.
  const bodyStyle = useAnimatedStyle(() => {
    const d = Math.min(1, Math.max(0, down.value));
    return { opacity: open.value, transformOrigin: 'top', transform: [{ translateY: (1 - d) * -10 }, { scale: 0.86 + d * 0.14 }] };
  });
  const headerStyle = useAnimatedStyle(() => ({
    paddingHorizontal: Math.min(1, Math.max(0, across.value)) * (OPEN_INSET - ROW_PAD),
    paddingTop: Math.min(1, Math.max(0, down.value)) * OPEN_TOP,
  }));
  const trailingStyle = useAnimatedStyle(() => ({ opacity: 1 - hide.value, transform: [{ scale: 1 - hide.value * 0.3 }] }));
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

  // The responder is created once, so it reads the motion style through a ref.
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const settle = () => (calmRef.current ? withSpring(0, { duration: 400, dampingRatio: 1 }) : withSpring(0));
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 || Math.abs(g.dx) > 12,
    onPanResponderGrant: () => { press.value = settle(); },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > Math.abs(g.dy)) dragX.value = Math.max(-60, Math.min(60, g.dx)) * 0.3;
      else dragY.value = Math.max(-60, Math.min(90, g.dy)) * (g.dy > 0 ? 0.6 : 0.4);
    },
    onPanResponderRelease: (_, g) => {
      dragX.value = withSpring(0, { duration: 500, dampingRatio: calmRef.current ? 1 : 0.6 });
      dragY.value = withSpring(0, { duration: 500, dampingRatio: calmRef.current ? 1 : 0.6 });
      gesture.current(g.dx, g.dy);
    },
    onPanResponderTerminate: () => {
      dragX.value = settle();
      dragY.value = settle();
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

  // Around a camera, both sides take the wider side's width so the gap stays centred on the lens,
  // the way iOS lays out leading and trailing around the sensor.
  const side = geo.cutout ? Math.max(sides.l, sides.r) : 0;
  const measureSide = (key: 'l' | 'r') => (e: { nativeEvent: { layout: { width: number } } }) => {
    const width = Math.ceil(e.nativeEvent.layout.width);
    setSides((prev) => (prev[key] === width ? prev : { ...prev, [key]: width }));
  };
  const compactRow = (header: boolean) => (
    <View style={[styles.compactRow, { minHeight: rowHeight }]}>
      {entry.template.compact.leading ? (
        <View style={{ minWidth: side, alignItems: 'flex-start' }}>
          <View onLayout={header ? undefined : measureSide('l')}><Node node={entry.template.compact.leading} ctx={ctx} inRow /></View>
        </View>
      ) : null}
      <View style={{ minWidth: geo.gap, flexGrow: 1 }} />
      {entry.template.compact.trailing ? (
        // Expanded keeps only the leading mark as a header: the body restates the value, larger.
        <Animated.View style={[{ minWidth: side, alignItems: 'flex-end' }, header ? trailingStyle : undefined]}>
          <View onLayout={header ? undefined : measureSide('r')}><Node node={entry.template.compact.trailing} ctx={ctx} inRow /></View>
        </Animated.View>
      ) : null}
    </View>
  );
  const body = bodyNode ? <Node node={bodyNode} ctx={ctx} /> : null;
  const bubbleTheme = bubble ? themeOf(bubble.template.theme, base, scheme) : theme;
  const bubbleNode = bubble ? bubble.template.minimal ?? bubble.template.compact.leading : undefined;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
      {debugCutout && geo.cutout ? (
        <View pointerEvents="none" style={{ position: 'absolute', zIndex: 10000, left: geo.cutout.x, top: geo.cutout.y, width: geo.cutout.width, height: geo.cutout.height, borderWidth: 1, borderColor: '#FF3B30', borderRadius: geo.cutout.height / 2 }} />
      ) : null}
      {dim ? (
        <Animated.View pointerEvents={isOpen ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => go(false)} accessibilityLabel="Collapse the island" />
        </Animated.View>
      ) : null}

      {/* Off-screen copies measure natural sizes; the visible island animates between them. */}
      <View pointerEvents="none" style={styles.measure}>
        <Quiet.Provider value>
        <View style={{ alignSelf: 'flex-start' }} onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCompact({ width: Math.ceil(width), height: Math.ceil(height) });
        }}>{compactRow(false)}</View>
        <View style={{ width: geo.expandedWidth - OPEN_INSET * 2 }} onLayout={(e) => setBodyHeight(Math.ceil(e.nativeEvent.layout.height))}>{body}</View>
        </Quiet.Provider>
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
          onPressOut={() => { press.value = withSpring(0, { duration: 500, dampingRatio: calm ? 1 : 0.45 }); }}
          onLongPress={() => hasBody && go(true)}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityHint={hasBody ? (isOpen ? 'Collapses the island' : 'Expands the island') : undefined}
          style={{ width: '100%' }}
        >
          <Animated.View style={[headerStyle, swapStyle]}>{compactRow(true)}</Animated.View>
        </Pressable>
        {isOpen || bodyHeight ? (
          <Animated.View pointerEvents={isOpen ? 'box-none' : 'none'} style={[{ width: geo.expandedWidth - OPEN_INSET * 2, alignSelf: 'center', marginTop: OPEN_TOP, transformOrigin: 'top' }, bodyStyle]}>
            {/* Screens slide only while open: the reset to the main screen after closing stays still. */}
            <Animated.View key={`${entry.id}:${screen ?? ''}`} entering={reduced || !isOpen ? undefined : screenIn(dir)} exiting={reduced || !isOpen ? undefined : screenOut(dir)}>
              {/* Collapsed, the body is kept for the next open but runs no loops. */}
              <Quiet.Provider value={!isOpen}>{body}</Quiet.Provider>
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
 * navigation work locally, so a gallery card is playable. `paused` stops its loops and timers:
 * pass it for previews scrolled out of view, so a long gallery only animates what's on screen.
 */
export function IslandPreview({ template, state: initial = {}, expanded = false, screen: first, theme: base, paused = false, onAction }: { template: IslandTemplate; state?: IslandState; expanded?: boolean; screen?: string; theme?: IslandTheme; paused?: boolean; onAction?: (action: string, state: IslandState) => void }) {
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
    <View style={[styles.compactRow, { minHeight: ctx.theme.compactHeight }, open && { paddingHorizontal: OPEN_INSET, marginTop: OPEN_TOP }]}>
      {template.compact.leading ? <Node node={template.compact.leading} ctx={ctx} inRow /> : null}
      <View style={{ minWidth: 28, flexGrow: 1 }} />
      {template.compact.trailing && !open ? <Node node={template.compact.trailing} ctx={ctx} inRow /> : null}
    </View>
  );
  return (
    <Paused.Provider value={paused}>
    <Quiet.Provider value={paused}>
    <View style={{ borderColor: theme.material === 'glass' ? 'rgba(255,255,255,0.22)' : theme.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: expanded ? theme.radius : 999, alignSelf: expanded ? 'stretch' : 'flex-start', overflow: 'hidden' }}>
      <Surface theme={theme} open={{ value: open ? 1 : 0 }} />
      {row}
      {open ? (
        <Animated.View key={name ?? ''} entering={FadeIn.duration(220)} style={{ paddingHorizontal: OPEN_INSET, paddingTop: OPEN_TOP, paddingBottom: OPEN_BOTTOM }}>
          <Node node={bodyNode!} ctx={ctx} />
        </Animated.View>
      ) : null}
    </View>
    </Quiet.Provider>
    </Paused.Provider>
  );
}

const styles = StyleSheet.create({
  island: { position: 'absolute', alignSelf: 'center', overflow: 'hidden' },
  bubble: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute', left: 0, right: 0, textAlign: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_PAD },
  measure: { position: 'absolute', top: -10000, left: 0, opacity: 0 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  button: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});

// endregion

// Screen size for lookAt() callers that don't have it handy.
export const screenSize = () => Dimensions.get('window');
