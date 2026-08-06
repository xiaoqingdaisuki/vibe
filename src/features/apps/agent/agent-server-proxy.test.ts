import assert from 'node:assert/strict';
import test from 'node:test';

import { proxyAgentRequest } from './agent-server-proxy.ts';

interface ContractCase {
  frontendPath: string;
  upstreamPath: string;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
}

const CONTRACT_CASES: ContractCase[] = [
  { method: 'GET', frontendPath: 'health', upstreamPath: '/health' },
  { method: 'GET', frontendPath: 'tools', upstreamPath: '/tools' },
  { method: 'POST', frontendPath: 'chat', upstreamPath: '/chat' },
  { method: 'POST', frontendPath: 'stream', upstreamPath: '/stream' },
  { method: 'POST', frontendPath: 'images/generations', upstreamPath: '/images/generations' },
  { method: 'GET', frontendPath: 'v1/health', upstreamPath: '/api/v1/health' },
  { method: 'GET', frontendPath: 'v1/capabilities', upstreamPath: '/api/v1/capabilities' },
  { method: 'GET', frontendPath: 'v1/conversations', upstreamPath: '/api/v1/conversations' },
  { method: 'POST', frontendPath: 'v1/conversations', upstreamPath: '/api/v1/conversations' },
  { method: 'GET', frontendPath: 'v1/conversations/conv_1', upstreamPath: '/api/v1/conversations/conv_1' },
  { method: 'DELETE', frontendPath: 'v1/conversations/conv_1', upstreamPath: '/api/v1/conversations/conv_1' },
  {
    method: 'GET',
    frontendPath: 'v1/conversations/conv_1/messages',
    upstreamPath: '/api/v1/conversations/conv_1/messages',
  },
  {
    method: 'POST',
    frontendPath: 'v1/conversations/conv_1/messages',
    upstreamPath: '/api/v1/conversations/conv_1/messages',
  },
  {
    method: 'DELETE',
    frontendPath: 'v1/conversations/conv_1/messages',
    upstreamPath: '/api/v1/conversations/conv_1/messages',
  },
  {
    method: 'POST',
    frontendPath: 'v1/conversations/conv_1/messages/stream',
    upstreamPath: '/api/v1/conversations/conv_1/messages/stream',
  },
  { method: 'POST', frontendPath: 'v1/knowledge/documents', upstreamPath: '/api/v1/knowledge/documents' },
  { method: 'GET', frontendPath: 'v1/knowledge/documents', upstreamPath: '/api/v1/knowledge/documents' },
  { method: 'GET', frontendPath: 'v1/knowledge/documents/doc_1', upstreamPath: '/api/v1/knowledge/documents/doc_1' },
  {
    method: 'DELETE',
    frontendPath: 'v1/knowledge/documents/doc_1',
    upstreamPath: '/api/v1/knowledge/documents/doc_1',
  },
  {
    method: 'POST',
    frontendPath: 'v1/knowledge/documents/doc_1/reindex',
    upstreamPath: '/api/v1/knowledge/documents/doc_1/reindex',
  },
  { method: 'POST', frontendPath: 'v1/knowledge/search', upstreamPath: '/api/v1/knowledge/search' },
  { method: 'GET', frontendPath: 'v1/profile', upstreamPath: '/api/v1/profile' },
  { method: 'PATCH', frontendPath: 'v1/profile', upstreamPath: '/api/v1/profile' },
  { method: 'GET', frontendPath: 'v1/memory', upstreamPath: '/api/v1/memory' },
  { method: 'POST', frontendPath: 'v1/memory', upstreamPath: '/api/v1/memory' },
  { method: 'DELETE', frontendPath: 'v1/memory', upstreamPath: '/api/v1/memory' },
  { method: 'GET', frontendPath: 'v1/history', upstreamPath: '/api/v1/history' },
];

test('maps the complete shared Agent contract without changing methods or queries', async (t) => {
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test:6001/base';
  t.after(() => {
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  for (const contract of CONTRACT_CASES) {
    let receivedUrl = '';
    let receivedMethod = '';
    const body = contract.method === 'GET' || contract.method === 'DELETE' ? undefined : JSON.stringify({ value: '测试' });
    const request = new Request(`http://vibe.test/api/agent/${contract.frontendPath}?user_id=web_1`, {
      method: contract.method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
    const response = await proxyAgentRequest(request, contract.frontendPath.split('/'), async (input, init) => {
      receivedUrl = String(input);
      receivedMethod = String(init?.method);
      return Response.json({ ok: true });
    });

    assert.equal(response.status, 200, contract.frontendPath);
    assert.equal(receivedUrl, `http://agent.test:6001${contract.upstreamPath}?user_id=web_1`);
    assert.equal(receivedMethod, contract.method);
  }
});

test('preserves JSON bodies, multipart boundaries, and SSE streams', async (t) => {
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  t.after(() => {
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const cases = [
    { contentType: 'application/json', body: '{"content":"你好"}', path: ['chat'] },
    {
      contentType: 'multipart/form-data; boundary=agent-boundary',
      body: '--agent-boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\n内容\r\n--agent-boundary--',
      path: ['v1', 'knowledge', 'documents'],
    },
  ];
  for (const contract of cases) {
    let receivedContentType = '';
    let receivedBody = '';
    const request = new Request(`http://vibe.test/api/agent/${contract.path.join('/')}`, {
      method: 'POST',
      headers: { 'Content-Type': contract.contentType },
      body: contract.body,
    });
    const response = await proxyAgentRequest(request, contract.path, async (_input, init) => {
      receivedContentType = new Headers(init?.headers).get('content-type') ?? '';
      receivedBody = new TextDecoder().decode(init?.body as ArrayBuffer);
      return Response.json({ ok: true });
    });
    assert.equal(response.status, 200);
    assert.equal(receivedContentType, contract.contentType);
    assert.equal(receivedBody, contract.body);
  }

  const sseResponse = await proxyAgentRequest(
    new Request('http://vibe.test/api/agent/stream', { method: 'POST', body: '{}' }),
    ['stream'],
    async () =>
      new Response('data: {"delta":"联调成功"}\n\ndata: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }),
  );
  assert.match(sseResponse.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(sseResponse.headers.get('x-accel-buffering'), 'no');
  assert.equal(await sseResponse.text(), 'data: {"delta":"联调成功"}\n\ndata: [DONE]\n\n');
});

test('rejects unsupported paths and does not contact an arbitrary upstream', async () => {
  let fetchCalled = false;
  const response = await proxyAgentRequest(
    new Request('http://vibe.test/api/agent/admin/secrets'),
    ['admin', 'secrets'],
    async () => {
      fetchCalled = true;
      return Response.json({ ok: true });
    },
  );

  assert.equal(response.status, 400);
  assert.equal(fetchCalled, false);
});
