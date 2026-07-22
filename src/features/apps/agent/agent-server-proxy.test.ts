import assert from 'node:assert/strict';
import test from 'node:test';

import { proxyAgentChat } from './agent-server-proxy.ts';

test('forwards the complete conversation and adapts the Agent reply', async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl: string | undefined;
  let upstreamBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamBody = init?.body;
    return new Response(JSON.stringify({ reply: '联调成功。' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await proxyAgentChat({
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，请问有什么可以帮你？' },
      { role: 'user', content: '请确认联调状态' },
    ],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { content: '联调成功。' });
  assert.equal(upstreamUrl, 'http://127.0.0.1:6001/chat');
  assert.deepEqual(JSON.parse(String(upstreamBody)), {
    message: 'user: 你好\n\nassistant: 你好，请问有什么可以帮你？\n\nuser: 请确认联调状态',
  });
});
