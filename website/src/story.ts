import type { IslandState } from 'halo-island';
import { useEffect, useRef, useState } from 'react';

import type { Beat, Scenario } from '../../example/catalog';

/** Total story length in ms. */
export const storyLength = (s: Scenario) => s.story.reduce((t, [d]) => t + d, 0);

/** A beat's patch, computed when it plays (function beats read the state at that moment). */
export const patchOf = (beat: Beat, state: IslandState): IslandState => (typeof beat[1] === 'function' ? beat[1](state) : beat[1]);

/**
 * Plays a scenario's story: initial state, then each beat's patch on time. Alerting beats call
 * `onAlert`. `act` runs the scenario's own button logic (`handle`). Loops after `loopAfter` ms.
 */
export function useStory(scenario: Scenario, playing: boolean, opts: { onAlert?: () => void; loopAfter?: number; delay?: number } = {}) {
  const [state, setState] = useState<IslandState>(() => scenario.initial());
  const [run, setRun] = useState(0);
  const alert = useRef(opts.onAlert);
  alert.current = opts.onAlert;
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    setState(scenario.initial());
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = opts.delay ?? 600;
    for (const beat of scenario.story) {
      t += beat[0];
      timers.push(setTimeout(() => { setState((s) => ({ ...s, ...patchOf(beat, s) })); if (beat[2]) alert.current?.(); }, t));
    }
    if (opts.loopAfter != null) timers.push(setTimeout(() => setRun((r) => r + 1), t + opts.loopAfter));
    return () => timers.forEach(clearTimeout);
  }, [scenario, playing, run]);
  // Inputs (chips, sliders) write here; the ref stays eager so a handler right after reads the new value.
  const patch = (p: IslandState) => { ref.current = { ...ref.current, ...p }; setState(ref.current); };
  /** Button logic from the catalog. Returns `go:done` when a scenario has a success screen to open. */
  const act = (action: string): string | void => {
    const p = scenario.handle?.(action, ref.current);
    if (p) patch(p);
    if (action === 'buy' && scenario.template.screens?.done) return 'go:done';
  };
  return { state, patch, act, replay: () => setRun((r) => r + 1) };
}
