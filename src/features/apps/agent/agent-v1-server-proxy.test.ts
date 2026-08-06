import assert from 'node:assert/strict';
import test from 'node:test';

import {
  proxyCreateAgentConversation,
  proxyGetAgentConversationMessages,
  proxyStreamAgentMessage,
} from './agent-v1-server-proxy.ts';

test('creates a conversation through the Agent v1 API', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  let upstreamUrl = '';
  let upstreamBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamBody = init?.body;
    return new Response(JSON.stringify({ id: 'conv_123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const result = await proxyCreateAgentConversation({ title: '你好', mode: 'chat', user_id: 'web_user123' });

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { id: 'conv_123' });
  assert.equal(upstreamUrl, 'http://agent.test/api/v1/conversations');
  assert.deepEqual(JSON.parse(String(upstreamBody)), { title: '你好', mode: 'chat', user_id: 'web_user123' });
});

test('streams only the current message through the Agent v1 conversation API', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  let upstreamUrl = '';
  let upstreamBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamBody = init?.body;
    return new Response('data: {"delta":"联调成功"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const result = await proxyStreamAgentMessage('conv_123', {
    content: '只发送当前问题',
    user_id: 'web_user123',
  });

  assert.equal(result.status, 200);
  assert.ok('stream' in result);
  assert.equal(upstreamUrl, 'http://agent.test/api/v1/conversations/conv_123/messages/stream');
  assert.deepEqual(JSON.parse(String(upstreamBody)), { content: '只发送当前问题', user_id: 'web_user123' });
});

test('adapts FastAPI nested detail errors to the shared frontend envelope', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: { code: 'NOT_FOUND', message: '会话不存在' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const result = await proxyStreamAgentMessage('conv_123', { content: '测试', user_id: 'web_user123' });

  assert.equal(result.status, 404);
  assert.deepEqual('body' in result ? result.body : null, {
    error: { code: 'UPSTREAM_ERROR', message: '会话不存在' },
  });
});

test('rejects requests without a stable user identity before contacting upstream', async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const createResult = await proxyCreateAgentConversation({ title: '你好' });
  const streamResult = await proxyStreamAgentMessage('conv_123', { content: '测试' });

  assert.equal(createResult.status, 400);
  assert.equal(streamResult.status, 400);
  assert.equal(fetchCalled, false);
});

test('retrieves conversation history through the Agent v1 API', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  let upstreamUrl = '';
  globalThis.fetch = async (input) => {
    upstreamUrl = String(input);
    return new Response(JSON.stringify([{ id: 'msg_1', role: 'user', content: '你好' }]), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const result = await proxyGetAgentConversationMessages('conv_123');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { messages: [{ id: 'msg_1', role: 'user', content: '你好' }] });
  assert.equal(upstreamUrl, 'http://agent.test/api/v1/conversations/conv_123/messages');
});
