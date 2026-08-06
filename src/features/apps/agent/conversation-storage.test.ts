import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearStoredConversationId,
  getOrCreateStoredAgentUserId,
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

  writeStoredConversationId(storage, 'web_user123', 'conv_123');

  assert.equal(readStoredConversationId(storage, 'web_user123'), 'conv_123');
  assert.equal(readStoredConversationId(storage, 'web_other'), null);
  clearStoredConversationId(storage);
  assert.equal(readStoredConversationId(storage, 'web_user123'), null);
});

test('ignores malformed stored Agent conversation data', () => {
  const storage = new MemoryStorage();
  storage.setItem('vibe.agent.conversation.v2', '{bad json');

  assert.equal(readStoredConversationId(storage, 'web_user123'), null);
});

test('creates and reuses a stable versioned Agent user ID', () => {
  const storage = new MemoryStorage();
  const first = getOrCreateStoredAgentUserId(storage, () => '12345678-1234-1234-1234-123456789abc');
  const second = getOrCreateStoredAgentUserId(storage, () => 'ffffffff-ffff-ffff-ffff-ffffffffffff');

  assert.equal(first, 'web_12345678123412341234123456789abc');
  assert.equal(second, first);
});
