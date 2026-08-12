import assert from 'node:assert/strict';
import test from 'node:test';

import { getMonsterTableResult, getMonstersWithDrops, getVisibleDrops } from './table-model.ts';
import type { MapleMonster } from './types.ts';

const stats = {
  level: 1,
  experience: 1,
  meso: null,
  hp: 1,
  mp: 0,
  weaponAttack: 1,
  magicAttack: 0,
  weaponDefense: 0,
  magicDefense: 0,
  accuracy: 0,
  avoidability: 0,
  hpRecoveryPer10Seconds: 0,
  mpRecoveryPer10Seconds: 0,
  speed: 0,
  knockback: 1,
};

const monsters: MapleMonster[] = Array.from({ length: 21 }, (_, index) => ({
  id: String(100000 + index),
  name: index === 0 ? '蜗牛' : `测试怪物${index}`,
  imageUrl: null,
  sourceUrl: '',
  stats: { ...stats, level: 21 - index },
  drops:
    index === 1
      ? [
          { id: '4000000', name: '蜗牛壳', category: '其他' },
          { id: '2040001', name: '头盔防御卷轴60%', category: '消耗' },
        ]
      : [],
  traits: { weaknesses: [], resistances: [] },
}));

test('filters monsters by name and drop item without matching IDs', () => {
  assert.equal(
    getMonsterTableResult(monsters, { query: '蜗牛', sortKey: 'level', sortDirection: 'ascending' }).filteredMonsters
      .length,
    2,
  );
  assert.equal(
    getMonsterTableResult(monsters, { query: '100020', sortKey: 'level', sortDirection: 'ascending' }).filteredMonsters
      .length,
    0,
  );
});

test('sorts numerical stats while preserving the complete result set', () => {
  const result = getMonsterTableResult(monsters, { query: '', sortKey: 'level', sortDirection: 'ascending' });

  assert.equal(result.sortedMonsters.length, 21);
  assert.equal(result.sortedMonsters[0].stats.level, 1);
  assert.equal(result.sortedMonsters.at(-1)?.stats.level, 21);
});

test('sorts monsters by drop count', () => {
  const result = getMonsterTableResult(monsters, {
    query: '',
    sortKey: 'dropCount',
    sortDirection: 'descending',
  });

  assert.equal(result.sortedMonsters[0].drops.length, 2);
});

test('sorts a filtered drop query by its visible drop count', () => {
  const oneMatchingDrop: MapleMonster = {
    ...monsters[1],
    name: '单件卷轴怪物',
  };
  const twoMatchingDrops: MapleMonster = {
    ...monsters[2],
    name: '双件卷轴怪物',
    drops: [
      { id: '2040002', name: '披风力量卷轴60%', category: '消耗' },
      { id: '2040003', name: '鞋子跳跃卷轴60%', category: '消耗' },
      { id: '2000001', name: '橙色药水', category: '消耗' },
    ],
  };
  const result = getMonsterTableResult([oneMatchingDrop, twoMatchingDrops], {
    query: '60%',
    sortKey: 'dropCount',
    sortDirection: 'descending',
  });

  assert.deepEqual(
    result.sortedMonsters.map((monster) => monster.name),
    ['双件卷轴怪物', '单件卷轴怪物'],
  );
  assert.deepEqual(
    result.sortedMonsters.map((monster) => getVisibleDrops(monster, '60%').length),
    [2, 1],
  );
});

test('filters empty-drop monsters without mutating the source database', () => {
  const monstersWithDrops = getMonstersWithDrops(monsters);

  assert.equal(monsters.length, 21);
  assert.equal(monstersWithDrops.length, 1);
  assert.ok(monstersWithDrops.every((monster) => monster.drops.length > 0));
});

test('shows only drop items that match a drop query', () => {
  const monster = monsters[1];

  assert.deepEqual(
    getVisibleDrops(monster, '60%').map((drop) => drop.name),
    ['头盔防御卷轴60%'],
  );
  assert.equal(getVisibleDrops(monster, '测试怪物').length, 2);
});
