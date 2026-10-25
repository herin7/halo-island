import { DEFAULT_THEME, IslandTemplate, IslandTheme, Motion, Weight } from 'halo-island';

export type Theme = typeof DEFAULT_THEME;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** `color` at `a` opacity. Hex in, hex or rgba out — same rule as the native renderer. */
export function alpha(color: string, a = 0.22) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + Math.round(a * 255).toString(16).padStart(2, '0');
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0');
  return `rgba(255,255,255,${a})`;
}

/** The library's motion presets (island.ts MOTION), as motion/react springs. */
const MOTION = {
  minimal: { stiffness: 300, damping: 35 },
  island: { stiffness: 340, damping: 30 },
  bouncy: { stiffness: 380, damping: 28 },
  snappy: { stiffness: 700, damping: 45 },
  smooth: { stiffness: 260, damping: 32 },
} as const;

export function springOf(motion: Motion | undefined, reduced = false) {
  if (reduced || motion === 'none') return { duration: 0 };
  const s = typeof motion === 'object' ? motion : MOTION[motion ?? 'minimal'];
  return { type: 'spring' as const, stiffness: s.stiffness, damping: s.damping, mass: 1 };
}

export function themeOf(template: IslandTemplate): Theme {
  const { light: _l, dark, ...base } = (template.theme ?? {}) as IslandTheme;
  // The site is dark, so the dark overrides apply.
  const merged = { ...DEFAULT_THEME, ...base, ...dark } as Theme;
  return { ...merged, border: merged.border || alpha(merged.accent, 0.3) };
}

export const WEIGHT: Record<Weight, number> = { regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 };

/**
 * App font names ("Manrope_700Bold", "InstrumentSerif_400Regular_Italic") → a web family. The site
 * self-hosts Manrope, Inter Tight and Instrument Serif; anything else falls back to the system face.
 */
export function familyOf(theme: Theme, font?: string) {
  const name = font ?? Object.values(theme.fonts ?? {}).find(Boolean);
  const fallback = "-apple-system, BlinkMacSystemFont, 'Inter Tight Variable', system-ui, sans-serif";
  if (!name) return fallback;
  const family = name.split('_')[0].replace(/([a-z])([A-Z])/g, '$1 $2');
  return `'${family} Variable', '${family}', ${fallback}`;
}
export const italicOf = (font?: string) => (font && /italic/i.test(font) ? 'italic' : undefined);

export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const gradient = (colors?: string[]) => (colors && colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : undefined);
