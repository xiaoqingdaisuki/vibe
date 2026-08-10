import type { Character, Item, LogEntry } from './types.ts';

const CHARACTER_KEY_PREFIX = 'game:v2:character:';
const LOGS_KEY_PREFIX = 'game:v2:logs:';
const LEGACY_STORAGE_KEY_PREFIX = 'game_character_';
const SESSION_KEY = 'game_session';
const LOGS_KEY_SUFFIX = '_logs';
const MAX_STORED_LOGS = 200;

// 判断值是否为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 校验值是否符合角色快照结构
function isCharacterSnapshot(value: unknown): value is Character {
  if (!isRecord(value) || !isRecord(value.stats) || !isRecord(value.equipment)) return false;
  const strings = ['username', 'name', 'class', 'createdAt'];
  const numbers = ['level', 'exp', 'expToNext', 'hp', 'maxHp', 'gold', 'lastActive'];
  if (
    strings.some((key) => typeof value[key] !== 'string') ||
    numbers.some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]))
  )
    return false;
  if (!Array.isArray(value.inventory) || !Array.isArray(value.skills)) return false;
  if (value.skillUsage !== undefined && !isRecord(value.skillUsage)) return false;
  if (
    value.inventoryMax !== undefined &&
    (typeof value.inventoryMax !== 'number' || !Number.isFinite(value.inventoryMax))
  )
    return false;
  if (
    value.favorites !== undefined &&
    (!Array.isArray(value.favorites) || value.favorites.some((name) => typeof name !== 'string'))
  )
    return false;
  const stats = value.stats;
  return (
    ['str', 'dex', 'int', 'vit', 'luk'].every((key) => typeof stats[key] === 'number' && Number.isFinite(stats[key])) &&
    value.skills.every(
      (skill) =>
        isRecord(skill) &&
        typeof skill.skillId === 'string' &&
        typeof skill.level === 'number' &&
        Number.isFinite(skill.level),
    )
  );
}

// 校验值是否符合日志条目结构
function isLogEntry(value: unknown): value is LogEntry {
  return (
    isRecord(value) &&
    typeof value.timestamp === 'number' &&
    typeof value.text === 'string' &&
    typeof value.type === 'string'
  );
}

// 获取浏览器localStorage，隐私模式拒绝访问时返回null
function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// 根据用户名生成独立的角色存储键
export function getCharacterStorageKey(username: string): string {
  return `${CHARACTER_KEY_PREFIX}${encodeURIComponent(username)}`;
}

// 根据用户名生成独立的日志存储键
export function getLogsStorageKey(username: string): string {
  return `${LOGS_KEY_PREFIX}${encodeURIComponent(username)}`;
}

// 生成旧版可能碰撞的角色存储键
function getLegacyCharacterStorageKey(username: string): string {
  return `${LEGACY_STORAGE_KEY_PREFIX}${username}`;
}

// 生成旧版可能碰撞的日志存储键
function getLegacyLogsStorageKey(username: string): string {
  return `${LEGACY_STORAGE_KEY_PREFIX}${username}${LOGS_KEY_SUFFIX}`;
}

// 为旧版碰撞饰品ID补入名称维度
function migrateLegacyAccessoryId(item: Item): Item {
  const isLegacyId =
    /^(?:warrior|mage|rogue)_acc_\d{2}_(?:common|uncommon|rare|epic|legendary|mythic|transcendent)$/.test(item.id);
  if (item.slot !== 'accessory' || !isLegacyId) return item;
  const owner = item.classRequired ?? 'all';
  return {
    ...item,
    id: `${owner}_acc_legacy_${encodeURIComponent(item.name)}_${item.minLevel ?? 0}_${item.rarity}`,
  };
}

// 迁移角色快照中的旧版饰品ID
function migrateCharacterSnapshot(character: Character): Character {
  return {
    ...character,
    inventory: character.inventory.map(migrateLegacyAccessoryId),
    equipment: {
      weapon: character.equipment.weapon ? migrateLegacyAccessoryId(character.equipment.weapon) : null,
      armor: character.equipment.armor ? migrateLegacyAccessoryId(character.equipment.armor) : null,
      accessory: character.equipment.accessory ? migrateLegacyAccessoryId(character.equipment.accessory) : null,
    },
  };
}

// 从 localStorage 加载角色快照，无数据则返回 null
export function loadCharacterSnapshot(username: string, storage = getBrowserStorage()): Character | null {
  if (!storage) return null;

  try {
    const key = getCharacterStorageKey(username);
    const currentData = storage.getItem(key);
    const currentValue: unknown = currentData ? JSON.parse(currentData) : null;
    if (isCharacterSnapshot(currentValue)) return migrateCharacterSnapshot(currentValue);

    const legacyData = storage.getItem(getLegacyCharacterStorageKey(username));
    const legacyValue: unknown = legacyData ? JSON.parse(legacyData) : null;
    if (!isCharacterSnapshot(legacyValue)) return null;

    const migrated = migrateCharacterSnapshot(legacyValue);
    storage.setItem(key, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

// 保存角色快照到 localStorage，附带 lastActive 时间戳
export function saveCharacterSnapshot(
  character: Character,
  storage = getBrowserStorage(),
  now: () => number = Date.now,
): Character {
  const snapshot = { ...character, lastActive: now() };
  if (!storage) return snapshot;

  try {
    storage.setItem(getCharacterStorageKey(snapshot.username), JSON.stringify(snapshot));
    storage.setItem(SESSION_KEY, JSON.stringify({ username: snapshot.username, lastLogin: snapshot.lastActive }));
  } catch {
    // Storage can be unavailable or full; the game should keep running in memory.
  }

  return snapshot;
}

// 从 localStorage 加载持久化日志
export function loadPersistedLogs(username: string, storage = getBrowserStorage()): LogEntry[] {
  if (!storage) return [];

  try {
    const key = getLogsStorageKey(username);
    const currentData = storage.getItem(key);
    if (currentData !== null) {
      const currentValue: unknown = JSON.parse(currentData);
      return Array.isArray(currentValue) ? currentValue.filter(isLogEntry) : [];
    }

    const legacyData = storage.getItem(getLegacyLogsStorageKey(username));
    const legacyValue: unknown = legacyData ? JSON.parse(legacyData) : [];
    if (!Array.isArray(legacyValue)) return [];
    const migrated = legacyValue.filter(isLogEntry);
    storage.setItem(key, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

// 将日志保存到 localStorage，最多保留 MAX_STORED_LOGS 条
export function savePersistedLogs(username: string, logs: readonly LogEntry[], storage = getBrowserStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(getLogsStorageKey(username), JSON.stringify(logs.slice(-MAX_STORED_LOGS)));
  } catch {
    // Logging persistence is best-effort only.
  }
}

// 清空指定用户的持久化日志
export function clearPersistedLogs(username: string, storage = getBrowserStorage()): void {
  savePersistedLogs(username, [], storage);
}
