import type { ScoreResult, Tile, Wind } from './types.ts';
import { toCounts } from './tiles.ts';

interface Group {
  readonly type: 'sequence' | 'triplet';
  readonly start: number;
}

interface WinningShape {
  readonly pair: number;
  readonly groups: readonly Group[];
}

// 深度优先搜索标准四面子一雀头的合法拆解
function findStandardShape(counts: readonly number[]): WinningShape | null {
  const working = [...counts];
  for (let pair = 0; pair < working.length; pair += 1) {
    if (working[pair] < 2) continue;
    working[pair] -= 2;
    const groups: Group[] = [];
    if (consumeGroups(working, groups)) return { pair, groups };
    working[pair] += 2;
  }
  return null;
}

// 递归消耗刻子或顺子，直到所有牌都被分组
function consumeGroups(counts: number[], groups: Group[]): boolean {
  const first = counts.findIndex((count) => count > 0);
  if (first === -1) return groups.length === 4;
  if (groups.length >= 4) return false;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    groups.push({ type: 'triplet', start: first });
    if (consumeGroups(counts, groups)) return true;
    groups.pop();
    counts[first] += 3;
  }

  const isNumbered = first < 27;
  const rank = (first % 9) + 1;
  if (isNumbered && rank <= 7 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    groups.push({ type: 'sequence', start: first });
    if (consumeGroups(counts, groups)) return true;
    groups.pop();
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  return false;
}

// 判断手牌是否满足七对子形
function isSevenPairs(counts: readonly number[]): boolean {
  return counts.filter((count) => count === 2).length === 7;
}

// 判断手牌是否满足国士无双形
function isThirteenOrphans(counts: readonly number[]): boolean {
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return terminals.every((kind) => counts[kind] > 0) && terminals.some((kind) => counts[kind] > 1);
}

// 判断牌型是否全部由中张组成
function isAllSimples(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => tile.suit !== 'honor' && tile.rank >= 2 && tile.rank <= 8);
}

// 判断牌型是否包含役牌刻子
function countValueTriplets(shape: WinningShape, counts: readonly number[], roundWind: Wind): number {
  const valueKinds = new Set([31, 32, 33, 27 + windKind(roundWind)]);
  return shape.groups.filter((group) => group.type === 'triplet' && valueKinds.has(group.start)).length;
}

// 将场风映射到 34 牌种中的风牌索引
function windKind(wind: Wind): number {
  return { east: 0, south: 1, west: 2, north: 3 }[wind];
}

// 计算基础符数，给出可解释的训练结果
function calculateFu(shape: WinningShape | null, tiles: readonly Tile[], tsumo: boolean): number {
  if (isSevenPairs(toCounts(tiles))) return 25;
  let fu = tsumo ? 22 : 30;
  if (shape) {
    for (const group of shape.groups) {
      if (group.type !== 'triplet') continue;
      const terminalOrHonor = group.start >= 27 || group.start % 9 === 0 || group.start % 9 === 8;
      fu += terminalOrHonor ? 8 : 4;
    }
  }
  return Math.ceil(fu / 10) * 10;
}

// 判断牌型是否已经和牌，包括标准形、七对子和国士
export function isWinningHand(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = toCounts(tiles);
  return isSevenPairs(counts) || isThirteenOrphans(counts) || findStandardShape(counts) !== null;
}

// 判断 13 张牌是否处于听牌状态，供立直动作和训练提示使用
export function isTenpai(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 13) return false;
  const counts = toCounts(tiles);
  return counts.some((count, kind) => {
    if (count >= 4) return false;
    const suit = kind >= 27 ? 'honor' : (['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)];
    const rank = kind >= 27 ? kind - 26 : (kind % 9) + 1;
    const candidate: Tile = { id: -1, kind, suit, rank, red: false };
    return isWinningHand([...tiles, candidate]);
  });
}

// 根据日麻基础役种计算训练用的番、符和总点数
export function scoreHand(
  tiles: readonly Tile[],
  options: { tsumo: boolean; riichi: boolean; roundWind: Wind; dealer: boolean },
): ScoreResult {
  const counts = toCounts(tiles);
  const shape = findStandardShape(counts);
  const yaku: string[] = [];
  let han = 0;

  if (options.tsumo) {
    yaku.push('门清自摸');
    han += 1;
  }
  if (options.riichi) {
    yaku.push('立直');
    han += 1;
  }
  if (isSevenPairs(counts)) {
    yaku.push('七对子');
    han += 2;
  } else if (isThirteenOrphans(counts)) {
    yaku.push('国士无双');
    han += 13;
  } else {
    if (isAllSimples(tiles)) {
      yaku.push('断幺九');
      han += 1;
    }
    if (shape) {
      const valueTriplets = countValueTriplets(shape, counts, options.roundWind);
      if (valueTriplets > 0) {
        yaku.push('役牌');
        han += valueTriplets;
      }
      if (shape.groups.every((group) => group.type === 'sequence')) {
        yaku.push('平和');
        han += 1;
      }
    }
  }

  const safeHan = Math.max(han, 1);
  const fu = calculateFu(shape, tiles, options.tsumo);
  const base = safeHan >= 13 ? 8000 : Math.min(2000, fu * 2 ** (safeHan + 2));
  const roundedBase = Math.ceil(base / 100) * 100;
  const points = options.tsumo ? roundedBase * (options.dealer ? 6 : 4) : roundedBase * (options.dealer ? 6 : 4);

  return { han: safeHan, fu, points, yaku };
}

// 计算一个简单但稳定的牌效率评价分数供 AI 选择弃牌
export function evaluateDiscard(tile: Tile, hand: readonly Tile[]): number {
  const others = hand.filter((candidate) => candidate.id !== tile.id);
  const counts = toCounts(others);
  const neighborCount = [tile.kind - 2, tile.kind - 1, tile.kind + 1, tile.kind + 2].filter(
    (kind) => kind >= 0 && kind < 27 && Math.floor(kind / 9) === Math.floor(tile.kind / 9) && counts[kind] > 0,
  ).length;
  const duplicateCount = counts[tile.kind] ?? 0;
  const terminalPenalty = tile.suit === 'honor' || tile.rank === 1 || tile.rank === 9 ? 2 : 0;
  const redBonus = tile.red ? 3 : 0;
  return duplicateCount * 12 + neighborCount * 4 - terminalPenalty - redBonus;
}
