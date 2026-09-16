import type { Suit, Tile } from './types.ts';

export const TILE_KIND_COUNT = 34;
export const TILE_COUNT = 136;

const SUIT_NAMES: readonly Suit[] = ['man', 'pin', 'sou', 'honor'];
const HONOR_LABELS = ['东', '南', '西', '北', '白', '发', '中'] as const;

// 根据牌种和实体序号创建一张具有稳定身份的麻将牌
function createTile(id: number, kind: number, copy: number, redFives: boolean): Tile {
  const suit = SUIT_NAMES[Math.floor(kind / 9)] ?? 'honor';
  const isHonor = kind >= 27;
  const rank = isHonor ? kind - 26 : (kind % 9) + 1;
  const red = redFives && !isHonor && rank === 5 && copy === 0;
  return { id, kind, suit, rank, red };
}

// 创建标准 136 张牌山，并为三种五牌配置赤五
export function createTileSet(redFives = true): Tile[] {
  return Array.from({ length: TILE_COUNT }, (_, id) => {
    const kind = Math.floor(id / 4);
    const copy = id % 4;
    return createTile(id, kind, copy, redFives);
  });
}

// 使用确定性伪随机数洗牌，确保相同 seed 得到相同牌山
export function shuffleTiles(tiles: readonly Tile[], seed: number): Tile[] {
  const result = [...tiles];
  let value = seed >>> 0;
  const nextRandom = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }

  return result;
}

// 将牌种转换成人类可读的中文牌面标签
export function tileLabel(tile: Pick<Tile, 'kind' | 'red'>): string {
  if (tile.kind >= 27) return HONOR_LABELS[tile.kind - 27] ?? '?';
  const suitLabels = ['万', '筒', '索'];
  const suit = suitLabels[Math.floor(tile.kind / 9)] ?? '';
  const rank = (tile.kind % 9) + 1;
  return `${tile.red ? '赤' : ''}${rank}${suit}`;
}

// 为牌河和手牌提供稳定的排序键
export function tileSortValue(tile: Pick<Tile, 'kind' | 'red'>): number {
  return tile.kind * 2 + (tile.red ? 1 : 0);
}

// 将牌种转换成适合规则计算的 34 维计数数组
export function toCounts(tiles: readonly Pick<Tile, 'kind'>[]): number[] {
  const counts = Array.from({ length: TILE_KIND_COUNT }, () => 0);
  for (const tile of tiles) counts[tile.kind] += 1;
  return counts;
}
