import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHotPreviewAction,
  getPreviewStateAfterCommand,
  isCurrentPreviewMessage,
  parseRuntimeMessage,
} from './preview-state.ts';

test('maps stop, restart and ready commands to lifecycle states', () => {
  assert.equal(getPreviewStateAfterCommand('stop'), 'paused');
  assert.equal(getPreviewStateAfterCommand('restart'), 'loading');
  assert.equal(getPreviewStateAfterCommand('ready'), 'ready');
});

test('hot reloads only changed code in an active frame', () => {
  assert.equal(getHotPreviewAction('old', 'new', 'ready', true), 'restart');
  assert.equal(getHotPreviewAction('same', 'same', 'ready', true), 'none');
  assert.equal(getHotPreviewAction('old', 'new', 'paused', true), 'remember');
  assert.equal(getHotPreviewAction('old', 'new', 'loading', false), 'remember');
});

test('accepts runtime messages only for the current sandbox session', () => {
  const message = parseRuntimeMessage({
    message: 'ready',
    sessionId: 'session-current',
    type: 'vibe:online-editor:ready',
  });

  assert.equal(isCurrentPreviewMessage(message, 'session-current'), true);
  assert.equal(isCurrentPreviewMessage(message, 'session-old'), false);
  assert.equal(parseRuntimeMessage({ sessionId: 'session-current', type: 'unknown' }), undefined);
});
