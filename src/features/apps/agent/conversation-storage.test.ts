import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearStoredConversationId,
  readStoredConversationId,
  writeStoredConversationId,
} from './conversation-storage.ts';
import type { StorageLike } from './conversation-storage.ts';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('stores and restores a versioned Agent conversation ID', () => {
  const storage = new MemoryStorage();

  writeStoredConversationId(storage, 'conv_123');

  assert.equal(readStoredConversationId(storage), 'conv_123');
  clearStoredConversationId(storage);
  assert.equal(readStoredConversationId(storage), null);
});

test('ignores malformed stored Agent conversation data', () => {
  const storage = new MemoryStorage();
  storage.setItem('vibe.agent.conversation.v1', '{bad json');

  assert.equal(readStoredConversationId(storage), null);
});
