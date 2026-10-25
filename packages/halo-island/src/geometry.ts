/**
 * Where the island sits, given the camera hole a device reports. Pure (no React Native), so every
 * class of device — punch-holes, notches, corners, foldables, landscape — is a unit fixture in
 * __tests__/geometry.test.ts.
 */

/** A rectangle in the app window's coordinates, in dp. */
export interface Hole { x: number; y: number; width: number; height: number }

export interface Placement {
  /** `wrap`: the pill surrounds the camera. `below`: it sits under the status bar. */
  mode: 'wrap' | 'below';
  top: number;
  /** Compact pill height. */
  height: number;
  /** Width kept empty in the compact row so content never sits under the lens. */
  gap: number;
  hole: Hole | null;
  /** The shape the island is born from and shrinks back into: always a pill, never taller than wide. */
  seed: { w: number; h: number };
}

/** Beyond these, a cutout is a notch or a sensor bar: wrapping it makes a slab, not a pill. */
const MAX_W = 160;
const MAX_H = 60;
/** Further from centre than this, the hole is a corner camera. */
const OFF_CENTRE = 40;
/** A hole lower than this isn't at the top edge (landscape, a window below the cutout). */
const TOP_BAND = 40;
/** Space kept between the lens and the pill's edge. */
const CLEAR = 3;

/**
 * Some OEMs (Samsung among them) report a punch-hole as a strip from the screen's top edge down to
 * the hole's bottom. Camera holes are round, so a strip taller than it is wide is really the
 * square at its bottom.
 */
export function trueHole(hole: Hole): Hole {
  if (hole.y < 1 && hole.height > hole.width * 1.15 && hole.width <= MAX_W) {
    return { x: hole.x, y: hole.y + hole.height - hole.width, width: hole.width, height: hole.width };
  }
  return hole;
}

export function placeIsland({ hole: reported, screenWidth, statusBar, safeTop = 0, pill }: {
  hole: Hole | null;
  screenWidth: number;
  /** Status bar height in the window, dp (0 when the app draws under a hidden bar and that's fine). */
  statusBar: number;
  /** The display's safe inset at the top, dp: below this nothing touches the cutout. */
  safeTop?: number;
  pill: number;
}): Placement {
  const hole = reported && reported.width > 0 && reported.height > 0 ? trueHole(reported) : null;
  const wraps = !!hole
    && hole.y >= 0 && hole.y < TOP_BAND
    && Math.abs(hole.x + hole.width / 2 - screenWidth / 2) < OFF_CENTRE
    && hole.width <= MAX_W && hole.height <= MAX_H;
  if (!hole || !wraps) {
    return { mode: 'below', top: Math.max(statusBar, safeTop) + 6, height: pill, gap: 16, hole: null, seed: { w: pill, h: pill } };
  }
  let height = Math.max(pill, hole.height + 8);
  let top = hole.y + hole.height / 2 - height / 2;
  // Never off the top of the screen; grow instead, so the lens keeps its margin below.
  if (top < 2) {
    top = 2;
    height = Math.max(height, hole.y + hole.height + CLEAR - top);
  }
  return { mode: 'wrap', top, height, gap: hole.width + 12, hole, seed: { w: Math.max(hole.width, hole.height), h: hole.height } };
}
