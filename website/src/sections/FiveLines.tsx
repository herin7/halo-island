import type { IslandState } from 'halo-island';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { scenarios } from '../../../example/showcase';
import { Code } from '../components/Code';
import { Phone } from '../components/Phone';
import { Island } from '../island/Island';
import { Head, Rise, useInView, useViewport } from '../ui';

const swiggy = scenarios.find((s) => s.id === 'swiggy')!;

const SRC = `import { island, useIslandAction } from 'halo-island'

const order = island(swiggy)
const live = order.start({ eta: 32, stage: 1 })
live.update({ eta: 9, rider: 'Ravi' }, { alert: true })
useIslandAction('call', () => dial(rider))
live.end()`;

/** What each line does to the island, so hovering the code drives it. */
const LINES: Record<number, { state?: IslandState; open?: boolean; gone?: boolean; note: string }> = {
  2: { state: { status: 'Order confirmed', items: 'Meghana Foods · 2 items', eta: 32, stage: 1 }, open: false, note: 'island(template) — nothing on screen yet, just the design' },
  3: { state: { status: 'Order confirmed', items: 'Meghana Foods · 2 items', eta: 32, stage: 1 }, open: false, note: 'start(state) — appears on every surface the phone has' },
  4: { state: { status: 'Ravi is on the way', items: 'Meghana Foods · 2 items', eta: 9, stage: 3.2, rider: 'Ravi' }, open: true, note: 'update(patch, { alert }) — only state travels; alert pops it open' },
  5: { state: { status: 'Ravi is on the way', items: 'Meghana Foods · 2 items', eta: 9, stage: 3.2, rider: 'Ravi' }, open: true, note: 'useIslandAction — buttons work from the island, lock screen, overlay. Tap “Call Ravi”.' },
  6: { gone: true, note: 'end() — gone everywhere, at once' },
};
const ORDER = [3, 4, 5, 6, 2];

export function FiveLines() {
  const [line, setLine] = useState(3);
  const [user, setUser] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const step = LINES[line];
  const vw = useViewport();

  // Plays itself until you take over.
  useEffect(() => {
    if (user || !inView) return;
    const t = setTimeout(() => setLine((l) => ORDER[(ORDER.indexOf(l) + 1) % ORDER.length]), 2800);
    return () => clearTimeout(t);
  }, [line, user, inView]);
  useEffect(() => { if (step.open != null) setOpen(step.open); }, [line]);

  const pick = (i: number) => { setUser(true); setLine(i); };

  return (
    <section className="section" id="code" ref={ref}>
      <div className="wrap">
        <Head eyebrow="The API" title={<>Five lines. <em>Every surface.</em></>} lede="A template is plain JSON. Start it with state, update only what changed, handle taps anywhere. Hover a line and watch the island do it." />
        <div className="split">
          <Rise className="panel" style={{ ['--accent' as string]: '#FC8019' }}>
            <div className="panel-bar"><i /><i /><i /><span className="grow" />order.ts</div>
            <Code src={SRC} id="five" active={line} interactive={(i) => i in LINES} onLine={pick} />
            <div className="log" aria-live="polite">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={log ?? step.note} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                  {log ? <><b>→ action</b> {log}</> : <><b>//</b> {step.note}</>}
                </motion.span>
              </AnimatePresence>
            </div>
          </Rise>
          <Rise delay={0.1} className="split-phone">
            <div style={{ maxWidth: 340, margin: '0 auto' }}>
              <Phone crop={vw < 900 ? 0.46 : 0.72} label="iPhone running the Swiggy island">
                <div className="wall" style={{ background: 'radial-gradient(90% 50% at 50% 0%, #3a1d08, #000 70%)' }} />
                <div className="phone-island">
                  <AnimatePresence>
                    {!step.gone ? (
                      <motion.div key="isl" initial={{ scale: 0.3, opacity: 0, filter: 'blur(6px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} exit={{ scale: 0.3, opacity: 0, filter: 'blur(6px)' }} transition={{ type: 'spring', stiffness: 340, damping: 26 }} style={{ transformOrigin: 'top center' }}>
                        <Island template={swiggy.template} state={step.state ?? {}} expanded={open} onExpandedChange={setOpen} width={371} gap={44}
                          onAction={(a) => { setLog(`'${a}' → your handler runs`); setTimeout(() => setLog(null), 2200); }} />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <FoodApp />
              </Phone>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}

function FoodApp() {
  return (
    <div className="screen-app" style={{ paddingTop: 330 }} aria-hidden>
      <div className="ui-title">Your order</div>
      <div className="ui-card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Chicken Biryani</span><span className="ui-muted">₹349</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mirchi ka Salan</span><span className="ui-muted">₹99</span></div>
      </div>
      <div className="ui-card" style={{ display: 'grid', gap: 10 }}><div className="ui-skel" style={{ width: '60%' }} /><div className="ui-skel" /><div className="ui-skel" style={{ width: '80%' }} /></div>
    </div>
  );
}
