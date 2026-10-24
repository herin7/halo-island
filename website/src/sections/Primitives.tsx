import { IslandNode, IslandState, arc, bar, bars, button, chips, fx, icon, image, line, pet, ring, row, slider, steps, text, timeline, timer, toggle, track } from 'halo-island';
import { useEffect, useRef, useState } from 'react';

import { MOODS } from '../island/graphics';
import { Ctx, Node } from '../island/nodes';
import { themeOf } from '../island/util';
import { Head, Rise, useInView } from '../ui';

const T = themeOf({ compact: {}, theme: { accent: '#8B7CFF' } });

const PRIMS: { name: string; code: string; node: IslandNode }[] = [
  { name: 'text · mono', code: "text('{n}', { mono: true })", node: text('{n}', { size: 40, weight: 'heavy', mono: true, align: 'center' }) },
  { name: 'ring', code: "ring('{p}')", node: row({ justify: 'center' }, ring('{p}', { size: 72, thickness: 8, color: '#30D158' })) },
  { name: 'pet', code: "pet('{mood}')", node: row({ justify: 'center' }, pet('{mood}', { size: 52 })) },
  { name: 'bars · animate', code: "bars('{v}', { animate: true })", node: bars('{v}', { height: 64, gap: 4, color: '#FF375F', animate: true }) },
  { name: 'line', code: "line('{v}')", node: line('{v}', { height: 64, color: '#5AC8FA' }) },
  { name: 'arc', code: "arc('{p}')", node: arc('{p}', { height: 56, colors: ['#FF9F0A', '#FFD60A', '#FFF3B0'] }) },
  { name: 'timeline', code: "timeline('{s}', icons)", node: timeline('{s}', ['check', 'bag', 'navigate', 'location'], { color: '#FC8019', ink: '#000000', size: 32 }) },
  { name: 'track', code: "track('{p}', 'navigate')", node: track('{p}', 'navigate', { color: '#FFD60A', height: 4 }) },
  { name: 'chips', code: "chips('size', options)", node: chips('size', ['S', 'M', 'L', 'XL'], { color: '#F4F2EC' }) },
  { name: 'slider', code: "slider('vol', { icon })", node: slider('vol', { icon: 'volume', color: '#F4F2EC', height: 44 }) },
  { name: 'toggle', code: "toggle('wifi', 'Wi-Fi')", node: row({ gap: 8 }, toggle('wifi', 'Wi-Fi', { icon: 'bolt', color: '#5AC8FA' }), toggle('dnd', 'Focus', { icon: 'moon', color: '#8B7CFF' })) },
  { name: 'button · confirm', code: "button('pay', 'Pay', { confirm })", node: row({ justify: 'center' }, button('pay', 'Pay ₹499', { icon: 'rupee', color: '#30D158', textColor: '#000000', confirm: 'Sure? Tap again' })) },
  { name: 'timer', code: "timer('{endsAt}')", node: timer('{endsAt}', { style: { size: 40, weight: 'heavy', align: 'center' } }) },
  { name: 'bar · steps', code: "bar('{p}') · steps('{s}', 4)", node: { type: 'column', style: { gap: 14 }, children: [bar('{p}', { height: 8, color: '#BF5AF2' }), steps('{s}', 4, { height: 8, color: '#BF5AF2' })] } },
  { name: 'effects', code: "fx(icon('bell'), 'wiggle')", node: row({ justify: 'between' }, fx(icon('heart', { size: 26, color: '#FF375F' }), 'pulse'), fx(icon('bell', { size: 26, color: '#FFD60A' }), 'wiggle'), fx(icon('sparkle', { size: 26, color: '#BF5AF2' }), 'spin'), fx(icon('location', { size: 26, color: '#30D158' }), 'bounce'), fx(text('LIVE', { weight: 'heavy', color: '#FF453A' }), 'shimmer')) },
  { name: 'image · glow', code: "image(uri, { glow: true })", node: row({ justify: 'center' }, image('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=70', { size: 72, radius: 18, glow: true })) },
];

const wave = (n: number) => Array.from({ length: n }, () => (0.2 + Math.random() * 0.8).toFixed(2)).join(',');

export function Primitives() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, '100px');
  const [state, setState] = useState<IslandState>(() => ({ n: 128, p: 0.42, s: 2.4, v: wave(12), mood: 'happy', size: 'M', vol: 0.6, wifi: true, dnd: false, endsAt: Date.now() + 4 * 60_000 + 59_000 }));
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setState((s) => ({
        ...s,
        n: Number(s.n) + Math.ceil(Math.random() * 9),
        p: Math.round((0.15 + Math.random() * 0.8) * 100) / 100,
        s: (Number(s.s) % 4) + 0.6,
        v: wave(12),
        mood: i % 2 ? MOODS[(MOODS.indexOf(s.mood as never) + 1) % MOODS.length] : s.mood,
      }));
    }, 1800);
    return () => clearInterval(t);
  }, [inView]);
  const ctx: Ctx = { state, theme: T, onAction: () => {}, setState: (p) => setState((s) => ({ ...s, ...p })) };
  return (
    <section className="section" id="primitives" ref={ref}>
      <div className="wrap">
        <Head eyebrow="Primitives" title={<>Twenty pieces. <em>Every island.</em></>} lede="A closed set of nodes the native renderers interpret: no code ships over the air, only data. Every card below is the real renderer, and the inputs work." />
        <div className="prims">
          {PRIMS.map((p, i) => (
            <Rise key={p.name} className="prim" delay={(i % 4) * 0.05}>
              <div className="prim-view"><div><Node node={p.node} ctx={ctx} /></div></div>
              <div className="prim-meta"><b>{p.name}</b><code>{p.code}</code></div>
            </Rise>
          ))}
        </div>
      </div>
    </section>
  );
}
