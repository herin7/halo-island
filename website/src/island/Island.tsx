/**
 * The island, on the web. Same geometry as the native host: a compact pill (leading · camera gap ·
 * trailing) that springs open into header + body, with `screens` navigated inside it.
 */
import { IslandNode, IslandState, IslandTemplate } from 'halo-island';
import { AnimatePresence, MotionValue, animate, motion, useIsPresent, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { CSSProperties, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Ctx, Node } from './nodes';
import { Theme, alpha, gradient, quicker, springOf, themeOf } from './util';

const ROW = 37;
const ROW_PAD = 14;
const INSET = 22;
const TOP = 10;
const BOTTOM = 22;

export interface IslandProps {
  template: IslandTemplate;
  state: IslandState;
  /** Changing it cross-fades to the new template while the pill morphs. */
  id?: string;
  expanded: boolean;
  onExpandedChange?: (open: boolean) => void;
  /** In-island inputs (chips, slider, toggle) write here. */
  onState?: (patch: IslandState) => void;
  /** Your actions. Return a built-in (`go:x`, `back`, `close`) to navigate in response. */
  onAction?: (action: string) => string | void;
  /** Expanded width. */
  width?: number;
  /** Space kept free in the compact row, like the camera on a phone. */
  gap?: number;
  label?: string;
  /** Jump straight to a screen from outside; a new `n` repeats the jump. */
  nav?: { screen: string; n: number } | null;
  style?: CSSProperties;
  className?: string;
}

interface Size { lead: number; trail: number; body: number }

export function Island({ template, state, id = 'island', expanded, onExpandedChange, onState, onAction, width = 370, gap = 64, label = 'Live activity', nav, style, className }: IslandProps) {
  const reduced = !!useReducedMotion();
  const theme = themeOf(template);
  const spring = springOf(template.motion, reduced);
  const [stack, setStack] = useState<string[]>([]);
  const dir = useRef(1);
  const [size, setSize] = useState<Size>({ lead: 0, trail: 0, body: 0 });
  const screen = stack[stack.length - 1];
  const body = screen ? template.screens?.[screen] : template.expanded;
  const open = expanded && !!template.expanded;

  // Collapsing or switching templates returns to the main layout, once the shape has landed.
  useEffect(() => { if (!open) { const t = setTimeout(() => setStack([]), 650); return () => clearTimeout(t); } }, [open]);
  useEffect(() => setStack([]), [id]);
  useEffect(() => { if (nav) { dir.current = 1; setStack([nav.screen]); } }, [nav?.n]);

  const run = useCallback((action: string) => {
    if (action.startsWith('go:')) {
      const name = action.slice(3);
      dir.current = 1;
      setStack((s) => (s.includes(name) ? s.slice(0, s.indexOf(name) + 1) : [...s, name]));
      onExpandedChange?.(true);
    } else if (action === 'back') {
      dir.current = -1;
      setStack((s) => s.slice(0, -1));
    } else if (action === 'close') {
      onExpandedChange?.(false);
    } else {
      const next = onAction?.(action);
      if (next) run(next);
    }
  }, [onAction, onExpandedChange]);

  const ctx: Ctx = { state, theme, onAction: run, setState: (p) => onState?.(p) };

  // Equal sides keep the camera gap centered, like the system island.
  const compactW = gap + 2 * Math.max(size.lead, size.trail, ROW - ROW_PAD) + ROW_PAD * 2;
  // One timeline, two springs: opening widens a beat before it deepens, closing lifts the floor first
  // and draws the sides in last. Everything inside is keyed to these, never to its own timer, so
  // content can't run ahead of the shape or blink out before it moves.
  const across = useSpringTo(open ? 1 : 0, open ? quicker(spring) : spring);
  const down = useSpringTo(open ? 1 : 0, open ? spring : quicker(spring));
  // Sizes that change at rest (a longer label, a new screen) glide too.
  const cw = useSpringTo(compactW, spring);
  const bh = useSpringTo(size.body, spring);
  const w = useTransform(() => cw.get() + (width - cw.get()) * across.get());
  const h = useTransform(() => ROW + (TOP + bh.get()) * down.get());
  const radius = useTransform(() => ROW / 2 + (theme.radius - ROW / 2) * Math.min(1, down.get()));
  const auraOpacity = useTransform(down, [0, 1], [0, 1]);

  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget && e.key !== 'Escape') return;
    if (e.key === 'Escape' && open) { onExpandedChange?.(false); e.stopPropagation(); }
    if ((e.key === 'Enter' || e.key === ' ') && !open && template.expanded) { onExpandedChange?.(true); e.preventDefault(); }
  };

  return (
    <motion.div
      className={`hi-island${theme.material === 'glass' ? ' hi-glass' : ''}${theme.glow ? ' hi-glowing' : ''}${className ? ` ${className}` : ''}`}
      role={open ? 'group' : 'button'}
      tabIndex={open ? -1 : 0}
      aria-label={label}
      aria-expanded={template.expanded ? open : undefined}
      onKeyDown={key}
      onClick={() => { if (!open && template.expanded) onExpandedChange?.(true); }}
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: theme.material === 'glass' ? undefined : gradient(theme.gradient) ?? theme.background,
        '--hi-border': theme.border,
        '--hi-glow': theme.glow || theme.accent,
        cursor: open ? 'default' : 'pointer',
        ...style,
      } as CSSProperties}
    >
      {/* Glass: lit from above, a faint refraction along the bottom, so the edge reads as a thick lens. */}
      {theme.material === 'glass' ? <div className="hi-lens" aria-hidden /> : null}
      {theme.aura ? (
        <motion.div className="hi-aura" aria-hidden style={{ opacity: auraOpacity }}>
          <div className={open ? 'hi-breathe' : undefined} style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(theme.aura, 0)} 25%, ${alpha(theme.aura, 0.16)} 62%, ${alpha(theme.aura, 0.62)})` }} />
        </motion.div>
      ) : null}
      <AnimatePresence initial={false}>
        <Stage key={id} template={template} ctx={ctx} open={open} body={body} bodyKey={screen ?? '__main'} dir={dir.current} gap={gap} width={width} theme={theme} across={across} down={down} onSize={setSize} onHeader={() => open && onExpandedChange?.(false)} />
      </AnimatePresence>
    </motion.div>
  );
}

function Stage({ template, ctx, open, body, bodyKey, dir, gap, width, theme, across, down, onSize, onHeader }: {
  template: IslandTemplate; ctx: Ctx; open: boolean; body?: IslandNode; bodyKey: string; dir: number; gap: number; width: number; theme: Theme;
  across: MotionValue<number>; down: MotionValue<number>; onSize: (s: Size) => void; onHeader: () => void;
}) {
  const present = useIsPresent();
  const lead = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const report = useRef<() => void>(() => {});
  report.current = () => {
    if (!present) return;
    onSize({ lead: lead.current?.offsetWidth ?? 0, trail: trail.current?.offsetWidth ?? 0, body: bodyRef.current?.offsetHeight ?? 0 });
  };
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => report.current());
    [lead.current, trail.current].forEach((el) => el && ro.observe(el));
    report.current();
    return () => ro.disconnect();
  }, []);
  // The newest screen's body is measured; an exiting one keeps its place while it fades.
  const attachBody = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    bodyRef.current = el;
    const ro = new ResizeObserver(() => { if (bodyRef.current === el) report.current(); });
    ro.observe(el);
    report.current();
    return () => { ro.disconnect(); if (bodyRef.current === el) bodyRef.current = null; };
  }, []);

  // Keyframes on the shape's progress. The compact trailing value is gone by the time the island has
  // widened 40% and returns over the last 40% of the close. The body arrives between 30% and 85% of
  // the drop, scaling up out of the header as it unblurs; closing plays the same keys backwards, so it
  // is drawn back into the pill while the pill is still big enough to hold it.
  const trailStyle = { opacity: useTransform(across, [0, 0.4], [1, 0]), scale: useTransform(across, [0, 0.4], [1, 0.7]), filter: useBlur(across, [0, 0.4], [0, 5]) };
  const bodyStyle = { opacity: useTransform(down, [0.3, 0.85], [0, 1]), scale: useTransform(down, [0, 1], [0.86, 1]), y: useTransform(down, [0, 1], [-10, 0]), filter: useBlur(down, [0.3, 0.9], [7, 0]) };
  const rowStyle = { paddingTop: useTransform(down, [0, 1], [0, TOP], { clamp: false }), paddingLeft: useTransform(across, [0, 1], [ROW_PAD, INSET]), paddingRight: useTransform(across, [0, 1], [ROW_PAD, INSET]) };

  return (
    <motion.div className="hi-stage" initial={{ opacity: 0, filter: 'blur(8px)', scale: 0.92 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.92 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      <motion.div className="hi-row" onClick={onHeader} style={{ ...rowStyle, minHeight: ROW, cursor: open ? 'pointer' : undefined }}>
        <div ref={lead} className="hi-slot-lead">{template.compact.leading ? <Node node={template.compact.leading} ctx={ctx} inRow /> : null}</div>
        <span style={{ minWidth: gap, flexGrow: 1 }} />
        <motion.div ref={trail} className="hi-slot-trail" style={trailStyle}>
          {template.compact.trailing ? <Node node={template.compact.trailing} ctx={ctx} inRow /> : null}
        </motion.div>
      </motion.div>
      {/* The body stays mounted and measured, so the shape knows its height before it opens and grows
          in one motion. */}
      <motion.div aria-hidden={!open} inert={!open} style={{ ...bodyStyle, transformOrigin: '50% 0%', pointerEvents: open ? 'auto' : 'none' }}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          {body ? (
            <motion.div key={bodyKey} ref={attachBody} className="hi-body" custom={dir} variants={screenVariants} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 420, damping: 38, opacity: { duration: 0.2 } }}
              style={{ width: width - INSET * 2, paddingBottom: BOTTOM, '--hi-fg': theme.foreground } as CSSProperties}>
              <Node node={body} ctx={ctx} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/** A motion value that springs to `to` whenever it changes, keeping its velocity if interrupted. */
function useSpringTo(to: number, transition: object) {
  const v = useMotionValue(to);
  useEffect(() => { const a = animate(v, to, transition); return () => a.stop(); }, [to]);
  return v;
}

/** Blur keyed to progress. Only mid-move: at either end it is `none`, so no filter layer idles. */
function useBlur(p: MotionValue<number>, [a, b]: number[], [from, to]: number[]) {
  return useTransform(p, (v) => {
    const t = (v - a) / (b - a);
    return t <= 0 || t >= 1 ? 'none' : `blur(${(from + (to - from) * t).toFixed(2)}px)`;
  });
}

/** Shared-axis between screens: forward slides in from the right, back from the left. */
const screenVariants = {
  enter: (d: number) => ({ opacity: 0, x: 36 * d, filter: 'blur(6px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, x: -36 * d, filter: 'blur(6px)' }),
};
