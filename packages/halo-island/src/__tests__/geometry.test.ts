import { describe, expect, test } from 'bun:test';

import { Hole, placeIsland } from '../geometry';

const PILL = 37;

/** Wrapped: the lens sits inside the pill with margin, the pill is on screen, the seed is a pill. */
function expectWraps(hole: Hole, screenWidth: number) {
  const p = placeIsland({ hole, screenWidth, statusBar: 30, pill: PILL });
  expect(p.mode).toBe('wrap');
  const lens = p.hole!;
  expect(p.top).toBeGreaterThanOrEqual(0);
  // A notch is attached to the screen edge; a punch-hole floats and needs margin above too.
  if (lens.y >= 1) expect(lens.y - p.top).toBeGreaterThanOrEqual(3);
  expect(p.top + p.height - (lens.y + lens.height)).toBeGreaterThanOrEqual(3);
  expect(p.gap).toBeGreaterThan(lens.width);
  expect(p.seed.w).toBeGreaterThanOrEqual(p.seed.h);
  return p;
}

function expectBelow(hole: Hole | null, screenWidth: number, statusBar = 30, safeTop = 0) {
  const p = placeIsland({ hole, screenWidth, statusBar, safeTop, pill: PILL });
  expect(p.mode).toBe('below');
  expect(p.top).toBeGreaterThanOrEqual(Math.max(statusBar, safeTop));
  expect(p.seed.w).toBeGreaterThanOrEqual(p.seed.h);
  return p;
}

describe('placeIsland across devices', () => {
  test('Galaxy S21 FE: Samsung reports the hole as a strip from the top edge', () => {
    // dumpsys: boundingRect (505,0)-(575,99) px at 3x; the lens is a 70px circle at y 29-99.
    const p = expectWraps({ x: 168.3, y: 0, width: 23.3, height: 33 }, 360);
    expect(p.hole!.y).toBeCloseTo(9.7, 1);
    expect(p.hole!.height).toBeCloseTo(23.3, 1);
  });

  test('Galaxy S21 FE: exact hole from the cutout path', () => {
    expectWraps({ x: 168.3, y: 9.67, width: 23.3, height: 23.3 }, 360);
  });

  test('Pixel 9: exact hole, and its padded bounding rect', () => {
    expectWraps({ x: 189.5, y: 17, width: 32, height: 32 }, 411);
    expectWraps({ x: 184.8, y: 0, width: 41.9, height: 54.1 }, 411);
  });

  test('dual-lens pill camera, centred', () => {
    expectWraps({ x: 170, y: 8, width: 72, height: 24 }, 412);
  });

  test('small waterdrop notch touching the top edge', () => {
    expectWraps({ x: 190, y: 0, width: 32, height: 26 }, 412);
  });

  test('iPhone Dynamic Island', () => {
    expectWraps({ x: 393 / 2 - 63, y: 11, width: 126, height: 37 }, 393);
  });

  test('corner punch-hole sits below the status bar', () => {
    expectBelow({ x: 14, y: 10, width: 24, height: 24 }, 360);
  });

  test('wide notch (Pixel 3 XL) and tall notch sit below', () => {
    expectBelow({ x: 120, y: 0, width: 172, height: 34 }, 412);
    expectBelow({ x: 150, y: 0, width: 110, height: 72 }, 412, 30, 72);
  });

  test('no cutout, hidden cutout, waterfall edges, older Android, web', () => {
    expectBelow(null, 412);
    expectBelow({ x: 0, y: 0, width: 0, height: 0 }, 412);
  });

  test('landscape: the cutout is on the side', () => {
    expectBelow({ x: 0, y: 190, width: 33, height: 26 }, 915);
  });

  test('pill never smaller than the developer asked, and grows for a big lens', () => {
    expect(placeIsland({ hole: { x: 190, y: 12, width: 30, height: 30 }, screenWidth: 410, statusBar: 30, pill: 26 }).height).toBe(38);
    expect(placeIsland({ hole: null, screenWidth: 410, statusBar: 30, pill: 26 }).height).toBe(26);
  });

  test('below respects a notch deeper than the reported status bar', () => {
    expect(expectBelow({ x: 150, y: 0, width: 200, height: 50 }, 412, 24, 50).top).toBe(56);
  });
});
