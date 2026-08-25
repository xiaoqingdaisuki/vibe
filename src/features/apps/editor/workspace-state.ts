import { createDefaultEditor } from './data.ts';
import type { OnlineEditorWorkspace } from './types';

// 生成不会与现有工作区冲突的编辑器标识
function createEditorId(workspace: OnlineEditorWorkspace): string {
  const existingIds = new Set(workspace.editors.map((editor) => editor.id));
  let suffix = workspace.editors.length + 1;
  let editorId = `editor-${suffix}`;

  while (existingIds.has(editorId)) {
    suffix += 1;
    editorId = `editor-${suffix}`;
  }

  return editorId;
}

// 为新标签分配最小可用的中文序号标题
function createEditorTitle(workspace: OnlineEditorWorkspace): string {
  const usedNumbers = new Set(
    workspace.editors
      .map((editor) => /^编辑器 (\d+)$/.exec(editor.title)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let suffix = 1;

  while (usedNumbers.has(suffix)) suffix += 1;
  return `编辑器 ${suffix}`;
}

// 选择存在的编辑器，无效标识保持原工作区不变
export function selectWorkspaceEditor(workspace: OnlineEditorWorkspace, editorId: string): OnlineEditorWorkspace {
  if (!workspace.editors.some((editor) => editor.id === editorId)) return workspace;
  return { ...workspace, activeEditorId: editorId };
}

// 新建独立编辑器并立即切换到新标签
export function addWorkspaceEditor(workspace: OnlineEditorWorkspace): OnlineEditorWorkspace {
  const editorId = createEditorId(workspace);
  const editor = createDefaultEditor({ id: editorId, title: createEditorTitle(workspace) });

  return {
    activeEditorId: editorId,
    editors: [...workspace.editors, editor],
    version: 2,
  };
}

// 关闭编辑器并在需要时选择相邻标签，始终保留至少一个文档
export function closeWorkspaceEditor(workspace: OnlineEditorWorkspace, editorId: string): OnlineEditorWorkspace {
  if (workspace.editors.length === 1) return workspace;

  const editorIndex = workspace.editors.findIndex((editor) => editor.id === editorId);
  if (editorIndex === -1) return workspace;

  const editors = workspace.editors.filter((editor) => editor.id !== editorId);
  const activeEditorId =
    workspace.activeEditorId === editorId
      ? editors[Math.min(editorIndex, editors.length - 1)]?.id
      : workspace.activeEditorId;

  return {
    activeEditorId: activeEditorId ?? editors[0]?.id ?? workspace.activeEditorId,
    editors,
    version: 2,
  };
}

// 仅更新目标编辑器源码，保持其他标签的独立内容
export function updateWorkspaceEditor(
  workspace: OnlineEditorWorkspace,
  editorId: string,
  code: string,
): OnlineEditorWorkspace {
  return {
    ...workspace,
    editors: workspace.editors.map((editor) => (editor.id === editorId ? { ...editor, code } : editor)),
  };
}
