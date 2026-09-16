import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createMatch, getLegalActions, playAiTurn } from './engine.ts';
import { createTileSet } from './tiles.ts';
import { getTenpaiWaits, isWinningHand, scoreHand } from './scoring.ts';
import type { Suit } from './types.ts';

test('creates a complete unique 136-tile set', () => {
  const tiles = createTileSet(true);
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map((tile) => tile.id)).size, 136);
  assert.equal(tiles.filter((tile) => tile.red).length, 3);
});

test('starts a deterministic human round with a dealer draw', () => {
  const first = createMatch(1234);
  const second = createMatch(1234);
  assert.deepEqual(
    first.wall.map((tile) => tile.id),
    second.wall.map((tile) => tile.id),
  );
  assert.equal(first.players[0].hand.length, 14);
  assert.equal(first.players[1].hand.length, 13);
  assert.equal(first.phase, 'player-turn');
  assert.equal(first.currentPlayer, 0);
});

test('runs a full local round using legal human and AI decisions', () => {
  let state = createMatch(42);
  for (let step = 0; step < 500 && state.phase !== 'round-over'; step += 1) {
    if (state.phase === 'reaction') {
      const pass = getLegalActions(state, 0).find((action) => action.type === 'pass');
      state = applyAction(state, 0, pass ?? { type: 'pass', label: '跳过' }).state;
      continue;
    }
    if (state.phase === 'player-turn') {
      const action = getLegalActions(state, 0).find((candidate) => candidate.type === 'discard');
      assert.ok(action);
      state = applyAction(state, 0, action).state;
      continue;
    }
    if (state.phase === 'ai-turn') state = playAiTurn(state, state.currentPlayer);
  }
  assert.equal(state.phase, 'round-over');
  assert.ok(state.seq > 0);
  assert.ok(state.result);
});

test('scores a closed all-simples self draw with a visible yaku', () => {
  const tiles = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 7, 7].map((kind, id) => ({
    id,
    kind,
    suit: (kind < 27 ? (['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)] : 'honor') as Suit,
    rank: (kind % 9) + 1,
    red: false,
  }));
  assert.equal(isWinningHand(tiles), true);
  const score = scoreHand(tiles, { tsumo: true, riichi: false, roundWind: 'east', dealer: false });
  assert.ok(score.yaku.includes('门清自摸'));
  assert.ok(score.yaku.includes('断幺九'));
  assert.ok(score.points > 0);
});

test('returns concrete waits for a two-sided tenpai hand', () => {
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 10, 22, 23].map((kind, id) => ({
    id,
    kind,
    suit: (kind >= 27 ? 'honor' : (['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)]) as Suit,
    rank: kind >= 27 ? kind - 26 : (kind % 9) + 1,
    red: false,
  }));
  assert.deepEqual(
    getTenpaiWaits(hand).map((tile) => tile.kind),
    [21, 24],
  );
});

test('limits a riichi turn to the drawn tile for automatic tsumogiri', () => {
  const state = createMatch(777);
  const riichiState = {
    ...state,
    players: state.players.map((player) => (player.seat === 0 ? { ...player, riichi: true } : player)),
  };
  const actions = getLegalActions(riichiState, 0);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.type === 'discard' && action.tileId === state.drawnTileId));
});
