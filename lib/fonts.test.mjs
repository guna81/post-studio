import test from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, cleanFont, resolveFonts } from './fonts.mjs';

test('font IDs are validated and resolve to renderer font families', () => {
  const existing = { display: 'Custom', mono: 'Space Mono', googleFontsUrl: 'custom-url' };
  assert.equal(resolveFonts('', existing), existing);
  assert.equal(cleanFont(undefined, 'inter'), 'inter');
  for (const f of FONTS) {
    assert.equal(cleanFont(f.id), f.id);
    const resolved = resolveFonts(f.id, existing);
    assert.equal(resolved.display, f.family);
    assert.equal(resolved.mono, existing.mono);
    assert.match(resolved.googleFontsUrl, /^https:\/\/fonts.googleapis.com\/css2\?/);
  }
  for (const value of ['unknown', 'Inter', null, {}, "x';color:red"]) assert.throws(() => cleanFont(value), /Choose a font/);
});

test('project font defaults persist across unrelated settings and colour changes', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'studio-font-test-'));
  const previous = process.env.POST_STUDIO_HOME;
  process.env.POST_STUDIO_HOME = home;
  try {
    const store = await import('./store.mjs');
    const project = store.createProject('test-user', { name: 'Test', font: 'poppins' });
    assert.equal(store.describeProject(project).font, 'poppins');
    store.updateProject(project.id, { colors: { primary: '#123456', accent: '#abcdef' }, audience: 'Founders' });
    assert.equal(store.describeProject(project).font, 'poppins');
    store.updateProject(project.id, { font: 'lora' });
    assert.equal(store.describeProject(project).font, 'lora');
    assert.throws(() => store.updateProject(project.id, { font: 'invalid' }), /Choose a font/);
    assert.equal(store.describeProject(project).font, 'lora');
  } finally {
    if (previous === undefined) delete process.env.POST_STUDIO_HOME;
    else process.env.POST_STUDIO_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
