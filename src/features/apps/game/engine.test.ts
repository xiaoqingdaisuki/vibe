import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from './engine.ts';
import { createGeneratedEquipmentId, ITEMS, SHOP_ITEMS } from './static-data.ts';
import type { Character, Item, ItemDef, ItemRarity } from './types.ts';

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
