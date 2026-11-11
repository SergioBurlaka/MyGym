import { describe, expect, it } from 'vitest';
import { navWavePositions } from './navWave.js';

// Widths as in the task (docs/tasks/nav-neon-wave.md): the screen minus 6px on
// each side. In the browser the function gets clientWidth, 2px less (the 1px
// border) - the geometry is the same. 6px of padding inside, then five equal cells.
function center(navWidth: number, index: number) {
  const cell = (navWidth - 12) / 5;
  return 6 + cell * index + cell / 2;
}

describe('navWavePositions', () => {
  it.each([
    // 375px phone: 363px panel.
    [363, 0, 14, 0],
    [363, 2, 126.5, 91.5],
    [363, 4, 239, 183],
    // 430px phone: 418px panel.
    [418, 0, 14, 0],
    [418, 2, 154, 119],
    [418, 4, 294, 238],
  ])('panel %ipx, tab %i -> line %d, glow %d', (navWidth, index, waveX, glowX) => {
    const pos = navWavePositions(center(navWidth, index), navWidth);
    expect(pos.waveX).toBeCloseTo(waveX, 5);
    expect(pos.glowX).toBeCloseTo(glowX, 5);
  });

  it('centres both layers on a tab away from the edges', () => {
    expect(navWavePositions(200, 400)).toEqual({ waveX: 145, glowX: 110 });
  });

  it('keeps the line off the rounded corners and the glow inside the panel', () => {
    expect(navWavePositions(0, 363)).toEqual({ waveX: 14, glowX: 0 });
    expect(navWavePositions(363, 363)).toEqual({ waveX: 239, glowX: 183 });
  });
});
