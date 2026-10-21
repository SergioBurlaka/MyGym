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

// Full-bleed square background + the logo content scaled around the centre.
function fullBleed(scale) {
  const offset = (viewBox * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">
  <rect width="${viewBox}" height="${viewBox}" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${content}</g>
</svg>`;
}

// Android masks a maskable icon to any shape (circle, squircle...) and only
// guarantees a centred circle of radius 40% of the icon. Measure the actual
// text bounds and shrink the content until its farthest corner fits inside
// that circle (a bit of margin so the glyphs don't touch the edge).
async function maskableScale() {
  const size = 1024;
  const contentOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">${content}</svg>`;
  // Two pipelines on purpose: sharp always trims *before* resizing, so a
  // single chain would measure the bounds at the SVG's native size.
  const rendered = await sharp(Buffer.from(contentOnly), { density: 72 * (size / viewBox) })
    .resize(size, size)
    .png()
    .toBuffer();
  const { info } = await sharp(rendered).trim().toBuffer({ resolveWithObject: true });
  const left = -info.trimOffsetLeft;
  const top = -info.trimOffsetTop;
  const c = size / 2;
  const dx = Math.max(c - left, left + info.width - c);
  const dy = Math.max(c - top, top + info.height - c);
  const safeRadius = size * 0.4 * 0.95;
  return Math.min(1, safeRadius / Math.hypot(dx, dy));
}

function render(source, size, file, { opaque = false } = {}) {
  const image = sharp(Buffer.from(source), { density: 72 * Math.ceil(size / viewBox) }).resize(size, size);
  return (opaque ? image.removeAlpha() : image).png().toFile(`${outDir}${file}`);
}

await mkdir(outDir, { recursive: true });
const scale = await maskableScale();

await Promise.all([
  // "any" icons: the logo as is (rounded square, transparent corners).
  render(svg, 192, 'icon-192.png'),
  render(svg, 512, 'icon-512.png'),
  render(fullBleed(scale), 512, 'icon-512-maskable.png', { opaque: true }),
  // iOS rounds the corners itself and fills transparency with black.
  render(fullBleed(1), 180, 'apple-touch-icon.png', { opaque: true }),
]);

console.log(`Icons written to public/icons/ (maskable content scale ${scale.toFixed(3)})`);
