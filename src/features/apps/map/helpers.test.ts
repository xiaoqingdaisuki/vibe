import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCoordinate, sameCoordinate } from './helpers.ts';

test('coordinate input accepts Chinese commas, whitespace and valid signed boundary values', () => {
  assert.deepEqual(parseCoordinate(' 116.397，39.908 '), [116.397, 39.908]);
  assert.deepEqual(parseCoordinate('-180  +90'), [-180, 90]);
  assert.deepEqual(parseCoordinate('.5,-.25'), [0.5, -0.25]);
});

test('coordinate input rejects incomplete, ambiguous, non-decimal and out-of-range values', () => {
  for (const input of ['', '116', '116,39,', '116,39,20', 'NaN,39', 'Infinity,39', '0xff,20', '181,0', '0,-91']) {
    assert.equal(parseCoordinate(input), null, input);
  }
});

test('duplicate route points tolerate coordinate rounding while distinct nearby points remain usable', () => {
  assert.equal(sameCoordinate([116.397, 39.908], [116.3970001, 39.9080001]), true);
  assert.equal(sameCoordinate([116.397, 39.908], [116.39702, 39.908]), false);
});
