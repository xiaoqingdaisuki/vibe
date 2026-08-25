import { createDefaultWorkspace } from './data.ts';
import type { EditorDocument, OnlineEditorWorkspace } from './types';

export const ONLINE_EDITOR_STORAGE_KEY = 'vibe-online-editor-v2';

interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// 判断对象是否是可恢复的编辑器文档
function isEditorDocument(value: unknown): value is EditorDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.title === 'string' &&
    candidate.title.length > 0 &&
    typeof candidate.code === 'string'
  );
}

// 验证本地存储中的工作区数据边界
export function isOnlineEditorWorkspace(value: unknown): value is OnlineEditorWorkspace {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (
    candidate.version !== 2 ||
    typeof candidate.activeEditorId !== 'string' ||
    !Array.isArray(candidate.editors) ||
    candidate.editors.length === 0 ||
    !candidate.editors.every(isEditorDocument)
  ) {
    return false;
  }

  const editorIds = new Set(candidate.editors.map((editor) => editor.id));

  return editorIds.size === candidate.editors.length && editorIds.has(candidate.activeEditorId);
}

// 克隆默认状态，避免模块级默认对象被意外修改
function cloneDefaultWorkspace(): OnlineEditorWorkspace {
  return createDefaultWorkspace();
}

// 从浏览器存储读取有效工作区，异常时安全回退
export function loadWorkspace(storage: WorkspaceStorage | null): OnlineEditorWorkspace {
  if (!storage) {
    return cloneDefaultWorkspace();
  }

  try {
    const rawValue = storage.getItem(ONLINE_EDITOR_STORAGE_KEY);

    if (!rawValue) {
      return cloneDefaultWorkspace();
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!isOnlineEditorWorkspace(parsedValue)) {
      return cloneDefaultWorkspace();
    }

    return {
      activeEditorId: parsedValue.activeEditorId,
      editors: parsedValue.editors.map((editor) => ({ ...editor })),
      version: 2,
    };
  } catch {
    return cloneDefaultWorkspace();
  }
}

// 保存当前工作区，调用方可据返回值更新保存状态
export function saveWorkspace(storage: WorkspaceStorage | null, workspace: OnlineEditorWorkspace): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(ONLINE_EDITOR_STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
