import type { SudokuDifficultyId, SudokuGame } from './types';

const GRID_SIZE = 9;
const BOX_SIZE = 3;
const FULL_DIGIT_MASK = 0b1111111110;
const MINIMUM_CLUE_PUZZLE = '000000010400000000020000000000050407008000300001090000300400200050100000000806000'
  .split('')
  .map(Number);
const MINIMUM_CLUE_SOLUTION = '693784512487512936125963874932651487568247391741398625319475268856129743274836159'
  .split('')
  .map(Number);

export const SUDOKU_DIFFICULTIES = [
  { id: 'starter', label: '入门', description: '50 个提示', clueCount: 50 },
  { id: 'easy', label: '轻松', description: '42 个提示', clueCount: 42 },
  { id: 'standard', label: '标准', description: '34 个提示', clueCount: 34 },
  { id: 'hard', label: '困难', description: '26 个提示', clueCount: 26 },
  { id: 'master', label: '大师', description: '17 个提示 · 理论下限', clueCount: 17 },
] as const;

// Fisher-Yates 洗牌算法
function shuffle<T>(values: T[], random: () => number): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selectedIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex], shuffled[index]];
  }

  return shuffled;
}

// 生成一个随机的有效数独终盘
function createSolvedBoard(random: () => number): number[] {
  const bands = shuffle([0, 1, 2], random);
  const stacks = shuffle([0, 1, 2], random);
  const rows = bands.flatMap((band) => shuffle([0, 1, 2], random).map((row) => band * BOX_SIZE + row));
  const columns = stacks.flatMap((stack) => shuffle([0, 1, 2], random).map((column) => stack * BOX_SIZE + column));
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const pattern = (row: number, column: number) => (row * BOX_SIZE + Math.floor(row / BOX_SIZE) + column) % GRID_SIZE;

  return rows.flatMap((row) => columns.map((column) => digits[pattern(row, column)]));
}

// 生成行/列的随机排列顺序（保持 band/stack 结构）
function createHouseOrder(random: () => number): number[] {
  return shuffle([0, 1, 2], random).flatMap((house) =>
    shuffle([0, 1, 2], random).map((position) => house * BOX_SIZE + position),
  );
}

// 对已知最少线索数独进行变换，生成等价题目
function transformMinimumClueGame(random: () => number): SudokuGame {
  const rows = createHouseOrder(random);
  const columns = createHouseOrder(random);
  const digitMap = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const transpose = random() >= 0.5;

  const transformBoard = (board: number[]) =>
    Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const column = index % GRID_SIZE;
      const sourceRow = transpose ? rows[column] : rows[row];
      const sourceColumn = transpose ? columns[row] : columns[column];
      const digit = board[sourceRow * GRID_SIZE + sourceColumn];
      return digit === 0 ? 0 : digitMap[digit - 1];
    });

  return {
    puzzle: transformBoard(MINIMUM_CLUE_PUZZLE),
    solution: transformBoard(MINIMUM_CLUE_SOLUTION),
  };
}

// 根据行、列计算所属九宫格索引
function getBoxIndex(row: number, column: number): number {
  return Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(column / BOX_SIZE);
}

// 初始化求解器状态（行/列/宫的 bitmask）
function prepareSolver(board: number[]) {
  const rowMasks = Array<number>(GRID_SIZE).fill(0);
  const columnMasks = Array<number>(GRID_SIZE).fill(0);
  const boxMasks = Array<number>(GRID_SIZE).fill(0);

  for (let index = 0; index < board.length; index += 1) {
    const digit = board[index];
    if (digit === 0) continue;

    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const box = getBoxIndex(row, column);
    const bit = 1 << digit;

    if ((rowMasks[row] & bit) !== 0 || (columnMasks[column] & bit) !== 0 || (boxMasks[box] & bit) !== 0) {
      return null;
    }

    rowMasks[row] |= bit;
    columnMasks[column] |= bit;
    boxMasks[box] |= bit;
  }

  return { rowMasks, columnMasks, boxMasks };
}

// 统计解的候选数，用于验证唯一解
export function countSolutions(board: number[], limit = 2): number {
  if (board.length !== GRID_SIZE * GRID_SIZE || limit < 1) return 0;

  const workingBoard = [...board];
  const masks = prepareSolver(workingBoard);
  if (!masks) return 0;

  let solutionCount = 0;

  const search = () => {
    if (solutionCount >= limit) return;

    let targetIndex = -1;
    let targetMask = 0;
    let fewestCandidates = GRID_SIZE + 1;

    for (let index = 0; index < workingBoard.length; index += 1) {
      if (workingBoard[index] !== 0) continue;

      const row = Math.floor(index / GRID_SIZE);
      const column = index % GRID_SIZE;
      const box = getBoxIndex(row, column);
      const candidateMask = FULL_DIGIT_MASK & ~(masks.rowMasks[row] | masks.columnMasks[column] | masks.boxMasks[box]);
      const candidateCount = candidateMask.toString(2).replaceAll('0', '').length;

      if (candidateCount === 0) return;
      if (candidateCount >= fewestCandidates) continue;

      targetIndex = index;
      targetMask = candidateMask;
      fewestCandidates = candidateCount;
      if (candidateCount === 1) break;
    }

    if (targetIndex === -1) {
      solutionCount += 1;
      return;
    }

    const row = Math.floor(targetIndex / GRID_SIZE);
    const column = targetIndex % GRID_SIZE;
    const box = getBoxIndex(row, column);

    for (let digit = 1; digit <= GRID_SIZE; digit += 1) {
      const bit = 1 << digit;
      if ((targetMask & bit) === 0) continue;

      workingBoard[targetIndex] = digit;
      masks.rowMasks[row] |= bit;
      masks.columnMasks[column] |= bit;
      masks.boxMasks[box] |= bit;
      search();
      masks.rowMasks[row] &= ~bit;
      masks.columnMasks[column] &= ~bit;
      masks.boxMasks[box] &= ~bit;
      workingBoard[targetIndex] = 0;

      if (solutionCount >= limit) return;
    }
  };

  search();
  return solutionCount;
}

// 从完整终盘中挖洞生成谜题，确保唯一解
function createPuzzle(solution: number[], targetClues: number, random: () => number): number[] {
  const puzzle = [...solution];
  const removalOrder = shuffle(
    Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index),
    random,
  );
  let clueCount = puzzle.length;

  for (const index of removalOrder) {
    if (clueCount <= targetClues) break;

    const digit = puzzle[index];
    puzzle[index] = 0;

    if (countSolutions(puzzle) === 1) {
      clueCount -= 1;
    } else {
      puzzle[index] = digit;
    }
  }

  return puzzle;
}

// 生成随机数独题目
export function createSudokuGame(difficultyId: SudokuDifficultyId, random: () => number = Math.random): SudokuGame {
  const difficulty = SUDOKU_DIFFICULTIES.find(({ id }) => id === difficultyId) ?? SUDOKU_DIFFICULTIES[0];
  if (difficulty.id === 'master') return transformMinimumClueGame(random);

  let bestGame: SudokuGame | null = null;
  let bestClueCount = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const solution = createSolvedBoard(random);
    const puzzle = createPuzzle(solution, difficulty.clueCount, random);
    const clueCount = puzzle.filter(Boolean).length;

    if (clueCount < bestClueCount) {
      bestGame = { puzzle, solution };
      bestClueCount = clueCount;
    }

    if (clueCount === difficulty.clueCount) return { puzzle, solution };
  }

  if (!bestGame) throw new Error('无法生成数独题目。');
  return bestGame;
}

// 获取难度进阶关系（当前难度和下一难度）
export function getDifficultyProgression(difficultyId: SudokuDifficultyId) {
  const currentIndex = SUDOKU_DIFFICULTIES.findIndex(({ id }) => id === difficultyId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  return {
    current: SUDOKU_DIFFICULTIES[safeIndex],
    next: SUDOKU_DIFFICULTIES[safeIndex + 1],
  };
}

// 检查当前填写是否与解决方案完全一致
export function isComplete(values: number[], solution: number[]): boolean {
  return values.length === solution.length && values.every((value, index) => value === solution[index]);
}
