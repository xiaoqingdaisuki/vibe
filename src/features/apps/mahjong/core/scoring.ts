import type { Meld, ScoreResult, Tile, Wind } from './types.ts';
import { TILE_KIND_COUNT, toCounts } from './tiles.ts';

interface Group {
  readonly type: 'sequence' | 'triplet';
  readonly start: number;
}

interface WinningShape {
  readonly pair: number;
  readonly groups: readonly Group[];
}

// 深度优先搜索标准四面子一雀头的合法拆解
function findStandardShape(counts: readonly number[], requiredGroups: number): WinningShape | null {
  const working = [...counts];
  for (let pair = 0; pair < working.length; pair += 1) {
    if (working[pair] < 2) continue;
    working[pair] -= 2;
    const groups: Group[] = [];
    if (consumeGroups(working, groups, requiredGroups)) return { pair, groups };
    working[pair] += 2;
  }
  return null;
}

// 递归消耗刻子或顺子，直到所有牌都被分组
function consumeGroups(counts: number[], groups: Group[], requiredGroups: number): boolean {
  const first = counts.findIndex((count) => count > 0);
  if (first === -1) return groups.length === requiredGroups;
  if (groups.length >= requiredGroups) return false;

  if (counts[first] >= 3) {
    counts[first] -= 3;
    groups.push({ type: 'triplet', start: first });
    if (consumeGroups(counts, groups, requiredGroups)) return true;
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
    if (consumeGroups(counts, groups, requiredGroups)) return true;
    groups.pop();
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  return false;
}

// 判断牌型是否满足七对子形
function isSevenPairs(counts: readonly number[], melds: readonly Meld[]): boolean {
  return (
    melds.length === 0 &&
    counts.reduce((total, count) => total + count, 0) === 14 &&
    counts.filter((count) => count === 2).length === 7
  );
}

// 判断牌型是否满足国士无双形
function isThirteenOrphans(counts: readonly number[], melds: readonly Meld[]): boolean {
  if (melds.length > 0 || counts.reduce((total, count) => total + count, 0) !== 14) return false;
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return terminals.every((kind) => counts[kind] > 0) && terminals.some((kind) => counts[kind] > 1);
}

// 判断牌型是否全部由中张组成
function isAllSimples(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => tile.suit !== 'honor' && tile.rank >= 2 && tile.rank <= 8);
}

// 判断牌型是否包含役牌刻子或副露刻子
function countValueTriplets(shape: WinningShape | null, melds: readonly Meld[], roundWind: Wind): number {
  const valueKinds = new Set([31, 32, 33, 27 + windKind(roundWind)]);
  const concealedValueTriplets =
    shape?.groups.filter((group) => group.type === 'triplet' && valueKinds.has(group.start)).length ?? 0;
  const openValueTriplets = melds.filter((meld) => {
    const first = meld.tiles[0];
    return meld.type !== 'chi' && first !== undefined && valueKinds.has(first.kind);
  }).length;
  return concealedValueTriplets + openValueTriplets;
}

// 将场风映射到 34 牌种中的风牌索引
function windKind(wind: Wind): number {
  return { east: 0, south: 1, west: 2, north: 3 }[wind];
}

// 计算基础符数，给出可解释的训练结果
function calculateFu(
  shape: WinningShape | null,
  tiles: readonly Tile[],
  melds: readonly Meld[],
  tsumo: boolean,
  closed: boolean,
): number {
  if (isSevenPairs(toCounts(tiles), melds)) return 25;
  let fu = 20;
  if (tsumo) fu += 2;
  if (!tsumo && closed) fu += 10;
  if (shape) {
    for (const group of shape.groups) {
      if (group.type !== 'triplet') continue;
      const terminalOrHonor = group.start >= 27 || group.start % 9 === 0 || group.start % 9 === 8;
      fu += terminalOrHonor ? 8 : 4;
    }
  }
  for (const meld of melds) {
    if (meld.type === 'chi') continue;
    const first = meld.tiles[0];
    const terminalOrHonor = first !== undefined && (first.kind >= 27 || first.rank === 1 || first.rank === 9);
    const baseFu = meld.type === 'kan' ? 16 : 4;
    fu += terminalOrHonor ? baseFu * 2 : baseFu;
  }
  if (fu === 20 && tiles.length > 0 && !closed) return 30;
  return Math.ceil(fu / 10) * 10;
}

// 判断牌型是否已经和牌，包括标准形、七对子和国士
export function isWinningHand(tiles: readonly Tile[], melds: readonly Meld[] = []): boolean {
  const requiredGroups = 4 - melds.length;
  if (requiredGroups < 0 || tiles.length !== requiredGroups * 3 + 2) return false;
  const counts = toCounts(tiles);
  return (
    isSevenPairs(counts, melds) ||
    isThirteenOrphans(counts, melds) ||
    findStandardShape(counts, requiredGroups) !== null
  );
}

// 判断当前手牌是否满足至少一个可用于和牌的基础役
export function hasYaku(
  tiles: readonly Tile[],
  options: {
    readonly melds?: readonly Meld[];
    readonly riichi?: boolean;
    readonly tsumo?: boolean;
    readonly roundWind?: Wind;
  },
): boolean {
  return (
    scoreHand(tiles, {
      tsumo: options.tsumo ?? false,
      riichi: options.riichi ?? false,
      roundWind: options.roundWind ?? 'east',
      dealer: false,
      melds: options.melds,
    }).han > 0
  );
}

// 判断 13 张牌是否处于听牌状态，供立直动作和训练提示使用
export function isTenpai(tiles: readonly Tile[], melds: readonly Meld[] = []): boolean {
  return getTenpaiWaits(tiles, melds).length > 0;
}

// 为指定牌种创建无实体编号的听牌候选，供规则和界面共同使用
function createWaitCandidate(kind: number): Tile {
  const suit = kind >= 27 ? 'honor' : ((['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)] ?? 'honor');
  const rank = kind >= 27 ? kind - 26 : (kind % 9) + 1;
  return { id: -1, kind, suit, rank, red: false };
}

// 返回当前手牌对应的具体听牌，供振听、立直确认和界面提示共同使用
export function getTenpaiWaits(tiles: readonly Tile[], melds: readonly Meld[] = []): Tile[] {
  const requiredGroups = 4 - melds.length;
  if (requiredGroups < 0 || tiles.length !== requiredGroups * 3 + 1) return [];
  const counts = toCounts(tiles);
  const waits: Tile[] = [];
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if ((counts[kind] ?? 0) >= 4) continue;
    const candidate = createWaitCandidate(kind);
    if (isWinningHand([...tiles, candidate], melds)) waits.push(candidate);
  }
  return waits;
}

// 根据日麻基础役种和自摸/荣和方式计算番、符与实际收付点
export function scoreHand(
  tiles: readonly Tile[],
  options: {
    readonly tsumo: boolean;
    readonly riichi: boolean;
    readonly roundWind: Wind;
    readonly dealer: boolean;
    readonly melds?: readonly Meld[];
  },
): ScoreResult {
  const melds = options.melds ?? [];
  const counts = toCounts(tiles);
  const requiredGroups = 4 - melds.length;
  const shape = requiredGroups >= 0 ? findStandardShape(counts, requiredGroups) : null;
  const allTiles = [...tiles, ...melds.flatMap((meld) => meld.tiles)];
  const closed = melds.every((meld) => !meld.open);
  const yaku: string[] = [];
  let han = 0;

  if (options.tsumo && closed) {
    yaku.push('门清自摸');
    han += 1;
  }
  if (options.riichi && closed) {
    yaku.push('立直');
    han += 1;
  }
  if (isSevenPairs(counts, melds)) {
    yaku.push('七对子');
    han += 2;
  } else if (isThirteenOrphans(counts, melds)) {
    yaku.push('国士无双');
    han += 13;
  } else {
    if (isAllSimples(allTiles)) {
      yaku.push('断幺九');
      han += 1;
    }
    const valueTriplets = countValueTriplets(shape, melds, options.roundWind);
    if (valueTriplets > 0) {
      yaku.push('役牌');
      han += valueTriplets;
    }
    if (
      closed &&
      melds.length === 0 &&
      shape !== null &&
      shape.groups.every((group) => group.type === 'sequence') &&
      !new Set([27, 28, 29, 30, 31, 32, 33]).has(shape.pair)
    ) {
      yaku.push('平和');
      han += 1;
    }
  }

  const fu = calculateFu(shape, tiles, melds, options.tsumo, closed);
  if (han === 0) return { han: 0, fu, points: 0, yaku };

  const base = han >= 13 ? 8000 : Math.min(2000, fu * 2 ** (han + 2));
  const roundedBase = Math.ceil(base / 100) * 100;
  if (!options.tsumo) {
    const points = Math.ceil((roundedBase * (options.dealer ? 6 : 4)) / 100) * 100;
    return { han, fu, points, yaku };
  }

  if (options.dealer) {
    const childPayment = Math.ceil((roundedBase * 2) / 100) * 100;
    return { han, fu, points: childPayment * 3, yaku, childPayment };
  }

  const dealerPayment = Math.ceil((roundedBase * 2) / 100) * 100;
  const childPayment = Math.ceil(roundedBase / 100) * 100;
  return {
    han,
    fu,
    points: dealerPayment + childPayment * 2,
    yaku,
    dealerPayment,
    childPayment,
  };
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
