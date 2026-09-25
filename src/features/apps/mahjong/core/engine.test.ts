import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createMatch, getLegalActions, playAiTurn, startNextRound } from './engine.ts';
import { createTileSet } from './tiles.ts';
import { getTenpaiWaits, isWinningHand, scoreHand } from './scoring.ts';
import type { MahjongState, Meld, Suit, Tile } from './types.ts';

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
  const score = scoreHand(tiles, {
    tsumo: true,
    riichi: false,
    roundWind: 'east',
    seatWind: 'south',
    dealer: false,
  });
  assert.ok(score.yaku.includes('门清自摸'));
  assert.ok(score.yaku.includes('断幺九'));
  assert.ok(score.points > 0);
});

test('blocks calls while another player has a legal ron', () => {
  const base = createMatch(910);
  const calledTile = makeTile(27, 9100);
  const humanHand = [27, 27, 1, 2, 3, 4, 5, 6, 9, 10, 11, 18, 19].map((kind, id) => makeTile(kind, id + 9101));
  const state = withPlayer(
    {
      ...base,
      phase: 'reaction',
      pendingReaction: { sourceSeat: 1, tile: calledTile, ronSeats: [2] },
    },
    0,
    { hand: humanHand },
  );

  const actions = getLegalActions(state, 0);
  assert.equal(
    actions.some((action) => action.type === 'pon'),
    false,
  );
  assert.equal(
    actions.some((action) => action.type === 'chi'),
    false,
  );
  assert.equal(
    actions.some((action) => action.type === 'kan'),
    false,
  );
});

test('uses open meld fu and counts the winner seat wind', () => {
  const tiles = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 18].map((kind, id) => makeTile(kind, id + 9200));
  const eastKan: Meld = {
    type: 'kan',
    tiles: [27, 27, 27, 27].map((kind, id) => makeTile(kind, id + 9300)),
    open: true,
    variant: 'daiminkan',
  };
  const score = scoreHand(tiles, {
    tsumo: false,
    riichi: false,
    roundWind: 'south',
    seatWind: 'east',
    dealer: false,
    melds: [eastKan],
  });

  assert.equal(score.fu, 40);
  assert.ok(score.yaku.includes('役牌'));
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

test('adds honba payments to a self draw result', () => {
  const base = createMatch(911);
  const tiles = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 7, 7].map((kind, id) => makeTile(kind, id + 9400));
  const state = withPlayer(
    {
      ...base,
      phase: 'ai-turn',
      currentPlayer: 1,
      drawnTileId: tiles[13]?.id ?? null,
      honba: 2,
    },
    1,
    { hand: tiles, score: 25_000 },
  );
  const action = getLegalActions(state, 1).find((candidate) => candidate.type === 'tsumo');
  assert.ok(action);

  const result = applyAction(state, 1, action);
  const baseScore = scoreHand(tiles, {
    tsumo: true,
    riichi: false,
    roundWind: state.roundWind,
    seatWind: 'south',
    dealer: false,
  });
  assert.equal(result.state.result?.points, baseScore.points + 600);
  assert.equal(result.state.players[1]?.score, 25_000 + baseScore.points + 600);
});

test('rounds final payments rather than basic points', () => {
  const tiles = [0, 1, 2, 12, 13, 14, 18, 19, 20, 23, 24, 25, 10, 10].map((kind, id) => makeTile(kind, id + 1000));
  const score = scoreHand(tiles, {
    tsumo: false,
    riichi: false,
    roundWind: 'east',
    seatWind: 'south',
    dealer: false,
    winningTile: tiles[11],
  });
  assert.deepEqual([score.han, score.fu, score.points], [1, 30, 1000]);
});

test('requires a two-sided wait for pinfu and keeps pinfu tsumo at 20 fu', () => {
  const tiles = [0, 1, 2, 12, 13, 14, 18, 19, 20, 23, 24, 25, 10, 10].map((kind, id) => makeTile(kind, id + 1100));
  const options = { riichi: false, roundWind: 'east' as const, seatWind: 'south' as const, dealer: false };
  const tsumo = scoreHand(tiles, { ...options, tsumo: true, winningTile: tiles[11] });
  const tanki = scoreHand(tiles, { ...options, tsumo: false, winningTile: tiles[13] });
  assert.equal(tsumo.fu, 20);
  assert.equal(tsumo.points, 1500);
  assert.equal(tanki.yaku.includes('平和'), false);
});

test('counts seven pairs with all simples and double east value triplets', () => {
  const pairs = [1, 1, 3, 3, 5, 5, 10, 10, 12, 12, 19, 19, 21, 21].map((kind, id) => makeTile(kind, id + 1200));
  const options = {
    tsumo: false,
    riichi: false,
    roundWind: 'east' as const,
    seatWind: 'south' as const,
    dealer: false,
  };
  const pairScore = scoreHand(pairs, options);
  assert.deepEqual([pairScore.han, pairScore.fu, pairScore.points], [3, 25, 3200]);
  const hand = [0, 1, 2, 12, 13, 14, 18, 19, 20, 10, 10].map((kind, id) => makeTile(kind, id + 1300));
  const eastPon: Meld = { type: 'pon', open: true, tiles: [27, 27, 27].map((kind, id) => makeTile(kind, id + 1400)) };
  assert.equal(scoreHand(hand, { ...options, seatWind: 'east', melds: [eastPon] }).han, 2);
});

test('counts red fives and indicator dora only after a real yaku', () => {
  const tiles = [0, 1, 2, 12, 13, 14, 18, 19, 20, 23, 24, 25, 10, 10].map((kind, id) => ({
    ...makeTile(kind, id + 1500),
    red: kind === 13,
  }));
  const score = scoreHand(tiles, {
    tsumo: false,
    riichi: true,
    roundWind: 'east',
    seatWind: 'south',
    dealer: false,
    doraIndicators: [makeTile(12, 1600)],
  });
  assert.ok(score.yaku.includes('宝牌 2'));
  assert.equal(score.han >= 3, true);
});

test('gives pon priority over a human chi on the same discard', () => {
  const base = createMatch(42);
  const calledTile = makeTile(3, 9000);
  const humanHand = [1, 2, 9, 10, 11, 12, 13, 14, 18, 19, 20, 28, 29].map((kind, id) => makeTile(kind, id + 9100));
  const aiHand = [3, 3, 0, 1, 2, 9, 10, 11, 18, 19, 20, 28, 29].map((kind, id) => makeTile(kind, id + 9200));
  const state = {
    ...base,
    phase: 'ai-turn' as const,
    currentPlayer: 3 as const,
    drawnTileId: calledTile.id,
    players: base.players.map((player) =>
      player.seat === 0
        ? { ...player, hand: humanHand }
        : player.seat === 1
          ? { ...player, hand: aiHand }
          : player.seat === 3
            ? { ...player, hand: [...player.hand.slice(0, 13), calledTile] }
            : player,
    ),
  };
  const fromDiscard = applyAction(state, 3, { type: 'discard', tileId: calledTile.id, label: '打出' });
  assert.equal(fromDiscard.accepted, true);
  assert.equal(fromDiscard.state.players[1]?.melds[0]?.type, 'pon');
  assert.equal(fromDiscard.state.players[0]?.melds.length, 0);
});

test('does not offer chi when another player can ron the same discard', () => {
  const base = createMatch(42);
  const tile = makeTile(3, 9300);
  const humanHand = [1, 2, 4, 5, 6, 9, 10, 11, 18, 19, 20, 28, 29].map((kind, id) => makeTile(kind, id + 9400));
  const winnerHand = [0, 0, 0, 9, 10, 11, 18, 19, 20, 31, 31, 31, 3].map((kind, id) => makeTile(kind, id + 9500));
  const state = {
    ...base,
    phase: 'reaction' as const,
    pendingReaction: { sourceSeat: 3 as const, tile, ronSeats: [1 as const] },
    players: base.players.map((player) =>
      player.seat === 0 ? { ...player, hand: humanHand } : player.seat === 1 ? { ...player, hand: winnerHand } : player,
    ),
  };
  assert.deepEqual(getLegalActions(state, 0), []);
});

test('a kan replenishes the dead wall from the live wall', () => {
  const base = createMatch(902);
  const hand = [0, 0, 0, 0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 21].map((kind, id) => makeTile(kind, id + 1700));
  const state = withPlayer({ ...base, drawnTileId: 1713 }, 0, { hand });
  const kan = getLegalActions(state, 0).find((action) => action.variant === 'ankan');
  assert.ok(kan);
  const next = applyAction(state, 0, kan).state;
  assert.equal(next.wall.length, state.wall.length - 1);
  assert.equal(next.deadWall.length, state.deadWall.length);
});

test('a drawn hand keeps honba even when the dealer rotates', () => {
  const base = createMatch(42, undefined, 2, 0, 'east', 2);
  const next = startNextRound({
    ...base,
    phase: 'round-over',
    result: { type: 'draw', yaku: [], message: '流局', dealerContinues: false },
  });
  assert.equal(next.honba, 3);
  assert.equal(next.dealer, 1);
});

test('open toitoi can win without a value triplet', () => {
  const hand = [9, 9, 9, 18, 18, 18, 29, 29, 29, 22, 22].map((kind, id) => makeTile(kind, id + 1800));
  const pon: Meld = { type: 'pon', open: true, tiles: [0, 0, 0].map((kind, id) => makeTile(kind, id + 1900)) };
  const score = scoreHand(hand, {
    tsumo: false,
    riichi: false,
    roundWind: 'east',
    seatWind: 'south',
    dealer: false,
    melds: [pon],
    winningTile: hand[8],
  });
  assert.ok(score.yaku.includes('对对和'));
  assert.ok(score.points > 0);
});

test('dora cannot make a no-yaku hand legal', () => {
  const hand = [0, 1, 2, 6, 7, 8, 12, 13, 14, 18, 19, 20, 30, 30].map((kind, id) => ({
    ...makeTile(kind, id + 2000),
    red: kind === 13,
  }));
  const score = scoreHand(hand, {
    tsumo: false,
    riichi: false,
    roundWind: 'east',
    seatWind: 'south',
    dealer: false,
    winningTile: hand[13],
    doraIndicators: [makeTile(12, 2100)],
  });
  assert.equal(score.han, 0);
  assert.equal(score.points, 0);
});

test('open-hand waits account for already owned meld tiles', () => {
  const hand = [1, 2, 3, 10, 11, 12, 18, 19, 20, 22].map((kind, id) => makeTile(kind, id + 2200));
  const pon: Meld = { type: 'pon', open: true, tiles: [27, 27, 27].map((kind, id) => makeTile(kind, id + 2300)) };
  assert.deepEqual(
    getTenpaiWaits(hand, [pon]).map((tile) => tile.kind),
    [22],
  );
  assert.deepEqual(
    getTenpaiWaits(hand).map((tile) => tile.kind),
    [],
  );
});

test('a riichi player may declare a concealed kan only without changing waits', () => {
  const base = createMatch(902);
  const hand = [0, 0, 0, 0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 21].map((kind, id) => makeTile(kind, id + 2400));
  const state = withPlayer({ ...base, drawnTileId: 2403 }, 0, { hand, riichi: true });
  const actions = getLegalActions(state, 0);
  const kan = actions.find((action) => action.variant === 'ankan');
  assert.ok(kan);
  const next = applyAction(state, 0, kan).state;
  assert.equal(next.players[0]?.riichi, true);
  assert.ok(actions.some((action) => action.type === 'discard'));
});
