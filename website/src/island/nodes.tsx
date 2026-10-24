/** IslandNode → DOM. Mirrors packages/halo-island/src/host.tsx node for node. */
import { IslandNode, IslandState, TextStyle, fill, num, nums, on, tracking, visible } from 'halo-island';
import { AnimatePresence, motion } from 'motion/react';
import { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Arc, Bar, Bars, Icon, Mark, Pet, Ring, Sparkline, Timeline, Track, isAsset } from './graphics';
import { resolveAsset } from './media';
import { Lottie, Rive } from './players';
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

const tone = (s: TextStyle | undefined, state: IslandState): TextStyle | undefined => (s?.color ? { ...s, color: fill(s.color, state) } : s);

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
    case 'stack': {
      const s = node.style ?? {};
      // The first child sets the size; the rest sit centered on top of it.
      return (
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', flexShrink: 0, padding: s.padding, background: s.background, borderRadius: s.radius, width: s.width, height: s.height, opacity: s.opacity }}>
          {node.children.map((child, i) => (
            <div key={i} style={{ gridArea: '1 / 1', display: 'grid', placeItems: 'center', pointerEvents: i === 0 ? undefined : 'none', ...(i === 0 ? {} : { position: 'relative', zIndex: i }) }}>
              <Node node={child} ctx={ctx} />
            </div>
          ))}
        </div>
      );
    }
    case 'text': {
      const value = fill(node.text, state);
      // Colors may come from state too ('{tone}': green, then amber when credits run low).
      const style = textStyle(tone(node.style, state), theme);
      const lines = node.style?.lines ?? 1;
      if (node.style?.mono) return <Roll value={value} style={style} />;
      return <span className="hi-text" style={{ ...style, WebkitLineClamp: lines, whiteSpace: lines === 1 ? 'nowrap' : undefined }}>{value}</span>;
    }
    case 'icon':
      return <Icon name={node.name ? fill(node.name, state) : undefined} path={node.path} viewBox={node.viewBox} stroke={node.stroke} size={node.size ?? 18} width={node.width} color={node.color ?? theme.foreground} />;
    case 'image': {
      const size = node.size ?? 32;
      const name = fill(node.uri, state);
      const asset = name ? resolveAsset(name) : null;
      const uri = asset?.url ?? name;
      const box: CSSProperties = { width: node.width ?? size, height: size, borderRadius: node.radius ?? 8, flexShrink: 0, objectFit: node.fit ?? 'cover', display: 'block' };
      return (
        <AnimatePresence mode="popLayout" initial={false}>
          {!uri ? (
            <motion.span key="empty" className="hi-shimmer" style={{ ...box, background: 'rgba(255,255,255,0.08)' }} exit={{ opacity: 0 }} />
          ) : (
            <motion.span key={uri} style={{ position: 'relative', flexShrink: 0, display: 'block' }} initial={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.3 }}>
              {node.glow ? <img src={uri} alt="" aria-hidden style={{ ...box, position: 'absolute', inset: 0, filter: 'blur(18px) saturate(1.6)', opacity: 0.75, transform: 'scale(1.6)' }} /> : null}
              <img src={uri} alt="" decoding="async" draggable={false} style={{ ...box, position: 'relative', filter: asset?.kind === 'image' ? 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' : undefined }} />
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
      return <Track value={num(node.value, state)} marker={node.marker ? fill(node.marker, state) : ''} end={node.end ? fill(node.end, state) : ''} markerSize={node.markerSize} flip={node.flip} height={node.height ?? 4} color={color} track={node.track ?? alpha(color)} puck={theme.material === 'glass' ? 'transparent' : theme.background} grow={inRow} />;
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
      return <Arc value={num(node.value, state)} height={node.height ?? 64} thickness={node.thickness ?? 4} colors={colors} track={node.track ?? alpha('#FFFFFF', 0.3)} glow={node.glow ?? true} marker={node.marker ? fill(node.marker, state) : undefined} markerSize={node.markerSize ?? 28} accent={theme.accent} />;
    }
    case 'timeline': {
      const color = node.color ?? theme.accent;
      return <Timeline value={num(node.value, state)} icons={node.icons.map((i) => fill(i, state))} size={node.size ?? 30} color={color} track={node.track ?? alpha('#FFFFFF', 0.14)} ink={node.ink ?? theme.background} />;
    }
    case 'timer':
      return <Timer to={num(node.to, state)} countUp={node.countUp} style={textStyle(tone(node.style, state), theme)} />;
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
    case 'lottie': {
      const name = fill(node.uri, state);
      const asset = resolveAsset(name);
      // Keyed by source, so swapping animations restarts cleanly.
      return asset ? <Lottie key={name} src={asset.url} size={node.size ?? 28} width={node.width} loop={node.loop ?? true} speed={node.speed} /> : null;
    }
    case 'rive': {
      const asset = resolveAsset(fill(node.uri, state));
      if (!asset) return null;
      const inputs = Object.fromEntries(Object.entries(node.inputs ?? {}).map(([k, v]) => {
        if (typeof v === 'boolean') return [k, v];
        const key = typeof v === 'string' && /^\{\w+\}$/.test(v) ? v.slice(1, -1) : '';
        return [k, key && typeof state[key] === 'boolean' ? (state[key] as boolean) : num(v, state)];
      }));
      return <Rive src={asset.url} size={node.size ?? 40} width={node.width} artboard={node.artboard} stateMachine={node.stateMachine} trigger={node.trigger ? fill(node.trigger, state) : undefined} inputs={inputs} />;
    }
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
      {chars.map((ch, i) => /\d/.test(ch) ? (
        <span key={chars.length - i} className="hi-slot" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
            <motion.span key={ch} custom={dir.current} variants={rollVariants} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : <span key={chars.length - i} aria-hidden style={{ whiteSpace: 'pre' }}>{ch}</span>)}
    </span>
  );
}
const rollVariants = {
  enter: (d: number) => ({ y: `${80 * d}%`, opacity: 0, scale: 0.75, filter: 'blur(2px)' }),
  center: { y: '0%', opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: (d: number) => ({ y: `${-80 * d}%`, opacity: 0, scale: 0.75, filter: 'blur(2px)' }),
};

function Timer({ to, countUp, style }: { to: number; countUp?: boolean; style: CSSProperties }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // Tick on the second boundary of `to`, so every timer on screen flips together and on time.
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      t = setTimeout(tick, 1000 - ((((n - to) % 1000) + 1000) % 1000) + 5);
    };
    tick();
    return () => clearTimeout(t);
  }, [to]);
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
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  const base = node.color ?? theme.accent;
  const tinted = !!node.tint && !armed;
  const ink = armed ? theme.background : node.textColor ?? (node.tint ? base : theme.background);
  const label = armed && node.confirm ? fill(node.confirm, state) : node.label ? fill(node.label, state) : undefined;
  const icon = node.icon ? fill(node.icon, state) : undefined;
  const shape = node.shape ?? 'pill';
  const object = !!icon && isAsset(icon);
  const press = () => {
    // The button becomes its own confirmation: same place, more context, second tap commits.
    if (node.confirm && !armed) return setArmed(true);
    setArmed(false);
    ctx.onAction(node.action);
  };
  const fam = familyOf(theme);

  if (shape === 'tile') {
    // Launcher tile: a glyph on a solid squircle (an image or animation on a tinted one), label under it.
    return (
      <motion.button type="button" className="hi-tile" onClick={press} aria-label={label ?? node.action} whileTap={{ scale: 0.9 }} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} style={{ fontFamily: fam }}>
        <span className="hi-tile-sq" style={object
          ? { background: `linear-gradient(160deg, rgba(255,255,255,.18), rgba(255,255,255,0) 55%), ${alpha(base, 0.2)}`, boxShadow: `inset 0 0 0 0.5px ${alpha(base, 0.5)}, inset 0 1px 0 rgba(255,255,255,.25), 0 8px 18px -10px ${base}` }
          : { background: `linear-gradient(160deg, rgba(255,255,255,.28), rgba(255,255,255,0) 60%), ${base}` }}>
          {icon ? <Mark name={icon} size={object ? 36 : 26} color={node.textColor ?? '#FFFFFF'} /> : null}
        </span>
        {node.label ? <span className="hi-tile-label" style={{ color: theme.foreground }}>{fill(node.label, state)}</span> : null}
      </motion.button>
    );
  }

  const circle = shape === 'circle' || (!label && !!icon);
  return (
    <motion.button type="button" className={`hi-btn${circle && !armed ? ' hi-btn-circle' : ''}`} onClick={press} layout="size"
      aria-label={label ?? node.action}
      initial={false} animate={{ backgroundColor: tinted ? alpha(base, 0.22) : base, color: ink }} whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      style={{ flexGrow: inRow && !circle ? 1 : undefined, fontFamily: fam }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={`${armed}|${icon}|${label}`} className="hi-btn-in" initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }} transition={{ duration: 0.22 }}>
          {icon && !armed ? <Mark name={icon} size={object ? (circle ? 26 : 22) : circle ? 20 : 17} color="currentColor" /> : null}
          {label ? <span>{label}</span> : null}
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
  // A segmented choice; the tinted knob slides between options like a physical control.
  return (
    <div className="hi-chips" role="radiogroup" style={{ background: alpha('#FFFFFF', 0.06), fontFamily: familyOf(ctx.theme) }}>
      {node.options.map((label, i) => {
        const value = node.values?.[i] ?? label;
        const selected = current === value;
        return (
          <button key={i} type="button" role="radio" aria-checked={selected} onClick={() => pick(i)} style={{ color: selected ? color : ctx.theme.secondary }}>
            {selected ? <motion.span layoutId={id} className="hi-chip-bg" style={{ background: alpha(color, 0.22), boxShadow: `inset 0 0 0 0.5px ${alpha(color, 0.45)}` }} transition={{ type: 'spring', stiffness: 520, damping: 36 }} /> : null}
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
