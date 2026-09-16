import type { NoteEntry } from './types';

export const NOTE_STORAGE_KEY = 'note:v2:entries';
export const LEGACY_NOTE_STORAGE_KEY = 'note:v1:commands';
export const MAX_NOTE_CONTENT_LENGTH = 20_000;

const MAX_NOTE_COUNT = 500;
const EMPTY_NOTES: NoteEntry[] = [];

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

// 判断未知值是否为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 判断未知值是否为有限时间戳
function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// 将存储中的未知值收敛为安全的笔记记录
function toNoteEntry(value: unknown): NoteEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.trim().length === 0) return null;
  if (typeof value.content !== 'string' || value.content.trim().length === 0) return null;
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return null;

  return {
    id: value.id,
    content: value.content.slice(0, MAX_NOTE_CONTENT_LENGTH),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

// 解析版本化笔记数据，非法记录会被丢弃
export function parseStoredNotes(raw: string | null): NoteEntry[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toNoteEntry)
      .filter((note): note is NoteEntry => note !== null)
      .slice(0, MAX_NOTE_COUNT);
  } catch {
    return [];
  }
}

// 将旧版名称与指令字段合并为一段自由文本，避免升级时丢失内容
function parseLegacyNotes(raw: string | null): NoteEntry[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value): NoteEntry | null => {
        if (!isRecord(value)) return null;
        const label = typeof value.label === 'string' ? value.label.trim() : '';
        const command = typeof value.command === 'string' ? value.command.trim() : '';
        const content = [label, command].filter(Boolean).join('\n');
        if (!content || typeof value.id !== 'string') return null;

        const createdAt = isTimestamp(value.createdAt) ? value.createdAt : Date.now();
        const updatedAt = isTimestamp(value.updatedAt) ? value.updatedAt : createdAt;
        return { id: value.id, content: content.slice(0, MAX_NOTE_CONTENT_LENGTH), createdAt, updatedAt };
      })
      .filter((note): note is NoteEntry => note !== null)
      .slice(0, MAX_NOTE_COUNT);
  } catch {
    return [];
  }
}

// 获取浏览器 localStorage，服务端和受限环境返回 null
function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// 读取当前版本数据，并在需要时将旧版内容迁移到新命名空间
export function loadNotes(storage: StorageLike | null): NoteEntry[] {
  if (!storage) return [];

  try {
    const currentRaw = storage.getItem(NOTE_STORAGE_KEY);
    if (currentRaw !== null) return parseStoredNotes(currentRaw);

    const legacyNotes = parseLegacyNotes(storage.getItem(LEGACY_NOTE_STORAGE_KEY));
    if (legacyNotes.length === 0) return [];

    try {
      storage.setItem(NOTE_STORAGE_KEY, JSON.stringify(legacyNotes));
      storage.removeItem(LEGACY_NOTE_STORAGE_KEY);
    } catch {
      // 迁移失败时仍返回内存中的转换结果，后续保存会再次尝试
    }
    return legacyNotes;
  } catch {
    // 读取受限时回退为空状态，不让页面崩溃
    return [];
  }
}

// 将笔记数据写入指定存储，返回是否成功
export function saveNotes(storage: StorageLike | null, notes: NoteEntry[]): boolean {
  if (!storage) return false;

  try {
    storage.setItem(NOTE_STORAGE_KEY, JSON.stringify(notes.slice(0, MAX_NOTE_COUNT)));
    return true;
  } catch {
    return false;
  }
}

let cache: NoteEntry[] | null = null;
const listeners = new Set<() => void>();

// 返回笔记缓存，首次读取时从浏览器存储加载
function getSnapshot(): NoteEntry[] {
  if (cache === null) cache = loadNotes(getBrowserStorage());
  return cache;
}

// 通知当前页面内所有笔记订阅者刷新界面
function notifyListeners(): void {
  for (const listener of listeners) listener();
}

// 将笔记写入缓存与 localStorage，并通知订阅者
function writeSnapshot(notes: NoteEntry[]): void {
  cache = notes;
  saveNotes(getBrowserStorage(), notes);
  notifyListeners();
}

// 其他标签页修改笔记时使缓存失效并通知订阅者
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== NOTE_STORAGE_KEY && event.key !== LEGACY_NOTE_STORAGE_KEY) return;
  cache = null;
  notifyListeners();
}

// 订阅笔记快照变化，返回取消订阅函数
export function subscribeNotes(callback: () => void): () => void {
  const isFirst = listeners.size === 0;
  listeners.add(callback);
  if (isFirst && typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

// 供 useSyncExternalStore 读取的客户端快照
export function getNotesSnapshot(): NoteEntry[] {
  return getSnapshot();
}

// 服务端渲染时返回稳定的空快照，避免访问浏览器 API
export function getServerNotesSnapshot(): NoteEntry[] {
  return EMPTY_NOTES;
}

// 覆盖式保存笔记列表并持久化
export function setNotes(notes: NoteEntry[]): void {
  writeSnapshot(notes);
}

// 同时清理新旧存储键，确保用户点击清空后不会被旧数据重新迁移
export function clearStoredNotes(): void {
  cache = [];
  const storage = getBrowserStorage();
  if (storage) {
    try {
      storage.removeItem(NOTE_STORAGE_KEY);
      storage.removeItem(LEGACY_NOTE_STORAGE_KEY);
    } catch {
      // 存储受限时保留当前页面的空状态
    }
  }
  notifyListeners();
}
