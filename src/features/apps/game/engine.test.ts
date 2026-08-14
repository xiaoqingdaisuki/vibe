import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from './engine.ts';
import { createGeneratedEquipmentId, ITEMS, recalcItemStats, SHOP_ITEMS } from './static-data.ts';
import type { Character, ClassType, EquipSlot, Item, ItemDef, ItemRarity } from './types.ts';

function createEquipment(id: string, name: string, rarity: ItemRarity, str = 4): Item {
  return {
    id,
    name,
    type: 'equipment',
    slot: 'weapon',
    stats: { str },
    rarity,
    description: name,
    minLevel: 1,
    classRequired: 'warrior',
  };
}

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    username: 'tester',
    name: 'tester',
    class: 'warrior',
    level: 30,
    exp: 0,
    expToNext: 1_000_000,
    stats: { str: 20, dex: 3, int: 2, vit: 20, luk: 3 },
    hp: 70,
    maxHp: 70,
    gold: 0,
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null },
    skills: [],
    skillUsage: {},
    lastActive: Date.now(),
    createdAt: '2026-08-10T00:00:00.000Z',
    inventoryMax: 20,
    favorites: [],
    ...overrides,
  };
}

test('generated accessory ids retain the original accessory discriminator', () => {
  const first: ItemDef = {
    id: 'warrior_acc_01',
    name: '力量护符',
    type: 'equipment',
    slot: 'accessory',
    rarity: 'common',
    description: '',
    minLevel: 3,
  };
  const second: ItemDef = { ...first, id: 'warrior_acc_08', name: '王者之冠' };

  assert.notEqual(createGeneratedEquipmentId(first, 10, 'rare'), createGeneratedEquipmentId(second, 10, 'rare'));
});

test('bulk selling targets the exact item variant and keeps protected same-name items', () => {
  const common = createEquipment('shared_common', '同名长剑', 'common');
  const mythic = createEquipment('shared_mythic', '同名长剑', 'mythic');
  const engine = new GameEngine(createCharacter({ inventory: [common, mythic] }));

  engine.performAction({ type: 'bulkSell', itemIds: [common.id] });
  assert.deepEqual(
    engine.character.inventory.map((item) => item.id),
    [mythic.id],
  );
  assert.equal(engine.character.gold, 10);

  engine.performAction({ type: 'bulkSell', itemIds: [mythic.id] });
  assert.deepEqual(
    engine.character.inventory.map((item) => item.id),
    [mythic.id],
  );
  assert.equal(engine.character.gold, 10);
});

test('full-inventory equipment swaps are atomic and unequip refuses without space', () => {
  const filler = createEquipment('filler', '填充装备', 'common');
  const nextWeapon = createEquipment('next', '新武器', 'epic');
  const previousWeapon = createEquipment('previous', '旧武器', 'rare');
  const engine = new GameEngine(
    createCharacter({
      inventory: [filler, nextWeapon],
      inventoryMax: 2,
      equipment: { weapon: previousWeapon, armor: null, accessory: null },
    }),
  );

  engine.performAction({ type: 'equip', slot: 'weapon', itemId: nextWeapon.id });
  assert.equal(engine.character.equipment.weapon?.id, nextWeapon.id);
  assert.deepEqual(
    engine.character.inventory.map((item) => item.id),
    [filler.id, previousWeapon.id],
  );

  const beforeUnequip = structuredClone(engine.character);
  const result = engine.performAction({ type: 'unequip', slot: 'weapon' });
  assert.deepEqual(engine.character, beforeUnequip);
  assert.match(result.logs[0]?.text ?? '', /背包已满/);
});

test('a full inventory rejects shop purchases without charging gold', () => {
  const shopItem = SHOP_ITEMS.find((entry) => ITEMS.some((item) => item.id === entry.itemId));
  assert.ok(shopItem);
  const engine = new GameEngine(
    createCharacter({
      gold: shopItem.price * 2,
      inventory: [createEquipment('filler', '填充装备', 'common')],
      inventoryMax: 1,
    }),
  );
  const goldBefore = engine.character.gold;
  const inventoryBefore = structuredClone(engine.character.inventory);

  const result = engine.performAction({ type: 'buy', itemId: shopItem.itemId });
  assert.equal(engine.character.gold, goldBefore);
  assert.deepEqual(engine.character.inventory, inventoryBefore);
  assert.match(result.logs[0]?.text ?? '', /背包空间不足/);
});

test('warrior temporary weapon health never accumulates into persistent hp', () => {
  const weapon = createEquipment('strong_weapon', '强力武器', 'legendary', 1_000);
  const engine = new GameEngine(
    createCharacter({
      level: 1,
      stats: { str: 20, dex: 3, int: 2, vit: 20, luk: 3 },
      equipment: { weapon, armor: null, accessory: null },
    }),
  );

  assert.equal(engine.runCombat(1).victory, true);
  assert.ok(engine.character.hp >= 0 && engine.character.hp <= engine.character.maxHp);
  assert.equal(engine.runCombat(1).victory, true);
  assert.ok(engine.character.hp >= 0 && engine.character.hp <= engine.character.maxHp);
});

test('long offline progress batches chest rewards across every rarity into the inventory', () => {
  const now = Date.now();
  const engine = new GameEngine(
    createCharacter({
      level: 1,
      expToNext: 1_000_000,
      stats: { str: 1_000, dex: 3, int: 2, vit: 1_000, luk: 3 },
      hp: 1_000_000,
      maxHp: 1_000_000,
      lastActive: now - 15 * 60 * 1000,
    }),
  );
  const originalNow = Date.now;
  const originalRandom = Math.random;

  Date.now = () => now;
  Math.random = () => 0;
  try {
    const result = engine.calculateOfflineProgress();
    const chestIds = result.totalItemsGained.map((item) => item.id).toSorted();

    assert.deepEqual(chestIds, [
      'common_chest',
      'epic_chest',
      'legendary_chest',
      'mythic_chest',
      'rare_chest',
      'transcendent_chest',
      'uncommon_chest',
    ]);
    assert.deepEqual(
      engine.character.inventory.map((item) => item.id).toSorted(),
      chestIds,
    );
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

test('offline chest reward rolls cap at twenty batches', () => {
  const now = Date.now();
  const engine = new GameEngine(
    createCharacter({
      level: 1,
      expToNext: 1_000_000,
      stats: { str: 1_000, dex: 3, int: 2, vit: 1_000, luk: 3 },
      hp: 1_000_000,
      maxHp: 1_000_000,
      inventoryMax: 200,
      lastActive: now - 8 * 60 * 60 * 1000,
    }),
  );
  const originalNow = Date.now;
  const originalRandom = Math.random;

  Date.now = () => now;
  Math.random = () => 0;
  try {
    const result = engine.calculateOfflineProgress();

    assert.equal(result.totalItemsGained.length, 20 * 7);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});

function createChestEquipment(classId: ClassType, slot: EquipSlot, rarity: ItemRarity, itemLevel: number): Item {
  const baseItem = ITEMS.find(
    (item) => item.type === 'equipment' && item.classRequired === classId && item.slot === slot,
  );
  assert.ok(baseItem);
  const { stats, scaleWithClass } = recalcItemStats({ ...baseItem, minLevel: itemLevel }, rarity);

  return {
    ...baseItem,
    stats,
    rarity,
    scaleWithClass,
    minLevel: itemLevel,
  };
}

test('gear progression comfortably defeats the matching level for every class', () => {
  const profiles: Record<25 | 29 | 30, Record<ClassType, Pick<Character, 'stats' | 'maxHp'>>> = {
    25: {
      warrior: { stats: { str: 52, dex: 27, int: 26, vit: 52, luk: 27 }, maxHp: 2_380 },
      mage: { stats: { str: 26, dex: 27, int: 52, vit: 27, luk: 27 }, maxHp: 1_304 },
      rogue: { stats: { str: 27, dex: 53, int: 26, vit: 27, luk: 52 }, maxHp: 1_329 },
    },
    29: {
      warrior: { stats: { str: 60, dex: 31, int: 30, vit: 60, luk: 31 }, maxHp: 3_382 },
      mage: { stats: { str: 30, dex: 31, int: 60, vit: 31, luk: 31 }, maxHp: 1_837 },
      rogue: { stats: { str: 31, dex: 61, int: 30, vit: 31, luk: 60 }, maxHp: 1_868 },
    },
    30: {
      warrior: { stats: { str: 62, dex: 32, int: 31, vit: 62, luk: 32 }, maxHp: 3_675 },
      mage: { stats: { str: 31, dex: 32, int: 62, vit: 32, luk: 32 }, maxHp: 1_992 },
      rogue: { stats: { str: 32, dex: 63, int: 31, vit: 32, luk: 62 }, maxHp: 2_025 },
    },
  };
  const loadouts: Array<{
    level: 25 | 29 | 30;
    rarities: Record<EquipSlot, ItemRarity>;
    maxRounds: number;
  }> = [
    { level: 25, rarities: { weapon: 'epic', armor: 'epic', accessory: 'epic' }, maxRounds: 10 },
    { level: 29, rarities: { weapon: 'legendary', armor: 'legendary', accessory: 'legendary' }, maxRounds: 10 },
    { level: 30, rarities: { weapon: 'legendary', armor: 'mythic', accessory: 'legendary' }, maxRounds: 10 },
    { level: 30, rarities: { weapon: 'transcendent', armor: 'transcendent', accessory: 'transcendent' }, maxRounds: 1 },
  ];
  const originalRandom = Math.random;

  Math.random = () => 0.5;
  try {
    for (const loadout of loadouts) {
      for (const classId of Object.keys(profiles[loadout.level]) as ClassType[]) {
        const profile = profiles[loadout.level][classId];
        const engine = new GameEngine(
          createCharacter({
            class: classId,
            level: loadout.level,
            stats: profile.stats,
            hp: profile.maxHp,
            maxHp: profile.maxHp,
            equipment: {
              weapon: createChestEquipment(classId, 'weapon', loadout.rarities.weapon, loadout.level),
              armor: createChestEquipment(classId, 'armor', loadout.rarities.armor, loadout.level),
              accessory: createChestEquipment(classId, 'accessory', loadout.rarities.accessory, loadout.level),
            },
            skills: [
              {
                skillId: classId === 'mage' ? 'fireball' : classId === 'rogue' ? 'backstab' : 'power_strike',
                level: 1,
              },
            ],
          }),
        );
        const result = engine.runCombat(loadout.level);

        assert.equal(result.victory, true, `${classId} should defeat a level ${loadout.level} monster`);
        assert.ok(
          result.rounds <= loadout.maxRounds,
          `${classId} should win level ${loadout.level} within ${loadout.maxRounds} rounds`,
        );
      }
    }
  } finally {
    Math.random = originalRandom;
  }
});
