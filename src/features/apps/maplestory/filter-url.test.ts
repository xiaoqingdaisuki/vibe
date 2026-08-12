import assert from 'node:assert/strict';
import test from 'node:test';

import { getMaplestoryFilterSearch } from './filter-url.ts';

test('updates the filter while preserving unrelated query parameters', () => {
  assert.equal(getMaplestoryFilterSearch('?view=table', '60%'), '?view=table&filter=60%25');
  assert.equal(getMaplestoryFilterSearch('?view=table&filter=60%25', ''), '?view=table');
});
