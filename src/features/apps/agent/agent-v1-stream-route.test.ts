/** 验证AI 助手：流式消息路由处理的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { getAgentStreamIdleTimeoutMs, getAgentStreamTimeoutMs } from './agent-timeout.ts';
import { handleAgentStreamPost } from './agent-v1-stream-route.ts';

test('passes the route request signal to the streaming proxy', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const proxy = async (_conversationId: string, _payload: unknown, signal?: AbortSignal) => {
    receivedSignal = signal;
    return {
      status: 200 as const,
      stream: new ReadableStream<Uint8Array>(),
      contentType: 'text/event-stream',
    };
  };
  const request = new Request('http://localhost/api/conversations/conv_123/messages/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '测试', user_id: 'web_user123' }),
    signal: controller.signal,
  });

  const response = await handleAgentStreamPost(request, { params: Promise.resolve({ id: 'conv_123' }) }, proxy);

  assert.equal(response.status, 200);
  assert.equal(receivedSignal, request.signal);
  assert.equal(response.headers.get('X-Agent-Stream-Timeout'), String(getAgentStreamTimeoutMs()));
  assert.equal(response.headers.get('X-Agent-Stream-Idle-Timeout'), String(getAgentStreamIdleTimeoutMs()));

  controller.abort();
  assert.equal(receivedSignal?.aborted, true);
  await response.body?.cancel();
});
