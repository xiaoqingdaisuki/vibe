import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultWorkspace } from './data.ts';
import {
  addWorkspaceEditor,
  closeWorkspaceEditor,
  selectWorkspaceEditor,
  updateWorkspaceEditor,
} from './workspace-state.ts';

test('adds an independent editor and selects it', () => {
  const initial = createDefaultWorkspace();
  const next = addWorkspaceEditor(initial);

  assert.equal(next.editors.length, 2);
  assert.equal(next.activeEditorId, next.editors[1]?.id);
  assert.notEqual(next.editors[0]?.code, '');
  assert.equal(next.editors[1]?.title, '编辑器 2');
});

test('updates only the selected editor source', () => {
  const initial = addWorkspaceEditor(createDefaultWorkspace());
  const targetId = initial.editors[1]?.id ?? '';
  const next = updateWorkspaceEditor(initial, targetId, 'console.log("two");');

  assert.equal(next.editors[1]?.code, 'console.log("two");');
  assert.equal(next.editors[0]?.code, initial.editors[0]?.code);
});

test('selects valid tabs and ignores unknown ids', () => {
  const initial = addWorkspaceEditor(createDefaultWorkspace());
  const firstId = initial.editors[0]?.id ?? '';
  const selected = selectWorkspaceEditor(initial, firstId);

  assert.equal(selected.activeEditorId, firstId);
  assert.equal(selectWorkspaceEditor(selected, 'missing'), selected);
});

test('closes the active tab, selects its neighbor and preserves one editor', () => {
  const initial = addWorkspaceEditor(createDefaultWorkspace());
  const closed = closeWorkspaceEditor(initial, initial.activeEditorId);

  assert.equal(closed.editors.length, 1);
  assert.equal(closed.activeEditorId, closed.editors[0]?.id);
  assert.equal(closeWorkspaceEditor(closed, closed.activeEditorId), closed);
});
