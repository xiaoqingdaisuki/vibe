import assert from 'node:assert/strict';
import test from 'node:test';

import { getTypewriterAnimationDuration, shouldAnimateTypewriter } from './typewriter.ts';

test('shows a short completion cursor feedback for short answers', () => {
  assert.ok(shouldAnimateTypewriter(600));
  assert.equal(getTypewriterAnimationDuration(600), 720);
});

test('skips per-frame animation for long markdown answers', () => {
  assert.equal(shouldAnimateTypewriter(8_000), false);
  assert.equal(getTypewriterAnimationDuration(8_000), 0);
});
