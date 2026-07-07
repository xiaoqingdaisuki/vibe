import type { Character, LogEntry } from "./types.ts"

const STORAGE_KEY_PREFIX = "game_character_"
const SESSION_KEY = "game_session"
const LOGS_KEY_SUFFIX = "_logs"
const MAX_STORED_LOGS = 200

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
    return data ? (JSON.parse(data) as Character) : null
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
    return data ? (JSON.parse(data) as LogEntry[]) : []
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
