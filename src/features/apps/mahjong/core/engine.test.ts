import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createMatch, getLegalActions, playAiTurn, startNextRound } from './engine.ts';
import { createTileSet } from './tiles.ts';
import { getTenpaiWaits, isWinningHand, scoreHand } from './scoring.ts';
import type { MahjongState, Suit, Tile } from './types.ts';

function makeTile(kind: number, id: number): Tile {
  const isHonor = kind >= 27;
  const suit = isHonor ? 'honor' : (['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)];
  return {
    id,
    kind,
    suit: suit ?? 'honor',
    rank: isHonor ? kind - 26 : (kind % 9) + 1,
    red: false,
  };
}

function withPlayer(
  state: MahjongState,
  seat: 0 | 1 | 2 | 3,
  patch: Partial<MahjongState['players'][number]>,
): MahjongState {
  return {
    ...state,
    players: state.players.map((player) => (player.seat === seat ? { ...player, ...patch } : player)),
  };
}

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

test('charges riichi, records the sideways discard, and blocks ron by furiten', () => {
  const base = createMatch(901);
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 13].map((kind, id) => makeTile(kind, id + 100));
  const state = withPlayer({ ...base, phase: 'player-turn', currentPlayer: 0, drawnTileId: hand[0]?.id ?? null }, 0, {
    hand,
    score: 25_000,
  });
  const riichiAction = getLegalActions(state, 0).find((action) => action.type === 'riichi' && action.tileId === 108);
  assert.ok(riichiAction);
  const result = applyAction(state, 0, riichiAction);
  assert.equal(result.accepted, true);
  const riichiPlayer = result.state.players[0];
  assert.equal(riichiPlayer.riichi, true);
  assert.equal(riichiPlayer.riichiDiscardId, 108);
  assert.equal(riichiPlayer.score, 24_000);
  assert.equal(riichiPlayer.furiten, true);

  const winningTile = makeTile(8, 908);
  const winningState = withPlayer(
    {
      ...result.state,
      phase: 'reaction',
      pendingReaction: { sourceSeat: 1, tile: winningTile, ronSeats: [0] },
    },
    0,
    { hand: [...riichiPlayer.hand, winningTile], temporaryFuriten: false },
  );
  assert.equal(
    getLegalActions(winningState, 0).some((action) => action.type === 'ron'),
    false,
  );
  assert.equal(
    getLegalActions(winningState, 0).some((action) => action.type === 'pass'),
    false,
  );
});

test('offers and resolves a concealed kan after drawing four identical tiles', () => {
  const base = createMatch(902);
  const hand = [0, 0, 0, 0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 21].map((kind, id) => makeTile(kind, id + 200));
  const state = withPlayer({ ...base, phase: 'player-turn', currentPlayer: 0, drawnTileId: 213 }, 0, { hand });
  const kan = getLegalActions(state, 0).find((action) => action.type === 'kan' && action.variant === 'ankan');
  assert.ok(kan);
  const result = applyAction(state, 0, kan);
  assert.equal(result.accepted, true);
  assert.equal(result.state.players[0].melds[0]?.type, 'kan');
  assert.equal(result.state.players[0].melds[0]?.open, false);
  assert.equal(result.state.players[0].hand.length, 11);
  assert.equal(result.state.drawnTileId !== null, true);
});

test('offers a pon reaction and keeps the called tile in the visible meld', () => {
  const base = createMatch(903);
  const calledTile = makeTile(27, 9030);
  const hand = [27, 27, 1, 2, 3, 4, 5, 6, 9, 10, 11, 18, 19].map((kind, id) => makeTile(kind, id + 300));
  const state = withPlayer(
    {
      ...base,
      phase: 'reaction',
      currentPlayer: 1,
      pendingReaction: { sourceSeat: 1, tile: calledTile, ronSeats: [] },
    },
    0,
    { hand },
  );
  const stateWithVisibleDiscard = withPlayer(state, 1, { discards: [calledTile] });
  const pon = getLegalActions(stateWithVisibleDiscard, 0).find((action) => action.type === 'pon');
  assert.ok(pon);
  const result = applyAction(stateWithVisibleDiscard, 0, pon);
  assert.equal(result.accepted, true);
  assert.equal(result.state.phase, 'player-turn');
  assert.equal(result.state.currentPlayer, 0);
  assert.equal(result.state.players[0].melds[0]?.type, 'pon');
  assert.equal(result.state.players[0].melds[0]?.calledTileId, calledTile.id);
  assert.deepEqual(result.state.players[1]?.discards, [calledTile]);
  assert.deepEqual(result.state.players[1]?.calledDiscardIds, [calledTile.id]);
});

test('offers chi only to the next player and records the sequence meld', () => {
  const base = createMatch(907);
  const calledTile = makeTile(0, 9070);
  const hand = [1, 2, 3, 4, 5, 6, 9, 10, 11, 18, 19, 20, 21].map((kind, id) => makeTile(kind, id + 400));
  const state = withPlayer(
    {
      ...base,
      phase: 'reaction',
      currentPlayer: 3,
      pendingReaction: { sourceSeat: 3, tile: calledTile, ronSeats: [] },
    },
    0,
    { hand },
  );
  const chi = getLegalActions(state, 0).find((action) => action.type === 'chi');
  assert.ok(chi);
  const result = applyAction(state, 0, chi);
  assert.equal(result.accepted, true);
  assert.equal(result.state.players[0].melds[0]?.type, 'chi');
  assert.equal(result.state.players[0].melds[0]?.tiles.length, 3);
});

test('moves from east four to south one only when every score is below 30000', () => {
  const eastFour = createMatch(904, [29_000, 28_000, 27_000, 26_000], 4, 0, 'east');
  const ended = {
    ...eastFour,
    result: { type: 'draw' as const, yaku: [], message: '流局', dealerContinues: false },
    matchScores: [29_000, 28_000, 27_000, 26_000],
  };
  const southOne = startNextRound(ended);
  assert.equal(southOne.roundWind, 'south');
  assert.equal(southOne.roundNumber, 1);

  const completed = startNextRound({ ...ended, matchScores: [30_000, 28_000, 27_000, 26_000] });
  assert.equal(completed.phase, 'match-over');
});

test('keeps the dealer for a win or a drawn hand where the dealer is tenpai', () => {
  const state = createMatch(905, undefined, 2, 1, 'south');
  const next = startNextRound({
    ...state,
    result: { type: 'draw', yaku: [], message: '流局', dealerContinues: true },
    matchScores: state.matchScores,
  });
  assert.equal(next.roundNumber, state.roundNumber);
  assert.equal(next.dealer, state.dealer);
  assert.equal(next.honba, state.honba + 1);
});

test('ends at south four even when the dealer would otherwise continue', () => {
  const southFour = createMatch(906, undefined, 4, 1, 'south');
  const next = startNextRound({
    ...southFour,
    result: { type: 'tsumo', winner: 1, yaku: ['立直'], message: '自摸', dealerContinues: true },
  });
  assert.equal(next.phase, 'match-over');
});

test('ends the south field as soon as a player reaches 30000', () => {
  const southOne = createMatch(908, [30_000, 28_000, 22_000, 20_000], 1, 0, 'south');
  const next = startNextRound({
    ...southOne,
    result: { type: 'draw', yaku: [], message: '流局', dealerContinues: false },
    matchScores: [30_000, 28_000, 22_000, 20_000],
  });
  assert.equal(next.phase, 'match-over');
});

test('keeps a non-leading dealer above 30000 in the same round for priority continuation', () => {
  const southTwo = createMatch(909, [31_000, 34_000, 20_000, 15_000], 2, 0, 'south');
  const next = startNextRound({
    ...southTwo,
    result: { type: 'tsumo', winner: 0, yaku: ['立直'], message: '自摸', dealerContinues: true },
    matchScores: [31_000, 34_000, 20_000, 15_000],
  });
  assert.equal(next.phase, 'player-turn');
  assert.equal(next.roundNumber, southTwo.roundNumber);
  assert.equal(next.dealer, southTwo.dealer);
  assert.equal(next.honba, southTwo.honba + 1);
});
