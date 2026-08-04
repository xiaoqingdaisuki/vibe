import type { SudokuDifficultyId, SudokuDigit, SudokuGame, SudokuStatus } from './types';

const GRID_SIZE = 9;
const DIGIT_BY_KEY: Record<string, SudokuDigit> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
};
const MOVEMENT_BY_KEY: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export interface SudokuSessionState {
  difficultyId: SudokuDifficultyId;
  game: SudokuGame;
  values: number[];
  selectedIndex: number;
  status: SudokuStatus;
  mistakes: number;
  hasIncorrectCompletion: boolean;
  incorrectBoxIndexes: number[];
}

export type SudokuKeyboardCommand =
  { type: 'select'; index: number } | { type: 'digit'; digit: SudokuDigit } | { type: 'erase' };

// 创建数独游戏会话初始状态
export function createSudokuSession(game: SudokuGame, difficultyId: SudokuDifficultyId): SudokuSessionState {
  return {
    difficultyId,
    game,
    values: [...game.puzzle],
    selectedIndex: game.puzzle.findIndex((value) => value === 0),
    status: 'playing',
    mistakes: 0,
    hasIncorrectCompletion: false,
    incorrectBoxIndexes: [],
  };
}

// 切换选中单元格，返回新状态
export function selectCellInSession(state: SudokuSessionState, index: number): SudokuSessionState {
  if (!Number.isInteger(index) || index < 0 || index >= state.values.length || index === state.selectedIndex) {
    return state;
  }

  return { ...state, selectedIndex: index };
}

// 在选中格填入数字，检测完成或错误
export function enterDigitInSession(state: SudokuSessionState, digit: number): SudokuSessionState {
  const { selectedIndex } = state;
  if (
    state.status === 'won' ||
    !Number.isInteger(digit) ||
    digit < 1 ||
    digit > 9 ||
    state.game.puzzle[selectedIndex] !== 0
  ) {
    return state;
  }

  const previousValue = state.values[selectedIndex];
  const nextValues = [...state.values];
  nextValues[selectedIndex] = previousValue === digit ? 0 : digit;
  const isComplete = nextValues.every((value) => value !== 0);
  const incorrectBoxIndexes = isComplete ? getIncorrectBoxIndexes(nextValues, state.game.solution) : [];
  const isSolved = isComplete && incorrectBoxIndexes.length === 0;
  const hasIncorrectCompletion = incorrectBoxIndexes.length > 0;

  return {
    ...state,
    values: nextValues,
    mistakes: state.mistakes + (hasIncorrectCompletion ? 1 : 0),
    status: isSolved ? 'won' : 'playing',
    hasIncorrectCompletion,
    incorrectBoxIndexes,
  };
}

// 清除选中格的数字
export function eraseSelectedInSession(state: SudokuSessionState): SudokuSessionState {
  const { selectedIndex } = state;
  if (state.status === 'won' || state.game.puzzle[selectedIndex] !== 0 || state.values[selectedIndex] === 0) {
    return state;
  }

  const nextValues = [...state.values];
  nextValues[selectedIndex] = 0;
  return { ...state, values: nextValues, hasIncorrectCompletion: false, incorrectBoxIndexes: [] };
}

// 找出填写错误的九宫格索引列表
export function getIncorrectBoxIndexes(values: number[], solution: number[]): number[] {
  const incorrectBoxes = new Set<number>();

  values.forEach((value, index) => {
    if (value === solution[index]) return;

    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    incorrectBoxes.add(Math.floor(row / 3) * 3 + Math.floor(column / 3));
  });

  return [...incorrectBoxes];
}

// 计算从起始时间到当前的经过秒数
export function getElapsedSeconds(startedAtMs: number, currentTimeMs: number): number {
  return Math.max(0, Math.floor((currentTimeMs - startedAtMs) / 1_000));
}

// 将秒数格式化为 HH:MM:SS 或 MM:SS
export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${base}` : base;
}

// 将键盘按键映射为数独操作指令
export function getSudokuKeyboardCommand(key: string, selectedIndex: number): SudokuKeyboardCommand | null {
  const movement = MOVEMENT_BY_KEY[key];
  if (movement) {
    const row = Math.floor(selectedIndex / GRID_SIZE);
    const column = selectedIndex % GRID_SIZE;
    const nextRow = Math.min(GRID_SIZE - 1, Math.max(0, row + movement[0]));
    const nextColumn = Math.min(GRID_SIZE - 1, Math.max(0, column + movement[1]));
    return { type: 'select', index: nextRow * GRID_SIZE + nextColumn };
  }

  const digit = DIGIT_BY_KEY[key];
  if (digit) return { type: 'digit', digit };
  if (key === 'Backspace' || key === 'Delete' || key === '0') return { type: 'erase' };
  return null;
}
