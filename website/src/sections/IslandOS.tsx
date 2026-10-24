import { useState } from 'react';

import { Phone } from '../components/Phone';
import { APPS, osTemplate } from '../demos/os';
import { useOS } from '../demos/useOS';
import { Icon } from '../island/graphics';
import { Island } from '../island/Island';
import { Head, Rise } from '../ui';

const HOW: Record<string, string> = {
  music: 'Play, skip, scrub the slider',
  wallet: 'Pick ₹200, tap Buy twice to confirm',
  home: 'Flip tiles, drag brightness',
  timer: 'Step the minutes, start a countdown',
  ride: 'Book, watch it arrive, cancel with confirm',
  halo: 'Change the pet’s mood',
};

export function IslandOS() {
  const os = useOS();
  const [open, setOpen] = useState(true);
  const [goTo, setGoTo] = useState<{ screen: string; n: number } | null>(null);
  return (
    <section className="section" id="os" onPointerMove={os.poke} onPointerDown={os.poke}>
      <div className="wrap os">
        <div>
          <Head eyebrow="Island OS" title={<>A whole phone, <em>inside the island.</em></>}
            lede={<>Six mini apps that never open a screen. Each one is a <code style={{ fontFamily: 'var(--mono)', fontSize: '0.9em' }}>screens</code> entry in one template: buttons with <code style={{ fontFamily: 'var(--mono)', fontSize: '0.9em' }}>go:wallet</code>, chips, sliders, toggles and confirm steps. Your code only answers action strings.</>} />
          <Rise className="os-list">
            {APPS.map((a) => (
              <button key={a.id} type="button" className="os-item" onClick={() => { setOpen(true); setGoTo({ screen: a.id, n: Date.now() }); }}>
                <span className="os-icon" style={{ background: a.color }}><Icon name={a.icon} size={20} color={a.id === 'ride' ? '#000' : '#fff'} /></span>
                <span><b>{a.label}</b><span>{HOW[a.id]}</span></span>
              </button>
            ))}
          </Rise>
        </div>
        <Rise className="os-phone" delay={0.1}>
          <Phone crop={0.78} label="Island OS running in a phone's Dynamic Island">
            <div className="wallpaper" />
            <div className="homegrid" aria-hidden>{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
            <div className="dock" aria-hidden><i /><i /><i /><i /></div>
            <div className="phone-island">
              <Island template={osTemplate} state={os.state} expanded={open} onExpandedChange={setOpen} onState={os.setState} width={371} gap={44} label="Island OS"
                nav={goTo} onAction={os.onAction} />
            </div>
          </Phone>
          <p className="hint" style={{ justifyContent: 'center' }}>Everything happens in the island · <span className="kbd">Esc</span> collapses</p>
        </Rise>
      </div>
    </section>
  );
}
