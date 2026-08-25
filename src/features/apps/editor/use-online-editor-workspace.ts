'use client';

import { useEffect, useState } from 'react';

import { createDefaultWorkspace, DEFAULT_EDITOR_CODE } from './data';
import type { EditorDocument, OnlineEditorWorkspace } from './types';
import {
  addWorkspaceEditor,
  closeWorkspaceEditor,
  selectWorkspaceEditor,
  updateWorkspaceEditor,
} from './workspace-state';
import { loadWorkspace, saveWorkspace } from './workspace-storage';

interface OnlineEditorWorkspaceController {
  activeEditor: EditorDocument;
  addEditor: () => void;
  closeEditor: (editorId: string) => void;
  editors: EditorDocument[];
  resetActiveEditor: () => void;
  selectEditor: (editorId: string) => void;
  updateEditor: (editorId: string, code: string) => void;
}

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

// 管理多编辑器工作区及其延迟持久化状态
export function useOnlineEditorWorkspace(): OnlineEditorWorkspaceController {
  const [workspace, setWorkspace] = useState<OnlineEditorWorkspace>(createDefaultWorkspace);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

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
      saveWorkspace(getBrowserStorage(), workspace);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [hasLoadedStorage, workspace]);

  const activeEditor =
    workspace.editors.find((editor) => editor.id === workspace.activeEditorId) ?? workspace.editors[0];

  // 切换当前可见的独立编辑器
  const selectEditor = (editorId: string): void => {
    setWorkspace((currentWorkspace) => selectWorkspaceEditor(currentWorkspace, editorId));
  };

  // 新建一份独立代码与预览的 React 编辑器
  const addEditor = (): void => {
    setWorkspace(addWorkspaceEditor);
  };

  // 关闭指定编辑器，并在必要时选择相邻标签
  const closeEditor = (editorId: string): void => {
    setWorkspace((currentWorkspace) => closeWorkspaceEditor(currentWorkspace, editorId));
  };

  // 更新指定编辑器的 JSX 源码
  const updateEditor = (editorId: string, code: string): void => {
    setWorkspace((currentWorkspace) => updateWorkspaceEditor(currentWorkspace, editorId, code));
  };

  // 将当前编辑器恢复为友善的 React 动画示例
  const resetActiveEditor = (): void => {
    updateEditor(activeEditor.id, DEFAULT_EDITOR_CODE);
  };

  return {
    activeEditor,
    addEditor,
    closeEditor,
    editors: workspace.editors,
    resetActiveEditor,
    selectEditor,
    updateEditor,
  };
}
