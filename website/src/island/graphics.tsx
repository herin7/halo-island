/**
 * Web ports of the library's graphics (packages/halo-island/src/graphics.tsx): same geometry,
 * same springs, same pet eye math — drawn with SVG + motion instead of react-native-svg + Reanimated.
 */
import { ICONS } from '@halo/icons';
import type { Mood } from 'halo-island';
import { AnimatePresence, MotionValue, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { onPointer, pointer } from './look';
import { resolveAsset } from './media';
import { Lottie, Rive } from './players';
import { alpha, clamp } from './util';

/** Element width, kept current. Graphics that span their parent need it for geometry. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.offsetWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// region Icon

export function Icon({ name, path, viewBox = 24, stroke, size = 18, width, color, style }: { name?: string; path?: string; viewBox?: number; stroke?: number; size?: number; width?: number; color: string; style?: CSSProperties }) {
  const d = path ?? (name ? ICONS[name] : undefined);
  const w = width ?? size;
  if (!d) return <span style={{ width: w, height: size, display: 'inline-block', flexShrink: 0 }} />;
  const vbH = w > size ? (viewBox * size) / w : viewBox;
  return (
    <svg width={w} height={size} viewBox={`0 ${(viewBox - vbH) / 2} ${viewBox} ${vbH}`} style={{ flexShrink: 0, display: 'block', ...style }} aria-hidden>
      {stroke ? <path d={d} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <path d={d} fill={color} />}
    </svg>
  );
}

// endregion

// region Ring, bar, steps, track

const VALUE_SPRING = { type: 'spring', visualDuration: 0.6, bounce: 0.15 } as const;

export function Ring({ value, size, thickness, color, track }: { value: number; size: number; thickness: number; color: string; track: string }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} initial={false} animate={{ strokeDashoffset: c * (1 - clamp(value)) }} transition={VALUE_SPRING} />
    </svg>
  );
}

export function Bar({ value, height, color, track, grow }: { value: number; height: number; color: string; track: string; grow?: boolean }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: track, overflow: 'hidden', flexGrow: grow ? 1 : undefined, flexBasis: grow ? 0 : undefined }}>
      <motion.div style={{ height, borderRadius: height / 2, background: color }} initial={false} animate={{ width: `${clamp(value) * 100}%` }} transition={VALUE_SPRING} />
    </div>
  );
}

/** A registered asset (Lottie, Rive, image) or a named icon, at a size. */
export function Mark({ name, size, color }: { name: string; size: number; color: string }) {
  const asset = resolveAsset(name);
  if (!asset) return <Icon name={name} size={size} color={color} />;
  if (asset.kind === 'lottie') return <Lottie src={asset.url} size={size} />;
  if (asset.kind === 'rive') return <Rive src={asset.url} size={size} />;
  return <img src={asset.url} alt="" width={size} height={size} draggable={false} decoding="async" style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />;
}
export const isAsset = (name: string) => !!resolveAsset(name);

/**
 * A bar with a marker riding on it — a scooter on its way to your door. The marker eases to each
 * value and, when it's an object rather than an icon, bobs as if it were moving. `end` waits at
 * the finish line; `flip` mirrors a marker drawn facing left.
 */
export function Track({ value, marker, end, markerSize, flip, height, color, track, puck, grow }: { value: number; marker: string; end: string; markerSize?: number; flip?: boolean; height: number; color: string; track: string; puck: string; grow?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const reduced = useReducedMotion();
  const v = clamp(value);
  const object = !!marker && isAsset(marker);
  const m = markerSize ?? (object ? 30 : 18);
  const endSize = end ? Math.round(m * 0.8) : 0;
  const run = Math.max(0, w - m - endSize);
  const ride = { type: 'spring', visualDuration: 1.2, bounce: 0.12 } as const;
  return (
    <div ref={ref} style={{ height: Math.max(24, m + 4), position: 'relative', display: 'flex', alignItems: 'center', flexGrow: grow ? 1 : undefined, alignSelf: 'stretch' }}>
      <div style={{ height, borderRadius: height / 2, background: track, overflow: 'hidden', flex: 1, marginRight: endSize / 2 }}>
        <motion.div style={{ height, background: color, borderRadius: height / 2 }} initial={false} animate={{ width: v * run + m / 2 }} transition={ride} />
      </div>
      {end ? <span style={{ position: 'absolute', right: 0 }}><Mark name={end} size={endSize} color={color} /></span> : null}
      <motion.div initial={false} animate={{ x: v * run }} transition={ride} style={{ position: 'absolute', left: 0, width: m, display: 'grid', placeItems: 'center', ...(object ? null : { height: m + 8, borderRadius: (m + 8) / 2, background: puck }) }}>
        <span className={object && v < 1 && !reduced ? 'hi-bob' : undefined} style={{ display: 'block', transform: flip ? 'scaleX(-1)' : undefined }}>
          {marker ? <Mark name={marker} size={m} color={color} /> : <span style={{ display: 'block', width: 14, height: 14, borderRadius: 7, background: color, border: '3px solid #000' }} />}
        </span>
      </motion.div>
    </div>
  );
}

// endregion

// region Bars, sparkline, arc

export function Bars({ values, active, height, gap, color, track, live }: { values: number[]; active: number; height: number; gap: number; color: string; track: string; live: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div className="hi-bars" style={{ height, gap }}>
      {values.map((v, i) => (
        <span key={i} className={live && !reduced ? 'hi-wave' : undefined}
          style={{ height: `${clamp(v, 0.06, 1) * 100}%`, minHeight: 3, background: i < active ? color : track, animationDelay: `${-i * 0.2}s` }} />
      ))}
    </div>
  );
}

/** Catmull-Rom through the points as cubic Béziers — same curve as the native sparkline. */
function smooth(xs: number[], ys: number[]) {
  if (!xs.length) return '';
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)], y0 = ys[Math.max(0, i - 1)];
    const x3 = xs[Math.min(xs.length - 1, i + 2)], y3 = ys[Math.min(xs.length - 1, i + 2)];
    d += ` C${xs[i] + (xs[i + 1] - x0) / 6},${ys[i] + (ys[i + 1] - y0) / 6} ${xs[i + 1] - (x3 - xs[i]) / 6},${ys[i + 1] - (y3 - ys[i]) / 6} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

/** Eases from the previous values to the new ones, like the native sparkline. */
function useTween(values: number[]) {
  const [shown, setShown] = useState(values);
  const cur = useRef(values);
  const key = values.join(',');
  useEffect(() => {
    const from = cur.current;
    const to = values;
    const c = animate(0, 1, {
      type: 'spring', visualDuration: 0.8, bounce: 0.1,
      onUpdate: (t) => {
        const next = to.map((v, i) => (from[i] == null ? v : from[i] + (v - from[i]) * t));
        cur.current = next;
        setShown(next);
      },
    });
    return () => c.stop();
  }, [key]);
  return shown;
}

export function Sparkline({ values, height, color, fill, thickness }: { values: number[]; height: number; color: string; fill: boolean; thickness: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const id = useId();
  const v = useTween(values);
  const pad = thickness + 3;
  const xs = v.map((_, i) => (v.length > 1 ? pad + (i / (v.length - 1)) * (w - pad * 2) : w / 2));
  const ys = v.map((y) => pad + (1 - clamp(y)) * (height - pad * 2));
  const line = smooth(xs, ys);
  const hx = xs[xs.length - 1] ?? 0, hy = ys[ys.length - 1] ?? 0;
  return (
    <div ref={ref} style={{ height, alignSelf: 'stretch' }}>
      {w ? (
        <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.35} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {fill && xs.length ? <path d={`${line} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`} fill={`url(#${id})`} /> : null}
          <path d={line} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={hx} cy={hy} r={thickness * 2.6} fill={color} opacity={0.25} className="hi-ping" style={{ transformOrigin: `${hx}px ${hy}px` }} />
          <circle cx={hx} cy={hy} r={thickness * 1.3} fill={color} />
        </svg>
      ) : null}
    </div>
  );
}

/** Point, tangent and sub-curves of the quadratic an Arc draws. */
function quad(x0: number, y0: number, cx: number, cy: number, x1: number) {
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
const REACH = 0.28;

export function Arc({ value, height, thickness, colors, track, glow, marker, markerSize = 28, accent }: { value: number; height: number; thickness: number; colors: string[]; track: string; glow: boolean; marker?: string; markerSize?: number; accent: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const id = useId();
  const p = useSpring(clamp(value), { stiffness: 120, damping: 22 });
  useEffect(() => { p.set(clamp(value)); }, [value]);
  // A rider needs room: half its size at the ends and above the peak, so it never clips.
  const pad = marker ? markerSize * 0.5 : thickness * 2 + 6;
  const top = marker ? markerSize * 0.6 : thickness;
  const y0 = height - (marker ? markerSize * 0.3 : thickness);
  const x0 = pad, x1 = w - pad, cx = w / 2, cy = 2 * top - y0;
  const q = quad(x0, y0, cx, cy, x1);
  let len = 0;
  for (let i = 1, [px, py] = q.at(0); i <= 40; i++) { const [x, y] = q.at(i / 40); len += Math.hypot(x - px, y - py); px = x; py = y; }
  const d = `M${x0},${y0} Q${cx},${cy} ${x1},${y0}`;
  const offset = useTransform(p, (t) => len * (1 - t));
  const mx = useTransform(p, (t) => q.at(t)[0]);
  const my = useTransform(p, (t) => q.at(t)[1]);
  const last = colors[colors.length - 1];
  return (
    <div ref={ref} style={{ height, alignSelf: 'stretch', position: 'relative' }}>
      {w && marker ? <Flight {...{ w, height, q, p, thickness, track, color: last, glow, marker, markerSize, id, ink: accent }} /> : null}
      {w && !marker ? (
        <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {colors.map((c, i) => <stop key={i} offset={colors.length > 1 ? i / (colors.length - 1) : 0} stopColor={c} />)}
            </linearGradient>
          </defs>
          <path d={d} stroke={track} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray="0.1 8" />
          <motion.path d={d} stroke={`url(#${id})`} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} style={{ strokeDashoffset: offset }} />
          {glow ? <motion.circle cx={mx} cy={my} r={thickness * 3.4} fill={last} opacity={0.22} /> : null}
          <motion.circle cx={mx} cy={my} r={thickness * 1.5} fill="#FFFFFF" stroke={last} strokeWidth={thickness * 0.8} />
        </svg>
      ) : null}
    </div>
  );
}

/** With a marker (a plane): the route ahead is dotted, a comet tail trails behind, and the marker flies nose-first in a halo with speed streaks. */
function Flight({ w, height, q, p, thickness, track, color, glow, marker, markerSize, id, ink }: {
  w: number; height: number; q: ReturnType<typeof quad>; p: MotionValue<number>; thickness: number; track: string; color: string; glow: boolean; marker: string; markerSize: number; id: string; ink: string;
}) {
  const ahead = useTransform(p, (t) => q.segment(t, 1));
  const flown = useTransform(p, (t) => q.segment(0, Math.max(t, 0.0001)));
  const t0 = useTransform(p, (t) => q.segment(Math.max(0, t - REACH * TAIL[0].length), Math.max(t, 0.0001)));
  const t1 = useTransform(p, (t) => q.segment(Math.max(0, t - REACH * TAIL[1].length), Math.max(t, 0.0001)));
  const t2 = useTransform(p, (t) => q.segment(Math.max(0, t - REACH * TAIL[2].length), Math.max(t, 0.0001)));
  const t3 = useTransform(p, (t) => q.segment(Math.max(0, t - REACH * TAIL[3].length), Math.max(t, 0.0001)));
  const box = { w: markerSize * 3.4, h: markerSize * 1.8 };
  const rx = useTransform(p, (t) => q.at(t)[0] - box.w / 2);
  const ry = useTransform(p, (t) => q.at(t)[1] - box.h / 2);
  const rotate = useTransform(p, (t) => { const [dx, dy] = q.slope(t); return (Math.atan2(dy, dx) * 180) / Math.PI; });
  const [sx, sy] = q.at(0);
  const [ex, ey] = q.at(1);
  return (
    <>
      <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}-end`}>
            <stop offset="0" stopColor={color} stopOpacity={0.55} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </radialGradient>
        </defs>
        <motion.path d={ahead} stroke={track} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`0.1 ${thickness * 3.2}`} />
        <motion.path d={flown} stroke={color} strokeOpacity={0.18} strokeWidth={thickness * 0.6} fill="none" strokeLinecap="round" />
        {[t0, t1, t2, t3].map((d, i) => <motion.path key={i} d={d} stroke={color} strokeOpacity={TAIL[i].opacity} strokeWidth={thickness * TAIL[i].width} fill="none" strokeLinecap="round" />)}
        <circle cx={sx} cy={sy} r={thickness * 1.1} fill={color} />
        <circle cx={ex} cy={ey} r={Math.min(thickness * 4.5, height - ey)} fill={`url(#${id}-end)`} />
        <circle cx={ex} cy={ey} r={thickness * 1.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={thickness * 0.6} />
      </svg>
      <motion.div style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, x: rx, y: ry, rotate, pointerEvents: 'none' }}>
        {[-0.3, 0, 0.3].map((lane, i) => {
          const length = markerSize * (i === 1 ? 1.3 : 0.85);
          return <span key={i} className="hi-streak" style={{ left: box.w / 2 - markerSize * 0.4 - length, top: box.h / 2 + lane * markerSize - 1, width: length, animationDelay: `${-i * 0.37 * 1.1}s`, ['--hi-wind' as string]: `${-markerSize * 0.6}px` }} />;
        })}
        {glow ? (
          <span className="hi-halo" style={{ left: box.w / 2 - markerSize, top: box.h / 2 - markerSize, width: markerSize * 2, height: markerSize * 2,
            background: `radial-gradient(closest-side, rgba(255,255,255,.45), ${alpha(color, 0.55)} 22%, ${alpha(color, 0.16)} 55%, transparent)` }} />
        ) : null}
        <span className="hi-ride" style={{ position: 'absolute', left: (box.w - markerSize) / 2, top: (box.h - markerSize) / 2 }}>
          <Mark name={marker} size={markerSize} color={ink} />
        </span>
      </motion.div>
    </>
  );
}

// endregion

// region Timeline

export function Timeline({ value, icons, size, color, track, ink }: { value: number; icons: string[]; size: number; color: string; track: string; ink: string }) {
  const n = icons.length;
  const [ref, w] = useWidth<HTMLDivElement>();
  const span = n > 1 ? (w - size) / (n - 1) : 0;
  return (
    <div ref={ref} style={{ height: size, alignSelf: 'stretch', position: 'relative' }}>
      <div style={{ position: 'absolute', left: size / 2, right: size / 2, top: size / 2 - 1.5, height: 3, borderRadius: 2, background: track }} />
      <motion.div initial={false} animate={{ width: clamp((value - 1) / Math.max(1, n - 1)) * Math.max(0, w - size) }} transition={{ type: 'spring', visualDuration: 0.9, bounce: 0.1 }}
        style={{ position: 'absolute', left: size / 2, top: size / 2 - 1.5, height: 3, borderRadius: 2, background: color }} />
      {w ? icons.map((name, i) => {
        const reached = value >= i + 1;
        const next = !reached && value > i;
        return (
          <motion.div key={i} className={next ? 'hi-pulse' : undefined} initial={false}
            animate={{ backgroundColor: reached ? color : '#1C1C1E', boxShadow: next ? `inset 0 0 0 2px ${color}` : 'inset 0 0 0 0px transparent' }}
            style={{ position: 'absolute', left: i * span, top: 0, width: size, height: size, borderRadius: size / 2, display: 'grid', placeItems: 'center' }}>
            <Icon name={name} size={size * 0.52} color={reached ? ink : next ? color : alpha('#FFFFFF', 0.45)} />
          </motion.div>
        );
      }) : null}
    </div>
  );
}

// endregion

// region Pet

type Eye = [w: number, top: number, bottom: number, outer: number, inner: number, dy: number];
const IDLE: Eye = [0.2, 0.34, 0.34, 0, 0, 0];
const HAPPY: Eye = [0.3, 0.3, -0.13, 0, 0, 0.05];
/** The mood table from the native renderer, unchanged. */
export const EYES: Record<Mood, [Eye, Eye]> = {
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
export const MOODS = Object.keys(EYES) as Mood[];
const flat = (m: string) => { const e = EYES[m as Mood] ?? EYES.idle; return [...e[0], ...e[1]]; };

function eyePath(e: number[], o: number, s: number, cx: number, cy: number, mirror: boolean, blink: number) {
  const w = e[o] * s, top = e[o + 1] * s * blink, bottom = e[o + 2] * s * (blink < 1 ? blink : 1);
  const outer = e[o + 3] * s, inner = e[o + 4] * s, y = cy + e[o + 5] * s;
  const lx = cx - w / 2, rx = cx + w / 2;
  const ly = y - (mirror ? inner : outer), ry = y - (mirror ? outer : inner);
  return `M${lx},${ly} C${lx},${y - top} ${rx},${y - top} ${rx},${ry} C${rx},${y + bottom} ${lx},${y + bottom} ${lx},${ly} Z`;
}

const LOOK = { stiffness: 220, damping: 22 };

/** Two eyes that blink, follow the cursor from wherever they sit, and morph between moods. */
export function Pet({ mood = 'idle', size, color, cheeks }: { mood?: string; size: number; color: string; cheeks: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const width = size * 1.5;
  const from = useRef(flat(mood));
  const to = useRef(flat(mood));
  const t = useMotionValue(1);
  const blink = useMotionValue(1);
  const bob = useMotionValue(0);
  const lx = useSpring(0, LOOK);
  const ly = useSpring(0, LOOK);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  // Morph from wherever the eyes are now to the new mood.
  useEffect(() => {
    const k = t.get();
    from.current = to.current.map((v, i) => from.current[i] + (v - from.current[i]) * k);
    to.current = flat(mood);
    t.set(0);
    const c = animate(t, 1, reduced ? { duration: 0 } : { type: 'spring', duration: 0.52, bounce: 0.45 });
    const b = mood === 'love' && !reduced ? animate(bob, [0, 1, 0], { duration: 0.84, repeat: Infinity, ease: 'easeInOut' }) : animate(bob, 0, { duration: 0.2 });
    return () => { c.stop(); b.stop(); };
  }, [mood, reduced]);

  // Blink at random, sometimes twice.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const once = () => animate(blink, [1, 0.05, 1], { duration: 0.19, times: [0, 0.37, 1] });
    const loop = () => {
      timer = setTimeout(() => {
        once();
        if (Math.random() < 0.2) setTimeout(once, 270);
        loop();
      }, 1800 + Math.random() * 3200);
    };
    loop();
    return () => clearTimeout(timer);
  }, [reduced]);

  // Look at the cursor from where this pet sits; glance around when nobody is moving.
  useEffect(() => {
    const look = () => {
      const el = ref.current;
      if (!el || pointer.at === 0) return;
      const r = el.getBoundingClientRect();
      lx.set(clamp((pointer.x - (r.left + r.width / 2)) / (window.innerWidth * 0.4), -1, 1));
      ly.set(clamp((pointer.y - (r.top + r.height / 2)) / (window.innerHeight * 0.4), -1, 1));
    };
    const off = onPointer(look);
    const wander = setInterval(() => {
      if (performance.now() - pointer.at < 2500 || reduced) return;
      const center = Math.random() < 0.4;
      lx.set(center ? 0 : Math.random() * 1.6 - 0.8);
      ly.set(center ? 0 : Math.random() * 1.2 - 0.5);
    }, 1900);
    return () => { off(); clearInterval(wander); };
  }, [reduced]);

  const eye = (left: boolean) => () => {
    // Read every value up front so the transform subscribes to all of them.
    const k = t.get(), ax = lx.get(), ay = ly.get(), b = bob.get(), bl = blink.get();
    const e = to.current.map((v, i) => from.current[i] + (v - from.current[i]) * k);
    const m = moodRef.current;
    // Thinking looks up and away; sleepy stops following.
    const x = m === 'thinking' ? 0.6 : m === 'sleepy' ? 0 : ax;
    const y = m === 'thinking' ? -0.8 : m === 'sleepy' ? 0.2 : ay;
    const cx = width / 2 + (left ? -1 : 1) * size * 0.3 + x * size * 0.14;
    const cy = size / 2 + y * size * 0.1 - b * size * 0.05;
    return eyePath(e, left ? 0 : 6, size, cx, cy, !left, bl);
  };
  const leftEye = useTransform(eye(true));
  const rightEye = useTransform(eye(false));
  const cheekL = useTransform(() => width / 2 - size * 0.52 + lx.get() * size * 0.08);
  const cheekR = useTransform(() => width / 2 + size * 0.52 + lx.get() * size * 0.08);
  const blushing = mood === 'love' || mood === 'happy' || mood === 'wink';
  const ink = mood === 'love' ? cheeks : color;
  return (
    <svg ref={ref} width={width} height={size} style={{ flexShrink: 0, overflow: 'visible', display: 'block' }} role="img" aria-label={`Pet, ${mood}`}>
      <motion.ellipse cx={cheekL} cy={size * 0.74} rx={size * 0.11} ry={size * 0.06} fill={cheeks} initial={false} animate={{ opacity: blushing ? 0.55 : 0 }} />
      <motion.ellipse cx={cheekR} cy={size * 0.74} rx={size * 0.11} ry={size * 0.06} fill={cheeks} initial={false} animate={{ opacity: blushing ? 0.55 : 0 }} />
      <motion.path d={leftEye} fill={ink} style={{ transition: 'fill .3s' }} />
      <motion.path d={rightEye} fill={ink} style={{ transition: 'fill .3s' }} />
    </svg>
  );
}

// endregion

// region Sky

/** Cloud puffs on a 100×70 grid: [cx, cy, r]. Back row first, so the front row overlaps it. */
const PUFFS: [number, number, number][] = [[34, 38, 17], [70, 36, 19], [52, 28, 24], [27, 48, 15], [50, 50, 17], [76, 48, 15]];
const CLOUD = {
  light: ['#FFFFFF', '#DCE1E9', '#8A92A1'],
  rain: ['#E6E9EF', '#9DA5B4', '#4B5262'],
  storm: ['#B9C0CC', '#6B7385', '#2C313D'],
};

/** A weather illustration drawn from light: top-lit cloud puffs with a shaded underside, a blooming sun, rain, lightning. */
export function Sky({ condition, size }: { condition: string; size: number }) {
  const width = Math.round(size * 1.15);
  const c = ['clear', 'partly', 'cloudy', 'rain', 'storm'].includes(condition) ? condition : 'cloudy';
  const k = width / 100;
  const wet = c === 'rain' || c === 'storm';
  return (
    <div style={{ width, height: size, position: 'relative', flexShrink: 0 }}>
      <AnimatePresence initial={false}>
        <motion.div key={c} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.6 } }} exit={{ opacity: 0, transition: { duration: 0.4 } }} style={{ position: 'absolute', inset: 0 }}>
          {c === 'clear' || c === 'partly' ? <Sun x={c === 'clear' ? 50 : 66} y={c === 'clear' ? 35 : 24} r={c === 'clear' ? 20 : 15} k={k} /> : null}
          {c !== 'clear' ? <div className="hi-drift" style={{ position: 'absolute', inset: 0, ['--hi-drift' as string]: `${size * 0.025}px` }}><Cloud k={k} width={width} height={size} tone={wet ? (c as 'rain' | 'storm') : 'light'} small={c === 'partly'} /></div> : null}
          {wet ? [22, 34, 46, 58, 70, 82, 40, 64].map((x, i) => (
            <span key={i} className="hi-drop" style={{ left: x * k, top: 60 * k, height: size * 0.12, animationDelay: `${i * 0.13}s`, ['--hi-fall' as string]: `${size * 0.26}px` }} />
          )) : null}
          {c === 'storm' ? (
            <svg className="hi-bolt" width={width} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
              <path d={`M${56 * k},${50 * k} L${46 * k},${66 * k} L${53 * k},${66 * k} L${47 * k},${80 * k} L${62 * k},${61 * k} L${55 * k},${61 * k} L${61 * k},${50 * k} Z`} fill="#FFE27A" stroke="#FFF6CC" strokeWidth={0.8} strokeLinejoin="round" />
            </svg>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Cloud({ k, width, height, tone, small }: { k: number; width: number; height: number; tone: keyof typeof CLOUD; small: boolean }) {
  const id = useId();
  const [hi, mid, lo] = CLOUD[tone];
  const dark = tone !== 'light';
  // A partly cloudy sky shows a smaller cloud, low and left, so the sun stays visible.
  const s = small ? 0.78 : 1;
  const ox = small ? -4 : 0, oy = small ? 10 : 0;
  const P = (n: number) => n * k;
  const puffs = PUFFS.map(([x, y, r]) => [P(x * s + ox + (1 - s) * 50), P(y * s + oy + (1 - s) * 35), P(r * s)] as const);
  const base = { x: P(16 * s + ox + (1 - s) * 50), y: P(46 * s + oy + (1 - s) * 35), w: P(70 * s), h: P(18 * s) };
  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={`${id}-puff`} gradientUnits="userSpaceOnUse" cx={P(50)} cy={P(36)} r={P(46 * s)} fx={P(40)} fy={P(16 + oy)}>
          <stop offset="0" stopColor={hi} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
        <radialGradient id={`${id}-lit`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.28 : 0.5} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#0B0E14" stopOpacity={0} />
          <stop offset="1" stopColor="#0B0E14" stopOpacity={dark ? 0.55 : 0.4} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          {puffs.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
          <rect x={base.x} y={base.y} width={base.w} height={base.h} rx={base.h / 2} />
        </clipPath>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={hi} stopOpacity={dark ? 0.1 : 0.18} />
          <stop offset="1" stopColor={hi} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={P(52)} cy={P(42)} rx={P(52 * s)} ry={P(34 * s)} fill={`url(#${id}-glow)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={width} height={height} fill={`url(#${id}-puff)`} />
        {puffs.map(([x, y, r], i) => <circle key={i} cx={x - r * 0.18} cy={y - r * 0.32} r={r * 0.72} fill={`url(#${id}-lit)`} />)}
        <rect width={width} height={height} fill={`url(#${id}-shade)`} />
      </g>
    </svg>
  );
}

function Sun({ x, y, r, k }: { x: number; y: number; r: number; k: number }) {
  const R = r * k * 2.6;
  return (
    <>
      <span className="hi-breathe" style={{ position: 'absolute', left: x * k - R, top: y * k - R, width: R * 2, height: R * 2, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(255,216,77,.55), rgba(255,159,10,.18) 40%, transparent)' }} />
      <span style={{ position: 'absolute', left: (x - r) * k, top: (y - r) * k, width: r * k * 2, height: r * k * 2, borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 35%, #FFFCEB, #FFD84D 45%, #FF9F0A)' }} />
    </>
  );
}

// endregion
