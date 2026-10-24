import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import SHOWCASE from '../../../example/catalog.ts?raw';
import { Group, Scenario, groups, scenarios } from '../../../example/catalog';
import { Code, CopyButton } from '../components/Code';
import { Phone } from '../components/Phone';
import { Icon, useWidth } from '../island/graphics';
import { Island } from '../island/Island';
import { useStory } from '../story';
import { Head, Rise, useInView } from '../ui';

const TODAY = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');

/** The scenario's literal source from example/catalog.ts — what you'd copy into your app. */
function sourceOf(id: string) {
  const at = SHOWCASE.indexOf(`id: '${id}'`);
  if (at < 0) return '';
  const start = SHOWCASE.lastIndexOf('\n  {', at) + 1;
  const end = SHOWCASE.indexOf('\n  },', at);
  return SHOWCASE.slice(start, end + 4).split('\n').map((l) => l.replace(/^ {2}/, '')).join('\n').replace(/,$/, '');
}

export function Gallery() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'phone' | 'code'>('phone');
  const current = scenarios.find((s) => s.id === openId) ?? null;
  const [group, setGroup] = useState<Group | 'All'>('All');
  const tabs = (['All', ...groups.filter((g) => scenarios.some((s) => s.group === g))] as const);
  const list = group === 'All' ? scenarios : scenarios.filter((s) => s.group === group);
  // The grid plays itself: one card at a time opens and runs its story, until you hover.
  const grid = useRef<HTMLDivElement>(null);
  const inView = useInView(grid, '-15% 0px');
  const [hovering, setHovering] = useState(false);
  const [auto, setAuto] = useState(-1);
  useEffect(() => {
    if (!inView || hovering || openId) return setAuto(-1);
    let i = 0;
    setAuto(0);
    const t = setInterval(() => setAuto(++i % list.length), 4200);
    return () => clearInterval(t);
  }, [inView, hovering, openId, group]);
  return (
    <section className="section" id="gallery" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <Head eyebrow="Gallery" title={<>Real apps, <em>real stories.</em></>} lede={`${scenarios.length} live activities: food, rides, lessons, limits, meds, raids. Each is plain JSON, laid out like Apple’s own Live Activities. Hover one, play its story, tap its buttons, steal the template.`} />
        <div className="tabs-row" role="tablist" aria-label="Filter by use case">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={group === t} className="tab" onClick={() => setGroup(t)}>
              {group === t ? <motion.span layoutId="gal-tab" className="tab-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} /> : null}
              <span>{t}</span>
            </button>
          ))}
        </div>
        <div className="gallery" ref={grid} onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)} onPointerLeave={() => setHovering(false)}>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((s, i) => (
              <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.94, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                <Card scenario={s} auto={auto === i} onPlay={() => { setTab('phone'); setOpenId(s.id); }} onCode={() => { setTab('code'); setOpenId(s.id); }} />
              </motion.div>
            ))}
          </AnimatePresence>
          <Rise className="card card-cta">
            <span className="eyebrow">Yours next</span>
            <div>
              <h3>Your app, <em>in the island.</em></h3>
              <p>Every card is plain JSON and a few state keys. Start from the closest one, change colors and copy, ship it.</p>
              <a className="chip-btn solid" href="#playground" style={{ display: 'inline-flex' }}>Open the playground</a>
            </div>
          </Rise>
        </div>
      </div>
      <AnimatePresence>{current ? <Modal key={current.id} scenario={current} tab={tab} setTab={setTab} onClose={() => setOpenId(null)} /> : null}</AnimatePresence>
    </section>
  );
}

function Card({ scenario, auto, onPlay, onCode }: { scenario: Scenario; auto: boolean; onPlay: () => void; onCode: () => void }) {
  const [hover, setHover] = useState(false);
  const [tapped, setTapped] = useState(false);
  const open = hover || tapped || auto;
  const { state, act, patch } = useStory(scenario, open, { delay: 300 });
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <article className={`card${open ? ' is-open' : ''}`} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={() => setHover(false)} style={{ ['--c' as string]: scenario.color }}>
      <div className="card-stage" ref={ref}>
        <div className="card-glow" />
        {/* A phone's top edge: the island lives where it really would, and grows down when it opens. */}
        <div className="card-status" aria-hidden><span /><span className="card-batt" /></div>
        {/* Lock screen under the island; it steps back when the island opens over it. */}
        <motion.div className="card-clock" aria-hidden initial={false} animate={open ? { opacity: 0, y: 24, filter: 'blur(6px)' } : { opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
          <span className="card-date">{TODAY}</span>
          <span className="card-time">9:41</span>
        </motion.div>
        <div className="card-island" style={{ top: 14 }}>
          {w ? <Island template={scenario.template} state={state} expanded={open} onExpandedChange={setTapped} onState={patch} onAction={act} width={Math.min(371, w - 20)} gap={40} label={`${scenario.title}: ${scenario.about}`} /> : null}
        </div>
      </div>
      <div className="card-foot">
        <div className="grow"><h3>{scenario.title} <span className="card-group">{scenario.group}</span></h3><p>{scenario.about}</p></div>
        <button type="button" className="chip-btn" onClick={onCode} aria-label={`View ${scenario.title} template code`}>Code</button>
        <button type="button" className="chip-btn solid" onClick={onPlay} aria-label={`Play the ${scenario.title} story`}><Icon name="play" size={14} color="currentColor" />Play</button>
      </div>
    </article>
  );
}

function Modal({ scenario, tab, setTab, onClose }: { scenario: Scenario; tab: 'phone' | 'code'; setTab: (t: 'phone' | 'code') => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const { state, replay, act, patch } = useStory(scenario, true, { onAlert: () => setOpen(true), loopAfter: scenario.story.length ? 3000 : undefined, delay: 1200 });
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const src = sourceOf(scenario.id);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => setOpen(true), 900);
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !dialog.current) return;
      // Keep Tab inside the dialog: wrap from last to first and back.
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const inside = dialog.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { first.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', key); document.body.style.overflow = ''; opener?.focus({ preventScroll: true }); };
  }, []);
  const accent = scenario.color;
  return (
    <motion.div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label={`${scenario.title} live activity`} data-tab={tab} style={{ ['--c' as string]: accent }}
        initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.97 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <div className="modal-phone">
          <div style={{ width: '100%', maxWidth: 300 }}>
            <Phone label={`${scenario.title} story playing on a phone`}>
              <div className="wall" style={{ background: `radial-gradient(90% 55% at 50% 0%, ${accent}33, #000 70%)` }} />
              <div className="phone-island">
                <Island template={scenario.template} state={state} expanded={open} onExpandedChange={setOpen} onState={patch} onAction={act} width={371} gap={44} />
              </div>
              <div className="screen-app" style={{ paddingTop: 330 }} aria-hidden>
                <div className="ui-title">{scenario.title}</div>
                <div className="ui-muted">{scenario.about}</div>
                <div className="ui-card" style={{ display: 'grid', gap: 10 }}><div className="ui-skel" style={{ width: '50%' }} /><div className="ui-skel" /><div className="ui-skel" style={{ width: '70%' }} /></div>
              </div>
            </Phone>
          </div>
        </div>
        <div className="modal-code">
          <div className="modal-head">
            <div style={{ flex: 1, minWidth: 0 }}><h3>{scenario.title}</h3><p>{scenario.about}</p></div>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'phone'} className={`chip-btn${tab === 'phone' ? ' solid' : ''}`} onClick={() => setTab('phone')}>Live</button>
              <button type="button" role="tab" aria-selected={tab === 'code'} className={`chip-btn${tab === 'code' ? ' solid' : ''}`} onClick={() => setTab('code')}>Code</button>
            </div>
            <button type="button" className="chip-btn" onClick={() => { setOpen(false); replay(); setTimeout(() => setOpen(true), 900); }}>Replay</button>
            <CopyButton text={src} className="chip-btn" />
            <button ref={close} type="button" className="close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} color="currentColor" /></button>
          </div>
          <Code src={src} id={`m-${scenario.id}`} />
        </div>
      </motion.div>
    </motion.div>
  );
}
