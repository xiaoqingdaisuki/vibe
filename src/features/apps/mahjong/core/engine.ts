import { evaluateDiscard, isTenpai, isWinningHand, scoreHand } from './scoring.ts';
import { createTileSet, shuffleTiles, tileSortValue } from './tiles.ts';
import type {
  DispatchResult,
  GamePhase,
  LegalAction,
  MahjongState,
  PlayerState,
  ReactionWindow,
  RoundResult,
  RulesConfig,
  Seat,
  Tile,
} from './types.ts';

export const DEFAULT_RULES: RulesConfig = {
  id: 'vibe-riichi-v1',
  startingScore: 25_000,
  redFives: true,
  roundCount: 4,
};

const PLAYER_NAMES = ['小青', '林悠', '森川葵', '白石澪'] as const;

// 使用安全随机源生成一局可回放的初始种子
export function createSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 1;
  }
  return Date.now() >>> 0;
}

// 创建一名座位状态，避免 UI 与规则层共享可变数组
function createPlayer(seat: Seat, hand: Tile[] = [], score = DEFAULT_RULES.startingScore): PlayerState {
  return {
    seat,
    name: PLAYER_NAMES[seat],
    isHuman: seat === 0,
    hand,
    discards: [],
    melds: [],
    score,
    riichi: false,
    furiten: false,
  };
}

// 从当前牌山抽出一张牌，并返回新的牌山和摸入牌
function drawFromWall(wall: readonly Tile[]): { wall: Tile[]; tile: Tile | null } {
  const nextWall = [...wall];
  const tile = nextWall.shift() ?? null;
  return { wall: nextWall, tile };
}

// 用新手牌替换指定座位，保持 MatchState 的不可变更新
function replacePlayer(players: readonly PlayerState[], player: PlayerState): PlayerState[] {
  return players.map((candidate) => (candidate.seat === player.seat ? player : { ...candidate }));
}

// 对手牌补上弃牌后判断荣和资格
function getRonSeats(state: MahjongState, sourceSeat: Seat, tile: Tile): Seat[] {
  return state.players
    .filter((player) => player.seat !== sourceSeat && !player.furiten)
    .filter((player) => isWinningHand([...player.hand, tile]))
    .filter(
      (player) =>
        scoreHand([...player.hand, tile], {
          tsumo: false,
          riichi: player.riichi,
          roundWind: state.roundWind,
          dealer: player.seat === state.dealer,
        }).han > 0,
    )
    .map((player) => player.seat);
}

// 将牌局推进到下一位玩家的摸牌阶段
function drawForNextPlayer(state: MahjongState, nextSeat: Seat): MahjongState {
  const draw = drawFromWall(state.wall);
  if (!draw.tile) {
    return {
      ...state,
      phase: 'round-over',
      result: {
        type: 'draw',
        yaku: [],
        message: '牌山耗尽，本局流局',
      },
      pendingReaction: null,
      lastDiscard: null,
      drawnTileId: null,
      seq: state.seq + 1,
    };
  }
  const player = state.players[nextSeat];
  const nextPlayer: PlayerState = { ...player, hand: [...player.hand, draw.tile] };
  return {
    ...state,
    wall: draw.wall,
    players: replacePlayer(state.players, nextPlayer),
    currentPlayer: nextSeat,
    phase: nextSeat === 0 ? 'player-turn' : 'ai-turn',
    pendingReaction: null,
    lastDiscard: null,
    drawnTileId: draw.tile.id,
    seq: state.seq + 1,
  };
}

// 结算自摸或荣和，并保留一份适合训练查看的说明
function finishWin(
  state: MahjongState,
  winner: Seat,
  type: 'tsumo' | 'ron',
  loser?: Seat,
  winningTile?: Tile,
): MahjongState {
  const player = state.players[winner];
  const tiles = winningTile ? [...player.hand, winningTile] : [...player.hand];
  const score = scoreHand(tiles, {
    tsumo: type === 'tsumo',
    riichi: player.riichi,
    roundWind: state.roundWind,
    dealer: winner === state.dealer,
  });
  const matchScores = state.players.map((candidate) => {
    if (candidate.seat === winner) return candidate.score + score.points;
    if (type === 'ron' && candidate.seat === loser) return candidate.score - score.points;
    if (type === 'tsumo') return candidate.score - Math.floor(score.points / 3);
    return candidate.score;
  });
  const result: RoundResult = {
    type,
    winner,
    loser,
    han: score.han,
    fu: score.fu,
    points: score.points,
    yaku: score.yaku,
    message: `${player.name}${type === 'tsumo' ? '自摸' : '荣和'}，${score.han} 番 ${score.fu} 符，${score.points} 点`,
  };
  return {
    ...state,
    phase: 'round-over',
    pendingReaction: null,
    result,
    matchScores,
    seq: state.seq + 1,
  };
}

// 将指定座位的弃牌写入牌河，并计算荣和反应窗口
function discardTile(state: MahjongState, seat: Seat, tileId: number, riichi = false): MahjongState {
  const player = state.players[seat];
  const tile = player.hand.find((candidate) => candidate.id === tileId);
  if (!tile) return state;
  const hand = player.hand
    .filter((candidate) => candidate.id !== tileId)
    .sort((a, b) => tileSortValue(a) - tileSortValue(b));
  const nextPlayer: PlayerState = {
    ...player,
    hand,
    discards: [...player.discards, tile],
    riichi: player.riichi || riichi,
  };
  const nextState: MahjongState = {
    ...state,
    players: replacePlayer(state.players, nextPlayer),
    lastDiscard: tile,
    drawnTileId: null,
    seq: state.seq + 1,
  };
  const ronSeats = getRonSeats(nextState, seat, tile);
  const humanCanRon = ronSeats.includes(0);
  const aiCanRon = ronSeats.find((candidate) => candidate !== 0);
  if (aiCanRon !== undefined) return finishWin(nextState, aiCanRon, 'ron', seat, tile);
  if (humanCanRon) {
    const pendingReaction: ReactionWindow = { sourceSeat: seat, tile, ronSeats: [0] };
    return { ...nextState, phase: 'reaction', pendingReaction };
  }
  return drawForNextPlayer(nextState, ((seat + 1) % 4) as Seat);
}

// 创建并发牌一局东风局，庄家先摸牌进入人类回合
export function createMatch(
  seed = createSeed(),
  scores?: readonly number[],
  roundNumber = 1,
  dealer: Seat = 0,
): MahjongState {
  const wall = shuffleTiles(createTileSet(DEFAULT_RULES.redFives), seed);
  const hands: Tile[][] = [[], [], [], []];
  let wallIndex = 0;
  for (let count = 0; count < 13; count += 1) {
    for (let seat = 0; seat < 4; seat += 1) {
      const tile = wall[wallIndex];
      if (tile) hands[seat].push(tile);
      wallIndex += 1;
    }
  }
  const players = hands.map((hand, index) =>
    createPlayer(
      index as Seat,
      hand.sort((a, b) => tileSortValue(a) - tileSortValue(b)),
      scores?.[index] ?? DEFAULT_RULES.startingScore,
    ),
  );
  const remainingWall = wall.slice(wallIndex);
  const state: MahjongState = {
    rules: DEFAULT_RULES,
    seed,
    seq: 0,
    roundWind: 'east',
    roundNumber,
    dealer,
    currentPlayer: dealer,
    wall: remainingWall,
    doraIndicators: remainingWall.slice(-5, -4),
    players,
    phase: 'ai-turn',
    pendingReaction: null,
    lastDiscard: null,
    result: null,
    matchScores: players.map((player) => player.score),
    drawnTileId: null,
  };
  return drawForNextPlayer(state, dealer);
}

// 返回当前座位可执行的动作，用于人类按钮和 AI 输入约束
export function getLegalActions(state: MahjongState, seat: Seat): LegalAction[] {
  const player = state.players[seat];
  if (state.phase === 'reaction' && state.pendingReaction?.ronSeats.includes(seat)) {
    return [
      { type: 'ron', label: '荣和' },
      { type: 'pass', label: '跳过' },
    ];
  }
  if (state.phase !== (seat === 0 ? 'player-turn' : 'ai-turn') || state.currentPlayer !== seat) return [];
  const actions: LegalAction[] = [];
  if (isWinningHand(player.hand)) actions.push({ type: 'tsumo', label: '自摸' });
  const discards =
    player.riichi && state.drawnTileId !== null
      ? player.hand.filter((tile) => tile.id === state.drawnTileId)
      : player.hand;
  for (const tile of discards) {
    actions.push({ type: 'discard', tileId: tile.id, label: '打出' });
    const remaining = player.hand.filter((candidate) => candidate.id !== tile.id);
    if (!player.riichi && player.score >= 1_000 && isTenpai(remaining)) {
      actions.push({ type: 'riichi', tileId: tile.id, label: '立直并打出' });
    }
  }
  return actions;
}

// 应用人类或 AI 的一个动作，返回不可变的新牌局状态
export function applyAction(state: MahjongState, seat: Seat, action: LegalAction): DispatchResult {
  const legal = getLegalActions(state, seat).some(
    (candidate) => candidate.type === action.type && candidate.tileId === action.tileId,
  );
  if (!legal) return { state, accepted: false, reason: '当前阶段不可执行该动作' };
  if (action.type === 'tsumo') return { state: finishWin(state, seat, 'tsumo'), accepted: true };
  if (action.type === 'discard') return { state: discardTile(state, seat, action.tileId ?? -1), accepted: true };
  if (action.type === 'riichi') return { state: discardTile(state, seat, action.tileId ?? -1, true), accepted: true };
  if (action.type === 'ron') {
    const reaction = state.pendingReaction;
    if (!reaction) return { state, accepted: false, reason: '没有待处理的荣和窗口' };
    return { state: finishWin(state, seat, 'ron', reaction.sourceSeat, reaction.tile), accepted: true };
  }
  if (action.type === 'pass' && state.pendingReaction) {
    return { state: drawForNextPlayer(state, ((state.pendingReaction.sourceSeat + 1) % 4) as Seat), accepted: true };
  }
  return { state, accepted: false, reason: '未知动作' };
}

// 为 AI 选择一张兼顾对子、连接和赤牌价值的弃牌
export function chooseAiDiscard(player: PlayerState): Tile | null {
  return (
    [...player.hand].sort(
      (left, right) => evaluateDiscard(left, player.hand) - evaluateDiscard(right, player.hand),
    )[0] ?? null
  );
}

// 执行 AI 的自摸、立直或弃牌动作，供页面调度器调用
export function playAiTurn(state: MahjongState, seat: Seat): MahjongState {
  const actions = getLegalActions(state, seat);
  const tsumo = actions.find((action) => action.type === 'tsumo');
  if (tsumo) return applyAction(state, seat, tsumo).state;
  const player = state.players[seat];
  const tile = player.riichi
    ? (player.hand.find((candidate) => candidate.id === state.drawnTileId) ?? player.hand[0])
    : chooseAiDiscard(player);
  if (!tile) return { ...state, phase: 'round-over' as GamePhase, seq: state.seq + 1 };
  const riichi = actions.find((action) => action.type === 'riichi' && action.tileId === tile.id);
  return applyAction(state, seat, riichi ?? { type: 'discard', tileId: tile.id, label: '打出' }).state;
}

// 开始下一局并沿用当前半庄的累计分数
export function startNextRound(state: MahjongState): MahjongState {
  const nextRound = state.roundNumber + 1;
  if (nextRound > state.rules.roundCount) return { ...state, phase: 'match-over', seq: state.seq + 1 };
  const winner = state.result?.winner;
  const nextDealer =
    winner === undefined || winner === state.dealer ? state.dealer : (((state.dealer + 1) % 4) as Seat);
  return createMatch((state.seed + state.seq + nextRound * 7919) >>> 0, state.matchScores, nextRound, nextDealer);
}
