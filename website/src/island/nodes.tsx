/** IslandNode → DOM. Mirrors packages/halo-island/src/host.tsx node for node. */
import { IslandNode, IslandState, TextStyle, fill, num, nums, on, tracking, visible } from 'halo-island';
import { AnimatePresence, motion } from 'motion/react';
import { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Arc, Bar, Bars, Icon, Pet, Ring, Sparkline, Timeline, Track } from './graphics';
import { Theme, WEIGHT, alpha, clamp, clock, familyOf, gradient, italicOf } from './util';

export interface Ctx {
  state: IslandState;
  theme: Theme;
  onAction: (action: string) => void;
  setState: (patch: IslandState) => void;
}

export function Node({ node, ctx, inRow }: { node: IslandNode; ctx: Ctx; inRow?: boolean }): ReactNode {
  if (!visible(node, ctx.state)) return null;
  const body = <Body node={node} ctx={ctx} inRow={inRow} />;
  return node.effect ? <span className={`hi-fx hi-fx-${node.effect}`}>{body}</span> : body;
}

const flex = (v?: string) => (v === 'start' ? 'flex-start' : v === 'end' ? 'flex-end' : v);

export function textStyle(s: TextStyle | undefined, theme: Theme): CSSProperties {
  const size = s?.size ?? 14;
  return {
    color: s?.color ?? theme.foreground,
    fontSize: size,
    letterSpacing: tracking(size),
    fontWeight: WEIGHT[s?.weight ?? 'medium'],
    fontFamily: familyOf(theme, s?.font),
    fontStyle: italicOf(s?.font),
    fontVariantNumeric: s?.mono ? 'tabular-nums' : undefined,
    textAlign: s?.align === 'end' ? 'right' : s?.align === 'center' ? 'center' : undefined,
    lineHeight: 1.2,
  };
}

function Body({ node, ctx, inRow }: { node: IslandNode; ctx: Ctx; inRow?: boolean }): ReactNode {
  const { state, theme } = ctx;
  switch (node.type) {
    case 'row':
    case 'column': {
      const s = node.style ?? {};
      const row = node.type === 'row';
      return (
        <div style={{
          display: 'flex',
          flexDirection: row ? 'row' : 'column',
          flexWrap: s.wrap ? 'wrap' : undefined,
          gap: s.justify === 'between' ? undefined : s.gap ?? 8,
          padding: s.padding,
          alignItems: s.align === 'baseline' ? 'baseline' : flex(s.align ?? (row ? 'center' : 'stretch')),
          justifyContent: s.justify === 'between' ? 'space-between' : flex(s.justify ?? 'start'),
          background: gradient(s.gradient) ?? s.background,
          borderRadius: s.radius,
          border: s.border ? `${s.border.width}px solid ${s.border.color}` : undefined,
          width: s.width,
          height: s.height,
          opacity: s.opacity,
          flexGrow: s.grow ? 1 : undefined,
          flexShrink: s.grow ? 1 : 0,
          flexBasis: s.grow ? 0 : undefined,
          minWidth: 0,
        }}>
          {node.children.map((child, i) => <Node key={i} node={child} ctx={ctx} inRow={row} />)}
        </div>
      );
    }
    case 'text': {
      const value = fill(node.text, state);
      const style = textStyle(node.style, theme);
      const lines = node.style?.lines ?? 1;
      if (node.style?.mono) return <Roll value={value} style={style} />;
      return <span className="hi-text" style={{ ...style, WebkitLineClamp: lines, whiteSpace: lines === 1 ? 'nowrap' : undefined }}>{value}</span>;
    }
    case 'icon':
      return <Icon name={node.name ? fill(node.name, state) : undefined} path={node.path} viewBox={node.viewBox} stroke={node.stroke} size={node.size ?? 18} width={node.width} color={node.color ?? theme.foreground} />;
    case 'image': {
      const size = node.size ?? 32;
      const uri = fill(node.uri, state);
      const box: CSSProperties = { width: node.width ?? size, height: size, borderRadius: node.radius ?? 8, flexShrink: 0, objectFit: node.fit ?? 'cover', display: 'block' };
      return (
        <AnimatePresence mode="popLayout" initial={false}>
          {!uri ? (
            <motion.span key="empty" className="hi-shimmer" style={{ ...box, background: 'rgba(255,255,255,0.08)' }} exit={{ opacity: 0 }} />
          ) : (
            <motion.span key={uri} style={{ position: 'relative', flexShrink: 0, display: 'block' }} initial={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.3 }}>
              {node.glow ? <img src={uri} alt="" aria-hidden style={{ ...box, position: 'absolute', inset: 0, filter: 'blur(18px) saturate(1.6)', opacity: 0.75, transform: 'scale(1.6)' }} /> : null}
              <img src={uri} alt="" loading="lazy" decoding="async" style={{ ...box, position: 'relative' }} />
            </motion.span>
          )}
        </AnimatePresence>
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
        <div style={{ display: 'flex', gap: 4, flexGrow: inRow ? 1 : undefined }}>
          {Array.from({ length: node.count }, (_, i) => <Bar key={i} value={v - i} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow />)}
        </div>
      );
    }
    case 'track': {
      const color = node.color ?? theme.accent;
      return <Track value={num(node.value, state)} marker={node.marker ? fill(node.marker, state) : ''} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} grow={inRow} />;
    }
    case 'bars': {
      const color = node.color ?? theme.accent;
      const values = nums(node.values, state);
      return <Bars values={values} active={node.active == null ? values.length : num(node.active, state)} height={node.height ?? 40} gap={node.gap ?? 3} color={color} track={node.track ?? alpha(color, 0.18)} live={!!node.animate} />;
    }
    case 'line':
      return <Sparkline values={nums(node.values, state)} height={node.height ?? 40} color={node.color ?? theme.accent} fill={node.fill ?? true} thickness={node.thickness ?? 2} />;
    case 'arc': {
      const colors = node.colors?.length ? node.colors : [theme.accent];
      return <Arc value={num(node.value, state)} height={node.height ?? 64} thickness={node.thickness ?? 4} colors={colors} track={node.track ?? alpha('#FFFFFF', 0.3)} glow={node.glow ?? true} />;
    }
    case 'timeline': {
      const color = node.color ?? theme.accent;
      return <Timeline value={num(node.value, state)} icons={node.icons} size={node.size ?? 30} color={color} track={node.track ?? alpha('#FFFFFF', 0.14)} ink={node.ink ?? theme.background} />;
    }
    case 'timer':
      return <Timer to={num(node.to, state)} countUp={node.countUp} style={textStyle(node.style, theme)} />;
    case 'pet':
      return <Pet mood={node.mood ? fill(node.mood, state) || 'idle' : 'idle'} size={node.size ?? 22} color={node.color ?? theme.foreground} cheeks={node.cheeks ?? '#FF6B8B'} />;
    case 'button':
      return <Button node={node} ctx={ctx} inRow={inRow} />;
    case 'chips':
      return <Chips node={node} ctx={ctx} />;
    case 'slider':
      return <Slider node={node} ctx={ctx} />;
    case 'toggle':
      return <Toggle node={node} ctx={ctx} />;
    case 'spacer':
      return node.size != null ? <span style={{ [inRow ? 'width' : 'height']: node.size, flexShrink: 0 }} /> : <span style={{ flexGrow: 1 }} />;
    case 'lottie':
    case 'rive':
      // Native-only players. The web build leaves the slot empty rather than faking them.
      return null;
  }
}

// region Text that rolls

/**
 * Tabular text where only the characters that changed roll — up when the number grew, down when
 * it shrank — like SwiftUI's numericText transition.
 */
export function Roll({ value, style }: { value: string; style: CSSProperties }) {
  const prev = useRef(value);
  const dir = useRef(1);
  if (prev.current !== value) {
    const a = parseFloat(prev.current.replace(/[^\d.-]/g, ''));
    const b = parseFloat(value.replace(/[^\d.-]/g, ''));
    dir.current = Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1;
    prev.current = value;
  }
  // Align from the right so units/digits keep their slots as the number grows.
  const chars = [...value];
  return (
    <span className="hi-roll" style={{ ...style, fontVariantNumeric: 'tabular-nums', justifyContent: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' ? 'flex-end' : undefined }} aria-label={value}>
      {chars.map((ch, i) => (
        <span key={chars.length - i} className="hi-slot" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
            <motion.span key={ch} custom={dir.current} variants={rollVariants} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
const rollVariants = {
  enter: (d: number) => ({ y: `${70 * d}%`, opacity: 0, filter: 'blur(3px)' }),
  center: { y: '0%', opacity: 1, filter: 'blur(0px)' },
  exit: (d: number) => ({ y: `${-70 * d}%`, opacity: 0, filter: 'blur(3px)' }),
};

function Timer({ to, countUp, style }: { to: number; countUp?: boolean; style: CSSProperties }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Roll value={clock(countUp ? now - to : to - now)} style={style} />;
}

// endregion

// region Button with confirm

type ButtonNode = Extract<IslandNode, { type: 'button' }>;

function Button({ node, ctx, inRow }: { node: ButtonNode; ctx: Ctx; inRow?: boolean }) {
  const { theme, state } = ctx;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3200);
    return () => clearTimeout(t);
  }, [armed]);
  const base = node.color ?? theme.accent;
  const ink = node.textColor ?? (node.tint ? base : theme.background);
  const label = armed && node.confirm ? fill(node.confirm, state) : node.label ? fill(node.label, state) : undefined;
  const icon = armed && node.confirm ? 'check' : node.icon ? fill(node.icon, state) : undefined;
  const shape = node.shape ?? 'pill';
  const press = () => {
    if (node.confirm && !armed) return setArmed(true);
    setArmed(false);
    ctx.onAction(node.action);
  };
  const bg = armed ? base : node.tint ? alpha(base, 0.22) : base;
  const fg = armed ? (node.tint ? theme.background : ink) : ink;
  return (
    <motion.button type="button" className={`hi-btn hi-btn-${shape}${label ? '' : ' hi-btn-icon'}`} onClick={press} layout="size"
      aria-label={label ?? node.action}
      initial={false} animate={{ backgroundColor: bg, color: fg }} whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      style={{ flexGrow: inRow && shape === 'tile' ? 1 : undefined, flexBasis: inRow && shape === 'tile' ? 0 : undefined, fontFamily: familyOf(theme) }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={`${icon}|${label}`} className="hi-btn-in" initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }} transition={{ duration: 0.22 }}>
          {icon ? <Icon name={icon} size={shape === 'tile' ? 22 : shape === 'circle' ? 20 : 16} color="currentColor" /> : null}
          {label && shape !== 'circle' ? <span>{label}</span> : null}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

// endregion

// region Inputs

type ChipsNode = Extract<IslandNode, { type: 'chips' }>;
type SliderNode = Extract<IslandNode, { type: 'slider' }>;
type ToggleNode = Extract<IslandNode, { type: 'toggle' }>;

function Chips({ node, ctx }: { node: ChipsNode; ctx: Ctx }) {
  const id = useId();
  const color = node.color ?? ctx.theme.accent;
  const current = String(ctx.state[node.bind] ?? '');
  const pick = (i: number) => {
    ctx.setState({ [node.bind]: node.values?.[i] ?? node.options[i] });
    ctx.onAction(`change:${node.bind}`);
  };
  return (
    <div className="hi-chips" role="radiogroup" style={{ background: alpha('#FFFFFF', 0.07), fontFamily: familyOf(ctx.theme) }}>
      {node.options.map((label, i) => {
        const value = node.values?.[i] ?? label;
        const selected = current === value;
        return (
          <button key={label} type="button" role="radio" aria-checked={selected} onClick={() => pick(i)} style={{ color: selected ? ctx.theme.background : ctx.theme.foreground }}>
            {selected ? <motion.span layoutId={id} className="hi-chip-bg" style={{ background: color }} transition={{ type: 'spring', stiffness: 520, damping: 36 }} /> : null}
            <span style={{ position: 'relative' }}>{fill(label, ctx.state)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Slider({ node, ctx }: { node: SliderNode; ctx: Ctx }) {
  const ref = useRef<HTMLDivElement>(null);
  const color = node.color ?? ctx.theme.accent;
  const value = clamp(Number(ctx.state[node.bind] ?? 0) || 0);
  const height = node.height ?? 36;
  const set = (v: number) => { ctx.setState({ [node.bind]: Math.round(clamp(v) * 100) / 100 }); ctx.onAction(`change:${node.bind}`); };
  const fromPointer = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    set((e.clientX - r.left) / r.width);
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(value + step); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(value - step); e.preventDefault(); }
    if (e.key === 'Home') set(0);
    if (e.key === 'End') set(1);
  };
  return (
    <div ref={ref} className="hi-slider" role="slider" tabIndex={0} aria-label={node.bind} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
      style={{ height, borderRadius: height / 2, background: node.track ?? alpha(color, 0.2) }}
      onKeyDown={key}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e); }}>
      <motion.div className="hi-slider-fill" style={{ background: color, borderRadius: height / 2 }} initial={false}
        animate={{ width: `calc(${height}px + (100% - ${height}px) * ${value})` }} transition={{ type: 'spring', stiffness: 700, damping: 50 }} />
      {node.icon ? <Icon name={node.icon} size={height * 0.5} color={value > 0.08 ? ctx.theme.background : color} style={{ position: 'absolute', left: height * 0.25, top: height * 0.25 }} /> : null}
    </div>
  );
}

function Toggle({ node, ctx }: { node: ToggleNode; ctx: Ctx }) {
  const color = node.color ?? ctx.theme.accent;
  const active = on(ctx.state[node.bind]);
  return (
    <motion.button type="button" className="hi-toggle" aria-pressed={active} onClick={() => { ctx.setState({ [node.bind]: !active }); ctx.onAction(`change:${node.bind}`); }}
      initial={false} animate={{ backgroundColor: active ? color : alpha('#FFFFFF', 0.08), color: active ? ctx.theme.background : ctx.theme.foreground }}
      whileTap={{ scale: 0.94 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} style={{ fontFamily: familyOf(ctx.theme) }}>
      <motion.span className="hi-toggle-dot" initial={false} animate={{ backgroundColor: active ? alpha('#000000', 0.12) : alpha(color, 0.2) }}>
        <Icon name={node.icon ?? 'bolt'} size={18} color={active ? ctx.theme.background : color} />
      </motion.span>
      <span className="hi-toggle-label">{fill(node.label, ctx.state)}</span>
      <span className="hi-toggle-state">{active ? 'On' : 'Off'}</span>
    </motion.button>
  );
}

// endregion
