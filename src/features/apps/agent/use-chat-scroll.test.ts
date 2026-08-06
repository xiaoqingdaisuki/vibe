import assert from 'node:assert/strict';
import test from 'node:test';

import { isScrollNearBottom } from './use-chat-scroll.ts';

test('distinguishes an actively reading user from a bottom-following user', () => {
  assert.equal(isScrollNearBottom({ scrollHeight: 2_000, scrollTop: 900, clientHeight: 600 }), false);
  assert.equal(isScrollNearBottom({ scrollHeight: 2_000, scrollTop: 1_350, clientHeight: 600 }), true);
});
