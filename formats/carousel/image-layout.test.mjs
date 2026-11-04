import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LAYOUTS, imageLayout } from './image-layout.mjs';
import carousel from './index.mjs';
import { imageName } from '../../lib/images.mjs';

test('automatic placement adapts to copy and varies across text slides', () => {
  assert.equal(imageLayout({ type: 'cover', title: 'Short cover' }), 'background');
  const short = { type: 'text', title: 'A short idea', text: 'Clear copy.' };
  assert.equal(new Set([0, 1, 2].map(i => imageLayout(short, i))).size, 3);
  const long = { ...short, text: 'Longer explanation. '.repeat(18) };
  assert.equal(imageLayout(long, 1), 'image-top');
  assert.equal(imageLayout(long, 2), 'image-bottom');
  assert.equal(imageLayout(short, 1), imageLayout(short, 1));
});

test('every explicit placement overrides automatic selection', () => {
  for (const layout of IMAGE_LAYOUTS.filter(l => l !== 'auto')) {
    assert.equal(imageLayout({ type: 'cover', image: { layout } }), layout);
  }
  assert.equal(imageLayout({ type: 'cover', image: { layout: 'unexpected' } }), 'background');
});

test('validation preserves placement and cached image while rejecting arbitrary layout values', () => {
  const prompt = 'A simple blue geometric sculpture';
  const file = imageName(prompt);
  for (const layout of [...IMAGE_LAYOUTS, 'unexpected']) {
    const slides = [0, 1, 2].map(() => ({type: 'text', title: 'Idea', theme: 'light', image: {prompt, file, layout}}));
    const result = carousel.clean(slides, {themes: ['light']});
    assert.equal(result[0].image.layout, layout === 'unexpected' ? undefined : layout);
    assert.equal(result[0].image.file, file);
  }
});
