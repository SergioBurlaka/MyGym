// The bottom panel's wave (BottomNav.tsx): a 110px line on the panel's top edge
// and a 180px glow under it, both centred on the highlighted tab. Clamped so the
// line stays NAV_WAVE_INSET off the edges - past that it would run over the
// panel's rounded corners - and the glow stays inside the panel.
// The widths are the .nav-wave-line / .nav-wave-glow sizes in styles/index.css.
export const NAV_WAVE_LINE_W = 110;
export const NAV_WAVE_GLOW_W = 180;
export const NAV_WAVE_INSET = 14;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

// `center` - the tab cell's centre, `navWidth` - the panel's inner width, both
// from the panel's padding edge (offsetLeft / clientWidth), the box the layers
// are positioned in.
export function navWavePositions(center: number, navWidth: number) {
  return {
    waveX: clamp(center - NAV_WAVE_LINE_W / 2, NAV_WAVE_INSET, navWidth - NAV_WAVE_INSET - NAV_WAVE_LINE_W),
    glowX: clamp(center - NAV_WAVE_GLOW_W / 2, 0, navWidth - NAV_WAVE_GLOW_W),
  };
}
