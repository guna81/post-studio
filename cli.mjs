#!/usr/bin/env node
// Small helper the skills call. Usage:
//   node cli.mjs log <workspace>                       print the post log
//   node cli.mjs check <workspace> "<title>"           exit 1 if title/slug already logged
//   node cli.mjs add <workspace> <draft-dir> "<title>" [--format carousel] [--channel instagram] [sourceUrl...]
//   node cli.mjs status <workspace> <draft-dir> drafted|approved|posted [post-url]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const argv = process.argv.slice(2), flags = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; argv.splice(i, 2); i--; }
const [cmd, ws, a, b, ...rest] = argv;
if (!cmd || !ws) { console.error('Usage: node cli.mjs <log|check|add|status> <workspace> ...'); process.exit(2); }
const root = resolve(ws), file = join(root, 'posts-log.json');
const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
const write = (l) => writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const today = new Date().toLocaleDateString('en-CA');
const log = read();

if (cmd === 'log') console.log(JSON.stringify(log, null, 2));
else if (cmd === 'check') {
  const hit = log.find((p) => p.topic_slug === slugify(a) || p.title.toLowerCase() === a.toLowerCase());
  if (hit) { console.error(`DUPLICATE: "${hit.title}" (${hit.date}, ${hit.status})`); process.exit(1); }
  console.log('ok: not in log');
} else if (cmd === 'add') {
  const dir = a.replace(/\/$/, '');
  if (!/^drafts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(dir)) { console.error('draft-dir must look like drafts/YYYY-MM-DD-slug'); process.exit(2); }
  const slug = slugify(b);
  if (log.some((p) => p.topic_slug === slug)) { console.error('DUPLICATE slug: ' + slug); process.exit(1); }
  const fmt = flags.format || 'carousel', ch = flags.channel || 'instagram';
  const deck = JSON.parse(readFileSync(join(root, dir, 'slides.json'), 'utf8'));
  log.push({ date: today, title: b, topic_slug: slug, format: fmt, channel: ch, slides: deck.slides.length, status: 'drafted', local_dir: dir, caption: `${dir}/caption.txt`, post_url: null, sources: rest });
  write(log); console.log('logged', b);
} else if (cmd === 'status') {
  const e = log.find((p) => p.local_dir === a.replace(/\/$/, ''));
  if (!e) { console.error('No log entry for ' + a); process.exit(1); }
  if (!['drafted', 'approved', 'posted'].includes(b)) { console.error('Bad status'); process.exit(2); }
  e.status = b;
  if (b === 'posted') { e.posted_date = today; if (rest[0]) { if (!/^https:\/\/[^\s]+$/.test(rest[0])) { console.error('Post URL must start with https://'); process.exit(2); } e.post_url = rest[0]; } }
  write(log); console.log(`${basename(e.local_dir)} -> ${b}`);
} else { console.error('Unknown command'); process.exit(2); }
