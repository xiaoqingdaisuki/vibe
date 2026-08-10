import assert from 'node:assert/strict';
import test from 'node:test';

import { createStoredSubscriptions, restoreSubscriptions } from './subscriptions.ts';
import { DEFAULT_FEEDS } from './types.ts';

test('restores defaults only when storage is missing or malformed', () => {
  assert.deepEqual(restoreSubscriptions(null), DEFAULT_FEEDS);
  assert.deepEqual(restoreSubscriptions({}), DEFAULT_FEEDS);
  assert.deepEqual(restoreSubscriptions(createStoredSubscriptions([])), []);
});

test('validates and deduplicates legacy subscription arrays', () => {
  assert.deepEqual(
    restoreSubscriptions(['https://example.com/feed', 'https://example.com/feed', 'javascript:alert(1)', 42]),
    ['https://example.com/feed'],
  );
});

test('keeps removal of a default feed across reloads', () => {
  const remaining = DEFAULT_FEEDS.slice(1);
  assert.deepEqual(restoreSubscriptions(createStoredSubscriptions(remaining)), remaining);
});
