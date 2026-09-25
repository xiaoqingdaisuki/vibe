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

interface FuResult {
  readonly fu: number;
  readonly details: readonly string[];
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

// 判断牌种是否为幺九牌或字牌
function isTerminalOrHonor(kind: number): boolean {
  return kind >= 27 || kind % 9 === 0 || kind % 9 === 8;
}

// 判断牌型是否包含自风、场风、三元牌刻子或副露刻子
function countValueTriplets(
  shape: WinningShape | null,
  melds: readonly Meld[],
  roundWind: Wind,
  seatWind: Wind,
): number {
  const valueKinds = [31, 32, 33, 27 + windKind(roundWind), 27 + windKind(seatWind)];
  const tripletKinds = [
    ...(shape?.groups.filter((group) => group.type === 'triplet').map((group) => group.start) ?? []),
    ...melds.filter((meld) => meld.type !== 'chi').map((meld) => meld.tiles[0]?.kind),
  ];
  return tripletKinds.reduce((total, kind) => total + valueKinds.filter((value) => value === kind).length, 0);
}

// 将场风映射到 34 牌种中的风牌索引
function windKind(wind: Wind): number {
  return { east: 0, south: 1, west: 2, north: 3 }[wind];
}

// 将宝牌指示牌映射为实际宝牌牌种
function nextDoraKind(kind: number): number {
  if (kind < 27) return Math.floor(kind / 9) * 9 + ((kind + 1) % 9);
  if (kind < 31) return 27 + ((kind - 27 + 1) % 4);
  return 31 + ((kind - 31 + 1) % 3);
}

// 给结算面板提供每个役种的实际番数
function getYakuHan(name: string, closed: boolean, valueTriplets: number): number {
  if (name.startsWith('宝牌 ')) return Number(name.slice(3)) || 0;
  if (name === '役牌') return valueTriplets;
  if (['国士无双十三面', '四暗刻单骑', '大四喜'].includes(name)) return 26;
  if (['国士无双', '大三元', '小四喜', '字一色', '清老头', '绿一色', '四杠子', '四暗刻', '九莲宝灯'].includes(name))
    return 13;
  if (name === '清一色') return closed ? 6 : 5;
  if (name === '混一色' || name === '纯全带幺九') return closed ? 3 : 2;
  if (name === '混全带幺九' || name === '三色同顺' || name === '一气通贯') return closed ? 2 : 1;
  if (name === '二盃口') return 3;
  if (['七对子', '对对和', '三暗刻', '三杠子', '小三元', '混老头', '三色同刻'].includes(name)) return 2;
  return 1;
}

// 计算基础符数，给出可解释的训练结果
function calculateFu(
  shape: WinningShape | null,
  tiles: readonly Tile[],
  melds: readonly Meld[],
  tsumo: boolean,
  closed: boolean,
  winningTile?: Tile,
  roundWind: Wind = 'east',
  seatWind: Wind = 'east',
): FuResult {
  if (isSevenPairs(toCounts(tiles), melds)) return { fu: 25, details: ['七对子固定 25 符'] };
  let fu = 20;
  const details = ['底符 20'];
  const pinfu = shape !== null && isPinfu(shape, melds, winningTile, roundWind, seatWind);
  if (pinfu && tsumo) return { fu: 20, details: ['平和自摸固定 20 符'] };
  if (tsumo) {
    fu += 2;
    details.push('自摸 +2');
  }
  if (!tsumo && closed) {
    fu += 10;
    details.push('门清荣和 +10');
  }
  if (shape) {
    const pairFu =
      (shape.pair >= 31 ? 2 : 0) +
      (shape.pair === 27 + windKind(roundWind) ? 2 : 0) +
      (shape.pair === 27 + windKind(seatWind) ? 2 : 0);
    if (pairFu > 0) {
      fu += pairFu;
      details.push(`役牌雀头 +${pairFu}`);
    }
    const waitFu = winningTile && !pinfu ? getWaitFu(shape, winningTile.kind) : 0;
    if (waitFu > 0) {
      fu += waitFu;
      details.push('特殊听牌 +2');
    }
    for (const group of shape.groups) {
      if (group.type !== 'triplet') continue;
      const terminalOrHonor = group.start >= 27 || group.start % 9 === 0 || group.start % 9 === 8;
      const completedByRon = !tsumo && winningTile?.kind === group.start;
      const tripletFu = terminalOrHonor ? (completedByRon ? 4 : 8) : completedByRon ? 2 : 4;
      fu += tripletFu;
      details.push(`刻子 +${tripletFu}`);
    }
  }
  for (const meld of melds) {
    if (meld.type === 'chi') continue;
    const first = meld.tiles[0];
    const terminalOrHonor = first !== undefined && (first.kind >= 27 || first.rank === 1 || first.rank === 9);
    const baseFu = meld.type === 'kan' ? (meld.open ? 8 : 16) : meld.open ? 2 : 4;
    const meldFu = terminalOrHonor ? baseFu * 2 : baseFu;
    fu += meldFu;
    details.push(`${meld.type === 'kan' ? '杠子' : '碰牌'} +${meldFu}`);
  }
  if (fu === 20 && !tsumo) return { fu: 30, details: [...details, '荣和最低 30 符'] };
  const roundedFu = Math.ceil(fu / 10) * 10;
  if (roundedFu !== fu) details.push(`进位至 ${roundedFu} 符`);
  return { fu: roundedFu, details };
}

// 判断顺子和牌是否满足两面听及无役牌雀头
function isPinfu(
  shape: WinningShape,
  melds: readonly Meld[],
  winningTile: Tile | undefined,
  roundWind: Wind,
  seatWind: Wind,
): boolean {
  if (!winningTile || melds.length > 0 || shape.groups.some((group) => group.type !== 'sequence')) return false;
  if ([31, 32, 33, 27 + windKind(roundWind), 27 + windKind(seatWind)].includes(shape.pair)) return false;
  return shape.groups.some((group) => {
    const rank = (group.start % 9) + 1;
    return (winningTile.kind === group.start && rank < 7) || (winningTile.kind === group.start + 2 && rank > 1);
  });
}

// 计算单骑、嵌张与边张等待的附加符数
function getWaitFu(shape: WinningShape, winningKind: number): number {
  if (shape.pair === winningKind) return 2;
  const canBeRyanmen = shape.groups.some((group) => {
    if (group.type !== 'sequence') return false;
    const rank = (group.start % 9) + 1;
    return (group.start === winningKind && rank < 7) || (group.start + 2 === winningKind && rank > 1);
  });
  if (canBeRyanmen) return 0;
  const isLimitedWait = shape.groups.some((group) => {
    if (group.type !== 'sequence') return false;
    const rank = (group.start % 9) + 1;
    return (
      group.start + 1 === winningKind ||
      (rank === 1 && group.start + 2 === winningKind) ||
      (rank === 7 && group.start === winningKind)
    );
  });
  return isLimitedWait ? 2 : 0;
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
    readonly seatWind?: Wind;
  },
): boolean {
  return (
    scoreHand(tiles, {
      tsumo: options.tsumo ?? false,
      riichi: options.riichi ?? false,
      roundWind: options.roundWind ?? 'east',
      seatWind: options.seatWind ?? 'east',
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
  const ownedCounts = toCounts([...tiles, ...melds.flatMap((meld) => meld.tiles)]);
  const waits: Tile[] = [];
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if ((ownedCounts[kind] ?? 0) >= 4) continue;
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
    readonly seatWind: Wind;
    readonly dealer: boolean;
    readonly melds?: readonly Meld[];
    readonly winningTile?: Tile;
    readonly doraIndicators?: readonly Tile[];
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
  const sevenPairs = isSevenPairs(counts, melds);
  const thirteenOrphans = isThirteenOrphans(counts, melds);
  if (sevenPairs) {
    yaku.push('七对子');
    han += 2;
  } else if (thirteenOrphans) {
    yaku.push('国士无双');
    han += 13;
  } else {
    const valueTriplets = countValueTriplets(shape, melds, options.roundWind, options.seatWind);
    if (valueTriplets > 0) {
      yaku.push('役牌');
      han += valueTriplets;
    }
    if (shape && isPinfu(shape, melds, options.winningTile, options.roundWind, options.seatWind)) {
      yaku.push('平和');
      han += 1;
    }
    if (
      shape &&
      shape.groups.every((group) => group.type === 'triplet') &&
      melds.every((meld) => meld.type !== 'chi')
    ) {
      yaku.push('对对和');
      han += 2;
    }
    if (shape && closed) {
      const sequences = shape.groups.filter((group) => group.type === 'sequence').map((group) => group.start);
      const duplicateSequences = new Set(
        sequences.filter((start) => sequences.filter((candidate) => candidate === start).length >= 2),
      );
      if (duplicateSequences.size >= 2) {
        yaku.push('二盃口');
        han += 3;
      } else if (duplicateSequences.size === 1) {
        yaku.push('一盃口');
        han += 1;
      }
    }
    const allGroups = [
      ...(shape?.groups ?? []),
      ...melds.map((meld) => ({
        type: meld.type === 'chi' ? ('sequence' as const) : ('triplet' as const),
        start: meld.tiles[0]?.kind ?? -1,
      })),
    ];
    for (const start of [0, 1, 2, 3, 4, 5, 6]) {
      if (
        [start, start + 9, start + 18].every((kind) =>
          allGroups.some((group) => group.type === 'sequence' && group.start === kind),
        )
      ) {
        yaku.push('三色同顺');
        han += closed ? 2 : 1;
        break;
      }
    }
    for (const suitStart of [0, 9, 18]) {
      if (
        [suitStart, suitStart + 3, suitStart + 6].every((kind) =>
          allGroups.some((group) => group.type === 'sequence' && group.start === kind),
        )
      ) {
        yaku.push('一气通贯');
        han += closed ? 2 : 1;
        break;
      }
    }
    for (let rank = 0; rank < 9; rank += 1) {
      if (
        [rank, rank + 9, rank + 18].every((kind) =>
          allGroups.some((group) => group.type === 'triplet' && group.start === kind),
        )
      ) {
        yaku.push('三色同刻');
        han += 2;
        break;
      }
    }
    const concealedTriplets =
      (shape?.groups.filter(
        (group) => group.type === 'triplet' && (options.tsumo || group.start !== options.winningTile?.kind),
      ).length ?? 0) + melds.filter((meld) => meld.type === 'kan' && !meld.open).length;
    if (concealedTriplets >= 3) {
      yaku.push('三暗刻');
      han += 2;
    }
    if (melds.filter((meld) => meld.type === 'kan').length >= 3) {
      yaku.push('三杠子');
      han += 2;
    }
    const dragonTriplets = [31, 32, 33].filter((kind) =>
      allGroups.some((group) => group.type === 'triplet' && group.start === kind),
    );
    if (dragonTriplets.length === 2 && [31, 32, 33].some((kind) => kind === shape?.pair)) {
      yaku.push('小三元');
      han += 2;
    }
    const hasHonor = allTiles.some((tile) => tile.suit === 'honor');
    const allGroupsContainTerminal = allGroups.every((group) =>
      group.type === 'sequence' ? group.start % 9 === 0 || group.start % 9 === 6 : isTerminalOrHonor(group.start),
    );
    if (
      shape &&
      allGroupsContainTerminal &&
      isTerminalOrHonor(shape.pair) &&
      allGroups.some((group) => group.type === 'sequence')
    ) {
      yaku.push(hasHonor ? '混全带幺九' : '纯全带幺九');
      han += hasHonor ? (closed ? 2 : 1) : closed ? 3 : 2;
    }
  }

  if (!thirteenOrphans && isAllSimples(allTiles)) {
    yaku.push('断幺九');
    han += 1;
  }
  if (!thirteenOrphans && allTiles.every((tile) => isTerminalOrHonor(tile.kind))) {
    yaku.push('混老头');
    han += 2;
  }
  const numberedSuits = new Set(allTiles.filter((tile) => tile.suit !== 'honor').map((tile) => tile.suit));
  if (!thirteenOrphans && numberedSuits.size === 1) {
    if (allTiles.some((tile) => tile.suit === 'honor')) {
      yaku.push('混一色');
      han += closed ? 3 : 2;
    } else {
      yaku.push('清一色');
      han += closed ? 6 : 5;
    }
  }

  const tripletKinds = [
    ...(shape?.groups.filter((group) => group.type === 'triplet').map((group) => group.start) ?? []),
    ...melds.filter((meld) => meld.type !== 'chi').map((meld) => meld.tiles[0]?.kind ?? -1),
  ];
  const yakuman: string[] = [];
  if (thirteenOrphans) {
    const thirteenWait = options.winningTile !== undefined && counts[options.winningTile.kind] === 2;
    yakuman.push(thirteenWait ? '国士无双十三面' : '国士无双');
  }
  if ([31, 32, 33].every((kind) => tripletKinds.includes(kind))) yakuman.push('大三元');
  const windTriplets = [27, 28, 29, 30].filter((kind) => tripletKinds.includes(kind));
  if (windTriplets.length === 4) yakuman.push('大四喜');
  else if (windTriplets.length === 3 && shape && [27, 28, 29, 30].includes(shape.pair)) yakuman.push('小四喜');
  if (allTiles.every((tile) => tile.suit === 'honor')) yakuman.push('字一色');
  if (allTiles.every((tile) => tile.suit !== 'honor' && (tile.rank === 1 || tile.rank === 9))) yakuman.push('清老头');
  if (allTiles.every((tile) => [19, 20, 21, 23, 25, 32].includes(tile.kind))) yakuman.push('绿一色');
  if (melds.filter((meld) => meld.type === 'kan').length === 4) yakuman.push('四杠子');
  if (
    shape &&
    shape.groups.every((group) => group.type === 'triplet') &&
    melds.every((meld) => meld.type === 'kan' && !meld.open) &&
    (options.tsumo || options.winningTile?.kind === shape.pair)
  ) {
    yakuman.push(options.winningTile?.kind === shape.pair ? '四暗刻单骑' : '四暗刻');
  }
  if (closed && melds.length === 0 && numberedSuits.size === 1 && allTiles.every((tile) => tile.suit !== 'honor')) {
    const suitStart = Math.floor((allTiles[0]?.kind ?? 0) / 9) * 9;
    const nineGates =
      counts[suitStart] >= 3 &&
      counts[suitStart + 8] >= 3 &&
      Array.from({ length: 7 }, (_, index) => counts[suitStart + index + 1]).every((count) => count >= 1);
    if (nineGates) yakuman.push('九莲宝灯');
  }
  if (yakuman.length > 0) {
    yaku.length = 0;
    yaku.push(...yakuman);
    han = yakuman.reduce(
      (total, name) => total + (['国士无双十三面', '四暗刻单骑', '大四喜'].includes(name) ? 26 : 13),
      0,
    );
  }

  const fuResult = calculateFu(
    shape,
    tiles,
    melds,
    options.tsumo,
    closed,
    options.winningTile,
    options.roundWind,
    options.seatWind,
  );
  const fu = fuResult.fu;
  if (han === 0) return { han: 0, fu, points: 0, yaku, hanDetails: [], fuDetails: fuResult.details };

  const doraKinds = (options.doraIndicators ?? []).map((indicator) => nextDoraKind(indicator.kind));
  const doraCount =
    yakuman.length > 0
      ? 0
      : allTiles.filter((tile) => tile.red).length +
        allTiles.reduce((total, tile) => total + doraKinds.filter((kind) => kind === tile.kind).length, 0);
  if (doraCount > 0) {
    yaku.push(`宝牌 ${doraCount}`);
    han += doraCount;
  }

  const valueTriplets = countValueTriplets(shape, melds, options.roundWind, options.seatWind);
  const hanDetails = yaku.map((name) => ({ name, han: getYakuHan(name, closed, valueTriplets) }));

  const base =
    yakuman.length > 0
      ? (han / 13) * 8000
      : han >= 13
        ? 8000
        : han >= 11
          ? 6000
          : han >= 8
            ? 4000
            : han >= 6
              ? 3000
              : Math.min(2000, fu * 2 ** (han + 2));
  if (!options.tsumo) {
    const points = Math.ceil((base * (options.dealer ? 6 : 4)) / 100) * 100;
    return { han, fu, points, yaku, hanDetails, fuDetails: fuResult.details };
  }

  if (options.dealer) {
    const childPayment = Math.ceil((base * 2) / 100) * 100;
    return { han, fu, points: childPayment * 3, yaku, childPayment, hanDetails, fuDetails: fuResult.details };
  }

  const dealerPayment = Math.ceil((base * 2) / 100) * 100;
  const childPayment = Math.ceil(base / 100) * 100;
  return {
    han,
    fu,
    points: dealerPayment + childPayment * 2,
    yaku,
    dealerPayment,
    childPayment,
    hanDetails,
    fuDetails: fuResult.details,
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
