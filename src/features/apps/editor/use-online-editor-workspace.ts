'use client';

import { useEffect, useRef, useState } from 'react';

import { createDefaultWorkspace, DEFAULT_EDITOR_CODE } from './data';
import type { EditorDocument, OnlineEditorWorkspace } from './types';
import {
  addWorkspaceEditor,
  closeWorkspaceEditor,
  selectWorkspaceEditor,
  updateWorkspaceEditor,
  updateWorkspaceEditorIfUnchanged as applyWorkspaceEditorIfUnchanged,
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
  updateEditorIfUnchanged: (editorId: string, expectedCode: string, code: string) => void;
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
  const workspaceRef = useRef(workspace);

  // 同步工作区引用，供页面离开时读取最新状态
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

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

  // 页面离开或工作区卸载时立即保存最新源码，避免延迟写入丢失
  useEffect(() => {
    function persistLatestWorkspace(): void {
      if (hasLoadedStorage) saveWorkspace(getBrowserStorage(), workspaceRef.current);
    }

    window.addEventListener('pagehide', persistLatestWorkspace);
    return () => {
      window.removeEventListener('pagehide', persistLatestWorkspace);
      persistLatestWorkspace();
    };
  }, [hasLoadedStorage]);

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

  // 仅在源码未变化时写回异步结果，避免覆盖用户的新输入
  const updateEditorIfUnchanged = (editorId: string, expectedCode: string, code: string): void => {
    setWorkspace((currentWorkspace) => applyWorkspaceEditorIfUnchanged(currentWorkspace, editorId, expectedCode, code));
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
    updateEditorIfUnchanged,
  };
}
