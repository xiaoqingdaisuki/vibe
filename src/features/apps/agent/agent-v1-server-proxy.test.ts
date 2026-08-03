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

  const result = await proxyCreateAgentConversation({ title: '你好', mode: 'chat' });

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { id: 'conv_123' });
  assert.equal(upstreamUrl, 'http://agent.test/api/v1/conversations');
  assert.deepEqual(JSON.parse(String(upstreamBody)), { title: '你好', mode: 'chat' });
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

  const result = await proxyStreamAgentMessage('conv_123', { content: '只发送当前问题' });

  assert.equal(result.status, 200);
  assert.ok('stream' in result);
  assert.equal(upstreamUrl, 'http://agent.test/api/v1/conversations/conv_123/messages/stream');
  assert.deepEqual(JSON.parse(String(upstreamBody)), { content: '只发送当前问题' });
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
