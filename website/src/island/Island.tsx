/**
 * The island, on the web. Same geometry as the native host: a compact pill (leading · camera gap ·
 * trailing) that springs open into header + body, with `screens` navigated inside it.
 */
import { IslandNode, IslandState, IslandTemplate } from 'halo-island';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { CSSProperties, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Ctx, Node } from './nodes';
import { Theme, alpha, gradient, springOf, themeOf } from './util';

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

  // Collapsing or switching templates returns to the main layout.
  useEffect(() => { if (!open) { const t = setTimeout(() => setStack([]), 300); return () => clearTimeout(t); } }, [open]);
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
  const w = open ? width : compactW;
  const h = open ? TOP + ROW + size.body : ROW;

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
      initial={false}
      animate={{ width: w, height: h, borderRadius: open ? theme.radius : ROW / 2 }}
      transition={spring}
      style={{
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
        <motion.div className="hi-aura" aria-hidden initial={false} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.5 }}>
          <div className={open ? 'hi-breathe' : undefined} style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(theme.aura, 0)} 25%, ${alpha(theme.aura, 0.16)} 62%, ${alpha(theme.aura, 0.62)})` }} />
        </motion.div>
      ) : null}
      <AnimatePresence initial={false}>
        <Stage key={id} template={template} ctx={ctx} open={open} body={body} bodyKey={screen ?? '__main'} dir={dir.current} gap={gap} width={width} theme={theme} spring={spring} onSize={setSize} onHeader={() => open && onExpandedChange?.(false)} />
      </AnimatePresence>
    </motion.div>
  );
}

function Stage({ template, ctx, open, body, bodyKey, dir, gap, width, theme, spring, onSize, onHeader }: {
  template: IslandTemplate; ctx: Ctx; open: boolean; body?: IslandNode; bodyKey: string; dir: number; gap: number; width: number; theme: Theme;
  spring: object; onSize: (s: Size) => void; onHeader: () => void;
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

  return (
    <motion.div className="hi-stage" initial={{ opacity: 0, filter: 'blur(8px)', scale: 0.92 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.92 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      <motion.div className="hi-row" onClick={onHeader} initial={false} animate={{ paddingTop: open ? TOP : 0, paddingLeft: open ? INSET : ROW_PAD, paddingRight: open ? INSET : ROW_PAD }} transition={spring} style={{ minHeight: ROW, cursor: open ? 'pointer' : undefined }}>
        <div ref={lead} className="hi-slot-lead">{template.compact.leading ? <Node node={template.compact.leading} ctx={ctx} inRow /> : null}</div>
        <span style={{ minWidth: gap, flexGrow: 1 }} />
        <motion.div ref={trail} className="hi-slot-trail" initial={false} animate={{ opacity: open ? 0 : 1, filter: open ? 'blur(4px)' : 'blur(0px)' }} transition={open ? { duration: 0.12 } : { delay: 0.2, duration: 0.22 }}>
          {template.compact.trailing ? <Node node={template.compact.trailing} ctx={ctx} inRow /> : null}
        </motion.div>
      </motion.div>
      {/* The body stays mounted and measured, so the shape knows its height before it opens and grows
          in one motion. Content arrives as the shape grows and leaves before it shrinks, like iOS. */}
      <motion.div aria-hidden={!open} inert={!open} initial={false} animate={open ? 'shown' : 'hidden'} variants={reveal} style={{ transformOrigin: '50% 0%', pointerEvents: open ? 'auto' : 'none' }}>
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

const reveal = {
  shown: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: { delay: 0.11, duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
  hidden: { opacity: 0, scale: 0.96, y: -6, filter: 'blur(4px)', transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
};

/** Shared-axis between screens: forward slides in from the right, back from the left. */
const screenVariants = {
  enter: (d: number) => ({ opacity: 0, x: 36 * d, filter: 'blur(6px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, x: -36 * d, filter: 'blur(6px)' }),
};
