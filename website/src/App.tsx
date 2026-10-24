import { MotionConfig } from 'motion/react';
import { ComponentType, lazy, Suspense, useEffect } from 'react';

import { Marquee } from './sections/Marquee';
import { Hero } from './sections/Hero';
import { GitHubIcon } from './ui';

/** Below-the-fold sections load as their own chunks, fetched as soon as the hero has painted. */
const load = {
  FiveLines: () => import('./sections/FiveLines').then((m) => ({ default: m.FiveLines })),
  Gallery: () => import('./sections/Gallery').then((m) => ({ default: m.Gallery })),
  IslandOS: () => import('./sections/IslandOS').then((m) => ({ default: m.IslandOS })),
  Playground: () => import('./sections/Playground').then((m) => ({ default: m.Playground })),
  Surfaces: () => import('./sections/Surfaces').then((m) => ({ default: m.Surfaces })),
  Primitives: () => import('./sections/Primitives').then((m) => ({ default: m.Primitives })),
  Footer: () => import('./sections/Footer').then((m) => ({ default: m.Footer })),
};
const FiveLines = lazy(load.FiveLines);
const Gallery = lazy(load.Gallery);
const IslandOS = lazy(load.IslandOS);
const Playground = lazy(load.Playground);
const Surfaces = lazy(load.Surfaces);
const Primitives = lazy(load.Primitives);
const Footer = lazy(load.Footer);

/** Keeps the anchor (#gallery…) and roughly the height while a chunk loads, so nav links and scroll still land. */
function Section({ id, C }: { id?: string; C: ComponentType }) {
  return <Suspense fallback={<section id={id} style={{ minHeight: '100vh' }} />}><C /></Suspense>;
}

export function App() {
  useEffect(() => {
    const go = () => Object.values(load).forEach((f) => f());
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    idle(go);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#code">Skip to content</a>
      <header className="nav" id="top">
        <a className="logo" href="#top" aria-label="Halo Island home"><span className="logo-mark" /><span className="logo-text">Halo Island</span></a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#gallery">Gallery</a>
          <a href="#os">Island OS</a>
          <a href="#playground">Playground</a>
          <a href="#surfaces">Surfaces</a>
          <a className="nav-gh" href="https://github.com/herin7/halo-island" target="_blank" rel="noreferrer" aria-label="GitHub"><GitHubIcon size={16} /><span>GitHub</span></a>
        </nav>
      </header>
      <main>
        <Hero />
        <Marquee />
        <Section id="code" C={FiveLines} />
        <Section id="gallery" C={Gallery} />
        <Section id="os" C={IslandOS} />
        <Section id="playground" C={Playground} />
        <Section id="surfaces" C={Surfaces} />
        <Section id="primitives" C={Primitives} />
      </main>
      <Section C={Footer} />
      <div className="grain" aria-hidden />
    </MotionConfig>
  );
}
