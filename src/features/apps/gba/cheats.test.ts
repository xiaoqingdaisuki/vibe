import assert from 'node:assert/strict';
import test from 'node:test';
import { createGbaCheat, normalizeGbaCheatCode, sanitizeGbaCheats, serializeGbaCheats } from './cheats.ts';

test('normalizes multi-line cheat codes for mGBA', () => {
  assert.equal(normalizeGbaCheatCode('  830050A8 1388\r\n\n  4203c354 0001  '), '830050A8 1388\n4203C354 0001');
});

test('serializes auto-detected and disabled sets in mGBA format', () => {
  const output = serializeGbaCheats([
    createGbaCheat({ name: '无限金钱', code: '12345678 90ABCDEF', enabled: false }),
    createGbaCheat({ name: '道具', code: '830050A8 1388' }),
  ]);

  assert.equal(output, '!disabled\n# 无限金钱\n12345678 90ABCDEF\n# 道具\n830050A8 1388\n');
});

test('sanitizes untrusted stored cheat records', () => {
  const cheats = sanitizeGbaCheats([
    { id: 'one', name: '有效', type: 'par', code: 'ABCDEF12 34567890', enabled: false },
    { id: 'bad', name: '空代码', type: 'auto', code: '   ', enabled: true },
    { id: 'fallback', name: '旧格式', type: 'invalid', code: '02000000:FF', enabled: true },
  ]);

  assert.deepEqual(cheats, [
    { id: 'one', name: '有效', code: 'ABCDEF12 34567890', enabled: false },
    { id: 'fallback', name: '旧格式', code: '02000000:FF', enabled: true },
  ]);
});
