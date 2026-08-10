import assert from 'node:assert/strict';
import test from 'node:test';

import { getAgentRequestTimeoutMs, getAgentStreamTimeoutMs } from './agent-timeout.ts';

test('keeps ordinary requests below the 60 second route budget', () => {
  assert.equal(getAgentRequestTimeoutMs('45000'), 45_000);
  assert.equal(getAgentRequestTimeoutMs('999999'), 55_000);
  assert.equal(getAgentRequestTimeoutMs('1'), 41_000);
  assert.equal(getAgentRequestTimeoutMs('invalid'), 45_000);
});

test('keeps streaming below the Hobby plan 300 second route budget', () => {
  assert.equal(getAgentStreamTimeoutMs('295000'), 295_000);
  assert.equal(getAgentStreamTimeoutMs('999999'), 295_000);
  assert.equal(getAgentStreamTimeoutMs('1'), 60_000);
  assert.equal(getAgentStreamTimeoutMs('invalid'), 295_000);
});
