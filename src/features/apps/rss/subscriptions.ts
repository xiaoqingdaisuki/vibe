import { DEFAULT_FEEDS } from './types.ts';

const STORAGE_VERSION = 1;

interface StoredSubscriptions {
  version: number;
  subscriptions: unknown;
}

// 判断未知值是否为可持久化的HTTP订阅地址
function isSubscriptionUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// 解析新版或旧版订阅数据，非法结构返回null
export function parseStoredSubscriptions(value: unknown): string[] | null {
  let subscriptions: unknown;
  if (Array.isArray(value)) {
    subscriptions = value;
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const stored = value as StoredSubscriptions;
    if (stored.version !== STORAGE_VERSION) return null;
    subscriptions = stored.subscriptions;
  } else {
    return null;
  }

  if (!Array.isArray(subscriptions)) return null;
  return [...new Set(subscriptions.filter(isSubscriptionUrl))];
}

// 将当前订阅列表包装为版本化存储结构
export function createStoredSubscriptions(subscriptions: string[]): StoredSubscriptions {
  return { version: STORAGE_VERSION, subscriptions };
}

// 首次访问使用默认源，已有有效存储则精确恢复用户选择
export function restoreSubscriptions(value: unknown): string[] {
  return parseStoredSubscriptions(value) ?? [...DEFAULT_FEEDS];
}
