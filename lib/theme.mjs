// Colour helpers and theme derivation: two brand colours -> four slide themes with checked contrast.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = join(dirname(fileURLToPath(import.meta.url)), '..');

export const hex = (s) => { s = String(s ?? '').trim().replace(/^#/, ''); if (s.length === 3) s = [...s].map((c) => c + c).join(''); return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Nudge `c` toward black or white (whichever helps) until it reaches `min` contrast on `bg`.
function fix(c, bg, min) {
  const target = lum(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0; t <= 1.001 && ratio(c, bg) < min; t += 0.05) c = mix(c, target, 0.05);
  return ratio(c, bg) >= min ? c : target;
}

export function deriveThemes(primary, accent) {
  const onP = ratio('#FFFFFF', primary) >= ratio('#000000', primary) ? '#FFFFFF' : '#000000';
  const lightBg = mix(primary, '#FFFFFF', 0.95), darkBg = mix(primary, '#000000', 0.72);
  const lightText = fix(mix(primary, '#000000', 0.5), lightBg, 7), popText = fix(mix(primary, '#000000', 0.75), accent, 7);
  return {
    blue: { bg: primary, text: onP, muted: fix(mix(onP, primary, 0.25), primary, 4.5), accent: fix(accent, primary, 3), accent2: onP, logoChip: true },
    light: { bg: lightBg, text: lightText, muted: fix(mix(lightText, lightBg, 0.35), lightBg, 4.5), accent: fix(accent, lightBg, 4.5), accent2: fix(primary, lightBg, 4.5), logoChip: false },
    dark: { bg: darkBg, text: '#FFFFFF', muted: fix(mix('#FFFFFF', darkBg, 0.35), darkBg, 4.5), accent: fix(accent, darkBg, 4.5), accent2: fix(mix(primary, '#FFFFFF', 0.5), darkBg, 4.5), logoChip: true },
    pop: { bg: accent, text: popText, muted: popText, accent: popText, accent2: popText, logoChip: true },
  };
}

export function buildTheme(primary, accent) {
  const fonts = JSON.parse(readFileSync(join(kit, 'examples', 'demo', 'theme.json'), 'utf8')).fonts;
  return { width: 1080, height: 1350, colors: deriveThemes(primary, accent), fonts };
}
