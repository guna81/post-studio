import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanInsights, qualityReport } from './instagram.mjs';

test('quality checks block too many hashtags and require a Reel plan', () => {
  const report = qualityReport({
    content: { hooks: [], beats: [], script: '' },
    caption: 'Useful idea\n#one #two #three #four #five #six',
    format: 'reel',
  });
  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => issue.rule === 'hashtags'));
  assert.ok(report.issues.some((issue) => issue.rule === 'reel-plan'));
});

test('manual insights accept bounded whole numbers', () => {
  assert.deepEqual(cleanInsights({ reach: '120', saves: 8 }), { reach: 120, saves: 8 });
  assert.throws(() => cleanInsights({ reach: '-1' }), /reach must be/);
  assert.throws(() => cleanInsights({}), /at least one/);
});
