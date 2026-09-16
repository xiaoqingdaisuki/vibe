import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_NOTE_STORAGE_KEY,
  NOTE_STORAGE_KEY,
  clearStoredNotes,
  loadNotes,
  parseStoredNotes,
  saveNotes,
  type StorageLike,
} from './storage.ts';
import type { NoteEntry } from './types.ts';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createNote(content: string): NoteEntry {
  return { id: 'note-1', content, createdAt: 1, updatedAt: 2 };
}

test('round-trips freeform notes through the versioned storage key', () => {
  const storage = new MemoryStorage();
  const notes = [createNote('shopify theme dev --store="meroeu"\n第二行备忘')];

  assert.equal(saveNotes(storage, notes), true);
  assert.deepEqual(loadNotes(storage), notes);
  assert.equal(storage.getItem(LEGACY_NOTE_STORAGE_KEY), null);
});

test('migrates the first version command shape into freeform text', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_NOTE_STORAGE_KEY,
    JSON.stringify([
      { id: 'legacy-1', label: '切换商店', command: 'shopify theme dev --store="meroeu"', createdAt: 1, updatedAt: 2 },
    ]),
  );

  assert.deepEqual(loadNotes(storage), [
    {
      id: 'legacy-1',
      content: '切换商店\nshopify theme dev --store="meroeu"',
      createdAt: 1,
      updatedAt: 2,
    },
  ]);
  assert.ok(storage.getItem(NOTE_STORAGE_KEY));
  assert.equal(storage.getItem(LEGACY_NOTE_STORAGE_KEY), null);
});

test('ignores malformed records while parsing persisted notes', () => {
  const raw = JSON.stringify([
    createNote('valid'),
    { id: 'missing-content', createdAt: 1, updatedAt: 2 },
    { id: 'missing-time', content: 'invalid', createdAt: 'now', updatedAt: 2 },
  ]);

  assert.deepEqual(parseStoredNotes(raw), [createNote('valid')]);
  assert.deepEqual(parseStoredNotes('{bad json'), []);
});

test('clears both the current and legacy namespaces', () => {
  const storage = new MemoryStorage();
  storage.setItem(NOTE_STORAGE_KEY, JSON.stringify([createNote('current')]));
  storage.setItem(LEGACY_NOTE_STORAGE_KEY, JSON.stringify([]));

  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });

  clearStoredNotes();

  assert.equal(storage.getItem(NOTE_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_NOTE_STORAGE_KEY), null);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});
