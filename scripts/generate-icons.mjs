/**
 * Generates the app icons (PWA, Apple touch, favicon PNG) from the brand mark.
 *   node scripts/generate-icons.mjs
 */
import sharp from "sharp";

const BG = "#4f5bd5";
const PATHS = [
  "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
  "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
];

/** `inset` = share of the canvas the glyph uses; maskable icons need a bigger safe zone. */
function svg(size, { rounded, inset }) {
  const glyph = size * inset;
  const offset = (size - glyph) / 2;
  const scale = glyph / 24;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS.map((d) => `<path d="${d}"/>`).join("")}
  </g>
</svg>`;
}

const out = [
  ["public/icon-192.png", 192, { rounded: true, inset: 0.55 }],
  ["public/icon-512.png", 512, { rounded: true, inset: 0.55 }],
  ["public/icon-maskable-512.png", 512, { rounded: false, inset: 0.45 }],
  ["public/apple-touch-icon.png", 180, { rounded: false, inset: 0.5 }],
];
for (const [file, size, opts] of out) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(file);
  console.log("wrote", file);
}
