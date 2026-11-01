// Data store: users and projects live under ~/.post-studio (override with POST_STUDIO_HOME).
// A project folder has exactly the layout the skills and cli.mjs already use (brand.json, theme.json, posts-log.json, drafts/, assets/).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, cpSync, chmodSync, unlinkSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { hex, buildTheme } from './theme.mjs';
import { formats } from '../formats/registry.mjs';
import { channels } from '../channels/registry.mjs';

export const HOME = resolve(process.env.POST_STUDIO_HOME || join(homedir(), '.post-studio'));
const PROJECTS = join(HOME, 'projects');
mkdirSync(PROJECTS, { recursive: true, mode: 0o700 });

const ID_RE = /^[a-f0-9]{16}$/;
export const isProjectId = (id) => ID_RE.test(String(id));

function writeAtomic(file, text, mode) {
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(tmp, text, mode ? { mode } : undefined);
  renameSync(tmp, file);
}
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };

// ---------- users ----------
const USERS = join(HOME, 'users.json');
export const readUsers = () => readJson(USERS, []);
export const writeUsers = (u) => writeAtomic(USERS, JSON.stringify(u, null, 2) + '\n', 0o600);

export function secret() {
  const f = join(HOME, 'secret');
  if (!existsSync(f)) { writeFileSync(f, randomBytes(32).toString('hex'), { mode: 0o600 }); }
  try { chmodSync(f, 0o600); } catch {}
  return readFileSync(f, 'utf8').trim();
}

// ---------- projects ----------
export function projectRoot(id) {
  if (!isProjectId(id)) throw new Error('Bad project id');
  return join(PROJECTS, id);
}

export function getProject(id, userId) {
  if (!isProjectId(id)) return null;
  const meta = readJson(join(projectRoot(id), 'project.json'), null);
  return meta && meta.ownerId === userId ? meta : null; // not-yours looks the same as not-found
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Validate and normalise the settings form. Returns only the fields that were sent.
export function cleanSettings(input = {}) {
  const out = {};
  if ('name' in input) { out.name = str(input.name, 80); if (!out.name) throw new Error('Give the project a name'); }
  for (const [k, max] of [['about', 300], ['goal', 400], ['audience', 200], ['tone', 120], ['cta', 120]]) if (k in input) out[k] = str(input[k], max);
  if ('hashtags' in input) {
    const list = Array.isArray(input.hashtags) ? input.hashtags : String(input.hashtags).split(/[,\s]+/);
    out.hashtags = list.map((t) => String(t).trim()).filter(Boolean).slice(0, 30).map((t) => (t.startsWith('#') ? t : '#' + t)).map((t) => t.replace(/[^#\w]/g, ''));
  }
  if ('channel' in input) { if (!channels[input.channel]) throw new Error('Unknown platform'); out.channel = input.channel; }
  if ('size' in input) out.size = str(input.size, 40);
  if ('format' in input) { if (!formats[input.format]) throw new Error('Unknown format'); out.format = input.format; }
  if (input.colors) {
    const primary = hex(input.colors.primary), accent = hex(input.colors.accent);
    if (!primary || !accent) throw new Error('Colours must be hex codes like #12448F');
    out.colors = { primary, accent };
  }
  return out;
}

function saveLogo(root, logo) {
  if (!logo) return undefined;
  const ext = extname(String(logo.filename || '')).toLowerCase();
  if (!['.svg', '.png'].includes(ext)) throw new Error('Logo must be an SVG or PNG file');
  const data = Buffer.from(String(logo.data || ''), 'base64');
  if (!data.length || data.length > 600 * 1024) throw new Error('Logo must be under 600 KB');
  const okPng = ext === '.png' && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const okSvg = ext === '.svg' && /<svg[\s>]/i.test(data.toString('utf8', 0, 4096));
  if (!okPng && !okSvg) throw new Error('That file does not look like a valid ' + ext.slice(1).toUpperCase());
  mkdirSync(join(root, 'assets'), { recursive: true });
  for (const e of ['.svg', '.png']) { try { unlinkSync(join(root, 'assets', 'logo' + e)); } catch {} }
  writeFileSync(join(root, 'assets', 'logo' + ext), data);
  return 'assets/logo' + ext;
}

// Make theme.json's canvas match the chosen post size (keeps hand-made themes, only width/height change).
export function syncSize(root, brand) {
  const ch = channels[brand.defaults?.channel || 'instagram'];
  const sz = ch?.sizes?.find((x) => x.id === (brand.defaults?.size || ch.defaultSize));
  if (!sz) return;
  const file = join(root, 'theme.json');
  const t = readJson(file, null);
  if (t && (t.width !== sz.width || t.height !== sz.height)) writeAtomic(file, JSON.stringify({ ...t, width: sz.width, height: sz.height }, null, 2) + '\n');
}

// Apply cleaned settings to brand.json (+ theme.json when colours changed).
function applySettings(root, s, logo) {
  const file = join(root, 'brand.json');
  const b = readJson(file, {});
  const { channel, format, colors, size, ...rest } = s;
  Object.assign(b, rest);
  b.defaults = { ...(b.defaults || {}), format: format || b.defaults?.format || 'carousel', channel: channel || b.defaults?.channel || 'instagram' };
  if (!channels[b.defaults.channel].formats.includes(b.defaults.format)) throw new Error(`${channels[b.defaults.channel].label} does not accept the ${b.defaults.format} format`);
  const ch = channels[b.defaults.channel];
  if (ch.sizes) {
    const sid = size || b.defaults.size || ch.defaultSize;
    const sz = ch.sizes.find((x) => x.id === sid);
    if (!sz) throw new Error(`${ch.label} does not support the size "${sid}"`);
    b.defaults.size = sz.id;
  }
  const newLogo = saveLogo(root, logo);
  if (newLogo) b.logo = newLogo;
  if (colors) { b.colors = colors; writeAtomic(join(root, 'theme.json'), JSON.stringify(buildTheme(colors.primary, colors.accent), null, 2) + '\n'); }
  syncSize(root, b);
  writeAtomic(file, JSON.stringify(b, null, 2) + '\n');
}

export function createProject(userId, input, logo) {
  const s = cleanSettings(input);
  if (!s.name) throw new Error('Give the project a name');
  s.colors ||= { primary: '#1F3A8A', accent: '#FACC15' };
  const id = randomBytes(8).toString('hex');
  const root = projectRoot(id);
  mkdirSync(join(root, 'drafts'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  try {
    writeFileSync(join(root, 'posts-log.json'), '[]\n');
    writeFileSync(join(root, 'brand.json'), '{}\n');
    writeFileSync(join(root, '.gitignore'), '.env\n.DS_Store\n');
    s.tone ||= 'plain, direct, confident, honest';
    s.hashtags ||= [];
    applySettings(root, s, logo);
    const meta = { id, ownerId: userId, createdAt: new Date().toISOString() };
    writeAtomic(join(root, 'project.json'), JSON.stringify(meta, null, 2) + '\n');
    return meta;
  } catch (e) { rmSync(root, { recursive: true, force: true }); throw e; }
}

export function updateProject(id, input, logo) {
  applySettings(projectRoot(id), cleanSettings(input), logo);
}

export function deleteProject(id) {
  rmSync(projectRoot(id), { recursive: true, force: true });
}

// Copy an existing workspace folder into the store as a new project.
export function importWorkspace(srcDir, userId) {
  const src = resolve(srcDir);
  for (const f of ['brand.json', 'theme.json']) if (!existsSync(join(src, f))) throw new Error(`${src} has no ${f}. Is it a workspace folder?`);
  const id = randomBytes(8).toString('hex');
  const root = projectRoot(id);
  cpSync(src, root, { recursive: true, filter: (p) => !/(^|[\\/])(\.env|\.git|node_modules)([\\/]|$)/.test(p) });
  if (!existsSync(join(root, 'posts-log.json'))) writeFileSync(join(root, 'posts-log.json'), '[]\n');
  mkdirSync(join(root, 'drafts'), { recursive: true });
  const meta = { id, ownerId: userId, createdAt: new Date().toISOString() };
  writeAtomic(join(root, 'project.json'), JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

// What the UI needs to show a project card or fill the settings form.
export function describeProject(meta) {
  const root = projectRoot(meta.id);
  const brand = readJson(join(root, 'brand.json'), {});
  const theme = readJson(join(root, 'theme.json'), { colors: {} });
  const log = readJson(join(root, 'posts-log.json'), []);
  const last = log.at(-1);
  return {
    id: meta.id, createdAt: meta.createdAt,
    name: brand.name || 'Untitled', about: brand.about || '', goal: brand.goal || '', audience: brand.audience || '', tone: brand.tone || '', cta: brand.cta || '',
    hashtags: brand.hashtags || [], channel: brand.defaults?.channel || 'instagram', format: brand.defaults?.format || 'carousel', size: brand.defaults?.size || channels[brand.defaults?.channel || 'instagram']?.defaultSize || null, width: theme.width || 1080, height: theme.height || 1350,
    hasLogo: !!(brand.logo && existsSync(join(root, brand.logo))),
    colors: brand.colors || { primary: theme.colors?.blue?.bg || '#1F3A8A', accent: theme.colors?.pop?.bg || '#FACC15' },
    customTheme: !brand.colors,
    posts: log.length, posted: log.filter((p) => p.status === 'posted').length,
    lastTitle: last?.title || null, lastDate: last?.date || null,
  };
}

export function listProjects(userId) {
  const out = [];
  for (const id of readdirSync(PROJECTS)) {
    if (!isProjectId(id)) continue;
    const meta = getProject(id, userId);
    if (meta) out.push(describeProject(meta));
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
