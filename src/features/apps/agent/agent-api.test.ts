import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentHttpError,
  callAgentApi,
  createAgentConversation,
  getAgentConversationMessages,
  shouldDiscardStoredConversation,
} from './agent-api.ts';

const REQUEST = { conversationId: 'conv_1', content: '测试', userId: 'web_user123' };

test('returns a successful JSON response from the HTTP API', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ content: '接口回复' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await callAgentApi(REQUEST, () => undefined);

  assert.deepEqual(response, { content: '接口回复', suggestionCards: undefined });
});

test('accepts the legacy chat reply response field', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ reply: '旧版接口回复' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await callAgentApi(REQUEST, () => undefined);

  assert.equal(response.content, '旧版接口回复');
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
    () => callAgentApi(REQUEST, () => undefined),
    /AI助手服务暂不可用/,
  );
});

test('does not expose an HTML error page to the user', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>Internal error</html>', { status: 500 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => callAgentApi(REQUEST, () => undefined),
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
  const response = await callAgentApi(REQUEST, (chunk) => chunks.push(chunk));

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
    REQUEST,
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
    () => callAgentApi(REQUEST, () => undefined),
    new Error('AI助手响应超时，请稍后重试。'),
  );
});

test('sends the same stable user identity when creating and streaming a conversation', async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) {
      return new Response(JSON.stringify({ id: 'conv_1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('data: {"delta":"完成"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await createAgentConversation('测试', 'web_user123');
  await callAgentApi(REQUEST, () => undefined);

  assert.deepEqual(bodies, [
    { title: '测试', mode: 'chat', user_id: 'web_user123' },
    { content: '测试', user_id: 'web_user123' },
  ]);
});

test('surfaces a nested FastAPI detail error', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: { code: 'NOT_FOUND', message: '会话不存在' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(() => callAgentApi(REQUEST, () => undefined), /会话不存在/);
});

test('discards a stored conversation only after a confirmed 404 response', () => {
  assert.equal(shouldDiscardStoredConversation(new AgentHttpError('会话不存在', 404)), true);
  assert.equal(shouldDiscardStoredConversation(new AgentHttpError('服务暂不可用', 503)), false);
  assert.equal(shouldDiscardStoredConversation(new Error('网络错误')), false);
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
