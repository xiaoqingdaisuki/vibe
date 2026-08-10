import assert from 'node:assert/strict';
import test from 'node:test';

import { getAgentRequestTimeoutMs, getAgentStreamTimeoutMs } from './agent-timeout.ts';

test('keeps ordinary requests below the 60 second route budget', () => {
  assert.equal(getAgentRequestTimeoutMs('45000'), 45_000);
  assert.equal(getAgentRequestTimeoutMs('999999'), 55_000);
  assert.equal(getAgentRequestTimeoutMs('1'), 41_000);
  assert.equal(getAgentRequestTimeoutMs('invalid'), 45_000);
});

test('keeps streaming beyond the tool deadline and below its 330 second route budget', () => {
  assert.equal(getAgentStreamTimeoutMs('320000'), 320_000);
  assert.equal(getAgentStreamTimeoutMs('999999'), 325_000);
  assert.equal(getAgentStreamTimeoutMs('1'), 311_000);
  assert.equal(getAgentStreamTimeoutMs('invalid'), 320_000);
});
