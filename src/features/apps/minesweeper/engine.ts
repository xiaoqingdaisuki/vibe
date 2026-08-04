import type { BoardConfig, Cell } from './types';

export const DIFFICULTY_PRESETS = [
  {
    id: 'beginner',
    label: '初级',
    description: '9 × 9 · 10 雷',
    config: { rows: 9, columns: 9, mines: 10 },
  },
  {
    id: 'intermediate',
    label: '中级',
    description: '16 × 16 · 40 雷',
    config: { rows: 16, columns: 16, mines: 40 },
  },
  {
    id: 'expert',
    label: '高级',
    description: '16 × 30 · 99 雷',
    config: { rows: 16, columns: 30, mines: 99 },
  },
] as const;

export const DEFAULT_CUSTOM_CONFIG: BoardConfig = {
  rows: 12,
  columns: 12,
  mines: 24,
};

export const CUSTOM_LIMITS = {
  rows: { min: 5, max: 24 },
  columns: { min: 5, max: 30 },
} as const;

// 创建空白单元格
function createCell(): Cell {
  return {
    mine: false,
    adjacentMines: 0,
    state: 'hidden',
    detonated: false,
  };
}

// 根据配置创建空白棋盘
export function createEmptyBoard(config: BoardConfig): Cell[] {
  return Array.from({ length: config.rows * config.columns }, createCell);
}

// 获取指定单元格的周围单元格索引列表
export function getNeighborIndices(index: number, config: BoardConfig): number[] {
  const row = Math.floor(index / config.columns);
  const column = index % config.columns;
  const neighbors: number[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;

      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;

      if (neighborRow >= 0 && neighborRow < config.rows && neighborColumn >= 0 && neighborColumn < config.columns) {
        neighbors.push(neighborRow * config.columns + neighborColumn);
      }
    }
  }

  return neighbors;
}

// 在棋盘上布雷，保证首次点击位置及其周围安全
export function placeMines(
  board: Cell[],
  config: BoardConfig,
  safeIndex: number,
  random: () => number = Math.random,
): Cell[] {
  const safeIndices = new Set([safeIndex, ...getNeighborIndices(safeIndex, config)]);
  const candidates = board.map((_, index) => index).filter((index) => !safeIndices.has(index));

  if (config.mines > candidates.length) {
    throw new Error('雷数过多，无法保留首次点击安全区。');
  }

  const nextBoard = board.map((cell) => ({ ...cell, mine: false, adjacentMines: 0, detonated: false }));

  for (let mineIndex = 0; mineIndex < config.mines; mineIndex += 1) {
    const selectedOffset = mineIndex + Math.floor(random() * (candidates.length - mineIndex));
    [candidates[mineIndex], candidates[selectedOffset]] = [candidates[selectedOffset], candidates[mineIndex]];
    const selectedIndex = candidates[mineIndex];
    nextBoard[selectedIndex].mine = true;
  }

  nextBoard.forEach((cell, index) => {
    if (cell.mine) return;
    cell.adjacentMines = getNeighborIndices(index, config).filter(
      (neighborIndex) => nextBoard[neighborIndex].mine,
    ).length;
  });

  return nextBoard;
}

export interface RevealResult {
  board: Cell[];
  changed: boolean;
  hitMine: boolean;
}

// 揭开指定单元格，自动展开空白区域
export function revealCell(board: Cell[], config: BoardConfig, startIndex: number): RevealResult {
  const startCell = board[startIndex];
  if (!startCell || startCell.state !== 'hidden') {
    return { board, changed: false, hitMine: false };
  }

  const nextBoard = board.map((cell) => ({ ...cell }));

  if (nextBoard[startIndex].mine) {
    nextBoard[startIndex].state = 'revealed';
    nextBoard[startIndex].detonated = true;
    return { board: nextBoard, changed: true, hitMine: true };
  }

  const pending = [startIndex];
  const queued = new Set(pending);

  while (pending.length > 0) {
    const index = pending.shift();
    if (index === undefined) break;

    const cell = nextBoard[index];
    if (cell.state !== 'hidden' || cell.mine) continue;

    cell.state = 'revealed';

    if (cell.adjacentMines !== 0) continue;

    getNeighborIndices(index, config).forEach((neighborIndex) => {
      if (!queued.has(neighborIndex) && nextBoard[neighborIndex].state === 'hidden') {
        queued.add(neighborIndex);
        pending.push(neighborIndex);
      }
    });
  }

  return { board: nextBoard, changed: true, hitMine: false };
}

// 切换指定单元格的插旗状态
export function toggleFlag(board: Cell[], index: number): Cell[] {
  const cell = board[index];
  if (!cell || cell.state === 'revealed') return board;

  const nextBoard = board.map((currentCell) => ({ ...currentCell }));
  nextBoard[index].state = cell.state === 'flagged' ? 'hidden' : 'flagged';
  return nextBoard;
}

// 对已揭开的数字格执行和弦操作（周围旗数正确时揭开剩余）
export function chordCell(board: Cell[], config: BoardConfig, index: number): RevealResult {
  const cell = board[index];
  if (!cell || cell.state !== 'revealed' || cell.adjacentMines === 0) {
    return { board, changed: false, hitMine: false };
  }

  const neighbors = getNeighborIndices(index, config);
  const flaggedCount = neighbors.filter((neighborIndex) => board[neighborIndex].state === 'flagged').length;
  if (flaggedCount !== cell.adjacentMines) {
    return { board, changed: false, hitMine: false };
  }

  let nextBoard = board;
  let changed = false;

  for (const neighborIndex of neighbors) {
    if (nextBoard[neighborIndex].state !== 'hidden') continue;

    const result = revealCell(nextBoard, config, neighborIndex);
    nextBoard = result.board;
    changed ||= result.changed;

    if (result.hitMine) {
      return { board: nextBoard, changed: true, hitMine: true };
    }
  }

  return { board: nextBoard, changed, hitMine: false };
}

// 揭开盘棋指定位置，首次点击时布雷
export function revealBoardAt(
  board: Cell[],
  config: BoardConfig,
  index: number,
  shouldPlaceMines: boolean,
  random: () => number = Math.random,
): RevealResult {
  const selectedCell = board[index];
  if (!selectedCell || selectedCell.state === 'flagged') {
    return { board, changed: false, hitMine: false };
  }

  const playableBoard = shouldPlaceMines ? placeMines(board, config, index, random) : board;
  const playableCell = playableBoard[index];

  return playableCell.state === 'revealed'
    ? chordCell(playableBoard, config, index)
    : revealCell(playableBoard, config, index);
}

// 揭开所有地雷（用于游戏结束时展示）
export function revealAllMines(board: Cell[]): Cell[] {
  return board.map((cell) => (cell.mine ? { ...cell, state: 'revealed' } : { ...cell }));
}

// 检查是否已赢得游戏（所有非雷格已揭开）
export function hasWon(board: Cell[]): boolean {
  return board.every((cell) => cell.mine || cell.state === 'revealed');
}

// 统计当前插旗数量
export function countFlags(board: Cell[]): number {
  return board.reduce((total, cell) => total + (cell.state === 'flagged' ? 1 : 0), 0);
}

// 验证自定义棋盘配置是否合法，返回错误信息或 null
export function validateCustomConfig(config: BoardConfig): string | null {
  if (!Number.isInteger(config.rows) || config.rows < CUSTOM_LIMITS.rows.min || config.rows > CUSTOM_LIMITS.rows.max) {
    return `行数需为 ${CUSTOM_LIMITS.rows.min}–${CUSTOM_LIMITS.rows.max} 之间的整数。`;
  }

  if (
    !Number.isInteger(config.columns) ||
    config.columns < CUSTOM_LIMITS.columns.min ||
    config.columns > CUSTOM_LIMITS.columns.max
  ) {
    return `列数需为 ${CUSTOM_LIMITS.columns.min}–${CUSTOM_LIMITS.columns.max} 之间的整数。`;
  }

  const maximumMines = config.rows * config.columns - 9;
  if (!Number.isInteger(config.mines) || config.mines < 1 || config.mines > maximumMines) {
    return `雷数需为 1–${maximumMines} 之间的整数。`;
  }

  return null;
}
