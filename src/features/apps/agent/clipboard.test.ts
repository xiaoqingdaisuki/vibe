import assert from 'node:assert/strict';
import test from 'node:test';

import { copyText } from './clipboard.ts';

test('copyText writes the complete message text to the clipboard', async (t) => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let copiedText = '';

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          copiedText = text;
        },
      },
    },
  });
  t.after(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  });

  const copied = await copyText('完整的对话文本');

  assert.equal(copied, true);
  assert.equal(copiedText, '完整的对话文本');
});
