/** Design tokens for the example app: dark, cinematic, one UI family plus a display serif. */
import { Platform } from 'react-native';

export const C = {
  bg: '#05050A',
  ink: '#F5F3EE',
  ink2: 'rgba(245,243,238,0.66)',
  ink3: 'rgba(245,243,238,0.42)',
  line: 'rgba(255,255,255,0.09)',
  card: 'rgba(255,255,255,0.045)',
  cardHi: 'rgba(255,255,255,0.08)',
  violet: '#8B7CFF',
  pink: '#FF5DA2',
  mint: '#4BE3B0',
  amber: '#FFB547',
  sky: '#5AC8FA',
  red: '#FF453A',
  green: '#30D158',
  grey: '#8E8E93',
};

export const F = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  semibold: 'InterTight_600SemiBold',
  bold: 'InterTight_700Bold',
  heavy: 'InterTight_800ExtraBold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }),
};

/** The island's typeface, per weight (Host + previews get it as the base theme). */
export const ISLAND_FONTS = { regular: F.medium, medium: F.medium, semibold: F.semibold, bold: F.bold, heavy: F.heavy };

export const R = { card: 28, pill: 999 };
