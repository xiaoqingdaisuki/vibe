import assert from 'node:assert/strict';
import test from 'node:test';
import { labApps } from '../lab/registry.ts';
import { getLabAppLoader } from './loaders.ts';

test('getLabAppLoader returns a loader for every registered app', () => {
  for (const app of labApps) {
    assert.equal(typeof getLabAppLoader(app.slug), 'function', `Missing loader for ${app.slug}`);
  }

  assert.equal(getLabAppLoader('missing-app'), undefined);
});
