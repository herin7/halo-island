/** Halo's few building blocks: cards with a lit top edge, big light numerals, a springy press. */
import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Switch as RNSwitch, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Glyph, glyphPath } from './glyphs';
import { C, F } from './theme';

export const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

export function Press({ onPress, onLongPress, style, outer, children, label }: { onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>; outer?: StyleProp<ViewStyle>; children: ReactNode; label?: string }) {
  const p = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * p.value }] }));
  return (
    <Pressable
      style={outer}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => { p.value = withSpring(1, { duration: 140, dampingRatio: 1 }); }}
      onPressOut={() => { p.value = withSpring(0, { duration: 380, dampingRatio: 0.6 }); }}
      onPress={onPress && (() => { tick(); onPress(); })}
      onLongPress={onLongPress && (() => { tick(); onLongPress(); })}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({ children, style, onPress, onLongPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void; label?: string }) {
  const body = <View style={[s.card, style]}>{children}</View>;
  return onPress || onLongPress ? <Press onPress={onPress} onLongPress={onLongPress} outer={{ flex: 1 }} style={{ flex: 1 }} label={label}>{body}</Press> : body;
}

export function Icon({ name, size, color }: { name: Glyph; size: number; color: string }) {
  const [d, vb] = glyphPath(name);
  return <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}><Path d={d} fill={color} /></Svg>;
}

/** Card heading: a glyph in its color and a quiet label. */
export function Head({ glyph, color, children, right }: { glyph: Glyph; color: string; children: string; right?: ReactNode }) {
  return (
    <View style={s.head}>
      <Icon name={glyph} size={15} color={color} />
      <Text style={s.headText}>{children}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** A big light number with a smaller unit beside it: "6,214 steps". */
export function Big({ value, unit, size = 40, color = C.ink }: { value: string | number; unit?: string; size?: number; color?: string }) {
  return (
    <Text style={[s.big, { fontSize: size, lineHeight: size * 1.1, letterSpacing: -size * 0.035, color }]} numberOfLines={1}>
      {value}{unit ? <Text style={[s.unit, { fontSize: size * 0.42 }]}> {unit}</Text> : null}
    </Text>
  );
}

export const T = ({ children, style, lines }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) => (
  <Text style={[s.text, style]} numberOfLines={lines}>{children}</Text>
);

export function Pill({ label, onPress, color = C.ink, filled }: { label: string; onPress: () => void; color?: string; filled?: boolean }) {
  return (
    <Press onPress={onPress} style={[s.pill, filled ? { backgroundColor: color } : { backgroundColor: color + '1F' }]} label={label}>
      <Text style={[s.pillText, { color: filled ? C.bg : color }]}>{label}</Text>
    </Press>
  );
}

export function Meter({ value, color, height = 4 }: { value: number; color: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: C.fill, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; numeric?: boolean; secure?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, props.style]}>
      <Text style={s.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={C.ink3}
        keyboardType={props.numeric ? 'number-pad' : 'default'}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
      />
    </View>
  );
}

export function Toggle({ title, hint, value, onChange }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.toggleTitle}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <RNSwitch value={value} onValueChange={onChange} trackColor={{ true: C.steps, false: '#3A3A3C' }} thumbColor="#FFFFFF" />
    </View>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <Text style={s.sheetTitle}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 30, padding: 18, gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge, borderTopColor: C.cardLit, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headText: { fontFamily: F.medium, fontSize: 13, color: C.ink2, letterSpacing: -0.1 },
  big: { fontFamily: F.light, color: C.ink, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: F.regular, color: C.ink2, letterSpacing: 0 },
  text: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.ink2 },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.semibold, fontSize: 14, letterSpacing: -0.1 },
  fieldLabel: { fontFamily: F.medium, fontSize: 13, color: C.ink2 },
  input: { height: 48, borderRadius: 14, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 15, color: C.ink, backgroundColor: C.fill },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  toggleTitle: { fontFamily: F.medium, fontSize: 15, color: C.ink },
  hint: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: C.ink3 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#111113', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, paddingBottom: 36, gap: 14, maxHeight: '86%', borderTopWidth: 1, borderColor: C.cardLit },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#3A3A3C', marginTop: -6 },
  sheetTitle: { fontFamily: F.semibold, fontSize: 20, color: C.ink, letterSpacing: -0.4 },
});
