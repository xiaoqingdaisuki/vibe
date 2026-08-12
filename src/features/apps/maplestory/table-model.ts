import type { MapleMonster, MonsterDrop, MonsterStats } from './types';

export type MonsterSortKey = 'dropCount' | keyof MonsterStats;
export type SortDirection = 'ascending' | 'descending';

interface MonsterTableOptions {
  query: string;
  sortKey: MonsterSortKey;
  sortDirection: SortDirection;
}

export interface MonsterTableResult {
  filteredMonsters: MapleMonster[];
  sortedMonsters: MapleMonster[];
}

// 统一比较字符串，支持怪物名称与掉落道具模糊检索
function containsQuery(monster: MapleMonster, query: string): boolean {
  const searchableText = [monster.name, ...monster.drops.map((drop) => drop.name)].join(' ').toLowerCase();
  return searchableText.includes(query);
}

// 查询命中掉落物时仅返回相关道具，其余查询保留完整掉落列表
export function getVisibleDrops(monster: MapleMonster, query: string): MonsterDrop[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return monster.drops;
  }

  const matchingDrops = monster.drops.filter((drop) => drop.name.toLowerCase().includes(normalizedQuery));
  return matchingDrops.length > 0 ? matchingDrops : monster.drops;
}

// 读取当前筛选上下文中可比较的数值
function getSortValue(monster: MapleMonster, sortKey: MonsterSortKey, query: string): number {
  if (sortKey === 'dropCount') {
    return getVisibleDrops(monster, query).length;
  }

  return monster.stats[sortKey] ?? Number.NEGATIVE_INFINITY;
}

// 筛除未记录掉落道具的怪物，保留原始数组不变
export function getMonstersWithDrops(monsters: MapleMonster[]): MapleMonster[] {
  return monsters.filter((monster) => monster.drops.length > 0);
}

// 派生筛选和排序后的完整怪物结果
export function getMonsterTableResult(
  monsters: MapleMonster[],
  { query, sortKey, sortDirection }: MonsterTableOptions,
): MonsterTableResult {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMonsters = normalizedQuery
    ? monsters.filter((monster) => containsQuery(monster, normalizedQuery))
    : monsters;
  const multiplier = sortDirection === 'ascending' ? 1 : -1;
  const sortedMonsters = filteredMonsters.toSorted((left, right) => {
    const leftValue = getSortValue(left, sortKey, normalizedQuery);
    const rightValue = getSortValue(right, sortKey, normalizedQuery);

    return leftValue < rightValue ? -1 * multiplier : leftValue > rightValue ? multiplier : 0;
  });
  return {
    filteredMonsters,
    sortedMonsters,
  };
}
