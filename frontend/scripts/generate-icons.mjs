// Generates the PWA / home-screen PNG icons from public/favicon.svg (the
// "Сходинка" logo). Run after changing the logo: `npm run icons`, then commit
// the PNGs in public/icons/ - the Docker build doesn't regenerate them.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const outDir = `${publicDir}icons/`;

const svg = await readFile(`${publicDir}favicon.svg`, 'utf8');

// The logo is one rounded orange <rect> (the background) plus the "My"/"Gym"
// <path>s. Splitting them lets us redraw the background full-bleed for the
// icons that the OS crops itself.
const viewBox = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
const rect = /<rect [^>]*\/>/.exec(svg)?.[0];
const background = /fill="(#[0-9a-fA-F]{6})"/.exec(rect ?? '')?.[1];
if (!viewBox || !rect || !background) {
  throw new Error('favicon.svg: expected a square viewBox and one background <rect fill="#rrggbb">');
}
const content = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(rect, '');

// Full-bleed square background + the logo content scaled by `scale` with the
// point (cx, cy) (viewBox units) moved to the centre of the icon.
function fullBleed(scale, cx = viewBox / 2, cy = viewBox / 2) {
  const tx = viewBox / 2 - cx * scale;
  const ty = viewBox / 2 - cy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">
  <rect width="${viewBox}" height="${viewBox}" fill="${background}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">${content}</g>
</svg>`;
}

// Android shows a maskable icon as an adaptive icon: the launcher keeps only
// the central 72/108 of it (the rest is room for its masks and parallax) and
// then cuts its own shape (squircle, rounded square, circle...) out of that.
// v2 stretched the text over almost the whole canvas, so the launcher clipped
// "G", "m" and the top of "My" (user's Xiaomi, 2026-10-26). Instead the
// approved "Сходинка" goes in unchanged - same composition and proportions
// as the "any" icon - scaled so the logo square fills exactly that visible
// zone, on a full-bleed background.
const ADAPTIVE_VISIBLE = 72 / 108;

if (!/<path\b/.test(content)) {
  throw new Error('favicon.svg: no logo text found after removing the background <rect>');
}

function render(source, size, file, { opaque = false } = {}) {
  const image = sharp(Buffer.from(source), { density: 72 * Math.ceil(size / viewBox) }).resize(size, size);
  return (opaque ? image.removeAlpha() : image).png().toFile(`${outDir}${file}`);
}

await mkdir(outDir, { recursive: true });
const maskableSvg = fullBleed(ADAPTIVE_VISIBLE);

await Promise.all([
  // "any" icons: the logo as is (rounded square, transparent corners).
  render(svg, 192, 'icon-192.png'),
  render(svg, 512, 'icon-512.png'),
  // -vN in the name: an installed WebAPK only re-fetches icons whose URL or
  // content changed on its periodic manifest check - bump N on every change.
  render(maskableSvg, 192, 'icon-192-maskable-v3.png', { opaque: true }),
  render(maskableSvg, 512, 'icon-512-maskable-v3.png', { opaque: true }),
  // iOS rounds the corners itself and fills transparency with black.
  render(fullBleed(1), 180, 'apple-touch-icon.png', { opaque: true }),
]);

console.log(`Icons written to public/icons/ (maskable content scale ${ADAPTIVE_VISIBLE.toFixed(3)})`);
