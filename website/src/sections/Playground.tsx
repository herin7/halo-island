import { IslandTemplate, Mood, Motion, button, column, pet, ring, row, steps, text } from 'halo-island';
import { motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Code, CopyButton } from '../components/Code';
import { MOODS, useWidth } from '../island/graphics';
import { Island } from '../island/Island';
import { Head, Rise } from '../ui';

const SWATCHES = ['#8B7CFF', '#FF375F', '#30D158', '#FF9F0A', '#5AC8FA', '#FFD60A', '#F4F2EC'];
const MOTIONS: Exclude<Motion, object>[] = ['minimal', 'island', 'bouncy', 'snappy', 'smooth'];
const GREY = '#8E8E93';

interface Opts { accent: string; material: 'solid' | 'glass'; aura: boolean; glow: boolean; motion: Exclude<Motion, object>; mood: Mood }

function build(o: Opts): IslandTemplate {
  return {
    compact: { leading: pet(o.mood, { size: 26 }), trailing: text('{left}', { weight: 'heavy', mono: true, color: o.accent, size: 16 }) },
    expanded: column({ gap: 16 },
      row({ gap: 14 },
        ring('{p}', { size: 52, thickness: 6 }),
        column({ gap: 2, grow: true }, text('Deep work', { size: 22, weight: 'heavy' }), text('{left} left · round 3 of 4', { size: 13, color: GREY }))),
      steps(2.6, 4, { height: 5 }),
      row({ gap: 10 },
        column({ grow: true }, button('pause', 'Pause', { icon: 'pause', tint: true })),
        column({ grow: true }, button('done', 'Done', { icon: 'check' })))),
    theme: { accent: o.accent, material: o.material, aura: o.aura ? o.accent : undefined, glow: o.glow ? o.accent : undefined },
    motion: o.motion,
  };
}

function codeOf(o: Opts) {
  const theme = [`accent: '${o.accent}'`, o.material === 'glass' && `material: 'glass'`, o.aura && `aura: '${o.accent}'`, o.glow && `glow: '${o.accent}'`].filter(Boolean).join(', ');
  return `import { island, row, column, text, pet, ring, steps, button } from 'halo-island'

export const focus = island({
  compact: {
    leading: pet('${o.mood}', { size: 26 }),
    trailing: text('{left}', { weight: 'heavy', mono: true, color: '${o.accent}' }),
  },
  expanded: column({ gap: 16 },
    row({ gap: 14 },
      ring('{p}', { size: 52, thickness: 6 }),
      column({ grow: true }, text('Deep work', { size: 22, weight: 'heavy' }), text('{left} left · round 3 of 4'))),
    steps(2.6, 4),
    row({ gap: 10 }, button('pause', 'Pause', { icon: 'pause', tint: true }), button('done', 'Done', { icon: 'check' })),
  ),
  theme: { ${theme} },
  motion: '${o.motion}',
})

focus.start({ left: '18:42', p: 0.62 })`;
}

export function Playground() {
  const [o, setO] = useState<Opts>({ accent: '#8B7CFF', material: 'glass', aura: true, glow: false, motion: 'minimal', mood: 'happy' });
  const [open, setOpen] = useState(true);
  const [left, setLeft] = useState(18 * 60 + 42);
  const [stageRef, stageW] = useWidth<HTMLDivElement>();
  const set = (p: Partial<Opts>) => setO((s) => ({ ...s, ...p }));
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => (l <= 0 ? 25 * 60 : l - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const template = useMemo(() => build(o), [o]);
  const code = codeOf(o);
  const prev = useRef(code);
  const changed = useMemo(() => {
    const a = prev.current.split('\n');
    prev.current = code;
    const out = new Set<number>();
    code.split('\n').forEach((l, i) => l !== a[i] && out.add(i));
    return out;
  }, [code]);
  const state = { left: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, p: Math.round((left / (25 * 60)) * 100) / 100 };

  return (
    <section className="section" id="playground" style={{ ['--accent' as string]: o.accent }}>
      <div className="wrap">
        <Head eyebrow="Playground" title={<>Tune it. <em>Ship the JSON.</em></>} lede="Colors, glass, aura, springs and moods are theme fields, not code paths. Change one and the template on the right is what you paste." />
        <Rise className="play">
          <div className="panel controls">
            <div className="ctl">
              <span className="lbl">Accent</span>
              <div className="swatches">
                {SWATCHES.map((c) => <button key={c} type="button" className="swatch" aria-label={`Accent ${c}`} aria-pressed={o.accent === c} style={{ background: c, color: c }} onClick={() => set({ accent: c })} />)}
                <label className="swatch swatch-custom" aria-label="Custom accent color" style={{ color: o.accent }}>
                  <input type="color" value={o.accent.length === 7 ? o.accent : '#8b7cff'} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} />
                </label>
              </div>
            </div>
            <Seg label="Material" value={o.material} options={['solid', 'glass']} onChange={(material) => set({ material })} />
            <Seg label="Motion" value={o.motion} options={MOTIONS} onChange={(m) => set({ motion: m })} />
            <Seg label="Island" value={open ? 'expanded' : 'compact'} options={['compact', 'expanded']} onChange={(v) => setOpen(v === 'expanded')} />
            <div className="ctl" style={{ display: 'grid', gap: 12 }}>
              <Switch label="Aura (light pools below)" on={o.aura} set={(aura) => set({ aura })} />
              <Switch label="Glow (border breathes)" on={o.glow} set={(glow) => set({ glow })} />
            </div>
            <div className="ctl">
              <span className="lbl">Pet mood</span>
              <div className="moods">
                {MOODS.map((m) => <button key={m} type="button" aria-pressed={o.mood === m} onClick={() => set({ mood: m })}>{m}</button>)}
              </div>
            </div>
          </div>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="stage" ref={stageRef}>
              <div className="blobs" aria-hidden>
                <div className="blob b1" style={{ background: o.accent }} />
                <div className="blob b2" />
                <div className="blob b3" />
              </div>
              <div className="stage-words" aria-hidden>halo</div>
              {stageW ? <div style={{ position: 'relative', zIndex: 2 }}>
                <Island template={template} state={state} expanded={open} onExpandedChange={setOpen} width={Math.min(371, stageW - 24)} label="Playground island" />
              </div> : null}
            </div>
            <div className="panel-bar"><span className="grow">focus.ts</span><CopyButton text={code} className="chip-btn" /></div>
            <Code src={code} id="pg" changed={changed} />
          </div>
        </Rise>
      </div>
    </section>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="ctl">
      <span className="lbl">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((opt) => (
          <button key={opt} type="button" aria-pressed={value === opt} onClick={() => onChange(opt)}>
            {value === opt ? <motion.span layoutId={id} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} /> : null}
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="switch" onClick={() => set(!on)}>
      <span>{label}</span>
      <span className="switch-track"><motion.span layout className="switch-knob" transition={{ type: 'spring', stiffness: 600, damping: 34 }} /></span>
    </button>
  );
}
