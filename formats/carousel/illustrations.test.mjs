import test from 'node:test';
import assert from 'node:assert/strict';
import carousel from './index.mjs';
import { ILLUSTRATIONS, illustrationSvg } from './illustrations.mjs';
const slides = [{ type: 'cover', title: 'AI' }, { type: 'text', title: 'Tools' }, { type: 'list', items: ['Try'] }];
test('illustrations survive cleaning, replace images and stay off dense slide types', () => {
  const content = carousel.clean(slides.map(s => ({ ...s, illustration: 'ai-chip', image: { prompt: 'An existing image' } })), { themes: ['blue'] });
  assert.equal(content[0].illustration, 'ai-chip');
  assert.equal(content[0].image, undefined);
  assert.equal(content[2].illustration, undefined);
  assert.equal(carousel.clean(slides.map(s => ({ ...s, illustration: '<script>' })), { themes: ['blue'] })[0].illustration, undefined);
  const illustrated = carousel.withIllustrations(slides);
  assert.ok(illustrated[0].illustration);
  assert.equal(illustrated[2].illustration, undefined);
  assert.equal(carousel.withImagePrompts(illustrated, { brand: {} })[0].image, undefined);
});
test('each built-in illustration renders SVG and rejects untrusted colours or IDs', () => {
  for (const id of ILLUSTRATIONS) {
    const svg = illustrationSvg(id, { text: '#112233', accent: '#ffcc00' });
    assert.match(svg, /<svg/);
    assert.match(svg, /#112233/);
    assert.match(svg, /#ffcc00/);
  }
  assert.equal(illustrationSvg('unknown', {}), '');
  assert.doesNotMatch(illustrationSvg('idea', { text: '\"><script>' }), /<script>/);
});
