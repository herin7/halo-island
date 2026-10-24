import { fill } from 'halo-island';
import { useRef, useState } from 'react';

import { scenarios } from '../../../example/showcase';
import { Phone } from '../components/Phone';
import { Icon } from '../island/graphics';
import { Island } from '../island/Island';
import { Ctx, Node } from '../island/nodes';
import { themeOf } from '../island/util';
import { useStory } from '../story';
import { Head, Rise, useInView } from '../ui';

const swiggy = scenarios.find((s) => s.id === 'swiggy')!;
const ORANGE = '#FC8019';

export function Surfaces() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, '-20% 0px');
  const [open, setOpen] = useState(false);
  const pop = () => { setOpen(true); setTimeout(() => setOpen(false), 3200); };
  const { state } = useStory(swiggy, inView, { onAlert: pop, loopAfter: 3500, delay: 1200 });
  const theme = themeOf(swiggy.template);
  const ctx: Ctx = { state, theme, onAction: () => {}, setState: () => {} };
  const card = swiggy.template.lockScreen ?? swiggy.template.expanded!;
  return (
    <section className="section" id="surfaces" ref={ref} style={{ ['--accent' as string]: ORANGE }}>
      <div className="wrap">
        <Head center eyebrow="Every surface" title={<>One design. <em>Both phones.</em></>} lede="The same template and the same state, rendered natively everywhere it can live. Below: one Swiggy order, in sync, on an iPhone and a Pixel." />
        <Rise className="duo">
          <figure>
            <Phone label="iPhone: Dynamic Island and a Lock Screen Live Activity">
              <div className="wall" style={{ background: 'linear-gradient(180deg, #1a1430, #050208 60%)' }} />
              <div className="lock-date">Friday 24 October</div>
              <div className="lock-time">9:41</div>
              <div className="phone-island"><Island template={swiggy.template} state={state} expanded={open} onExpandedChange={setOpen} width={371} gap={44} /></div>
              <div className="lock">
                <div className="la-card">
                  <div className="la-tag">{swiggy.template.compact.leading ? <Node node={swiggy.template.compact.leading} ctx={ctx} inRow /> : null}<span>Swiggy · Live Activity</span></div>
                  <Node node={card} ctx={ctx} />
                </div>
              </div>
            </Phone>
            <figcaption><b>iPhone</b>Dynamic Island + Lock Screen</figcaption>
          </figure>
          <figure>
            <Phone kind="pixel" label="Pixel: island over other apps, Live Update notification and status chip">
              <div className="wall" style={{ background: 'linear-gradient(180deg, #0f2420, #020605 60%)' }} />
              <span className="chip-status" style={{ background: ORANGE }}><Icon name="bag" size={14} color="#000" />{fill('{eta} min', state)}</span>
              <div className="phone-island" style={{ top: 6 }}><Island template={swiggy.template} state={state} expanded={open} onExpandedChange={setOpen} width={377} gap={44} /></div>
              <div className="lock" style={{ top: 280 }}>
                <div className="la-card" style={{ borderRadius: 28, background: 'rgba(28,30,30,0.85)' }}>
                  <div className="la-tag"><Icon name="bag" size={16} color={ORANGE} /><span>Swiggy · Live Update · now</span></div>
                  <Node node={card} ctx={ctx} />
                </div>
              </div>
            </Phone>
            <figcaption><b>Pixel</b>Island over any app + Live Update</figcaption>
          </figure>
        </Rise>

        <Rise className="limits">
          <table>
            <thead><tr><th>Surface</th><th>Runs on</th><th>Inputs</th><th>Honest limits</th></tr></thead>
            <tbody>
              <tr><td>In-app island</td><td data-l="Runs on">iOS, Android, web</td><td data-l="Inputs"><span className="pill ok">Everything</span></td><td data-l="Limits">Only while your app is open. Screens, chips, sliders, pet, all of it.</td></tr>
              <tr><td>Android island</td><td data-l="Runs on">Android, over other apps</td><td data-l="Inputs"><span className="pill ok">Everything</span></td><td data-l="Limits">Needs SYSTEM_ALERT_WINDOW and a special-use foreground service; Google Play asks you to justify both.</td></tr>
              <tr><td>Live Update</td><td data-l="Runs on">Android 16+ (ongoing notification below)</td><td data-l="Inputs"><span className="pill part">Buttons</span></td><td data-l="Limits">Constrained system styles; the user can turn promotion off.</td></tr>
              <tr><td>iOS Live Activity</td><td data-l="Runs on">Dynamic Island + Lock Screen</td><td data-l="Inputs"><span className="pill part">Buttons only</span></td><td data-l="Limits">No custom inputs or pet; template + state ≤ 4 KB, 8 h active. In progress.</td></tr>
            </tbody>
          </table>
        </Rise>
      </div>
    </section>
  );
}
