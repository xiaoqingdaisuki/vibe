/** 验证生成应用名称、安装入口与图标等 Web App Manifest 信息的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';

import manifest from './manifest.ts';

test('the web app manifest declares an installable Vibe application', () => {
  const config = manifest();

  assert.equal(config.name, 'Vibe — Personal Web Lab');
  assert.equal(config.short_name, 'Vibe');
  assert.equal(config.start_url, '/');
  assert.equal(config.scope, '/');
  assert.equal(config.display, 'standalone');
  assert.deepEqual(config.icons, [
    {
      src: '/icon',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]);
});
