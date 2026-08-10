import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCharacterStorageKey,
  getLogsStorageKey,
  loadCharacterSnapshot,
  loadPersistedLogs,
  saveCharacterSnapshot,
  savePersistedLogs,
} from './persistence.ts';
import type { Character, Item, LogEntry } from './types.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createCharacter(username: string, inventory: Item[] = []): Character {
  return {
    username,
    name: username,
    class: 'warrior',
    level: 1,
    exp: 0,
    expToNext: 100,
    stats: { str: 4, dex: 3, int: 2, vit: 4, luk: 3 },
    hp: 70,
    maxHp: 70,
    gold: 0,
    inventory,
    equipment: { weapon: null, armor: null, accessory: null },
    skills: [],
    skillUsage: {},
    lastActive: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
    inventoryMax: 20,
    favorites: [],
  };
}

test('character and log namespaces cannot collide across usernames', () => {
  assert.notEqual(getLogsStorageKey('alice'), getCharacterStorageKey('alice_logs'));

  const storage = new MemoryStorage();
  const alice = createCharacter('alice');
  const aliceLogs = createCharacter('alice_logs');
  const logs: LogEntry[] = [{ timestamp: 1, text: 'alice log', type: 'info' }];

  saveCharacterSnapshot(alice, storage, () => 10);
  saveCharacterSnapshot(aliceLogs, storage, () => 20);
  savePersistedLogs('alice', logs, storage);

  assert.equal(loadCharacterSnapshot('alice', storage)?.username, 'alice');
  assert.equal(loadCharacterSnapshot('alice_logs', storage)?.username, 'alice_logs');
  assert.deepEqual(loadPersistedLogs('alice', storage), logs);
});

test('legacy snapshots migrate without deleting ambiguous legacy keys', () => {
  const storage = new MemoryStorage();
  const firstAccessory: Item = {
    id: 'warrior_acc_05_common',
    name: '力量护符',
    type: 'equipment',
    slot: 'accessory',
    rarity: 'common',
    description: '',
    minLevel: 5,
    classRequired: 'warrior',
  };
  const secondAccessory: Item = { ...firstAccessory, name: '王者之冠' };
  const legacyCharacter = createCharacter('legacy', [firstAccessory, secondAccessory]);
  const legacyLogs: LogEntry[] = [{ timestamp: 1, text: 'legacy log', type: 'info' }];
  storage.setItem('game_character_legacy', JSON.stringify(legacyCharacter));
  storage.setItem('game_character_legacy_logs', JSON.stringify(legacyLogs));

  const migratedCharacter = loadCharacterSnapshot('legacy', storage);
  const migratedLogs = loadPersistedLogs('legacy', storage);

  assert.ok(migratedCharacter);
  assert.notEqual(migratedCharacter.inventory[0].id, migratedCharacter.inventory[1].id);
  assert.deepEqual(migratedLogs, legacyLogs);
  assert.ok(storage.getItem(getCharacterStorageKey('legacy')));
  assert.ok(storage.getItem(getLogsStorageKey('legacy')));
  assert.ok(storage.getItem('game_character_legacy'));
  assert.ok(storage.getItem('game_character_legacy_logs'));
});
