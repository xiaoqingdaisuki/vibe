import assert from 'node:assert/strict';
import test from 'node:test';

import { getMaplestoryFilterSearch, getMaplestoryFilterValue } from './filter-url.ts';

test('reads and decodes the filter from a shared URL', () => {
  assert.equal(getMaplestoryFilterValue('?filter=%E8%9C%97%E7%89%9B&view=table'), '蜗牛');
  assert.equal(getMaplestoryFilterValue('?view=table'), '');
});

test('updates the filter while preserving unrelated query parameters', () => {
  assert.equal(getMaplestoryFilterSearch('?view=table', '60%'), '?view=table&filter=60%25');
  assert.equal(getMaplestoryFilterSearch('?view=table&filter=60%25', ''), '?view=table');
});
