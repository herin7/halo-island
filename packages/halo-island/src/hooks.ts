import { useEffect, useId, useRef } from 'react';

import { LiveIsland, StartOptions, get, onAction, start } from './island';
import { IslandState, IslandTemplate } from './spec';

/**
 * Runs `handler` when any island's `action` button is tapped — in-app, overlay, notification or
 * Live Activity. `state` holds what the island's chips, sliders and toggles were set to.
 */
export function useIslandAction(action: string, handler: (islandId: string, state: IslandState) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onAction((id, a, s) => a === action && latest.current(id, s)), [action]);
}

export interface UseIslandOptions extends StartOptions {
  /** Pop the island open when any of these keys change ("Rider arrived"). */
  alertOn?: string[];
  /** Every button tap of this island, with its state at the time. */
  onAction?: (action: string, state: IslandState) => void;
  /**
   * In-island input (chips, slider, toggle) changed a key. Store it in your state to make the input
   * controlled — the island then always shows exactly what your app holds.
   */
  onChange?: (patch: IslandState) => void;
}

/**
 * The island as a view of your state. It starts when `state` becomes non-null, sends only the keys
 * that differ from what the island shows, ends on `null` or unmount — so the island and your
 * screen can never disagree. Keep `template` stable (define it outside the component); a new
 * template object swaps the design in place.
 *
 * ```tsx
 * useIsland(order, tracking ? { eta, stage, rider } : null, { id: 'order', alertOn: ['stage'] });
 * ```
 */
export function useIsland(template: IslandTemplate, state: IslandState | null, options: UseIslandOptions = {}): LiveIsland | null {
  const fallbackId = `island-${useId()}`;
  const id = options.id ?? fallbackId;
  const live = useRef<LiveIsland | null>(null);
  const sentKeys = useRef<string[]>([]);
  const shownTemplate = useRef(template);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!state) {
      live.current?.end();
      live.current = null;
      sentKeys.current = [];
      return;
    }
    const { alertOn: _a, onAction: _o, onChange: _c, ...startOptions } = latest.current;
    const current = get(id);
    if (!live.current || !current || shownTemplate.current !== template) {
      // First show, ended elsewhere (endAll, a toast timeout), or a new design: (re)start in place.
      shownTemplate.current = template;
      live.current = start(template, state, { ...startOptions, id });
      sentKeys.current = Object.keys(state);
      return;
    }
    // Diff against what the island actually shows, not what was last sent: anything that drifted
    // (an input the app rejected, an update from elsewhere) is corrected to the app's truth.
    const patch: IslandState = {};
    for (const k of Object.keys(state)) if (current[k] !== state[k]) patch[k] = state[k];
    for (const k of sentKeys.current) if (!(k in state) && current[k] != null) patch[k] = null;
    sentKeys.current = Object.keys(state);
    if (!Object.keys(patch).length) return;
    live.current.update(patch, { alert: latest.current.alertOn?.some((k) => k in patch) });
  });

  useEffect(() => onAction((from, action, s) => {
    if (from !== id) return;
    if (action.startsWith('change:')) {
      const key = action.slice(7);
      latest.current.onChange?.({ [key]: s[key] });
    }
    latest.current.onAction?.(action, s);
  }), [id]);

  // Leaving the screen that owns the island ends it.
  useEffect(() => () => { live.current?.end(); live.current = null; }, [id]);

  return live.current;
}
