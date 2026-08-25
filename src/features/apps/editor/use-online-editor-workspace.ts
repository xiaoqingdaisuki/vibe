'use client';

import { useEffect, useState } from 'react';

import { createDefaultEditor, createDefaultWorkspace, DEFAULT_EDITOR_CODE } from './data';
import type { EditorDocument, OnlineEditorWorkspace } from './types';
import { loadWorkspace, saveWorkspace } from './workspace-storage';

type SaveState = 'error' | 'idle' | 'saved';

// 获取可用的浏览器本地存储，兼容受限环境
function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// 生成不会与现有工作区冲突的编辑器标识
function createEditorId(editors: EditorDocument[]): string {
  const existingIds = new Set(editors.map((editor) => editor.id));
  let suffix = editors.length + 1;
  let editorId = `editor-${suffix}`;

  while (existingIds.has(editorId)) {
    suffix += 1;
    editorId = `editor-${suffix}`;
  }

  return editorId;
}

// 为新标签分配最小可用的中文序号标题
function createEditorTitle(editors: EditorDocument[]): string {
  const usedNumbers = new Set(
    editors
      .map((editor) => /^编辑器 (\d+)$/.exec(editor.title)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let suffix = 1;

  while (usedNumbers.has(suffix)) {
    suffix += 1;
  }

  return `编辑器 ${suffix}`;
}

// 管理多编辑器工作区及其延迟持久化状态
export function useOnlineEditorWorkspace() {
  const [workspace, setWorkspace] = useState<OnlineEditorWorkspace>(createDefaultWorkspace);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setWorkspace(loadWorkspace(getBrowserStorage()));
      setHasLoadedStorage(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveState(saveWorkspace(getBrowserStorage(), workspace) ? 'saved' : 'error');
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [hasLoadedStorage, workspace]);

  const activeEditor =
    workspace.editors.find((editor) => editor.id === workspace.activeEditorId) ?? workspace.editors[0];

  // 切换当前可见的独立编辑器
  const selectEditor = (editorId: string): void => {
    setWorkspace((currentWorkspace) => {
      if (!currentWorkspace.editors.some((editor) => editor.id === editorId)) {
        return currentWorkspace;
      }

      return { ...currentWorkspace, activeEditorId: editorId };
    });
  };

  // 新建一份独立代码与预览的 React 编辑器
  const addEditor = (): void => {
    setWorkspace((currentWorkspace) => {
      const editorId = createEditorId(currentWorkspace.editors);
      const editor = createDefaultEditor({
        id: editorId,
        title: createEditorTitle(currentWorkspace.editors),
      });

      return {
        activeEditorId: editorId,
        editors: [...currentWorkspace.editors, editor],
        version: 2,
      };
    });
  };

  // 关闭指定编辑器，并在必要时选择相邻标签
  const closeEditor = (editorId: string): void => {
    setWorkspace((currentWorkspace) => {
      if (currentWorkspace.editors.length === 1) {
        return currentWorkspace;
      }

      const editorIndex = currentWorkspace.editors.findIndex((editor) => editor.id === editorId);

      if (editorIndex === -1) {
        return currentWorkspace;
      }

      const nextEditors = currentWorkspace.editors.filter((editor) => editor.id !== editorId);
      const nextActiveEditorId =
        currentWorkspace.activeEditorId === editorId
          ? nextEditors[Math.min(editorIndex, nextEditors.length - 1)]?.id
          : currentWorkspace.activeEditorId;

      return {
        activeEditorId: nextActiveEditorId ?? nextEditors[0]?.id ?? currentWorkspace.activeEditorId,
        editors: nextEditors,
        version: 2,
      };
    });
  };

  // 更新指定编辑器的 JSX 源码
  const updateEditor = (editorId: string, code: string): void => {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      editors: currentWorkspace.editors.map((editor) => (editor.id === editorId ? { ...editor, code } : editor)),
    }));
  };

  // 将当前编辑器恢复为友善的 React 动画示例
  const resetActiveEditor = (): void => {
    updateEditor(activeEditor.id, DEFAULT_EDITOR_CODE);
  };

  return {
    activeEditor,
    addEditor,
    closeEditor,
    editorCount: workspace.editors.length,
    editors: workspace.editors,
    resetActiveEditor,
    saveState,
    selectEditor,
    updateEditor,
  };
}
