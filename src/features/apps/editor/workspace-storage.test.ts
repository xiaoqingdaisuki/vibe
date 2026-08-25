import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_EDITOR_CODE } from './data.ts';
import {
  ONLINE_EDITOR_STORAGE_KEY,
  isOnlineEditorWorkspace,
  loadWorkspace,
  saveWorkspace,
} from './workspace-storage.ts';

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

test('loads a fresh React workspace when storage is unavailable', () => {
  const workspace = loadWorkspace(null);

  assert.equal(workspace.version, 2);
  assert.equal(workspace.editors.length, 1);
  assert.equal(workspace.editors[0]?.code, DEFAULT_EDITOR_CODE);
});

test('accepts only non-empty editor collections with a valid active editor', () => {
  assert.equal(
    isOnlineEditorWorkspace({
      activeEditorId: 'editor-2',
      editors: [
        { code: 'one', id: 'editor-1', title: '编辑器 1' },
        { code: 'two', id: 'editor-2', title: '编辑器 2' },
      ],
      version: 2,
    }),
    true,
  );
  assert.equal(
    isOnlineEditorWorkspace({
      activeEditorId: 'missing-editor',
      editors: [{ code: 'one', id: 'editor-1', title: '编辑器 1' }],
      version: 2,
    }),
    false,
  );
  assert.equal(
    isOnlineEditorWorkspace({
      activeEditorId: 'editor-1',
      editors: [
        { code: 'one', id: 'editor-1', title: '编辑器 1' },
        { code: 'two', id: 'editor-1', title: '编辑器 2' },
      ],
      version: 2,
    }),
    false,
  );
});

test('round-trips multiple independent editors through storage', () => {
  const storage = new MemoryStorage();
  const workspace = {
    activeEditorId: 'editor-2',
    editors: [
      { code: 'one', id: 'editor-1', title: '编辑器 1' },
      { code: 'two', id: 'editor-2', title: '编辑器 2' },
    ],
    version: 2 as const,
  };

  assert.equal(saveWorkspace(storage, workspace), true);
  assert.equal(storage.getItem(ONLINE_EDITOR_STORAGE_KEY), JSON.stringify(workspace));
  assert.deepEqual(loadWorkspace(storage), workspace);
});

test('falls back safely when parsing stored data fails', () => {
  const storage = new MemoryStorage();
  storage.setItem(ONLINE_EDITOR_STORAGE_KEY, '{bad json');

  assert.equal(loadWorkspace(storage).editors.length, 1);
  assert.equal(saveWorkspace(null, loadWorkspace(storage)), false);
});
