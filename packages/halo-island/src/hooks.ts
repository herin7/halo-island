import { useEffect, useRef } from 'react';

import { onAction } from './island';

/** Runs `handler` when any island's `action` button is tapped — in-app, overlay, notification or Live Activity. */
export function useIslandAction(action: string, handler: (islandId: string) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onAction((id, a) => a === action && latest.current(id)), [action]);
}
