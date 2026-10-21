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

// Android masks a maskable icon to its launcher shape (circle, squircle...).
// Fitting the text into the spec's guaranteed r = 40% circle made it look
// clearly smaller than the "Add to Home screen" shortcut, so instead the
// text is centred on its own bounds (the staircase sits a bit low in the
// logo) and made as large as possible while
//  - its bounds stay inside the central 80% square, and
//  - no glyph pixel leaves a full-size circle mask (r = 50%, small margin),
// which is what keeps round launchers from clipping the "y" / "G" corners.
const MASKABLE_BOX = 0.8;
const CIRCLE_MARGIN = 0.96;

async function maskableLayout() {
  const size = 1024;
  const contentOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">${content}</svg>`;
  const { data } = await sharp(Buffer.from(contentOnly), { density: 72 * (size / viewBox) })
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const glyphs = [];
  let minX = size, minY = size, maxX = 0, maxY = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] < 128) continue;
      glyphs.push(x, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (glyphs.length === 0) {
    throw new Error('favicon.svg: no logo text found after removing the background <rect>');
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let farthest = 0;
  for (let i = 0; i < glyphs.length; i += 2) {
    farthest = Math.max(farthest, Math.hypot(glyphs[i] - cx, glyphs[i + 1] - cy));
  }

  const squareFit = (MASKABLE_BOX * size) / Math.max(maxX - minX, maxY - minY);
  const circleFit = (0.5 * CIRCLE_MARGIN * size) / farthest;
  const toViewBox = viewBox / size;
  return { scale: Math.min(squareFit, circleFit), cx: cx * toViewBox, cy: cy * toViewBox };
}

function render(source, size, file, { opaque = false } = {}) {
  const image = sharp(Buffer.from(source), { density: 72 * Math.ceil(size / viewBox) }).resize(size, size);
  return (opaque ? image.removeAlpha() : image).png().toFile(`${outDir}${file}`);
}

await mkdir(outDir, { recursive: true });
const maskable = await maskableLayout();
const maskableSvg = fullBleed(maskable.scale, maskable.cx, maskable.cy);

await Promise.all([
  // "any" icons: the logo as is (rounded square, transparent corners).
  render(svg, 192, 'icon-192.png'),
  render(svg, 512, 'icon-512.png'),
  // -vN in the name: an installed WebAPK only re-fetches icons whose URL or
  // content changed on its periodic manifest check - bump N on every change.
  render(maskableSvg, 192, 'icon-192-maskable-v2.png', { opaque: true }),
  render(maskableSvg, 512, 'icon-512-maskable-v2.png', { opaque: true }),
  // iOS rounds the corners itself and fills transparency with black.
  render(fullBleed(1), 180, 'apple-touch-icon.png', { opaque: true }),
]);

console.log(`Icons written to public/icons/ (maskable content scale ${maskable.scale.toFixed(3)})`);
