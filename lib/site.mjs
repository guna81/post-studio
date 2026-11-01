// Read a public website to suggest brand colours and a logo. No dependencies.
// Safety: http(s) only, public addresses only (checked at connect time, so DNS tricks cannot reach
// localhost or the LAN), size and time limits, redirects re-checked.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { hex } from './theme.mjs';

const MAX_BYTES = 1.5e6, TIMEOUT = 8000, MAX_REDIRECTS = 4;

function isPublicIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd')) return false;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPublicIp(m[1]) : true;
  }
  return false;
}

// DNS lookup that refuses non-public addresses; the socket then connects to the checked address.
function safeLookup(host, opts, cb) {
  dns.lookup(host, { ...opts, all: true }, (err, list) => {
    if (err) return cb(err);
    const ok = list.filter((a) => isPublicIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error('That address is not a public website'), { code: 'EBLOCKED' }));
    if (opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function fetchOnce(u, accept) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { lookup: safeLookup, timeout: TIMEOUT, headers: { 'user-agent': 'PostStudio/1 (brand colour lookup)', accept } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u) }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`The site answered with status ${res.statusCode}`)); }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > MAX_BYTES) { req.destroy(new Error('The page is too large')); } else chunks.push(c); });
      res.on('end', () => resolve({ body: Buffer.concat(chunks), type: String(res.headers['content-type'] || '') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The site took too long to answer')));
    req.on('error', (e) => reject(e.code === 'EBLOCKED' ? e : new Error(e.code === 'ENOTFOUND' ? 'Could not find that website' : e.message)));
  });
}

async function get(url, accept = '*/*') {
  let u = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses are supported');
    const lit = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(lit) && !isPublicIp(lit)) throw new Error('That address is not a public website'); // IP literals skip DNS lookup
    if (u.username || u.password) throw new Error('Remove the username and password from the address');
    const r = await fetchOnce(u, accept);
    if (r.redirect) { u = r.redirect; continue; }
    return { ...r, url: u };
  }
  throw new Error('Too many redirects');
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
function sat(h) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
function light(h) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return (r + g + b) / 765; }

// Count colours written in HTML/CSS and keep the distinctive ones (drop whites, blacks, greys).
function rankColors(text, boost = []) {
  const count = new Map();
  const bump = (h, w = 1) => { h = hex(h); if (h) count.set(h, (count.get(h) || 0) + w); };
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) bump(m[1].length === 3 ? '#' + [...m[1]].map((c) => c + c).join('') : '#' + m[1], 1);
  for (const m of text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) { const [r, g, b] = [m[1], m[2], m[3]].map(Number); if (r < 256 && g < 256 && b < 256) bump(toHex(r, g, b), 1); }
  for (const h of boost) bump(h, 25);
  const keep = [...count].filter(([h]) => sat(h) > 0.25 && light(h) > 0.08 && light(h) < 0.95).sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [h, n] of keep) {
    const near = out.some((o) => [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(h.slice(i, i + 2), 16) - parseInt(o.hex.slice(i, i + 2), 16)), 0) < 60);
    if (!near) out.push({ hex: h, uses: n });
    if (out.length === 8) break;
  }
  return out;
}

const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || []).slice(2).find((x) => x !== undefined);

export async function siteTheme(input) {
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(input) ? input : 'https://' + input); } catch { throw new Error('Enter a website address like example.com'); }
  const page = await get(u, 'text/html,application/xhtml+xml');
  if (!/html/i.test(page.type)) throw new Error('That address is not a web page');
  const html = page.body.toString('utf8');
  const head = html.slice(0, 200000);

  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const themeColor = metas.filter((t) => /name\s*=\s*["']?theme-color/i.test(t)).map((t) => attr(t, 'content')).filter(Boolean);
  const title = (head.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim().slice(0, 80) || '';

  // Inline styles plus up to 3 stylesheets from the same site.
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join('\n');
  const sheets = links.filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t)).map((t) => attr(t, 'href')).filter(Boolean).slice(0, 3);
  for (const href of sheets) {
    try { const s = new URL(href, page.url); if (s.hostname === page.url.hostname) css += '\n' + (await get(s, 'text/css')).body.toString('utf8'); } catch {}
  }
  const colors = rankColors(css, themeColor);

  // Logo candidates (PNG or SVG only, since those are what the renderer accepts).
  const cand = [];
  for (const t of [...head.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])) if (/logo|brand/i.test(t)) cand.push(attr(t, 'src'));
  for (const t of links) if (/rel\s*=\s*["']?(apple-touch-icon|icon|shortcut icon)/i.test(t)) cand.push(attr(t, 'href'));
  for (const t of metas) if (/property\s*=\s*["']og:image/i.test(t)) cand.push(attr(t, 'content'));
  const logos = [];
  const seen = new Set();
  for (const c of cand.filter(Boolean)) {
    if (logos.length >= 3) break;
    let lu; try { lu = new URL(c, page.url); } catch { continue; }
    if (seen.has(lu.href) || !/\.(png|svg)(\?|$)/i.test(lu.pathname + lu.search)) continue;
    seen.add(lu.href);
    try {
      const r = await get(lu, 'image/png,image/svg+xml');
      const ext = /\.svg(\?|$)/i.test(lu.pathname + lu.search) ? 'svg' : 'png';
      const okPng = ext === 'png' && r.body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const okSvg = ext === 'svg' && /<svg[\s>]/i.test(r.body.toString('utf8', 0, 4096));
      if ((okPng || okSvg) && r.body.length <= 600 * 1024) logos.push({ filename: 'logo.' + ext, data: r.body.toString('base64'), from: lu.href });
    } catch {}
  }
  return { site: page.url.origin, title, colors, logos };
}
