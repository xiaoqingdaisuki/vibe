import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chordCell,
  createEmptyBoard,
  getNeighborIndices,
  hasWon,
  placeMines,
  revealBoardAt,
  revealCell,
  toggleFlag,
  validateCustomConfig,
} from './engine.ts';
import type { BoardConfig } from './types.ts';

const config: BoardConfig = { rows: 5, columns: 5, mines: 3 };

test('placeMines keeps the first cell and its neighbors safe', () => {
  const safeIndex = 12;
  const board = placeMines(createEmptyBoard(config), config, safeIndex, () => 0);
  const safeIndices = [safeIndex, ...getNeighborIndices(safeIndex, config)];

  assert.equal(board.filter((cell) => cell.mine).length, config.mines);
  assert.ok(safeIndices.every((index) => !board[index].mine));
});

test('revealCell expands an empty area without revealing flagged cells', () => {
  const board = createEmptyBoard(config);
  board[0].mine = true;
  board[1].adjacentMines = 1;
  board[5].adjacentMines = 1;
  board[6].adjacentMines = 1;
  const flaggedBoard = toggleFlag(board, 24);
  const result = revealCell(flaggedBoard, config, 12);

  assert.equal(result.hitMine, false);
  assert.equal(result.board[12].state, 'revealed');
  assert.equal(result.board[24].state, 'flagged');
});

test('chordCell reveals neighbors when the adjacent flag count matches', () => {
  const board = createEmptyBoard({ rows: 3, columns: 3, mines: 1 });
  board[0].mine = true;
  board[4].state = 'revealed';
  board[4].adjacentMines = 1;
  const flaggedBoard = toggleFlag(board, 0);
  const result = chordCell(flaggedBoard, { rows: 3, columns: 3, mines: 1 }, 4);

  assert.equal(result.hitMine, false);
  assert.ok(result.board.slice(1).every((cell) => cell.state === 'revealed'));
  assert.equal(hasWon(result.board), true);
});

test('validateCustomConfig rejects boards that cannot preserve a safe opening', () => {
  assert.match(validateCustomConfig({ rows: 5, columns: 5, mines: 17 }) ?? '', /1–16/);
  assert.equal(validateCustomConfig({ rows: 10, columns: 12, mines: 20 }), null);
});

test('a flagged cell does not consume the first safe reveal', () => {
  const flaggedBoard = toggleFlag(createEmptyBoard(config), 12);
  const blockedReveal = revealBoardAt(flaggedBoard, config, 12, true, () => 0);

  assert.equal(blockedReveal.changed, false);
  assert.equal(blockedReveal.board, flaggedBoard);
  assert.equal(
    blockedReveal.board.some((cell) => cell.mine),
    false,
  );

  const firstActualReveal = revealBoardAt(blockedReveal.board, config, 0, true, () => 0);
  assert.equal(firstActualReveal.hitMine, false);
  assert.equal(firstActualReveal.board[0].state, 'revealed');
});
