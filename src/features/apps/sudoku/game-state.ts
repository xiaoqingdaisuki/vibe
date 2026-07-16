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
}

export type SudokuKeyboardCommand =
  { type: 'select'; index: number } | { type: 'digit'; digit: SudokuDigit } | { type: 'erase' };

export function createSudokuSession(game: SudokuGame, difficultyId: SudokuDifficultyId): SudokuSessionState {
  return {
    difficultyId,
    game,
    values: [...game.puzzle],
    selectedIndex: game.puzzle.findIndex((value) => value === 0),
    status: 'playing',
    mistakes: 0,
  };
}

export function selectCellInSession(state: SudokuSessionState, index: number): SudokuSessionState {
  if (!Number.isInteger(index) || index < 0 || index >= state.values.length || index === state.selectedIndex) {
    return state;
  }

  return { ...state, selectedIndex: index };
}

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
  const isNewMistake = previousValue !== digit && digit !== state.game.solution[selectedIndex];

  return {
    ...state,
    values: nextValues,
    mistakes: state.mistakes + (isNewMistake ? 1 : 0),
    status: nextValues.every((value, index) => value === state.game.solution[index]) ? 'won' : 'playing',
  };
}

export function eraseSelectedInSession(state: SudokuSessionState): SudokuSessionState {
  const { selectedIndex } = state;
  if (state.status === 'won' || state.game.puzzle[selectedIndex] !== 0 || state.values[selectedIndex] === 0) {
    return state;
  }

  const nextValues = [...state.values];
  nextValues[selectedIndex] = 0;
  return { ...state, values: nextValues };
}

export function getElapsedSeconds(startedAtMs: number, currentTimeMs: number): number {
  return Math.max(0, Math.floor((currentTimeMs - startedAtMs) / 1_000));
}

export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${base}` : base;
}

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
