import assert from 'node:assert/strict';
import test from 'node:test';
import { getAgentConnectionStatusLabel } from './chat-status.ts';

test('maps request state to an honest connection label', () => {
  assert.equal(getAgentConnectionStatusLabel('idle'), '等待连接');
  assert.equal(getAgentConnectionStatusLabel('connecting'), '连接中');
  assert.equal(getAgentConnectionStatusLabel('connected'), '已连接');
  assert.equal(getAgentConnectionStatusLabel('error'), '连接失败');
});
