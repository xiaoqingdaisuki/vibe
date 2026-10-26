/** 验证GBA 模拟器：模拟速度的输入校验与转换的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { GBA_SPEEDS, getNextGbaSpeed } from './speed.ts';

test('cycles through the supported GBA speed multipliers', () => {
  assert.deepEqual(GBA_SPEEDS, [1, 2, 4, 8]);
  assert.equal(getNextGbaSpeed(1), 2);
  assert.equal(getNextGbaSpeed(2), 4);
  assert.equal(getNextGbaSpeed(4), 8);
  assert.equal(getNextGbaSpeed(8), 1);
});
