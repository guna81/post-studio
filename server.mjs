// Postloom studio server. Run: node server.mjs <workspace-dir>  then open http://localhost:4173
// Uses the Claude Code CLI in headless mode (`claude -p`), so it runs on your Claude Code login, no API key.
// Formats (what a post is) live in formats/, channels (where it is published) in channels/.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formats } from './formats/registry.mjs';
import { channels } from './channels/registry.mjs';

const kit = dirname(fileURLToPath(import.meta.url)); // this repo: code only
const root = resolve(process.argv[2] || process.env.POSTLOOM_WORKSPACE || ''); // your workspace: brand, theme, log, drafts
if (!process.argv[2] && !process.env.POSTLOOM_WORKSPACE) { console.error('Usage: node server.mjs <workspace-dir>   (try: examples/demo)'); process.exit(1); }
for (const f of ['theme.json', 'brand.json']) if (!existsSync(join(root, f))) { console.error(`Missing ${f} in ${root}. Run \`postloom init\` or copy examples/demo.`); process.exit(1); }

const PORT = Number(process.env.PORT) || 4173;
const LOG = join(root, 'posts-log.json');
const brand = JSON.parse(readFileSync(join(root, 'brand.json'), 'utf8'));
const THEMES = Object.keys(JSON.parse(readFileSync(join(root, 'theme.json'), 'utf8')).colors);
const DEFAULTS = { format: brand.defaults?.format || 'carousel', channel: brand.defaults?.channel || 'instagram' };
if (!existsSync(LOG)) writeFileSync(LOG, '[]\n');
mkdirSync(join(root, 'drafts'), { recursive: true });

const DIR_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$/;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
let busy = false;

const readLog = () => JSON.parse(readFileSync(LOG, 'utf8'));
const writeLog = (l) => writeFileSync(LOG, JSON.stringify(l, null, 2) + '\n');
const today = () => new Date().toLocaleDateString('en-CA');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'post';
const getFormat = (id) => formats[id || DEFAULTS.format] || (() => { throw new Error(`Unknown format "${id}"`); })();
const getChannel = (id) => channels[id || DEFAULTS.channel] || (() => { throw new Error(`Unknown channel "${id}"`); })();
const entryFor = (dir) => readLog().find((p) => p.local_dir === `drafts/${dir}`);

function run(cmd, args, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root });
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
async function askClaude(prompt) {
  const out = await run('claude', ['-p', prompt, '--output-format', 'json', '--allowedTools', 'WebSearch', '--no-session-persistence']);
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

const render = (dir, fmt) => run('node', [fmt.renderScript, root, join('drafts', dir)], 120000);

function dirPath(dir) {
  if (!DIR_RE.test(dir || '')) throw new Error('Bad draft folder name');
  return join(root, 'drafts', dir);
}

function openFolder(path) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [path]] : process.platform === 'win32' ? ['explorer', [path]] : ['xdg-open', [path]];
  return run(cmd, args, 10000).catch((e) => { if (process.platform !== 'win32') throw e; }); // explorer exits 1 on success
}

const api = {
  async log() { return readLog(); },

  async topics() {
    const used = readLog().map((p) => p.title);
    const prompt = `Today is ${today()}. Search the web for the hottest news from the last 48 hours relevant to ${brand.audience || 'a general tech audience'}${brand.about ? ' (context: ' + brand.name + ' is ' + brand.about + ')' : ''}.
Pick 5 stories that would make a strong educational social post.
Do NOT pick topics similar to these already-posted ones: ${JSON.stringify(used)}.
Reply with ONLY a JSON array (no prose) of 5 objects: {"title": short post title, "angle": one sentence on how the post would explain it, "why_now": one sentence on why it's hot, "source_url": a real URL you used}.`;
    return { topics: extractJson(await askClaude(prompt)) };
  },

  async generate({ topic, notes, format: fid, channel: cid }) {
    if (!topic || typeof topic !== 'string' || topic.length > 500) throw new Error('Enter a topic (max 500 characters)');
    const fmt = getFormat(fid), ch = getChannel(cid);
    if (!ch.formats.includes(fmt.id)) throw new Error(`${ch.label} does not accept the ${fmt.id} format`);
    const log = readLog();
    const used = log.map((p) => p.title);
    const prompt = `Today is ${today()}. Create a ${fmt.id} post for ${ch.label} for ${brand.name}${brand.about ? ' (' + brand.about + ')' : ''}.${brand.audience ? ' Audience: ' + brand.audience + '.' : ''} Tone: ${brand.tone || 'plain, direct, confident, honest'}.
Topic: ${JSON.stringify(topic)}
${notes ? 'Extra notes from the user: ' + JSON.stringify(String(notes).slice(0, 1500)) : ''}
Do not repeat these already-posted titles: ${JSON.stringify(used)}.
Use web search to verify any fact, number or price. Label estimates as estimates. Never invent statistics.

${fmt.outputSpec({ brand, themes: THEMES })}
${ch.captionRules(brand)}`;
    const data = extractJson(await askClaude(prompt));
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
    const file = JSON.parse(readFileSync(join(d, fmt.contentFile), 'utf8'));
    const caption = existsSync(join(d, 'caption.txt')) ? readFileSync(join(d, 'caption.txt'), 'utf8') : '';
    return { dir, title: file.title, format: fmt.id, channel: ch.id, content: fmt.unwrap(file), caption, previews: fmt.previews(d), postingHint: ch.postingHint, homeUrl: ch.homeUrl };
  },

  async save({ dir, content, caption, title }) {
    const d = dirPath(dir), e = entryFor(dir) || {};
    const fmt = getFormat(e.format);
    const clean = fmt.clean(content, { themes: THEMES });
    const prev = JSON.parse(readFileSync(join(d, fmt.contentFile), 'utf8'));
    writeFileSync(join(d, fmt.contentFile), JSON.stringify(fmt.wrap(title || prev.title, clean), null, 2) + '\n');
    writeFileSync(join(d, 'caption.txt'), String(caption ?? '').trim() + '\n');
    await render(dir, fmt);
    if (e.local_dir) { const log = readLog(); log.find((p) => p.local_dir === e.local_dir).slides = clean.length; writeLog(log); }
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

  async openFolder({ dir }) { await openFolder(dirPath(dir)); return { ok: true }; },
};

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0];
    if (host !== 'localhost' && host !== '127.0.0.1') return send(res, 403, { error: 'Forbidden' });
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'GET') {
      if (p === '/') return send(res, 200, readFileSync(join(kit, 'ui', 'index.html')), 'text/html; charset=utf-8');
      if (p === '/api/log') return send(res, 200, await api.log());
      if (p === '/api/brand') return send(res, 200, {
        name: brand.name, hasLogo: !!(brand.logo && existsSync(join(root, brand.logo))), defaults: DEFAULTS,
        formats: Object.values(formats).map((f) => ({ id: f.id, label: f.label })),
        channels: Object.values(channels).map((c) => ({ id: c.id, label: c.label, formats: c.formats })),
      });
      if (p === '/assets/logo') { const f = brand.logo && join(root, brand.logo); return f && existsSync(f) ? send(res, 200, readFileSync(f), MIME[extname(f)] || 'application/octet-stream') : send(res, 404, { error: 'No logo' }); }
      const m = p.match(/^\/drafts\/([^/]+)\/([\w.-]+)$/);
      if (m && DIR_RE.test(m[1]) && MIME[extname(m[2])]) {
        const f = join(root, 'drafts', m[1], m[2]);
        if (existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[extname(m[2])], 'Cache-Control': 'no-store' }); return createReadStream(f).pipe(res); }
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (req.method === 'POST' && p.startsWith('/api/')) {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON only' });
      const name = p.slice(5);
      if (!Object.hasOwn(api, name) || name === 'log') return send(res, 404, { error: 'Unknown action' });
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 1e6) return send(res, 413, { error: 'Too large' }); }
      const body = raw ? JSON.parse(raw) : {};
      const slow = name === 'topics' || name === 'generate' || name === 'save';
      if (slow) { if (busy) return send(res, 429, { error: 'Another job is running. Wait for it to finish.' }); busy = true; }
      try { return send(res, 200, await api[name](body)); } finally { if (slow) busy = false; }
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Postloom studio for "${brand.name}": http://localhost:${PORT}  (workspace: ${root})`));
