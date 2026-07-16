import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSudokuSession,
  enterDigitInSession,
  eraseSelectedInSession,
  formatElapsedTime,
  getElapsedSeconds,
  getSudokuKeyboardCommand,
  selectCellInSession,
} from './game-state.ts';
import type { SudokuGame } from './types.ts';

function createNearlyCompleteGame(): SudokuGame {
  const solution = Array.from({ length: 81 }, (_, index) => (index % 9) + 1);
  const puzzle = [...solution];
  puzzle[0] = 0;
  return { puzzle, solution };
}

test('digit entry tracks mistakes, toggles repeated entries, and completes the puzzle', () => {
  const game = createNearlyCompleteGame();
  const initial = createSudokuSession(game, 'starter');
  const wrong = enterDigitInSession(initial, 2);
  const cleared = enterDigitInSession(wrong, 2);
  const completed = enterDigitInSession(cleared, 1);

  assert.equal(wrong.values[0], 2);
  assert.equal(wrong.mistakes, 1);
  assert.equal(cleared.values[0], 0);
  assert.equal(cleared.mistakes, 1);
  assert.equal(completed.status, 'won');
});

test('given cells cannot be changed and editable cells can be erased', () => {
  const initial = createSudokuSession(createNearlyCompleteGame(), 'starter');
  const selectedGiven = selectCellInSession(initial, 1);
  const unchanged = enterDigitInSession(selectedGiven, 9);
  const entered = enterDigitInSession(initial, 2);
  const erased = eraseSelectedInSession(entered);

  assert.equal(unchanged, selectedGiven);
  assert.equal(erased.values[0], 0);
  assert.equal(erased.mistakes, 1);
});

test('elapsed time is derived from timestamps instead of timer callback counts', () => {
  assert.equal(getElapsedSeconds(1_000, 66_400), 65);
  assert.equal(getElapsedSeconds(2_000, 1_000), 0);
  assert.equal(formatElapsedTime(65), '01:05');
  assert.equal(formatElapsedTime(3_665), '01:01:05');
});

test('keyboard commands drive the expected next actions', () => {
  assert.deepEqual(getSudokuKeyboardCommand('ArrowRight', 0), { type: 'select', index: 1 });
  assert.deepEqual(getSudokuKeyboardCommand('ArrowUp', 0), { type: 'select', index: 0 });
  assert.deepEqual(getSudokuKeyboardCommand('7', 0), { type: 'digit', digit: 7 });
  assert.deepEqual(getSudokuKeyboardCommand('Backspace', 0), { type: 'erase' });
  assert.equal(getSudokuKeyboardCommand('a', 0), null);
});
