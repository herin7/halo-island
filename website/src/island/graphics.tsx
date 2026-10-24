/**
 * Web ports of the library's graphics (packages/halo-island/src/graphics.tsx): same geometry,
 * same springs, same pet eye math — drawn with SVG + motion instead of react-native-svg + Reanimated.
 */
import { ICONS } from '@halo/icons';
import type { Mood } from 'halo-island';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { onPointer, pointer } from './look';
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

export function Track({ value, marker, height, color, track, grow }: { value: number; marker: string; height: number; color: string; track: string; grow?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const v = clamp(value);
  return (
    <div ref={ref} style={{ height: 24, position: 'relative', display: 'flex', alignItems: 'center', flexGrow: grow ? 1 : undefined, alignSelf: 'stretch' }}>
      <div style={{ height, borderRadius: height / 2, background: track, overflow: 'hidden', width: '100%' }}>
        <motion.div style={{ height, background: color, borderRadius: height / 2 }} initial={false} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <motion.div initial={false} animate={{ x: v * Math.max(0, w - 22) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', left: 0, width: 22, height: 22, display: 'grid', placeItems: 'center', fontSize: 16, lineHeight: 1 }}>
        {marker ? (ICONS[marker] ? <Icon name={marker} size={18} color={color} /> : marker) : <span style={{ width: 14, height: 14, borderRadius: 7, background: color, border: '3px solid #000' }} />}
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

export function Arc({ value, height, thickness, colors, track, glow }: { value: number; height: number; thickness: number; colors: string[]; track: string; glow: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const id = useId();
  const p = useSpring(clamp(value), { stiffness: 120, damping: 22 });
  useEffect(() => { p.set(clamp(value)); }, [value]);
  const pad = thickness * 2 + 6;
  const x0 = pad, y0 = height - thickness, cx = w / 2, cy = -height + thickness * 3, x1 = w - pad;
  const at = (t: number) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y0];
  let len = 0;
  for (let i = 1, [px, py] = at(0); i <= 40; i++) { const [x, y] = at(i / 40); len += Math.hypot(x - px, y - py); px = x; py = y; }
  const d = `M${x0},${y0} Q${cx},${cy} ${x1},${y0}`;
  const offset = useTransform(p, (t) => len * (1 - t));
  const mx = useTransform(p, (t) => at(t)[0]);
  const my = useTransform(p, (t) => at(t)[1]);
  const last = colors[colors.length - 1];
  return (
    <div ref={ref} style={{ height, alignSelf: 'stretch' }}>
      {w ? (
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
