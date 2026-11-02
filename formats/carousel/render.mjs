// Usage: node formats/carousel/render.mjs <workspace-dir> drafts/2026-11-02-my-topic
// Reads <workspace>/theme.json, <workspace>/brand.json and <dir>/slides.json; writes <dir>/slide-N.png.
// Requires: npm i playwright && npx playwright install chromium
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { ratio } from '../../lib/theme.mjs';

const root = resolve(process.argv[2] || '');
const dir = process.argv[3];
if (!process.argv[2] || !dir) { console.error('Usage: node formats/carousel/render.mjs <workspace-dir> <draft-dir>'); process.exit(1); }

const theme = JSON.parse(readFileSync(join(root, 'theme.json'), 'utf8'));
const brand = JSON.parse(readFileSync(join(root, 'brand.json'), 'utf8'));
const deck = JSON.parse(readFileSync(join(root, dir, 'slides.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const total = deck.slides.length;
const logoFile = brand.logo && join(root, brand.logo);
const logoUri = logoFile && existsSync(logoFile) ? `data:image/${logoFile.toLowerCase().endsWith('.png') ? 'png' : 'svg+xml'};base64,` + readFileSync(logoFile).toString('base64') : null;

// Highlight a word in the accent colour; if that colour would vanish into the background (e.g. a
// green slide with a green accent), fall back to a solid marker with inverted text.
const readable = (a, b) => { try { return ratio(a, b) >= 3; } catch { return true; } };
const hl = (t, s, c) => {
  const e = esc(t);
  if (!s.highlight || !e.includes(esc(s.highlight))) return e;
  const st = readable(c.accent, c.bg) ? `color:${c.accent}` : `background:${c.text};color:${c.bg};padding:0 .12em;border-radius:.12em`;
  return e.replace(esc(s.highlight), `<span style="${st}">${esc(s.highlight)}</span>`);
};

function body(s, c, i) {
  const mono = `font-family:'${theme.fonts.mono}',monospace`;
  switch (s.type) {
    case 'cover':
      return `<div style="display:flex;flex-direction:column;gap:40px">
        <h1 style="margin:0;font-size:150px;line-height:.95;letter-spacing:-4px">${hl(s.title, s, c)}</h1>
        <p style="margin:0;font-size:44px;line-height:1.3;color:${c.muted};max-width:820px">${esc(s.subtitle)}</p></div>`;
    case 'stat':
      return `<div style="display:flex;flex-direction:column;gap:36px">
        <div style="${mono};font-size:40px">${esc(s.label)}</div>
        <div style="font-size:${s.big.length > 8 ? 140 : s.big.length > 5 ? 230 : 290}px;line-height:.85;font-weight:700;letter-spacing:-8px;color:${c.accent}">${esc(s.big)}</div>
        <div style="font-size:88px;line-height:1;font-weight:700">${esc(s.unit)}</div>
        <p style="margin:0;font-size:38px;line-height:1.35;max-width:860px">${esc(s.text)}</p></div>`;
    case 'list':
      return `<div style="display:flex;flex-direction:column;gap:40px">
        <h2 style="margin:0;font-size:96px;line-height:1;letter-spacing:-2px">${hl(s.title, s, c)}</h2>
        ${s.items.map((t, n) => `<div style="display:flex;gap:24px;border-top:3px solid ${c.muted};padding-top:22px;font-size:42px;line-height:1.25"><span style="${mono}">${String(n + 1).padStart(2, '0')}</span><span>${esc(t)}</span></div>`).join('')}</div>`;
    case 'table':
      return `<div style="display:flex;flex-direction:column;gap:32px">
        <h2 style="margin:0;font-size:84px;line-height:1;letter-spacing:-2px">${hl(s.title, s, c)}</h2>
        ${s.rows.map((r) => `<div style="display:flex;align-items:baseline;border-top:2px solid ${c.muted};padding:24px 0;font-size:40px"><span style="flex:1;font-weight:700;font-size:44px">${esc(r[0])}</span><span style="width:200px;text-align:right;${mono};color:${c.accent}">${esc(r[1])}</span><span style="width:200px;text-align:right;${mono};color:${c.accent2}">${esc(r[2])}</span></div>`).join('')}
        <p style="margin:0;font-size:32px;color:${c.muted}">${esc(s.text)}</p></div>`;
    default: // 'text'
      return `<div style="display:flex;flex-direction:column;gap:44px">
        <h2 style="margin:0;font-size:100px;line-height:1;letter-spacing:-2px">${hl(s.title, s, c)}</h2>
        <p style="margin:0;font-size:42px;line-height:1.35;max-width:860px;color:${c.muted}">${esc(s.text)}</p></div>`;
  }
}

// Per-post look: a seed from the draft name rotates gradient angles and decoration, so posts differ.
const seed = [...String(dir)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
function backdrop(c, i) {
  const r = (seed + i * 2654435761) >>> 0, angle = 105 + (r % 150), px = 15 + (r >> 4) % 70, py = 10 + (r >> 9) % 80;
  const layers = [];
  if (c.glow) layers.push(`radial-gradient(circle at ${px}% ${py}%, ${c.glow}99 0, ${c.glow}00 70%)`);
  else if ((r >> 3) % 3 === 0) layers.push(`radial-gradient(circle at ${100 - px}% ${100 - py}%, ${c.accent}33 0, ${c.accent}00 55%)`);
  layers.push(c.grad ? `linear-gradient(${angle}deg, ${c.grad[0]}, ${c.grad[1]})` : c.bg);
  return layers.join(',');
}

function slideHtml(s, i) {
  const c = theme.colors[s.theme || 'dark'];
  const mono = `font-family:'${theme.fonts.mono}',monospace`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="${theme.fonts.googleFontsUrl}" rel="stylesheet">
<style>body{margin:0}</style></head><body>
<div style="width:${theme.width}px;height:${theme.height}px;box-sizing:border-box;padding:88px 84px;position:relative;background:${backdrop(c, i)};color:${c.text};font-family:'${theme.fonts.display}',sans-serif;display:flex;flex-direction:column;justify-content:space-between">
<div style="display:flex;justify-content:space-between;align-items:center;${mono};font-size:26px;color:${c.muted}">${logoUri ? `<span style="${c.logoChip ? 'background:#fff;border-radius:12px;padding:10px 18px;' : ''}display:flex"><img src="${logoUri}" alt="${esc(brand.name)}" style="height:52px"></span>` : `<span style="font-family:'${theme.fonts.display}',sans-serif;font-weight:700;font-size:36px;color:${c.text}">${esc(brand.name)}</span>`}</span><span>${i + 1} / ${total}</span></div>
${s.sticker ? `<div id="stk" style="position:absolute;right:70px;top:${s.type === 'cover' ? 170 : 150}px;width:170px;height:170px;border-radius:50%;background:${c.accent};display:flex;align-items:center;justify-content:center;font-size:96px;transform:rotate(12deg);box-shadow:0 10px 30px #0004;font-family:'Apple Color Emoji','Noto Color Emoji',sans-serif">${esc(s.sticker)}</div>` : ''}
${body(s, c, i)}
<div style="${mono};font-size:24px;color:${c.muted};display:flex;justify-content:space-between"><span>${esc(s.footer || '')}</span><span>${i + 1 < total ? '→' : ''}</span></div>
</div></body></html>`;
}

mkdirSync(join(root, dir), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: theme.width, height: theme.height } });
for (let i = 0; i < total; i++) {
  await page.setContent(slideHtml(deck.slides[i], i), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Move the sticker (or shrink it) until it no longer covers any text or the logo.
  await page.evaluate(() => {
    const stk = document.getElementById('stk');
    if (!stk) return;
    const obstacles = [];
    const walker = document.createTreeWalker(stk.parentElement, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (stk.contains(n) || !n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of r.getClientRects()) obstacles.push(q);
    }
    for (const im of stk.parentElement.querySelectorAll('img')) obstacles.push(im.getBoundingClientRect());
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const pad = 14;
    const tries = [];
    for (const size of [170, 140, 110, 90]) for (const where of [{ top: 150 }, { top: 190 }, { bottom: 160 }, { bottom: 210 }]) tries.push({ size, ...where });
    let best = null;
    for (const t of tries) {
      stk.style.width = stk.style.height = t.size + 'px';
      stk.style.fontSize = Math.round(t.size * 0.56) + 'px';
      stk.style.top = t.top != null ? t.top + 'px' : 'auto';
      stk.style.bottom = t.bottom != null ? t.bottom + 'px' : 'auto';
      const b = stk.getBoundingClientRect();
      const grown = { left: b.left - pad, right: b.right + pad, top: b.top - pad, bottom: b.bottom + pad };
      const area = obstacles.reduce((sum, o) => sum + overlap(grown, o), 0);
      if (best === null || area < best.area) best = { ...t, area };
      if (area === 0) break;
    }
    stk.style.width = stk.style.height = best.size + 'px';
    stk.style.fontSize = Math.round(best.size * 0.56) + 'px';
    stk.style.top = best.top != null ? best.top + 'px' : 'auto';
    stk.style.bottom = best.bottom != null ? best.bottom + 'px' : 'auto';
  });
  const out = join(root, dir, `slide-${i + 1}.png`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();
// Drop PNGs left over from a longer earlier version of this deck.
for (const f of readdirSync(join(root, dir))) { const m = /^slide-(\d+)\.png$/.exec(f); if (m && +m[1] > total) unlinkSync(join(root, dir, f)); }

// Local review page: open drafts/<dir>/review.html in a browser.
const imgs = deck.slides.map((_, i) => `<img src="slide-${i + 1}.png" alt="Slide ${i + 1}">`).join('');
let caption = '';
try { caption = readFileSync(join(root, dir, 'caption.txt'), 'utf8'); } catch {}
writeFileSync(join(root, dir, 'review.html'), `<!doctype html><meta charset="utf-8"><title>${esc(deck.title)}</title>
<style>body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#e9edf3;color:#0C2F66}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}img{width:100%;border-radius:8px;box-shadow:0 2px 8px #0003}
pre{white-space:pre-wrap;background:#fff;padding:16px;border-radius:8px;max-width:760px}</style>
<h1>${esc(deck.title)}</h1><div class="g">${imgs}</div><h2>Caption</h2><pre>${esc(caption)}</pre>`);
console.log('review page:', join(root, dir, 'review.html'));
