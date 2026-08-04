const STORAGE_KEY = 'vibe.agent.conversation.v1';
const STORAGE_VERSION = 1;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredConversation {
  version: number;
  conversationId: string;
}

// 验证存储值是否为合法的会话记录格式
function isStoredConversation(value: unknown): value is StoredConversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).version === STORAGE_VERSION &&
    typeof (value as Record<string, unknown>).conversationId === 'string' &&
    CONVERSATION_ID_PATTERN.test((value as Record<string, string>).conversationId)
  );
}

// 从localStorage读取当前会话ID
export function readStoredConversationId(storage: StorageLike): string | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredConversation(parsed) ? parsed.conversationId : null;
  } catch {
    return null;
  }
}

// 将会话ID写入localStorage
export function writeStoredConversationId(storage: StorageLike, conversationId: string): void {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, conversationId }));
  } catch {
    // Storage is optional. The current browser session remains usable without it.
  }
}

// 从localStorage清除当前会话ID
export function clearStoredConversationId(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is optional. Clearing the in-memory session is still enough for this page.
  }
}
