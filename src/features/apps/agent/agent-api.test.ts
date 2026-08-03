import assert from 'node:assert/strict';
import test from 'node:test';

import { callAgentApi } from './agent-api.ts';

test('returns a successful JSON response from the HTTP API', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ content: '接口回复' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await callAgentApi({ conversationId: 'conv_1', content: '测试' }, () => undefined);

  assert.deepEqual(response, { content: '接口回复', suggestionCards: undefined });
});

test('surfaces a concise server error without using local fallback data', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'AI助手服务暂不可用' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => callAgentApi({ conversationId: 'conv_1', content: '测试' }, () => undefined),
    new Error('AI助手服务暂不可用'),
  );
});

test('does not expose an HTML error page to the user', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>Internal error</html>', { status: 500 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => callAgentApi({ conversationId: 'conv_1', content: '测试' }, () => undefined),
    /AI助手请求失败（HTTP 500）/,
  );
});

test('streams SSE chunks split across network boundaries', async (t) => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"delta":"你'));
          controller.enqueue(encoder.encode('好"}\n\ndata: [DONE]\n\n'));
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const chunks: string[] = [];
  const response = await callAgentApi({ conversationId: 'conv_1', content: '测试' }, (chunk) => chunks.push(chunk));

  assert.equal(response.content, '你好');
  assert.deepEqual(chunks, ['你好']);
});

test('surfaces a structured error received after an SSE stream starts', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('data: {"error":{"code":"AGENT_TIMEOUT","message":"AI助手响应超时，请稍后重试。"}}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => callAgentApi({ conversationId: 'conv_1', content: '测试' }, () => undefined),
    new Error('AI助手响应超时，请稍后重试。'),
  );
});
