const CONVERSATION_STORAGE_KEY = 'vibe.agent.conversation.v2';
const USER_STORAGE_KEY = 'vibe.agent.user.v1';
const CONVERSATION_STORAGE_VERSION = 2;
const USER_STORAGE_VERSION = 1;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredConversation {
  version: number;
  userId: string;
  conversationId: string;
}

interface StoredUser {
  version: number;
  userId: string;
}

// 验证存储值是否为合法的会话记录格式
function isStoredConversation(value: unknown): value is StoredConversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).version === CONVERSATION_STORAGE_VERSION &&
    typeof (value as Record<string, unknown>).userId === 'string' &&
    ID_PATTERN.test((value as Record<string, string>).userId) &&
    typeof (value as Record<string, unknown>).conversationId === 'string' &&
    ID_PATTERN.test((value as Record<string, string>).conversationId)
  );
}

// 验证存储值是否为合法的用户标识记录
function isStoredUser(value: unknown): value is StoredUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).version === USER_STORAGE_VERSION &&
    typeof (value as Record<string, unknown>).userId === 'string' &&
    ID_PATTERN.test((value as Record<string, string>).userId)
  );
}

// 创建符合后端约束的匿名用户标识
function createAnonymousUserId(randomUuid: () => string): string {
  return `web_${randomUuid().replace(/-/g, '')}`;
}

// 读取或创建浏览器稳定用户标识
export function getOrCreateStoredAgentUserId(storage: StorageLike, randomUuid: () => string): string {
  try {
    const raw = storage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredUser(parsed)) return parsed.userId;
    }
  } catch {
    // 存储不可用时仍为当前页面生成隔离标识
  }

  const userId = createAnonymousUserId(randomUuid);
  try {
    storage.setItem(USER_STORAGE_KEY, JSON.stringify({ version: USER_STORAGE_VERSION, userId }));
  } catch {
    // localStorage 是可选能力，当前页面仍可继续使用
  }
  return userId;
}

// 从localStorage读取当前会话ID
export function readStoredConversationId(storage: StorageLike, userId: string): string | null {
  try {
    const raw = storage.getItem(CONVERSATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredConversation(parsed) && parsed.userId === userId ? parsed.conversationId : null;
  } catch {
    return null;
  }
}

// 将会话ID写入localStorage
export function writeStoredConversationId(storage: StorageLike, userId: string, conversationId: string): void {
  if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(conversationId)) return;
  try {
    storage.setItem(
      CONVERSATION_STORAGE_KEY,
      JSON.stringify({ version: CONVERSATION_STORAGE_VERSION, userId, conversationId }),
    );
  } catch {
    // Storage is optional. The current browser session remains usable without it.
  }
}

// 从localStorage清除当前会话ID
export function clearStoredConversationId(storage: StorageLike): void {
  try {
    storage.removeItem(CONVERSATION_STORAGE_KEY);
  } catch {
    // Storage is optional. Clearing the in-memory session is still enough for this page.
  }
}
