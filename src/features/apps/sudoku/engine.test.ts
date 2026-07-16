import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countSolutions,
  createSudokuGame,
  getDifficultyProgression,
  isComplete,
  SUDOKU_DIFFICULTIES,
} from './engine.ts';

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

test('every difficulty creates a valid puzzle with one solution', () => {
  SUDOKU_DIFFICULTIES.forEach((difficulty, index) => {
    const game = createSudokuGame(difficulty.id, createSeededRandom(index + 1));

    assert.equal(game.puzzle.length, 81);
    assert.equal(game.solution.length, 81);
    assert.equal(game.puzzle.filter(Boolean).length, difficulty.clueCount);
    assert.equal(countSolutions(game.puzzle), 1);
    assert.ok(game.puzzle.every((digit, cellIndex) => digit === 0 || digit === game.solution[cellIndex]));
  });
});

test('master difficulty stays at the proven 17-clue minimum while still producing varied boards', () => {
  const firstGame = createSudokuGame('master', createSeededRandom(100));
  const secondGame = createSudokuGame('master', createSeededRandom(200));

  assert.equal(SUDOKU_DIFFICULTIES.find(({ id }) => id === 'master')?.clueCount, 17);
  assert.equal(firstGame.puzzle.filter(Boolean).length, 17);
  assert.equal(countSolutions(firstGame.puzzle), 1);
  assert.notDeepEqual(firstGame.puzzle, secondGame.puzzle);
});

test('difficulty clue counts form a steady descending ladder', () => {
  assert.deepEqual(
    SUDOKU_DIFFICULTIES.map(({ clueCount }) => clueCount),
    [50, 42, 34, 26, 17],
  );
  assert.equal(getDifficultyProgression('standard').next?.id, 'hard');
  assert.equal(getDifficultyProgression('master').next, undefined);
});

test('isComplete only accepts the exact finished grid', () => {
  const game = createSudokuGame('starter', createSeededRandom(42));
  const unfinished = [...game.solution];
  unfinished[0] = 0;

  assert.equal(isComplete(unfinished, game.solution), false);
  assert.equal(isComplete(game.solution, game.solution), true);
});
