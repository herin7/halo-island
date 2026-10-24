import type { IslandState } from 'halo-island';
import { useEffect, useRef, useState } from 'react';

import type { Scenario } from '../../example/showcase';

/** Total story length in ms. */
export const storyLength = (s: Scenario) => s.story.reduce((t, [d]) => t + d, 0);

/**
 * Plays a scenario's story: initial state, then each beat's patch on time. Alerting beats call
 * `onAlert` (the island pops open). Loops after `loopAfter` ms when given.
 */
export function useStory(scenario: Scenario, playing: boolean, opts: { onAlert?: () => void; loopAfter?: number; delay?: number } = {}) {
  const [state, setState] = useState<IslandState>(() => scenario.initial());
  const [run, setRun] = useState(0);
  const alert = useRef(opts.onAlert);
  alert.current = opts.onAlert;
  useEffect(() => {
    setState(scenario.initial());
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = opts.delay ?? 600;
    for (const [delay, patch, isAlert] of scenario.story) {
      t += delay;
      timers.push(setTimeout(() => { setState((s) => ({ ...s, ...patch })); if (isAlert) alert.current?.(); }, t));
    }
    if (opts.loopAfter != null) timers.push(setTimeout(() => setRun((r) => r + 1), t + opts.loopAfter));
    return () => timers.forEach(clearTimeout);
  }, [scenario, playing, run]);
  const patch = (p: IslandState) => setState((s) => ({ ...s, ...p }));
  return { state, patch, replay: () => setRun((r) => r + 1) };
}
