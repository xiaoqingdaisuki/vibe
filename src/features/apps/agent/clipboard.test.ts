import assert from 'node:assert/strict';
import test from 'node:test';

import { copyText } from './clipboard.ts';

test('uses the synchronous copy fallback before requesting clipboard permission', async (t) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let clipboardRequested = false;
  let legacyCopyRequested = false;

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { appendChild: () => undefined },
      createElement: () => ({ value: '', style: { cssText: '' }, select: () => undefined, remove: () => undefined }),
      execCommand: () => {
        legacyCopyRequested = true;
        return true;
      },
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          clipboardRequested = true;
        },
      },
    },
  });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });

  assert.equal(await copyText('选中的句子'), true);
  assert.equal(legacyCopyRequested, true);
  assert.equal(clipboardRequested, false);
});

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
