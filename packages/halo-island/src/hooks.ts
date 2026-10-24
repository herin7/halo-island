import { useEffect, useRef } from 'react';

import { onAction } from './island';
import { IslandState } from './spec';

/**
 * Runs `handler` when any island's `action` button is tapped — in-app, overlay, notification or
 * Live Activity. `state` holds what the island's chips, sliders and toggles were set to.
 */
export function useIslandAction(action: string, handler: (islandId: string, state: IslandState) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onAction((id, a, s) => a === action && latest.current(id, s)), [action]);
}
