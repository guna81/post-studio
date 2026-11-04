#!/usr/bin/env node
// post-studio start | doctor | import <workspace-dir> <email> | where
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...args] = process.argv.slice(2);

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
  // Optional: AI images need the Codex CLI (logged in). Without it, posts are made without pictures.
  const cx = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  console.log(cx.status === 0 ? '  ok   Codex CLI on PATH (optional, used for AI images)' : '  note Codex CLI not found (optional): posts will have no AI images. Install it and run `codex login` to enable them');
  if (!quiet) console.log(ok ? '\nAll good. Not checked: whether `claude` is logged in. Run `claude` once if topics fail with an auth error.' : '\nFix the items above, then run `post-studio doctor` again.');
  return ok;
}

function start() {
  spawn('node', [join(kit, 'server.mjs')], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
}

// Copy an existing workspace folder (brand.json, theme.json, drafts/…) into the studio as a project owned by <email>.
async function importWs([dir, email]) {
  if (!dir || !email) { console.error('Usage: post-studio import <workspace-dir> <account-email>'); process.exit(2); }
  const { readUsers, importWorkspace, HOME } = await import('../lib/store.mjs');
  const user = readUsers().find((u) => u.email === email.trim().toLowerCase());
  if (!user) { console.error(`No account for ${email}. Start the studio (post-studio start) and sign up first.`); process.exit(1); }
  const meta = importWorkspace(dir, user.id);
  console.log(`Imported ${resolve(dir)} as project ${meta.id} for ${user.email}\n  stored in ${join(HOME, 'projects', meta.id)}`);
}

if (cmd === 'start') start();
else if (cmd === 'doctor') process.exit((await doctor()) ? 0 : 1);
else if (cmd === 'import') await importWs(args);
else if (cmd === 'where') { const { HOME } = await import('../lib/store.mjs'); console.log(HOME); }
else console.log('Usage:\n  post-studio start                          run Post Studio at http://localhost:4173\n  post-studio doctor                         check Node, Claude Code, Playwright, Chromium\n  post-studio import <dir> <account-email>   copy an existing workspace folder into a project\n  post-studio where                          print the data folder');
