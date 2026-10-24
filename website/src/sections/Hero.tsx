import { IslandState, IslandTemplate, button, column, pet, row, text } from 'halo-island';
import { motion, useReducedMotion } from 'motion/react';
import { PointerEvent, useEffect, useRef, useState } from 'react';

import { scenarios } from '../../../example/catalog';
import { CopyButton } from '../components/Code';
import { Island } from '../island/Island';
import { patchOf, storyLength } from '../story';
import { GitHubIcon, useViewport } from '../ui';

const GREY = '#8E8E93';
const HALO = '#8B7CFF';

/** The site's mascot: the island itself, with eyes. */
const petTemplate: IslandTemplate = {
  compact: { leading: pet('{mood}', { size: 24, color: '#FFFFFF' }), trailing: text('{hello}', { size: 15, weight: 'bold' }) },
  // The header already wears the face; the body talks.
  expanded: column({ gap: 16 },
    column({ gap: 2 },
      text('Hi, I’m Halo.', { size: 30, font: 'InstrumentSerif_400Regular_Italic' }),
      text('I live in the island and I follow your cursor. Try a face.', { size: 13, color: GREY, lines: 2 })),
    row({ gap: 8 },
      column({ grow: true }, button('mood:happy', 'Happy', { color: HALO, tint: true })),
      column({ grow: true }, button('mood:love', 'Love', { color: '#FF5DA2', tint: true })),
      column({ grow: true }, button('mood:wink', 'Wink', { color: '#FFD60A', tint: true }))),
  ),
  theme: { accent: HALO },
};

type Reaction = { mood: string; hello: string } | null;
const PET_GAP = 2400;
const OPEN_AT = 1100;
const HOLD_OPEN = 2600;

export function Hero() {
  const reduced = useReducedMotion();
  const vw = useViewport();
  const [idx, setIdx] = useState(-1);
  const next = useRef(0);
  const [state, setState] = useState<IslandState>({});
  const [open, setOpen] = useState(false);
  const [react, setReact] = useState<Reaction>(null);
  const [petState, setPetState] = useState({ mood: 'happy', hello: 'Hi there' });
  const [userHold, setUserHold] = useState(false);
  const hero = useRef<HTMLElement>(null);

  const showingPet = idx === -1 || !!react;
  const scenario = idx >= 0 ? scenarios[idx] : null;
  const accent = showingPet || !scenario ? HALO : scenario.color;

  // The show: pet, then a real live activity with its story, then pet again…
  useEffect(() => {
    if (react || userHold) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (idx === -1) {
      setOpen(false);
      setPetState((p) => ({ mood: p.mood === 'sleepy' ? 'idle' : p.mood, hello: p.hello }));
      at(900, () => setPetState({ mood: 'idle', hello: 'Watch this' }));
      at(PET_GAP, () => { setIdx(next.current); next.current = (next.current + 1) % scenarios.length; });
    } else {
      const sc = scenarios[idx];
      setState(sc.initial());
      setOpen(false);
      // Wide screens have room to keep it open; phones pop it open only on alerts, like iOS.
      const roomy = window.innerWidth >= 900;
      let t = OPEN_AT;
      if (roomy || !sc.story.some(([, , alert]) => alert)) at(t, () => setOpen(true));
      for (const beat of sc.story) {
        const [delay, , alert] = beat;
        t += delay;
        at(t, () => setState((s) => ({ ...s, ...patchOf(beat, s) })));
        if (!roomy && alert) { at(t, () => setOpen(true)); at(t + 2400, () => setOpen(false)); }
      }
      t += roomy ? HOLD_OPEN : 1400;
      at(t, () => setOpen(false));
      at(t + 800, () => setIdx(-1));
    }
    return () => timers.forEach(clearTimeout);
  }, [idx, react, userHold]);

  // Reactions: idle too long → sleepy; any movement wakes it.
  useEffect(() => {
    let last = performance.now();
    let asleep = false;
    const move = () => {
      last = performance.now();
      if (asleep) { asleep = false; flash({ mood: 'surprised', hello: 'Oh! Hi' }, 1200); }
    };
    const id = setInterval(() => {
      if (!asleep && performance.now() - last > 9000 && window.scrollY < window.innerHeight) {
        asleep = true;
        setIdx(-1);
        setReact({ mood: 'sleepy', hello: 'zzz' });
      }
    }, 1000);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('keydown', move);
    return () => { clearInterval(id); window.removeEventListener('pointermove', move); window.removeEventListener('keydown', move); };
  }, []);

  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function flash(r: NonNullable<Reaction>, ms: number) {
    clearTimeout(flashTimer.current);
    setOpen(false);
    setIdx(-1);
    setReact(r);
    if (ms) flashTimer.current = setTimeout(() => setReact(null), ms);
  }
  const hoverCta = (on: boolean) => {
    if (on) flash({ mood: 'happy', hello: 'Yes, that!' }, 0);
    else flashTimer.current = setTimeout(() => setReact(null), 700);
  };

  const spotlight = (e: PointerEvent) => {
    const el = hero.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const k = vw >= 900 ? 1.18 : 1;
  const width = Math.min(371, (vw - 16) / k);
  const totalMs = scenario ? OPEN_AT + storyLength(scenario) + HOLD_OPEN : 0;
  const tpl = showingPet ? petTemplate : scenario!.template;

  return (
    <section ref={hero} className="hero" onPointerMove={spotlight} style={{ ['--accent' as string]: accent }}
      onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('hero-body')) flash({ mood: 'surprised', hello: 'Whoa!' }, 1300); }}>
      <div className="hero-bg" aria-hidden>
        <motion.div className="hero-aura" animate={{ backgroundColor: accent }} transition={{ duration: 1.2 }} />
        <motion.div className="hero-floor" animate={{ backgroundColor: accent }} transition={{ duration: 1.2 }} />
        <div className="hero-grid" />
        <div className="hero-spot" />
      </div>

      <div className="hero-island">
        <Island
          template={tpl}
          id={showingPet ? 'pet' : scenario!.id}
          state={showingPet ? (react ?? petState) : state}
          expanded={open}
          width={width}
          label={showingPet ? 'Halo, the island pet' : `${scenario!.title} live activity`}
          onExpandedChange={(o) => { setOpen(o); setUserHold(o); }}
          onAction={(a) => {
            if (a.startsWith('mood:')) { setPetState({ mood: a.slice(5), hello: '♥' }); return; }
          }}
        />
      </div>

      <div className="hero-body">
        <h1>
          <Reveal text="The Dynamic Island" delay={0.1} reduced={!!reduced} />
          <span className="line serif"><Reveal text="on every phone." delay={0.35} reduced={!!reduced} /></span>
        </h1>
        <motion.p className="hero-sub" initial={reduced ? false : { opacity: 0, y: 16, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.75, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          Live Activities, an in-app island, and an Android island that floats over other apps. One JSON design, every surface. Open source, for React Native.
        </motion.p>
        <motion.div className="cta-row" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <div className="npm" onPointerEnter={(e) => e.pointerType === 'mouse' && hoverCta(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && hoverCta(false)}>
            <span><span className="dollar">$ </span>npm i halo-island</span>
            <CopyButton text="npm i halo-island" />
          </div>
          <a className="btn btn-primary" href="https://github.com/herin7/halo-island" target="_blank" rel="noreferrer" onPointerEnter={(e) => e.pointerType === 'mouse' && hoverCta(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && hoverCta(false)} onFocus={() => hoverCta(true)} onBlur={() => hoverCta(false)}>
            <GitHubIcon /> Star on GitHub
          </a>
        </motion.div>
      </div>

      <nav className="ticker" aria-label="Live activities in the hero">
        {scenarios.map((s, i) => (
          <button key={s.id} type="button" className={idx === i && !react ? 'on' : undefined} onClick={() => { clearTimeout(flashTimer.current); setReact(null); setUserHold(false); setIdx(i); next.current = (i + 1) % scenarios.length; }}>
            {idx === i && !react ? <motion.span key={`${i}-${idx}`} className="fillbar" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: totalMs / 1000, ease: 'linear' }} /> : null}
            <span>{s.title}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}

/** Words rise out of a blur, one after another. */
function Reveal({ text: value, delay, reduced }: { text: string; delay: number; reduced: boolean }) {
  return (
    <span className="line">
      {value.split(' ').map((w, i, all) => (
        <motion.span key={i} className="word" initial={reduced ? false : { opacity: 0, y: '0.4em', filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          transition={{ delay: delay + i * 0.08, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          {w}{i < all.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}

