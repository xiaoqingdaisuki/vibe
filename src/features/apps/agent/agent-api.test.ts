import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentHttpError,
  callAgentApi,
  createAgentConversation,
  deleteAgentConversation,
  getAgentConversationMessages,
  shouldDiscardStoredConversation,
} from './agent-api.ts';

const REQUEST = { conversationId: 'conv_1', content: '测试', userId: 'web_user123' };

type TestContext = { after(callback: () => void): void };

// 安装一次性全局 fetch mock，并在测试结束后恢复原实现
function installFetchMock(t: TestContext, implementation: typeof globalThis.fetch): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

test('stops a stalled stream and cancels its reader instead of remaining in loading', async (t) => {
  let cancelled = false;
  installFetchMock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = callAgentApi(REQUEST, () => undefined);
  const assertion = assert.rejects(pending, /响应超时/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(75_000);
  await assertion;
  assert.equal(cancelled, true);
});

test('cancels the upstream reader when an SSE error ends consumption', async (t) => {
  let cancelled = false;
  installFetchMock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('event: error\ndata: {"error":{"message":"invalid response"}}\n\n'),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  await assert.rejects(
    callAgentApi(REQUEST, () => undefined),
    /invalid response/,
  );
  assert.equal(cancelled, true);
});

test('continuous progress cannot keep a request alive past the total deadline', async (t) => {
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  installFetchMock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            streamController = controller;
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = callAgentApi(REQUEST, () => undefined);
  const assertion = assert.rejects(pending, /响应超时/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (let index = 0; index < 4; index += 1) {
    t.mock.timers.tick(60_000);
    streamController!.enqueue(new TextEncoder().encode('data: {"text":"progress"}\n\n'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  t.mock.timers.tick(50_000);
  await assertion;
  assert.equal(cancelled, true);
});

test('honors the stream timeout announced by the server', async (t) => {
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  installFetchMock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            streamController = controller;
          },
          cancel() {
            cancelled = true;
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'X-Agent-Stream-Timeout': '120000',
          },
        },
      ),
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = callAgentApi(REQUEST, () => undefined);
  const assertion = assert.rejects(pending, /响应超时/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(60_000);
  streamController!.enqueue(new TextEncoder().encode('data: {"text":"progress"}\n\n'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(55_000);
  await assertion;
  assert.equal(cancelled, true);
});

test('returns a successful JSON response from the HTTP API', async (t) => {
  installFetchMock(
    t,
    async () =>
      new Response(JSON.stringify({ content: '接口回复' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  const response = await callAgentApi(REQUEST, () => undefined);

  assert.deepEqual(response, { content: '接口回复', suggestionCards: undefined });
});

test('accepts the legacy chat reply response field', async (t) => {
  installFetchMock(
    t,
    async () =>
      new Response(JSON.stringify({ reply: '旧版接口回复' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  const response = await callAgentApi(REQUEST, () => undefined);

  assert.equal(response.content, '旧版接口回复');
});

test('surfaces a concise server error without using local fallback data', async (t) => {
  installFetchMock(
    t,
    async () =>
      new Response(JSON.stringify({ error: { message: 'AI助手服务暂不可用' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  await assert.rejects(() => callAgentApi(REQUEST, () => undefined), /AI助手服务暂不可用/);
});

test('does not expose an HTML error page to the user', async (t) => {
  installFetchMock(t, async () => new Response('<html>Internal error</html>', { status: 500 }));

  await assert.rejects(() => callAgentApi(REQUEST, () => undefined), /AI助手请求失败（HTTP 500）/);
});

test('streams SSE chunks split across network boundaries', async (t) => {
  const encoder = new TextEncoder();
  installFetchMock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"delta":"你'));
            controller.enqueue(encoder.encode('好"}\n\ndata: [DONE]\n\n'));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );

  const chunks: string[] = [];
  const response = await callAgentApi(REQUEST, (chunk) => chunks.push(chunk));

  assert.equal(response.content, '你好');
  assert.deepEqual(chunks, ['你好']);
});

test('forwards tool progress events without adding them to the assistant response', async (t) => {
  installFetchMock(
    t,
    async () =>
      new Response(
        [
          'data: {"event":"tool","tool_name":"web_search","status":"started"}\n\n',
          'data: {"event":"tool","tool_name":"web_search","status":"completed"}\n\n',
          'data: {"delta":"搜索结果"}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );

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
  installFetchMock(
    t,
    async () =>
      new Response('data: {"error":{"code":"AGENT_TIMEOUT","message":"AI助手响应超时，请稍后重试。"}}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  );

  await assert.rejects(() => callAgentApi(REQUEST, () => undefined), new Error('AI助手响应超时，请稍后重试。'));
});

test('sends the same stable user identity when creating and streaming a conversation', async (t) => {
  const bodies: unknown[] = [];
  installFetchMock(t, async (_input, init) => {
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
  });

  await createAgentConversation('测试', 'web_user123');
  await callAgentApi(REQUEST, () => undefined);

  assert.deepEqual(bodies, [
    { title: '测试', mode: 'chat', user_id: 'web_user123' },
    { content: '测试', user_id: 'web_user123' },
  ]);
});

test('surfaces a nested FastAPI detail error', async (t) => {
  installFetchMock(
    t,
    async () =>
      new Response(JSON.stringify({ detail: { code: 'NOT_FOUND', message: '会话不存在' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  await assert.rejects(() => callAgentApi(REQUEST, () => undefined), /会话不存在/);
});

test('discards a stored conversation only after a confirmed 404 response', () => {
  assert.equal(shouldDiscardStoredConversation(new AgentHttpError('会话不存在', 404)), true);
  assert.equal(shouldDiscardStoredConversation(new AgentHttpError('服务暂不可用', 503)), false);
  assert.equal(shouldDiscardStoredConversation(new Error('网络错误')), false);
});

test('loads persisted messages from the v1 conversation API', async (t) => {
  let requestUrl = '';
  installFetchMock(t, async (input) => {
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
  });

  const messages = await getAgentConversationMessages('conv_1', 'web_user123');

  assert.equal(requestUrl, '/api/conversations/conv_1/messages?user_id=web_user123');
  assert.deepEqual(messages, [
    { id: 'msg_1', role: 'user', content: '你好', createdAt: '2026-08-03T08:00:00.000Z' },
    { id: 'msg_2', role: 'assistant', content: '你好！', createdAt: '2026-08-03T08:00:01.000Z' },
  ]);
});

test('deletes the server conversation and surfaces failures instead of orphaning it', async (t) => {
  const requests: string[] = [];
  installFetchMock(t, async (input) => {
    requests.push(String(input));
    return requests.length === 1
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ error: { message: '删除会话失败' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
  });

  await deleteAgentConversation('conv_1', 'web_user123');
  await assert.rejects(() => deleteAgentConversation('conv_2', 'web_user123'), /删除会话失败/);
  assert.deepEqual(requests, [
    '/api/conversations/conv_1?user_id=web_user123',
    '/api/conversations/conv_2?user_id=web_user123',
  ]);
});
