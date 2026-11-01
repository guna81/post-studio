#!/usr/bin/env node
// postloom init [dir] | doctor | start [dir]
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, arg] = process.argv.slice(2);

// ---------- colour helpers ----------
const hex = (s) => { s = String(s).trim().replace(/^#/, ''); if (s.length === 3) s = [...s].map((c) => c + c).join(''); return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toUpperCase() : null; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Nudge `c` toward black or white (whichever helps) until it reaches `min` contrast on `bg`.
function fix(c, bg, min) {
  const target = lum(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0; t <= 1.001 && ratio(c, bg) < min; t += 0.05) c = mix(c, target, 0.05);
  return ratio(c, bg) >= min ? c : target;
}
function deriveThemes(primary, accent) {
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

// ---------- doctor ----------
async function doctor({ quiet = false } = {}) {
  const checks = [];
  const add = (name, ok, fix = '') => checks.push({ name, ok, fix });
  add('Node 20+', Number(process.versions.node.split('.')[0]) >= 20, 'Install Node 20 or newer from https://nodejs.org');
  const c = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  add('Claude Code CLI on PATH', c.status === 0, 'Install Claude Code (https://claude.com/claude-code) and run `claude` once to log in');
  let chromiumOk = false, pwOk = false;
  try { const { chromium } = await import('playwright'); pwOk = true; chromiumOk = existsSync(chromium.executablePath()); } catch {}
  add('Playwright installed', pwOk, `cd ${kit} && npm install`);
  add('Chromium browser installed', chromiumOk, `cd ${kit} && npx playwright install chromium`);
  for (const k of checks) console.log(`${k.ok ? '  ok ' : ' FAIL'}  ${k.name}${k.ok ? '' : '\n        fix: ' + k.fix}`);
  const ok = checks.every((k) => k.ok);
  if (!quiet) console.log(ok ? '\nAll good. Not checked: whether `claude` is logged in. Run `claude` once if topics fail with an auth error.' : '\nFix the items above, then run `postloom doctor` again.');
  return ok;
}

// ---------- init ----------
async function init(dirArg) {
  console.log('Postloom setup\n');
  await doctor({ quiet: true });
  // Interactive terminal: readline. Piped input (CI, scripts): read all answers up front.
  const piped = !process.stdin.isTTY ? readFileSync(0, 'utf8').split('\n') : null;
  const rl = piped ? { question: async (q) => { process.stdout.write(q); const a = piped.shift() ?? ''; console.log(a); return a; }, close() {} } : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '') => ((await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim() || def);
  const askHex = async (q, def) => { for (;;) { const v = hex(await ask(q, def)); if (v) return v; console.log('  Enter a hex colour like #12448F'); } };
  console.log('\nAnswer a few questions about your brand (Enter keeps the default).\n');
  const name = await ask('Brand name');
  if (!name) { rl.close(); console.error('A brand name is required.'); process.exit(1); }
  const about = await ask('One line: what do you do?', '');
  const audience = await ask('Who is the audience?', 'developers, students and founders');
  const tone = await ask('Tone of voice', 'plain, direct, confident, honest');
  const primary = await askHex('Primary brand colour (hex)', '#1F3A8A');
  const accent = await askHex('Accent colour (hex)', '#FACC15');
  const logoIn = await ask('Logo file path, SVG or PNG (optional, Enter to skip)');
  const tags = (await ask('Hashtags, comma separated', '#' + name.replace(/[^a-z0-9]/gi, ''))).split(',').map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t));
  const cta = await ask('Closing call to action', `Save this · Follow ${name}`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
  const dir = resolve(dirArg || (await ask('Workspace folder', `./${slug}`)));
  if (existsSync(join(dir, 'brand.json'))) { rl.close(); console.error(`\n${dir} already has a brand.json. Not overwriting. Choose another folder.`); process.exit(1); }
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'drafts'), { recursive: true });
  let logo = null;
  if (logoIn) {
    const src = resolve(logoIn.replace(/^~/, process.env.HOME || '~'));
    if (existsSync(src) && ['.svg', '.png'].includes(extname(src).toLowerCase())) { logo = 'assets/logo' + extname(src).toLowerCase(); copyFileSync(src, join(dir, logo)); }
    else console.log('  Logo not found or not .svg/.png, skipping.');
  }
  const demoTheme = JSON.parse(readFileSync(join(kit, 'examples', 'demo', 'theme.json'), 'utf8'));
  const themes = deriveThemes(primary, accent);
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ width: 1080, height: 1350, colors: themes, fonts: demoTheme.fonts }, null, 2) + '\n');
  writeFileSync(join(dir, 'brand.json'), JSON.stringify({ name, about, audience, tone, cta, hashtags: tags, logo, defaults: { format: 'carousel', channel: 'instagram' } }, null, 2) + '\n');
  writeFileSync(join(dir, 'posts-log.json'), '[]\n');
  writeFileSync(join(dir, '.gitignore'), '.env\n.DS_Store\n');
  console.log(`\nCreated ${dir}`);
  for (const [k, t] of Object.entries(themes)) console.log(`  ${k.padEnd(5)} text/bg contrast ${ratio(t.text, t.bg).toFixed(1)}:1`);
  const go = (await ask('\nStart the studio now? (y/n)', 'y')).toLowerCase().startsWith('y');
  rl.close();
  if (go) start(dir); else console.log(`\nLater: postloom start ${dir}`);
}

// ---------- start ----------
function start(dirArg) {
  const dir = resolve(dirArg || '.');
  if (!existsSync(join(dir, 'brand.json'))) { console.error(`No brand.json in ${dir}. Run \`postloom init\` first.`); process.exit(1); }
  spawn('node', [join(kit, 'server.mjs'), dir], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
}

if (cmd === 'init') await init(arg);
else if (cmd === 'doctor') process.exit((await doctor()) ? 0 : 1);
else if (cmd === 'start') start(arg);
else console.log('Usage:\n  postloom init [dir]    create a workspace (asks a few questions)\n  postloom doctor        check Node, Claude Code, Playwright, Chromium\n  postloom start [dir]   run the studio for a workspace');
