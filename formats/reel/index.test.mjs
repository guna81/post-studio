import test from 'node:test';
import assert from 'node:assert/strict';
import reel from './index.mjs';

const plan = {
  duration: 30,
  selectedHook: 'Stop losing an hour to this task.',
  hooks: ['Stop losing an hour to this task.', 'A faster way to do this.', 'Try this before your next meeting.'],
  script: 'Here is a practical three-step workflow you can use today.',
  beats: [
    { seconds: '0-3', visual: 'Creator opens a laptop', voiceover: 'Stop losing an hour to this task.', onScreenText: 'Save time' },
    { seconds: '3-10', visual: 'Show the first step', voiceover: 'Start with the outcome.', onScreenText: '1. Outcome' },
    { seconds: '10-20', visual: 'Show the second step', voiceover: 'Then remove busywork.', onScreenText: '2. Simplify' },
    { seconds: '20-30', visual: 'Creator points to checklist', voiceover: 'Save this for your next session.', onScreenText: 'Save this' },
  ],
  shotList: ['Phone on tripod'],
  checklist: ['Record in a quiet room'],
};

test('Reel format requires a complete short-form production plan', () => {
  const clean = reel.clean(plan);
  assert.equal(clean.beats.length, 4);
  assert.equal(reel.count(clean), 4);
  assert.throws(() => reel.clean({ ...plan, hooks: ['Only one'] }), /exactly 3/);
});
