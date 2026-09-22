import { sanitizeGbaCheats } from './cheats';
import type { GbaCheat } from './types';

const STORAGE_PREFIX = 'vibe-gba-cheats:';

// 生成按 ROM 隔离的金手指本地存储键
function getGbaCheatStorageKey(romHash: string): string {
  return `${STORAGE_PREFIX}${romHash}`;
}

// 读取指定 ROM 的金手指列表，损坏数据会安全回退为空列表
export function loadGbaCheats(romHash: string): GbaCheat[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(getGbaCheatStorageKey(romHash));
    return raw ? sanitizeGbaCheats(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

// 保存指定 ROM 的金手指列表，存储不可用时不影响模拟器运行
export function saveGbaCheats(romHash: string, cheats: readonly GbaCheat[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(getGbaCheatStorageKey(romHash), JSON.stringify(cheats));
  } catch {
    // 隐私模式或存储配额不足时保留当前运行内的金手指状态。
  }
}
