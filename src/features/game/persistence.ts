import type { Character, LogEntry } from "./types.ts"

const STORAGE_KEY_PREFIX = "game_character_"
const SESSION_KEY = "game_session"
const LOGS_KEY_SUFFIX = "_logs"
const MAX_STORED_LOGS = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isCharacterSnapshot(value: unknown): value is Character {
  if (!isRecord(value) || !isRecord(value.stats) || !isRecord(value.equipment)) return false
  const strings = ["username", "name", "class", "createdAt"]
  const numbers = ["level", "exp", "expToNext", "hp", "maxHp", "gold", "lastActive"]
  if (strings.some((key) => typeof value[key] !== "string") || numbers.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) return false
  if (!Array.isArray(value.inventory) || !Array.isArray(value.skills)) return false
  if (value.skillUsage !== undefined && !isRecord(value.skillUsage)) return false
  if (value.inventoryMax !== undefined && (typeof value.inventoryMax !== "number" || !Number.isFinite(value.inventoryMax))) return false
  if (value.favorites !== undefined && (!Array.isArray(value.favorites) || value.favorites.some((name) => typeof name !== "string"))) return false
  const stats = value.stats
  return ["str", "dex", "int", "vit", "luk"].every((key) => typeof stats[key] === "number" && Number.isFinite(stats[key])) && value.skills.every((skill) => isRecord(skill) && typeof skill.skillId === "string" && typeof skill.level === "number" && Number.isFinite(skill.level))
}

function isLogEntry(value: unknown): value is LogEntry {
  return isRecord(value) && typeof value.timestamp === "number" && typeof value.text === "string" && typeof value.type === "string"
}

function getBrowserStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage
}

export function getCharacterStorageKey(username: string): string {
  return `${STORAGE_KEY_PREFIX}${username}`
}

export function getLogsStorageKey(username: string): string {
  return `${STORAGE_KEY_PREFIX}${username}${LOGS_KEY_SUFFIX}`
}

export function loadCharacterSnapshot(username: string, storage = getBrowserStorage()): Character | null {
  if (!storage) return null

  try {
    const data = storage.getItem(getCharacterStorageKey(username))
    const parsed: unknown = data ? JSON.parse(data) : null
    return isCharacterSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveCharacterSnapshot(
  character: Character,
  storage = getBrowserStorage(),
  now: () => number = Date.now,
): Character {
  const snapshot = { ...character, lastActive: now() }
  if (!storage) return snapshot

  try {
    storage.setItem(getCharacterStorageKey(snapshot.username), JSON.stringify(snapshot))
    storage.setItem(SESSION_KEY, JSON.stringify({ username: snapshot.username, lastLogin: snapshot.lastActive }))
  } catch {
    // Storage can be unavailable or full; the game should keep running in memory.
  }

  return snapshot
}

export function loadPersistedLogs(username: string, storage = getBrowserStorage()): LogEntry[] {
  if (!storage) return []

  try {
    const data = storage.getItem(getLogsStorageKey(username))
    const parsed: unknown = data ? JSON.parse(data) : []
    return Array.isArray(parsed) ? parsed.filter(isLogEntry) : []
  } catch {
    return []
  }
}

export function savePersistedLogs(username: string, logs: readonly LogEntry[], storage = getBrowserStorage()): void {
  if (!storage) return

  try {
    storage.setItem(getLogsStorageKey(username), JSON.stringify(logs.slice(-MAX_STORED_LOGS)))
  } catch {
    // Logging persistence is best-effort only.
  }
}

export function clearPersistedLogs(username: string, storage = getBrowserStorage()): void {
  savePersistedLogs(username, [], storage)
}
