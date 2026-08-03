import assert from 'node:assert/strict';
import test from 'node:test';

import { proxyAgentImage } from './agent-image-server-proxy.ts';

test('forwards an image prompt and adapts the generated data URL', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.AGENT_API_BASE_URL;
  process.env.AGENT_API_BASE_URL = 'http://agent.test';
  let upstreamUrl: string | undefined;
  let upstreamBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamBody = init?.body;
    return new Response(JSON.stringify({ image_data_url: 'data:image/png;base64,aGVsbG8=' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.AGENT_API_BASE_URL;
    else process.env.AGENT_API_BASE_URL = originalBaseUrl;
  });

  const response = await proxyAgentImage({ prompt: '紫色的山谷' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { imageDataUrl: 'data:image/png;base64,aGVsbG8=' });
  assert.equal(upstreamUrl, 'http://agent.test/images/generations');
  assert.deepEqual(JSON.parse(String(upstreamBody)), { prompt: '紫色的山谷' });
});
