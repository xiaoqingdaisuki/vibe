import { evaluateDiscard, getTenpaiWaits, isTenpai, isWinningHand, scoreHand } from './scoring.ts';
import { createTileSet, shuffleTiles, tileSortValue, toCounts } from './tiles.ts';
import type {
  DispatchResult,
  GamePhase,
  LegalAction,
  MahjongState,
  Meld,
  PlayerState,
  RoundResult,
  RulesConfig,
  Seat,
  Tile,
  Wind,
} from './types.ts';

export const DEFAULT_RULES: RulesConfig = {
  id: 'vibe-riichi-v1',
  startingScore: 25_000,
  redFives: true,
  roundCount: 4,
};

const PLAYER_NAMES = ['玩家', '林悠', '森川葵', '白石澪'] as const;
const ROUND_SEATS: readonly Seat[] = [0, 1, 2, 3];
const ACTION_PRIORITY: Readonly<Record<ActionTypeForPriority, number>> = {
  kan: 0,
  pon: 1,
  chi: 2,
};
type ActionTypeForPriority = 'chi' | 'pon' | 'kan';

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
    riichiDiscardId: null,
    furiten: false,
    temporaryFuriten: false,
  };
}

// 从当前牌山抽出一张牌，并返回新的牌山和摸入牌
function drawFromWall(wall: readonly Tile[]): { wall: Tile[]; tile: Tile | null } {
  const nextWall = [...wall];
  const tile = nextWall.shift() ?? null;
  return { wall: nextWall, tile };
}

// 用新手牌替换指定座位，保持牌局状态的不可变更新
function replacePlayer(players: readonly PlayerState[], player: PlayerState): PlayerState[] {
  return players.map((candidate) => (candidate.seat === player.seat ? player : { ...candidate }));
}

// 返回牌手当前听牌，供舍牌振听和立直确认共用
function getPlayerWaits(player: PlayerState): Tile[] {
  return getTenpaiWaits(player.hand, player.melds);
}

// 根据现有牌河重算舍牌振听，允许非立直手牌换听后解除振听
function refreshFuriten(player: PlayerState, temporaryFuriten = player.temporaryFuriten): PlayerState {
  const waitKinds = new Set(getPlayerWaits(player).map((tile) => tile.kind));
  const discardFuriten = player.discards.some((tile) => waitKinds.has(tile.kind));
  return {
    ...player,
    furiten: discardFuriten || (player.riichi && player.furiten),
    temporaryFuriten,
  };
}

// 判断牌手能否以当前手牌自摸并满足至少一番役
function canWinByTsumo(state: MahjongState, player: PlayerState): boolean {
  return (
    isWinningHand(player.hand, player.melds) &&
    scoreHand(player.hand, {
      tsumo: true,
      riichi: player.riichi,
      roundWind: state.roundWind,
      dealer: player.seat === state.dealer,
      melds: player.melds,
    }).han > 0
  );
}

// 对手牌补上弃牌后判断荣和资格，同时应用舍牌振听限制
function getRonSeats(state: MahjongState, sourceSeat: Seat, tile: Tile): Seat[] {
  return state.players
    .filter((player) => player.seat !== sourceSeat && !player.furiten && !player.temporaryFuriten)
    .filter((player) => isWinningHand([...player.hand, tile], player.melds))
    .filter(
      (player) =>
        scoreHand([...player.hand, tile], {
          tsumo: false,
          riichi: player.riichi,
          roundWind: state.roundWind,
          dealer: player.seat === state.dealer,
          melds: player.melds,
        }).han > 0,
    )
    .map((player) => player.seat);
}

// 在王牌岭上牌中补摸一张，并翻开下一张杠宝牌
function drawFromRinshan(state: MahjongState, seat: Seat): MahjongState {
  if (state.rinshan.length === 0 || state.kanCount >= 4) return finishDraw(state);
  const tile = state.rinshan[0];
  const player = state.players[seat];
  const nextPlayer = refreshFuriten({ ...player, hand: [...player.hand, tile] }, false);
  const nextDora = state.deadWall[0] ? [...state.doraIndicators, state.deadWall[0]] : [...state.doraIndicators];
  return {
    ...state,
    players: replacePlayer(state.players, nextPlayer),
    rinshan: state.rinshan.slice(1),
    deadWall: state.deadWall.slice(1),
    doraIndicators: nextDora,
    currentPlayer: seat,
    phase: seat === 0 ? 'player-turn' : 'ai-turn',
    pendingReaction: null,
    lastDiscard: null,
    drawnTileId: tile.id,
    kanCount: state.kanCount + 1,
    seq: state.seq + 1,
  };
}

// 结算荒牌流局时的听牌罚符，并记录庄家是否听牌连庄
function finishDraw(state: MahjongState): MahjongState {
  const tenpaiSeats = state.players
    .filter((player) => isTenpai(player.hand, player.melds))
    .map((player) => player.seat);
  const deltas = [0, 0, 0, 0];
  if (tenpaiSeats.length > 0 && tenpaiSeats.length < 4) {
    const gain = 3000 / tenpaiSeats.length;
    const loss = 3000 / (4 - tenpaiSeats.length);
    for (const seat of ROUND_SEATS) {
      deltas[seat] = tenpaiSeats.includes(seat) ? gain : -loss;
    }
  }
  const matchScores = state.players.map((player) => player.score + (deltas[player.seat] ?? 0));
  const players = state.players.map((player) => ({ ...player, score: matchScores[player.seat] ?? player.score }));
  const dealerContinues = tenpaiSeats.includes(state.dealer);
  const result: RoundResult = {
    type: 'draw',
    yaku: [],
    dealerContinues,
    message: `牌山耗尽，本局流局 · ${tenpaiSeats.length} 家听牌${dealerContinues ? ' · 庄家连庄' : ''}`,
  };
  return {
    ...state,
    phase: 'round-over',
    players,
    pendingReaction: null,
    result,
    matchScores,
    drawnTileId: null,
    seq: state.seq + 1,
  };
}

// 将牌局推进到下一位玩家的摸牌阶段，并解除同巡振听
function drawForNextPlayer(state: MahjongState, nextSeat: Seat): MahjongState {
  const draw = drawFromWall(state.wall);
  if (!draw.tile) return finishDraw(state);
  const player = state.players[nextSeat];
  const nextPlayer = refreshFuriten({ ...player, hand: [...player.hand, draw.tile] }, false);
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

// 结算自摸或荣和，区分每种和牌方式的付款并更新牌手分数
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
    melds: player.melds,
  });
  if (score.han === 0) return state;

  const nextScores = state.players.map((candidate) => candidate.score);
  if (type === 'ron') {
    nextScores[winner] = (nextScores[winner] ?? 0) + score.points;
    if (loser !== undefined) nextScores[loser] = (nextScores[loser] ?? 0) - score.points;
  } else {
    for (const candidate of state.players) {
      if (candidate.seat === winner) continue;
      const payment =
        winner === state.dealer
          ? (score.childPayment ?? 0)
          : candidate.seat === state.dealer
            ? (score.dealerPayment ?? 0)
            : (score.childPayment ?? 0);
      nextScores[candidate.seat] = (nextScores[candidate.seat] ?? 0) - payment;
      nextScores[winner] = (nextScores[winner] ?? 0) + payment;
    }
  }
  if (state.riichiSticks > 0) {
    nextScores[winner] = (nextScores[winner] ?? 0) + state.riichiSticks * 1_000;
  }
  const players = state.players.map((candidate) => ({
    ...candidate,
    score: nextScores[candidate.seat] ?? candidate.score,
  }));
  const result: RoundResult = {
    type,
    winner,
    loser,
    han: score.han,
    fu: score.fu,
    points: score.points,
    yaku: score.yaku,
    dealerContinues: winner === state.dealer,
    message: `${player.name}${type === 'tsumo' ? '自摸' : '荣和'}，${score.han} 番 ${score.fu} 符，${score.points} 点`,
  };
  return {
    ...state,
    phase: 'round-over',
    players,
    pendingReaction: null,
    result,
    matchScores: nextScores,
    riichiSticks: 0,
    seq: state.seq + 1,
  };
}

// 为指定牌手生成副露动作，严格限制碰杠优先于吃且吃只能由上家执行
function getCallActions(state: MahjongState, seat: Seat): LegalAction[] {
  const reaction = state.pendingReaction;
  const player = state.players[seat];
  if (!reaction || !player || player.riichi || state.kanCount >= 4) return [];
  const actions: LegalAction[] = [];
  const matchingTiles = player.hand.filter((candidate) => candidate.kind === reaction.tile.kind);
  if (matchingTiles.length >= 3) {
    actions.push({
      type: 'kan',
      variant: 'daiminkan',
      tileIds: matchingTiles.slice(0, 3).map((tile) => tile.id),
      label: `杠 ${compactTileLabel(reaction.tile)}`,
    });
  }
  if (matchingTiles.length >= 2) {
    actions.push({
      type: 'pon',
      tileIds: matchingTiles.slice(0, 2).map((tile) => tile.id),
      label: `碰 ${compactTileLabel(reaction.tile)}`,
    });
  }
  const nextSeat = ((reaction.sourceSeat + 1) % 4) as Seat;
  if (seat === nextSeat && reaction.tile.suit !== 'honor') {
    const rank = reaction.tile.rank;
    const kind = reaction.tile.kind;
    const patterns = [
      rank >= 3 ? [kind - 2, kind - 1] : null,
      rank >= 2 && rank <= 8 ? [kind - 1, kind + 1] : null,
      rank <= 7 ? [kind + 1, kind + 2] : null,
    ];
    for (const pattern of patterns) {
      if (!pattern) continue;
      if (Math.floor(pattern[0] / 9) !== Math.floor(kind / 9)) continue;
      const consumed = pattern.map((targetKind) => player.hand.find((tile) => tile.kind === targetKind));
      if (consumed.every((tile): tile is Tile => tile !== undefined)) {
        actions.push({
          type: 'chi',
          variant: 'chi',
          tileIds: consumed.map((tile) => tile.id),
          label: `吃 ${pattern.map((targetKind) => compactTileLabel(createTileCandidate(targetKind))).join('、')}`,
        });
      }
    }
  }
  return actions;
}

// 根据牌种创建副露按钮需要的临时牌面
function createTileCandidate(kind: number): Tile {
  const isHonor = kind >= 27;
  const suit = isHonor ? 'honor' : (['man', 'pin', 'sou'] as const)[Math.floor(kind / 9)];
  return {
    id: -1,
    kind,
    suit: suit ?? 'honor',
    rank: isHonor ? kind - 26 : (kind % 9) + 1,
    red: false,
  };
}

// 返回牌手摸牌后可以执行的暗杠或加杠动作
function getSelfKanActions(state: MahjongState, player: PlayerState): LegalAction[] {
  if (state.drawnTileId === null || player.riichi || state.kanCount >= 4) return [];
  const actions: LegalAction[] = [];
  const counts = toCounts(player.hand);
  for (let kind = 0; kind < counts.length; kind += 1) {
    if (counts[kind] !== 4) continue;
    const tileIds = player.hand.filter((tile) => tile.kind === kind).map((tile) => tile.id);
    actions.push({
      type: 'kan',
      variant: 'ankan',
      tileIds,
      label: `暗杠 ${compactTileLabel(createTileCandidate(kind))}`,
    });
  }
  const drawnTile = player.hand.find((tile) => tile.id === state.drawnTileId);
  if (drawnTile) {
    const pon = player.melds.find((meld) => meld.type === 'pon' && meld.open && meld.tiles[0]?.kind === drawnTile.kind);
    if (pon) {
      actions.push({
        type: 'kan',
        variant: 'kakan',
        tileIds: [drawnTile.id],
        label: `加杠 ${compactTileLabel(drawnTile)}`,
      });
    }
  }
  return actions;
}

// 生成反应窗口中的荣和、吃碰杠和跳过动作
function getReactionActions(state: MahjongState, seat: Seat): LegalAction[] {
  const reaction = state.pendingReaction;
  if (!reaction || seat === reaction.sourceSeat) return [];
  const player = state.players[seat];
  const actions: LegalAction[] = [];
  if (reaction.ronSeats.includes(seat) && !player.furiten && !player.temporaryFuriten) {
    actions.push({ type: 'ron', label: '荣和' });
  }
  actions.push(...getCallActions(state, seat));
  if (actions.length > 0) actions.push({ type: 'pass', label: '跳过' });
  return actions;
}

// 选择 AI 对弃牌的最高优先级反应，碰杠优先于吃
function chooseAiReaction(state: MahjongState): { seat: Seat; action: LegalAction } | null {
  const reaction = state.pendingReaction;
  if (!reaction) return null;
  const candidates = state.players
    .filter((player) => player.seat !== 0 && player.seat !== reaction.sourceSeat)
    .flatMap((player) =>
      getReactionActions(state, player.seat)
        .filter((action) => action.type !== 'pass')
        .map((action) => ({ seat: player.seat, action })),
    );
  candidates.sort((left, right) => {
    const leftPriority = left.action.type === 'ron' ? -1 : ACTION_PRIORITY[left.action.type as ActionTypeForPriority];
    const rightPriority =
      right.action.type === 'ron' ? -1 : ACTION_PRIORITY[right.action.type as ActionTypeForPriority];
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftDistance = (left.seat - reaction.sourceSeat + 4) % 4;
    const rightDistance = (right.seat - reaction.sourceSeat + 4) % 4;
    return leftDistance - rightDistance;
  });
  return candidates[0] ?? null;
}

// 处理弃牌后的荣和、鸣牌和下一位摸牌，统一玩家与 AI 的优先级
function resolveDiscardReaction(state: MahjongState, sourceSeat: Seat, tile: Tile): MahjongState {
  const ronSeats = getRonSeats(state, sourceSeat, tile);
  const reactionState: MahjongState = {
    ...state,
    phase: 'reaction',
    pendingReaction: { sourceSeat, tile, ronSeats },
  };
  const humanActions = getReactionActions(reactionState, 0).filter((action) => action.type !== 'pass');
  if (humanActions.length > 0) return reactionState;
  const aiReaction = chooseAiReaction(reactionState);
  if (aiReaction?.action.type === 'ron') return finishWin(reactionState, aiReaction.seat, 'ron', sourceSeat, tile);
  if (aiReaction && aiReaction.action.type !== 'pass')
    return applyMeldCall(reactionState, aiReaction.seat, aiReaction.action);
  return drawForNextPlayer(state, ((sourceSeat + 1) % 4) as Seat);
}

// 将指定座位的弃牌写入牌河，并计算荣和或鸣牌反应窗口
function discardTile(state: MahjongState, seat: Seat, tileId: number, declareRiichi = false): MahjongState {
  const player = state.players[seat];
  const tile = player.hand.find((candidate) => candidate.id === tileId);
  if (!tile) return state;
  const declaringRiichi = declareRiichi && !player.riichi;
  const hand = player.hand
    .filter((candidate) => candidate.id !== tileId)
    .sort((left, right) => tileSortValue(left) - tileSortValue(right));
  const nextPlayer = refreshFuriten({
    ...player,
    hand,
    discards: [...player.discards, tile],
    riichi: player.riichi || declaringRiichi,
    riichiDiscardId: declaringRiichi ? tile.id : player.riichiDiscardId,
    score: player.score - (declaringRiichi ? 1_000 : 0),
  });
  const nextState: MahjongState = {
    ...state,
    players: replacePlayer(state.players, nextPlayer),
    riichiSticks: state.riichiSticks + (declaringRiichi ? 1 : 0),
    lastDiscard: tile,
    drawnTileId: null,
    seq: state.seq + 1,
  };
  return resolveDiscardReaction(nextState, seat, tile);
}

// 生成指定动作对应的副露，并在碰杠后恢复该牌手的出牌回合
function applyMeldCall(state: MahjongState, seat: Seat, action: LegalAction): MahjongState {
  const reaction = state.pendingReaction;
  if (!reaction || (action.type !== 'chi' && action.type !== 'pon' && action.type !== 'kan')) return state;
  const player = state.players[seat];
  const tileIds = action.tileIds ?? [];
  const consumed = tileIds
    .map((id) => player.hand.find((tile) => tile.id === id))
    .filter((tile): tile is Tile => tile !== undefined);
  const needed = action.type === 'chi' ? 2 : action.type === 'pon' ? 2 : 3;
  if (consumed.length !== needed) return state;
  const meldTiles = [...consumed, reaction.tile].sort((left, right) => tileSortValue(left) - tileSortValue(right));
  const meld: Meld = {
    type: action.type,
    tiles: meldTiles,
    open: true,
    calledTileId: reaction.tile.id,
    fromSeat: reaction.sourceSeat,
    variant: action.variant ?? (action.type === 'kan' ? 'daiminkan' : action.type),
  };
  const nextPlayer = refreshFuriten(
    {
      ...player,
      hand: player.hand.filter((tile) => !tileIds.includes(tile.id)),
      melds: [...player.melds, meld],
    },
    false,
  );
  const nextState: MahjongState = {
    ...state,
    players: replacePlayer(state.players, nextPlayer),
    currentPlayer: seat,
    phase: seat === 0 ? 'player-turn' : 'ai-turn',
    pendingReaction: null,
    lastDiscard: null,
    drawnTileId: null,
    seq: state.seq + 1,
  };
  return action.type === 'kan' ? drawFromRinshan(nextState, seat) : nextState;
}

// 在自摸回合执行暗杠或加杠，并补摸岭上牌继续该玩家的回合
function applySelfKan(state: MahjongState, seat: Seat, action: LegalAction): MahjongState {
  const player = state.players[seat];
  if (action.type !== 'kan' || !action.variant || action.variant === 'daiminkan') return state;
  if (action.variant === 'kakan') {
    const tileId = action.tileIds?.[0];
    const tile = player.hand.find((candidate) => candidate.id === tileId);
    if (!tile) return state;
    const meldIndex = player.melds.findIndex(
      (meld) => meld.type === 'pon' && meld.open && meld.tiles[0]?.kind === tile.kind,
    );
    const meld = player.melds[meldIndex];
    if (!meld) return state;
    const nextMeld: Meld = {
      ...meld,
      type: 'kan',
      tiles: [...meld.tiles, tile],
      variant: 'kakan',
    };
    const nextMelds = player.melds.map((candidate, index) => (index === meldIndex ? nextMeld : candidate));
    const nextPlayer = refreshFuriten(
      {
        ...player,
        hand: player.hand.filter((candidate) => candidate.id !== tile.id),
        melds: nextMelds,
      },
      false,
    );
    return drawFromRinshan(
      {
        ...state,
        players: replacePlayer(state.players, nextPlayer),
        drawnTileId: null,
        lastDiscard: null,
        seq: state.seq + 1,
      },
      seat,
    );
  }
  const tileIds = action.tileIds ?? [];
  const consumed = tileIds
    .map((id) => player.hand.find((tile) => tile.id === id))
    .filter((tile): tile is Tile => tile !== undefined);
  if (consumed.length !== 4) return state;
  const nextMeld: Meld = { type: 'kan', tiles: consumed, open: false, variant: 'ankan' };
  const nextPlayer = refreshFuriten(
    {
      ...player,
      hand: player.hand.filter((tile) => !tileIds.includes(tile.id)),
      melds: [...player.melds, nextMeld],
    },
    false,
  );
  return drawFromRinshan(
    {
      ...state,
      players: replacePlayer(state.players, nextPlayer),
      drawnTileId: null,
      lastDiscard: null,
      seq: state.seq + 1,
    },
    seat,
  );
}

// 创建并发牌一局，保留四张岭上牌和王牌区以支持真实杠流程
export function createMatch(
  seed = createSeed(),
  scores?: readonly number[],
  roundNumber = 1,
  dealer: Seat = 0,
  roundWind: Wind = 'east',
  honba = 0,
  riichiSticks = 0,
): MahjongState {
  const shuffled = shuffleTiles(createTileSet(DEFAULT_RULES.redFives), seed);
  const hands: Tile[][] = [[], [], [], []];
  let wallIndex = 0;
  for (let count = 0; count < 13; count += 1) {
    for (const seat of ROUND_SEATS) {
      const tile = shuffled[wallIndex];
      if (tile) hands[seat].push(tile);
      wallIndex += 1;
    }
  }
  const players = hands.map((hand, index) =>
    createPlayer(
      index as Seat,
      hand.sort((left, right) => tileSortValue(left) - tileSortValue(right)),
      scores?.[index] ?? DEFAULT_RULES.startingScore,
    ),
  );
  const remaining = shuffled.slice(wallIndex);
  const dead = remaining.slice(-14);
  const liveWall = remaining.slice(0, -14);
  const state: MahjongState = {
    rules: DEFAULT_RULES,
    seed,
    seq: 0,
    roundWind,
    roundNumber,
    honba,
    dealer,
    currentPlayer: dealer,
    wall: liveWall,
    rinshan: dead.slice(0, 4),
    deadWall: dead.slice(5),
    doraIndicators: dead[4] ? [dead[4]] : [],
    kanCount: 0,
    riichiSticks,
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
  if (state.phase === 'reaction' && state.pendingReaction?.sourceSeat !== seat) {
    return getReactionActions(state, seat);
  }
  if (state.phase !== (seat === 0 ? 'player-turn' : 'ai-turn') || state.currentPlayer !== seat) return [];
  const actions: LegalAction[] = [];
  if (canWinByTsumo(state, player)) actions.push({ type: 'tsumo', label: '自摸' });
  actions.push(...getSelfKanActions(state, player));
  const discards =
    player.riichi && state.drawnTileId !== null
      ? player.hand.filter((tile) => tile.id === state.drawnTileId)
      : player.hand;
  for (const tile of discards) {
    actions.push({ type: 'discard', tileId: tile.id, label: '打出' });
    const remaining = player.hand.filter((candidate) => candidate.id !== tile.id);
    const canDeclareRiichi =
      !player.riichi &&
      player.melds.every((meld) => !meld.open) &&
      player.score >= 1_000 &&
      isTenpai(remaining, player.melds);
    if (canDeclareRiichi) actions.push({ type: 'riichi', tileId: tile.id, label: '立直并打出' });
  }
  return actions;
}

// 判断两个动作的牌面参数是否一致，支持测试和 AI 只传动作类型的简写
function matchesAction(candidate: LegalAction, requested: LegalAction): boolean {
  if (candidate.type !== requested.type) return false;
  if (requested.tileId !== undefined && candidate.tileId !== requested.tileId) return false;
  if (requested.variant !== undefined && candidate.variant !== requested.variant) return false;
  if (requested.tileIds !== undefined && candidate.tileIds?.join(',') !== requested.tileIds.join(',')) return false;
  return true;
}

// 应用人类或 AI 的一个动作，返回不可变的新牌局状态
export function applyAction(state: MahjongState, seat: Seat, action: LegalAction): DispatchResult {
  const legalAction = getLegalActions(state, seat).find((candidate) => matchesAction(candidate, action));
  if (!legalAction) return { state, accepted: false, reason: '当前阶段不可执行该动作' };
  if (legalAction.type === 'tsumo') return { state: finishWin(state, seat, 'tsumo'), accepted: true };
  if (legalAction.type === 'discard') {
    return { state: discardTile(state, seat, legalAction.tileId ?? -1), accepted: true };
  }
  if (legalAction.type === 'riichi') {
    return { state: discardTile(state, seat, legalAction.tileId ?? -1, true), accepted: true };
  }
  if (legalAction.type === 'ron') {
    const reaction = state.pendingReaction;
    if (!reaction) return { state, accepted: false, reason: '没有待处理的荣和窗口' };
    return { state: finishWin(state, seat, 'ron', reaction.sourceSeat, reaction.tile), accepted: true };
  }
  if (legalAction.type === 'pass' && state.pendingReaction) {
    const player = state.players[seat];
    const passedRon = state.pendingReaction.ronSeats.includes(seat);
    const nextPlayer = passedRon
      ? {
          ...player,
          temporaryFuriten: true,
          furiten: player.riichi ? true : player.furiten,
        }
      : player;
    const nextState = {
      ...state,
      players: replacePlayer(state.players, nextPlayer),
      seq: state.seq + 1,
    };
    return { state: resolveAutomaticReaction(nextState), accepted: true };
  }
  if (
    legalAction.type === 'chi' ||
    legalAction.type === 'pon' ||
    (legalAction.type === 'kan' && state.phase === 'reaction')
  ) {
    return { state: applyMeldCall(state, seat, legalAction), accepted: true };
  }
  if (legalAction.type === 'kan') return { state: applySelfKan(state, seat, legalAction), accepted: true };
  return { state, accepted: false, reason: '未知动作' };
}

// 玩家跳过反应后，继续处理没有人类参与的 AI 荣和或鸣牌
function resolveAutomaticReaction(state: MahjongState): MahjongState {
  const reaction = state.pendingReaction;
  if (!reaction) return state;
  const aiReaction = chooseAiReaction(state);
  if (aiReaction?.action.type === 'ron')
    return finishWin(state, aiReaction.seat, 'ron', reaction.sourceSeat, reaction.tile);
  if (aiReaction && aiReaction.action.type !== 'pass') return applyMeldCall(state, aiReaction.seat, aiReaction.action);
  return drawForNextPlayer(state, ((reaction.sourceSeat + 1) % 4) as Seat);
}

// 为 AI 选择一张兼顾对子、连接和赤牌价值的弃牌
export function chooseAiDiscard(player: PlayerState): Tile | null {
  return (
    [...player.hand].sort(
      (left, right) => evaluateDiscard(left, player.hand) - evaluateDiscard(right, player.hand),
    )[0] ?? null
  );
}

// 执行 AI 的自摸、杠、立直或弃牌动作，供页面调度器调用
export function playAiTurn(state: MahjongState, seat: Seat): MahjongState {
  const actions = getLegalActions(state, seat);
  const tsumo = actions.find((action) => action.type === 'tsumo');
  if (tsumo) return applyAction(state, seat, tsumo).state;
  const kan = actions.find((action) => action.type === 'kan');
  if (kan) return applyAction(state, seat, kan).state;
  const player = state.players[seat];
  const tile = player.riichi
    ? (player.hand.find((candidate) => candidate.id === state.drawnTileId) ?? player.hand[0])
    : chooseAiDiscard(player);
  if (!tile) return { ...state, phase: 'round-over' as GamePhase, seq: state.seq + 1 };
  const riichi = actions.find((action) => action.type === 'riichi' && action.tileId === tile.id);
  return applyAction(state, seat, riichi ?? { type: 'discard', tileId: tile.id, label: '打出' }).state;
}

// 开始下一局，处理连庄、南入、南四终局和半庄累计分数
export function startNextRound(state: MahjongState): MahjongState {
  if (state.roundWind === 'south' && state.roundNumber >= state.rules.roundCount) {
    return { ...state, phase: 'match-over', seq: state.seq + 1 };
  }
  const highestScore = Math.max(...state.matchScores);
  const dealerScore = state.matchScores[state.dealer] ?? 0;
  const dealerNeedsPriorityContinuation =
    state.result?.dealerContinues === true && dealerScore >= 30_000 && dealerScore < highestScore;
  if (state.matchScores.some((score) => score >= 30_000) && !dealerNeedsPriorityContinuation) {
    return { ...state, phase: 'match-over', seq: state.seq + 1 };
  }
  if (state.result?.dealerContinues) {
    return createMatch(
      (state.seed + state.seq + (state.honba + 1) * 7919) >>> 0,
      state.matchScores,
      state.roundNumber,
      state.dealer,
      state.roundWind,
      state.honba + 1,
      state.riichiSticks,
    );
  }
  if (state.roundWind === 'east' && state.roundNumber >= state.rules.roundCount) {
    return createMatch(
      (state.seed + state.seq + 17_939) >>> 0,
      state.matchScores,
      1,
      ((state.dealer + 1) % 4) as Seat,
      'south',
      0,
      state.riichiSticks,
    );
  }
  const nextRound = state.roundNumber + 1;
  const nextDealer = ((state.dealer + 1) % 4) as Seat;
  return createMatch(
    (state.seed + state.seq + nextRound * 7919) >>> 0,
    state.matchScores,
    nextRound,
    nextDealer,
    state.roundWind,
    0,
    state.riichiSticks,
  );
}

// 返回短牌名供动作提示和副露标签使用
function compactTileLabel(tile: Tile): string {
  const labels = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (tile.kind >= 27) return ['东', '南', '西', '北', '白', '发', '中'][tile.kind - 27] ?? '?';
  const suit = ['万', '筒', '索'][Math.floor(tile.kind / 9)] ?? '';
  return `${labels[tile.kind % 9] ?? ''}${suit}`;
}
