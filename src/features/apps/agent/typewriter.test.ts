import assert from 'node:assert/strict';
import test from 'node:test';

import { getTypewriterFrameSize, shouldAnimateTypewriter } from './typewriter.ts';

test('bounds short-answer animation to a small fixed number of renders', () => {
  const contentLength = 600;
  const frames = Math.ceil(contentLength / getTypewriterFrameSize(contentLength));

  assert.ok(shouldAnimateTypewriter(contentLength));
  assert.ok(frames <= 45);
});

test('skips per-frame animation for long markdown answers', () => {
  assert.equal(shouldAnimateTypewriter(8_000), false);
});
