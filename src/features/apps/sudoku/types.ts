export type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SudokuDifficultyId = 'starter' | 'easy' | 'standard' | 'hard' | 'master';

export type SudokuStatus = 'playing' | 'won';

export interface SudokuGame {
  puzzle: number[];
  solution: number[];
}
