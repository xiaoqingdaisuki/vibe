/** 验证在线编辑器：预览沙箱的内容安全策略的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createPreviewContentSecurityPolicy } from './preview-policy.ts';

test('permits public HTTPS dependencies while retaining iframe safety boundaries', () => {
  const policy = createPreviewContentSecurityPolicy('test-nonce');

  assert.match(policy, /script-src 'nonce-test-nonce' https:/);
  assert.match(policy, /style-src 'unsafe-inline' https:/);
  assert.match(policy, /connect-src https:/);
  assert.match(policy, /img-src https: data:/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});
