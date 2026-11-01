// Post Studio server. Run: node server.mjs   then open http://localhost:4173
// Accounts and projects live in ~/.post-studio (POST_STUDIO_HOME). Each project is a workspace folder.
// Uses the Claude Code CLI in headless mode (`claude -p`), so it runs on the host's Claude Code login, no API key.
// Formats (what a post is) live in formats/, channels (where it is published) in channels/.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formats } from './formats/registry.mjs';
import { channels } from './channels/registry.mjs';
import * as auth from './lib/auth.mjs';
import * as store from './lib/store.mjs';
import { zip } from './lib/zip.mjs';
import { siteTheme } from './lib/site.mjs';

const kit = dirname(fileURLToPath(import.meta.url)); // this repo: code only
const PORT = Number(process.env.PORT) || 4173;
const DIR_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$/;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const EXPORTABLE = new Set(['.png', '.jpg', '.mp4', '.json', '.txt']);

const today = () => new Date().toLocaleDateString('en-CA');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'post';
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const fail = (status, msg) => Object.assign(new Error(msg), { status });

function run(cmd, args, cwd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('Timed out after ' + timeout / 1000 + 's')); }, timeout);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); reject(e.code === 'ENOENT' ? new Error(`"${cmd}" not found. Is it installed and on PATH?`) : e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err.trim() || out.trim() || `exit code ${code}`)); });
    p.stdin.end();
  });
}

// Headless Claude Code. Only web search is allowed; the server (not Claude) writes the files.
async function askClaude(prompt, cwd) {
  const out = await run('claude', ['-p', prompt, '--output-format', 'json', '--allowedTools', 'WebSearch', '--no-session-persistence'], cwd);
  const parsed = JSON.parse(out);
  if (parsed.is_error) throw new Error(String(parsed.result || 'Claude returned an error'));
  return String(parsed.result);
}

function extractJson(text) {
  const t = text.replace(/```(?:json)?/g, '').trim();
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('No JSON found in Claude output');
  const s = Math.min(...starts);
  const open = t[s], close = open === '{' ? '}' : ']';
  return JSON.parse(t.slice(s, t.lastIndexOf(close) + 1));
}

// Everything that used to be global (one workspace) is now built per project.
function projectApi(root) {
  const LOG = join(root, 'posts-log.json');
  const brand = readJson(join(root, 'brand.json'));
  const THEMES = Object.keys(readJson(join(root, 'theme.json')).colors);
  const DEFAULTS = { format: brand.defaults?.format || 'carousel', channel: brand.defaults?.channel || 'instagram' };
  if (!existsSync(LOG)) writeFileSync(LOG, '[]\n');
  mkdirSync(join(root, 'drafts'), { recursive: true });

  const readLog = () => readJson(LOG);
  const writeLog = (l) => writeFileSync(LOG, JSON.stringify(l, null, 2) + '\n');
  const getFormat = (id) => formats[id || DEFAULTS.format] || (() => { throw new Error(`Unknown format "${id}"`); })();
  const getChannel = (id) => channels[id || DEFAULTS.channel] || (() => { throw new Error(`Unknown channel "${id}"`); })();
  const entryFor = (dir) => readLog().find((p) => p.local_dir === `drafts/${dir}`);
  const render = (dir, fmt) => run('node', [fmt.renderScript, root, join('drafts', dir)], root, 120000);
  const dirPath = (dir) => { if (!DIR_RE.test(dir || '')) throw new Error('Bad draft folder name'); return join(root, 'drafts', dir); };
  const context = () => `${brand.about ? ' (' + brand.about + ')' : ''}${brand.goal ? ' Goal of this account: ' + brand.goal + '.' : ''}${brand.audience ? ' Audience: ' + brand.audience + '.' : ''}`;

  const backupName = (f) => f.replace(/\.json$/, '.prev.json');
  async function writeDraft(dir, fmt, title, content, caption) {
    const d = dirPath(dir), e = entryFor(dir) || {};
    writeFileSync(join(d, fmt.contentFile), JSON.stringify(fmt.wrap(title, content), null, 2) + '\n');
    writeFileSync(join(d, 'caption.txt'), String(caption ?? '').trim() + '\n');
    await render(dir, fmt);
    if (e.local_dir) { const log = readLog(); log.find((p) => p.local_dir === e.local_dir).slides = content.length; writeLog(log); }
  }

  const api = {
    async topics() {
      const used = readLog().map((p) => p.title);
      const prompt = `Today is ${today()}. Search the web for the hottest news from the last 48 hours relevant to ${brand.audience || 'a general tech audience'}${brand.about ? ' (context: ' + brand.name + ' is ' + brand.about + ')' : ''}.${brand.goal ? ' The account goal is: ' + brand.goal + '.' : ''}
Pick 5 stories that would make a strong educational social post.
Do NOT pick topics similar to these already-posted ones: ${JSON.stringify(used)}.
Reply with ONLY a JSON array (no prose) of 5 objects: {"title": short post title, "angle": one sentence on how the post would explain it, "why_now": one sentence on why it's hot, "source_url": a real URL you used}.`;
      return { topics: extractJson(await askClaude(prompt, root)) };
    },

    async generate({ topic, notes, format: fid, channel: cid }) {
      if (!topic || typeof topic !== 'string' || topic.length > 500) throw new Error('Enter a topic (max 500 characters)');
      const fmt = getFormat(fid), ch = getChannel(cid);
      if (!ch.formats.includes(fmt.id)) throw new Error(`${ch.label} does not accept the ${fmt.id} format`);
      store.syncSize(root, brand); // make sure the canvas matches the project's chosen post size before rendering
      const log = readLog();
      const used = log.map((p) => p.title);
      const prompt = `Today is ${today()}. Create a ${fmt.id} post for ${ch.label} for ${brand.name}.${context()} Tone: ${brand.tone || 'plain, direct, confident, honest'}.
Topic: ${JSON.stringify(topic)}
${notes ? 'Extra notes from the user: ' + JSON.stringify(String(notes).slice(0, 1500)) : ''}
Do not repeat these already-posted titles: ${JSON.stringify(used)}.
Use web search to verify any fact, number or price. Label estimates as estimates. Never invent statistics.

${fmt.outputSpec({ brand, themes: THEMES })}
${ch.captionRules(brand)}`;
      const data = extractJson(await askClaude(prompt, root));
      const content = fmt.clean(data.content ?? data.slides, { themes: THEMES });
      const title = String(data.title || topic).slice(0, 100);
      const slug = slugify(data.slug || title);
      if (log.some((p) => p.topic_slug === slug || p.title.toLowerCase() === title.toLowerCase()))
        throw new Error(`"${title}" looks like a topic that is already in the log. Pick a different angle.`);
      let dir = `${today()}-${slug}`, n = 2;
      while (existsSync(join(root, 'drafts', dir))) dir = `${today()}-${slug}-${n++}`;
      mkdirSync(dirPath(dir), { recursive: true });
      writeFileSync(join(dirPath(dir), fmt.contentFile), JSON.stringify(fmt.wrap(title, content), null, 2) + '\n');
      writeFileSync(join(dirPath(dir), 'caption.txt'), String(data.caption || '').trim() + '\n');
      await render(dir, fmt);
      log.push({ date: today(), title, topic_slug: slug, format: fmt.id, channel: ch.id, slides: content.length, status: 'drafted', local_dir: `drafts/${dir}`, caption: `drafts/${dir}/caption.txt`, post_url: null, sources: Array.isArray(data.sources) ? data.sources.slice(0, 10) : [] });
      writeLog(log);
      return { dir };
    },

    async draft({ dir }) {
      const d = dirPath(dir), e = entryFor(dir) || {};
      const fmt = getFormat(e.format), ch = getChannel(e.channel);
      const file = readJson(join(d, fmt.contentFile));
      const caption = existsSync(join(d, 'caption.txt')) ? readFileSync(join(d, 'caption.txt'), 'utf8') : '';
      return { dir, title: file.title, format: fmt.id, channel: ch.id, channelLabel: ch.label, content: fmt.unwrap(file), caption, previews: fmt.previews(d), canUndo: existsSync(join(d, backupName(fmt.contentFile))), postingHint: ch.postingHint, homeUrl: ch.homeUrl };
    },

    async save({ dir, content, caption, title }) {
      const d = dirPath(dir), e = entryFor(dir) || {};
      const fmt = getFormat(e.format);
      const clean = fmt.clean(content, { themes: THEMES });
      const prev = readJson(join(d, fmt.contentFile));
      await writeDraft(dir, fmt, title || prev.title, clean, caption);
      return { ok: true };
    },

    // Ask Claude to change an existing post. Sends the editor's current content so unsaved edits are kept.
    async revise({ dir, instruction, content, caption }) {
      if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 1000) throw new Error('Describe the change in 1 to 1000 characters');
      const d = dirPath(dir), e = entryFor(dir) || {};
      const fmt = getFormat(e.format), ch = getChannel(e.channel);
      const file = readJson(join(d, fmt.contentFile));
      const base = fmt.clean(content ?? fmt.unwrap(file), { themes: THEMES });
      const cap = String(caption ?? (existsSync(join(d, 'caption.txt')) ? readFileSync(join(d, 'caption.txt'), 'utf8') : '')).slice(0, 4000);
      const prompt = `Today is ${today()}. You are editing an existing ${fmt.id} post for ${ch.label} for ${brand.name}.${context()} Tone: ${brand.tone || 'plain, direct, confident, honest'}.
Current post title: ${JSON.stringify(file.title)}
Current content: ${JSON.stringify(base)}
Current caption: ${JSON.stringify(cap)}

The user asks: ${JSON.stringify(instruction.trim())}

Change only what the request needs and keep everything else as it is. Use web search to verify any new fact, number or price. Never invent statistics.
Reply with the FULL updated post in this format (the "slug" is ignored, keep the title unless the request changes it):

${fmt.outputSpec({ brand, themes: THEMES })}
${ch.captionRules(brand)}`;
      const data = extractJson(await askClaude(prompt, root));
      const next = fmt.clean(data.content ?? data.slides, { themes: THEMES });
      // One level of undo: keep what was on disk before this change.
      copyFileSync(join(d, fmt.contentFile), join(d, backupName(fmt.contentFile)));
      if (existsSync(join(d, 'caption.txt'))) copyFileSync(join(d, 'caption.txt'), join(d, 'caption.prev.txt'));
      await writeDraft(dir, fmt, String(data.title || file.title).slice(0, 100), next, data.caption ?? cap);
      if (e.local_dir) { const log = readLog(); const le = log.find((p) => p.local_dir === e.local_dir); if (le.status === 'approved') le.status = 'drafted'; writeLog(log); }
      return { ok: true };
    },

    async undoRevise({ dir }) {
      const d = dirPath(dir), e = entryFor(dir) || {};
      const fmt = getFormat(e.format);
      const bk = join(d, backupName(fmt.contentFile));
      if (!existsSync(bk)) throw new Error('Nothing to undo');
      const old = readJson(bk);
      const capBk = join(d, 'caption.prev.txt');
      await writeDraft(dir, fmt, old.title, fmt.clean(fmt.unwrap(old), { themes: THEMES }), existsSync(capBk) ? readFileSync(capBk, 'utf8') : '');
      rmSync(bk); rmSync(capBk, { force: true });
      return { ok: true };
    },

    async deleteDraft({ dir }) {
      const d = dirPath(dir);
      writeLog(readLog().filter((p) => p.local_dir !== `drafts/${dir}`));
      rmSync(d, { recursive: true, force: true });
      return { ok: true };
    },

    async status({ dir, status, post_url }) {
      dirPath(dir);
      if (!['drafted', 'approved', 'posted'].includes(status)) throw new Error('Bad status');
      const log = readLog();
      const e = log.find((p) => p.local_dir === `drafts/${dir}`);
      if (!e) throw new Error('Post not in log');
      e.status = status;
      if (status === 'posted') {
        e.posted_date = today();
        if (post_url) {
          const ch = getChannel(e.channel);
          if (!ch.postUrlPattern.test(post_url)) throw new Error(`URL must start with ${ch.homeUrl}`);
          e.post_url = post_url;
        }
      }
      writeLog(log);
      return { ok: true };
    },

    async openFolder({ dir }) {
      const path = dirPath(dir);
      const [cmd, args] = process.platform === 'darwin' ? ['open', [path]] : process.platform === 'win32' ? ['explorer', [path]] : ['xdg-open', [path]];
      await run(cmd, args, root, 10000).catch((e) => { if (process.platform !== 'win32') throw e; }); // explorer exits 1 on success
      return { ok: true };
    },
  };

  // Export: one post (dir) or the whole project, as a zip or JSON.
  function exportData({ dir, format }) {
    const name = brand.name || 'project';
    const base = slugify(name);
    if (format === 'json') {
      const drafts = (dir ? [dir] : readdirSync(join(root, 'drafts')).filter((d) => DIR_RE.test(d))).map((d) => {
        const p = dirPath(d), f = readdirSync(p).find((x) => x.endsWith('.json') && !x.includes('.prev.'));
        return { dir: d, content: f ? readJson(join(p, f)) : null, caption: existsSync(join(p, 'caption.txt')) ? readFileSync(join(p, 'caption.txt'), 'utf8') : '' };
      });
      const body = { exportedAt: new Date().toISOString(), brand, theme: readJson(join(root, 'theme.json')), log: dir ? readLog().filter((p) => p.local_dir === `drafts/${dir}`) : readLog(), drafts };
      return { type: 'application/json', filename: `${base}${dir ? '-' + dir : ''}.json`, data: Buffer.from(JSON.stringify(body, null, 2)) };
    }
    const files = [];
    const addDraft = (d, prefix) => { const p = dirPath(d); for (const f of readdirSync(p)) if (EXPORTABLE.has(extname(f)) && !f.includes('.prev.')) files.push({ name: `${prefix}${f}`, data: readFileSync(join(p, f)) }); };
    if (dir) addDraft(dir, '');
    else {
      for (const d of readdirSync(join(root, 'drafts'))) if (DIR_RE.test(d)) addDraft(d, `drafts/${d}/`);
      for (const f of ['posts-log.json', 'brand.json', 'theme.json']) files.push({ name: f, data: readFileSync(join(root, f)) });
      if (brand.logo && existsSync(join(root, brand.logo))) files.push({ name: brand.logo, data: readFileSync(join(root, brand.logo)) });
    }
    if (!files.length) throw fail(404, 'Nothing to export yet');
    return { type: 'application/zip', filename: `${base}${dir ? '-' + dir : ''}.zip`, data: zip(files) };
  }

  return { api, brand, exportData, dirPath };
}

// ---------- http plumbing ----------
const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const sendFile = (res, file, type) => {
  // SVGs are user uploads: the sandbox CSP stops scripts running if one is opened directly.
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
  createReadStream(file).pipe(res);
};
const meta = () => ({
  formats: Object.values(formats).map((f) => ({ id: f.id, label: f.label })),
  channels: Object.values(channels).map((c) => ({ id: c.id, label: c.label, formats: c.formats, sizes: c.sizes || [], defaultSize: c.defaultSize || null })),
});
async function readBody(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 1.5e6) throw fail(413, 'Too large'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw fail(400, 'Invalid JSON'); }
}

const running = new Set(); // project ids with a slow job in flight
let slowJobs = 0;
const MAX_SLOW = 2;
const SLOW = new Set(['topics', 'generate', 'save', 'revise', 'undoRevise']);

http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0];
    if (host !== 'localhost' && host !== '127.0.0.1') return send(res, 403, { error: 'Forbidden' });
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const ip = req.socket.remoteAddress || '?';
    const me = auth.userFrom(req);
    const needUser = () => { if (!me) throw fail(401, 'Please log in'); return me; };
    // Resolve /…/projects/:id/… to this user's project (404 for someone else's, same as missing).
    const projectFor = (id) => { const m = store.getProject(id, needUser().id); if (!m) throw fail(404, 'Project not found'); return m; };

    if (req.method === 'GET') {
      if (p === '/') return send(res, 200, readFileSync(join(kit, 'ui', 'index.html')), 'text/html; charset=utf-8');
      if (p === '/assets/post-studio-logo.png') return send(res, 200, readFileSync(join(kit, 'ui', 'assets', 'post-studio-logo.png')), 'image/png');
      if (p === '/api/meta') return send(res, 200, meta());
      if (p === '/api/me') return me ? send(res, 200, { user: auth.publicUser(me) }) : send(res, 401, { error: 'Not logged in' });
      if (p === '/api/projects') return send(res, 200, { projects: store.listProjects(needUser().id) });

      let m = p.match(/^\/api\/projects\/([a-f0-9]{16})(?:\/(log|export))?$/);
      if (m) {
        const pm = projectFor(m[1]);
        if (!m[2]) return send(res, 200, { project: store.describeProject(pm) });
        if (m[2] === 'log') return send(res, 200, JSON.parse(readFileSync(join(store.projectRoot(pm.id), 'posts-log.json'), 'utf8')));
        const fmt = url.searchParams.get('format') === 'json' ? 'json' : 'zip';
        const out = projectApi(store.projectRoot(pm.id)).exportData({ dir: url.searchParams.get('dir') || undefined, format: fmt });
        return send(res, 200, out.data, out.type, { 'Content-Disposition': `attachment; filename="${out.filename}"` });
      }
      m = p.match(/^\/projects\/([a-f0-9]{16})\/logo$/);
      if (m) {
        const root = store.projectRoot(projectFor(m[1]).id), b = readJson(join(root, 'brand.json'));
        const f = b.logo && join(root, b.logo);
        return f && existsSync(f) ? sendFile(res, f, MIME[extname(f)] || 'application/octet-stream') : send(res, 404, { error: 'No logo' });
      }
      m = p.match(/^\/projects\/([a-f0-9]{16})\/drafts\/([^/]+)\/([\w.-]+)$/);
      if (m && DIR_RE.test(m[2]) && MIME[extname(m[3])]) {
        const f = join(store.projectRoot(projectFor(m[1]).id), 'drafts', m[2], m[3]);
        if (existsSync(f)) return sendFile(res, f, MIME[extname(m[3])]);
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (req.method === 'POST' && p.startsWith('/api/')) {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON only' });

      if (p === '/api/signup' || p === '/api/login') {
        if (auth.rateLimited(ip + p)) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
        const body = await readBody(req);
        let u;
        try { u = p === '/api/signup' ? await auth.signup(body) : await auth.login(body); }
        catch (e) { throw fail(p === '/api/login' ? 401 : 400, e.message); }
        return send(res, 200, { user: auth.publicUser(u) }, 'application/json', { 'Set-Cookie': auth.sessionCookie(u) });
      }
      if (p === '/api/profile') {
        const u0 = needUser();
        if (auth.rateLimited(ip + p, 10)) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
        const body = await readBody(req);
        let u;
        try { u = await auth.updateProfile(u0, body); } catch (e) { throw fail(e.status || 400, e.message); }
        return send(res, 200, { user: auth.publicUser(u) }, 'application/json', { 'Set-Cookie': auth.sessionCookie(u) });
      }
      if (p === '/api/logout') return send(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': auth.clearCookie() });

      if (p === '/api/theme/site') {
        needUser();
        if (auth.rateLimited(ip + p, 10)) return send(res, 429, { error: 'Too many lookups. Wait a minute and try again.' });
        const body = await readBody(req);
        try { return send(res, 200, await siteTheme(String(body.url || '').trim().slice(0, 300))); }
        catch (e) { throw fail(400, e.message); }
      }

      if (p === '/api/projects') {
        const body = await readBody(req);
        const created = store.createProject(needUser().id, body.settings || {}, body.logo);
        return send(res, 200, { project: store.describeProject(created) });
      }

      const m = p.match(/^\/api\/projects\/([a-f0-9]{16})\/([a-zA-Z]+)$/);
      if (m) {
        const pm = projectFor(m[1]), name = m[2], root = store.projectRoot(pm.id);
        const body = await readBody(req);
        if (name === 'update') { store.updateProject(pm.id, body.settings || {}, body.logo); return send(res, 200, { project: store.describeProject(pm) }); }
        if (name === 'delete') { store.deleteProject(pm.id); return send(res, 200, { ok: true }); }
        const { api } = projectApi(root);
        if (!Object.hasOwn(api, name)) return send(res, 404, { error: 'Unknown action' });
        const slow = SLOW.has(name);
        if (slow) {
          if (running.has(pm.id)) return send(res, 429, { error: 'Another job is running in this project. Wait for it to finish.' });
          if (slowJobs >= MAX_SLOW) return send(res, 429, { error: 'The server is busy with other jobs. Try again shortly.' });
          running.add(pm.id); slowJobs++;
        }
        try { return send(res, 200, await api[name](body)); } finally { if (slow) { running.delete(pm.id); slowJobs--; } }
      }
      return send(res, 404, { error: 'Unknown action' });
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, e.status || 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Post Studio: http://localhost:${PORT}  (data: ${store.HOME})`));
