import assert from 'node:assert/strict';
import test from 'node:test';
import { GBA_KEY_BINDINGS } from './keyboard.ts';

test('uses the left Shift key for the GBA Select button', () => {
  assert.equal(GBA_KEY_BINDINGS.ShiftLeft, 'select');
  assert.equal(GBA_KEY_BINDINGS.ShiftRight, undefined);
});
