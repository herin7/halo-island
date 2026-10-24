/**
 * Lottie and Rive on the web. Both runtimes load lazily, only when a node shows up; animations
 * pause while offscreen and freeze on a hero frame under reduced motion.
 */
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

const json = new Map<string, Promise<unknown>>();
const fetchJson = (url: string) => {
  if (!json.has(url)) json.set(url, fetch(url).then((r) => r.json()));
  return json.get(url)!;
};

/** Plays while on screen, pauses when scrolled away. */
function whileVisible(el: Element, play: () => void, pause: () => void) {
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()));
  io.observe(el);
  return () => io.disconnect();
}

export function Lottie({ src, size, width, loop = true, speed = 1 }: { src: string; size: number; width?: number; loop?: boolean; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    let alive = true;
    let stop = () => {};
    let anim: { destroy(): void; play(): void; pause(): void; setSpeed(s: number): void; goToAndStop(v: number, frame?: boolean): void; totalFrames: number; isPaused: boolean } | null = null;
    Promise.all([import('lottie-web/build/player/lottie_light'), fetchJson(src)]).then(([m, data]) => {
      if (!alive || !ref.current) return;
      // lottie-web writes into its data, so every player gets its own copy.
      anim = m.default.loadAnimation({ container: ref.current, renderer: 'svg', loop, autoplay: false, animationData: structuredClone(data), rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } }) as unknown as typeof anim;
      anim!.setSpeed(speed);
      if (reduced) { anim!.goToAndStop(Math.floor(anim!.totalFrames * 0.5), true); return; }
      stop = whileVisible(ref.current, () => anim?.play(), () => anim?.pause());
    }).catch(() => {});
    return () => { alive = false; stop(); anim?.destroy(); };
  }, [src, loop, reduced]);
  return <span ref={ref} aria-hidden style={{ width: width ?? size, height: size, display: 'block', flexShrink: 0 }} />;
}

type RiveInstance = {
  cleanup(): void; play(): void; pause(): void; resizeDrawingSurfaceToCanvas(): void;
  stateMachineInputs(name: string): { name: string; value: number | boolean; fire(): void }[] | undefined;
};

/**
 * A Rive file whose state machine follows the island: `trigger` fires the named trigger whenever its
 * filled value changes; `inputs` set number and boolean inputs.
 */
export function Rive({ src, size, width, artboard, stateMachine, trigger, inputs }: { src: string; size: number; width?: number; artboard?: string; stateMachine?: string; trigger?: string; inputs?: Record<string, number | boolean> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rive = useRef<RiveInstance | null>(null);
  const reduced = useReducedMotion();
  const latest = useRef({ trigger, inputs });
  latest.current = { trigger, inputs };

  useEffect(() => {
    let alive = true;
    let stop = () => {};
    Promise.all([import('@rive-app/canvas'), import('@rive-app/canvas/rive.wasm?url')]).then(([m, wasm]) => {
      if (!alive || !canvas.current) return;
      m.RuntimeLoader.setWasmUrl(wasm.default);
      const r = new m.Rive({
        src, canvas: canvas.current, artboard, stateMachines: stateMachine, autoplay: !reduced,
        layout: new m.Layout({ fit: m.Fit.Contain, alignment: m.Alignment.Center }),
        onLoad: () => {
          r.resizeDrawingSurfaceToCanvas();
          apply(r as unknown as RiveInstance, stateMachine, latest.current.inputs);
        },
      });
      rive.current = r as unknown as RiveInstance;
      if (!reduced) stop = whileVisible(canvas.current, () => rive.current?.play(), () => rive.current?.pause());
    }).catch(() => {});
    return () => { alive = false; stop(); rive.current?.cleanup(); rive.current = null; };
  }, [src, artboard, stateMachine, reduced]);

  const lastTrigger = useRef(trigger);
  useEffect(() => {
    if (!stateMachine || !trigger || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    rive.current?.stateMachineInputs(stateMachine)?.find((i) => i.name === trigger)?.fire();
  }, [trigger]);
  useEffect(() => { if (rive.current) apply(rive.current, stateMachine, inputs); }, [JSON.stringify(inputs)]);

  const w = width ?? size;
  // Drawn at device resolution, shown at layout size.
  return <canvas ref={canvas} width={w * 2} height={size * 2} aria-hidden style={{ width: w, height: size, display: 'block', flexShrink: 0 }} />;
}

function apply(r: RiveInstance, sm?: string, inputs?: Record<string, number | boolean>) {
  if (!sm || !inputs) return;
  const all = r.stateMachineInputs(sm) ?? [];
  for (const [k, v] of Object.entries(inputs)) {
    const input = all.find((i) => i.name === k);
    if (input) input.value = v;
  }
}
