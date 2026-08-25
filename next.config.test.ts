import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from './next.config.ts';

test('redirects legacy Lab routes to their current slugs', async () => {
  assert.ok(nextConfig.redirects);
  const redirects = await nextConfig.redirects();

  assert.deepEqual(
    redirects.filter(
      ({ source }) => source === '/lab/ai' || source === '/lab/online-editor' || source === '/lab/skills',
    ),
    [
      { source: '/lab/ai', destination: '/lab/agent', permanent: true },
      { source: '/lab/skills', destination: '/lab/skill', permanent: true },
      { source: '/lab/online-editor', destination: '/lab/editor', permanent: true },
    ],
  );
});
