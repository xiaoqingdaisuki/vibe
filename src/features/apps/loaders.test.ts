import assert from 'node:assert/strict';
import test from 'node:test';
import { getLabAppLoader } from './loaders.ts';

test('getLabAppLoader returns a loader for registered apps', () => {
  assert.equal(typeof getLabAppLoader('skills'), 'function');
  assert.equal(getLabAppLoader('missing-app'), undefined);
});

test('getLabAppLoader returns a loader for the RPG Lab app', () => {
  assert.equal(typeof getLabAppLoader('rpg'), 'function');
});
