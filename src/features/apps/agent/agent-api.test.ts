import assert from 'node:assert/strict';
import test from 'node:test';

import { callAgentApi, getAgentConversationMessages } from './agent-api.ts';

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

test('forwards tool progress events without adding them to the assistant response', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"event":"tool","tool_name":"web_search","status":"started"}\n\n',
        'data: {"event":"tool","tool_name":"web_search","status":"completed"}\n\n',
        'data: {"delta":"搜索结果"}\n\n',
        'data: [DONE]\n\n',
      ].join(''),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const progress: string[] = [];
  const response = await callAgentApi(
    { conversationId: 'conv_1', content: '测试' },
    () => undefined,
    undefined,
    (event) => progress.push(`${event.toolName}:${event.status}`),
  );

  assert.equal(response.content, '搜索结果');
  assert.deepEqual(progress, ['web_search:started', 'web_search:completed']);
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

test('loads persisted messages from the v1 conversation API', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return new Response(
      JSON.stringify({
        messages: [
          { id: 'msg_1', role: 'user', content: '你好', created_at: '2026-08-03T08:00:00.000Z' },
          { id: 'msg_2', role: 'assistant', content: '你好！', created_at: '2026-08-03T08:00:01.000Z' },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const messages = await getAgentConversationMessages('conv_1');

  assert.equal(requestUrl, '/api/agent/v1/conversations/conv_1/messages');
  assert.deepEqual(messages, [
    { id: 'msg_1', role: 'user', content: '你好', createdAt: '2026-08-03T08:00:00.000Z' },
    { id: 'msg_2', role: 'assistant', content: '你好！', createdAt: '2026-08-03T08:00:01.000Z' },
  ]);
});
