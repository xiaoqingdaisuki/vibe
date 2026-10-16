import assert from 'node:assert/strict';
import test from 'node:test';

import { getAgentRequestTimeoutMs, getAgentStreamIdleTimeoutMs, getAgentStreamTimeoutMs } from './agent-timeout.ts';

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

test('keeps streaming idle protection within the total route budget', () => {
  assert.equal(getAgentStreamIdleTimeoutMs('75000'), 75_000);
  assert.equal(getAgentStreamIdleTimeoutMs('999999'), 295_000);
  assert.equal(getAgentStreamIdleTimeoutMs('1'), 30_000);
  assert.equal(getAgentStreamIdleTimeoutMs('invalid'), 180_000);
});

test('caps configured idle protection by the configured total timeout', () => {
  const originalTimeout = process.env.AGENT_STREAM_TIMEOUT_MS;
  process.env.AGENT_STREAM_TIMEOUT_MS = '60000';
  try {
    assert.equal(getAgentStreamIdleTimeoutMs('999999'), 60_000);
  } finally {
    if (originalTimeout === undefined) delete process.env.AGENT_STREAM_TIMEOUT_MS;
    else process.env.AGENT_STREAM_TIMEOUT_MS = originalTimeout;
  }
});
