import test from 'node:test';
import { cleanFont } from './fonts.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import carousel from '../formats/carousel/index.mjs';

test('prompt edits keep the requested opening theme and generate a replacement image without selected elements', async () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const base = [
    { type: 'cover', title: 'Choose AI', theme: 'blue', image: { prompt: 'An old blue toolbox' } },
    { type: 'text', title: 'Compare', text: 'Try your task.', theme: 'light' },
    { type: 'list', title: 'Save', items: ['Test first'], theme: 'blue' },
  ];
  const next = structuredClone(base);
  next[0].theme = 'pop';
  next[1].title = 'Unwanted model change';
  next[0].image.prompt = 'An orange robot beside a toolbox';
  const files = new Map([
    ['/project/brand.json', { name: 'Test', font: 'poppins' }],
    ['/project/theme.json', { colors: { blue: {}, light: {}, pop: {} } }],
    ['/project/posts-log.json', []],
    ['/project/drafts/2026-11-04-test/slides.json', { title: 'Choose AI', slides: base }],
  ]);
  let prompt, generated;
  const context = vm.createContext({
    cleanFont, join, formats: { carousel }, channels: { instagram: { id: 'instagram', label: 'Instagram', formats: ['carousel'], captionRules: () => '' } },
    store: { syncSize() {} }, readJson: (p) => files.get(p),
    existsSync: (p) => files.has(p), mkdirSync() {}, copyFileSync() {},
    writeFileSync: (p, text) => files.set(p, p.endsWith('.json') ? JSON.parse(text) : text),
    slugify: (s) => s.toLowerCase(), DIR_RE: /^2026-11-04-[a-z]+$/, today: () => '2026-11-04',
    askClaude: async (p) => { prompt = p; return JSON.stringify({ content: next }); },
    extractJson: JSON.parse, run: async () => {},
    codexAvailable: () => true, imageName: () => 'assets/img-12345678.png',
    mapLimit: async (jobs, limit, fn) => Promise.all(jobs.map(fn)),
    generateImage: async (job) => { generated = job; return job.outPath; },
  });
  // Exercise the actual API implementation without starting a server or invoking paid CLI jobs.
  const start = source.indexOf('function projectApi(root)');
  const end = source.indexOf('\nconst ', source.indexOf('\n}', start));
  vm.runInContext(source.slice(start, end) + '\nthis.api = projectApi("/project").api;', context);
  await context.api.revise({ dir: '2026-11-04-test', instruction: 'Make the first slide orange and replace its AI image', scope: 0, font: 'inter', elements: [] });
  const saved = files.get('/project/drafts/2026-11-04-test/slides.json').slides;
  assert.equal(saved[0].theme, 'pop');
  assert.equal(saved[1].theme, 'light');
  assert.equal(saved[1].title, base[1].title);
  assert.equal(files.get('/project/drafts/2026-11-04-test/slides.json').font, 'inter');
  assert.equal(saved[0].image.file, 'assets/img-12345678.png');
  assert.equal(generated.prompt, next[0].image.prompt);
  assert.match(prompt, /including the first slide/);
  assert.match(prompt, /even when AI images is not selected/);
  await context.api.save({ dir: '2026-11-04-test', content: saved, caption: 'Caption' });
  assert.equal(files.get('/project/drafts/2026-11-04-test/slides.json').font, 'inter', 'ordinary saves preserve the post font');
  await context.api.save({ dir: '2026-11-04-test', content: saved, caption: 'Caption', font: 'lora' });
  assert.equal(files.get('/project/drafts/2026-11-04-test/slides.json').font, 'lora');
  await assert.rejects(context.api.save({ dir: '2026-11-04-test', content: saved, font: 'invalid' }), /Choose a font/);
  assert.equal(files.get('/project/drafts/2026-11-04-test/slides.json').font, 'lora');
  await context.api.generate({ topic: 'Inherited' });
  assert.equal(files.get('/project/drafts/2026-11-04-inherited/slides.json').font, 'poppins');
  await context.api.generate({ topic: 'Override', font: 'montserrat' });
  assert.equal(files.get('/project/drafts/2026-11-04-override/slides.json').font, 'montserrat');
});

test('prompt improvement validates input and returns an editable brief', async () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  let calls = 0, request;
  const context = vm.createContext({
    join, mkdirSync() {}, existsSync: () => true, store: { syncSize() {} }, readJson: (path) => path.endsWith('brand.json') ? { name: 'Test', audience: 'Developers' } : { colors: {} },
    askClaude: async (prompt) => { calls++; request = prompt; return JSON.stringify({ prompt: 'Explain RAG to developers with a simple example.' }); },
    extractJson: JSON.parse,
  });
  const start = source.indexOf('function projectApi(root)');
  const end = source.indexOf('\nconst ', source.indexOf('\n}', start));
  vm.runInContext(source.slice(start, end) + '\nthis.api = projectApi("/project").api;', context);
  for (const prompt of ['', '  ', null, 'x'.repeat(2001)]) {
    await assert.rejects(context.api.improvePrompt({ prompt }), /Enter a post prompt/);
  }
  assert.equal(calls, 0);
  const result = await context.api.improvePrompt({ prompt: 'RAG for developers' });
  assert.equal(result.prompt, 'Explain RAG to developers with a simple example.');
  assert.match(request, /RAG for developers/);
  assert.match(request, /Do not invent facts/);
});
