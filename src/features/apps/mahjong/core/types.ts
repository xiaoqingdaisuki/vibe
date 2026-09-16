export type Seat = 0 | 1 | 2 | 3;

export type Suit = 'man' | 'pin' | 'sou' | 'honor';

export type Wind = 'east' | 'south' | 'west' | 'north';

export type GamePhase = 'player-turn' | 'ai-turn' | 'reaction' | 'round-over' | 'match-over';

export type ActionType = 'discard' | 'tsumo' | 'ron' | 'pass' | 'riichi';

export interface Tile {
  readonly id: number;
  readonly kind: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly red: boolean;
}

export interface Meld {
  readonly type: 'chi' | 'pon' | 'kan';
  readonly tiles: readonly Tile[];
  readonly open: boolean;
}

export interface PlayerState {
  readonly seat: Seat;
  readonly name: string;
  readonly isHuman: boolean;
  readonly hand: readonly Tile[];
  readonly discards: readonly Tile[];
  readonly melds: readonly Meld[];
  readonly score: number;
  readonly riichi: boolean;
  readonly furiten: boolean;
}

export interface RulesConfig {
  readonly id: 'vibe-riichi-v1';
  readonly startingScore: number;
  readonly redFives: boolean;
  readonly roundCount: 4;
}

export interface ReactionWindow {
  readonly sourceSeat: Seat;
  readonly tile: Tile;
  readonly ronSeats: readonly Seat[];
}

export interface RoundResult {
  readonly type: 'tsumo' | 'ron' | 'draw';
  readonly winner?: Seat;
  readonly loser?: Seat;
  readonly han?: number;
  readonly fu?: number;
  readonly points?: number;
  readonly yaku: readonly string[];
  readonly message: string;
}

export interface MahjongState {
  readonly rules: RulesConfig;
  readonly seed: number;
  readonly seq: number;
  readonly roundWind: Wind;
  readonly roundNumber: number;
  readonly dealer: Seat;
  readonly currentPlayer: Seat;
  readonly drawnTileId: number | null;
  readonly wall: readonly Tile[];
  readonly doraIndicators: readonly Tile[];
  readonly players: readonly PlayerState[];
  readonly phase: GamePhase;
  readonly pendingReaction: ReactionWindow | null;
  readonly lastDiscard: Tile | null;
  readonly result: RoundResult | null;
  readonly matchScores: readonly number[];
}

export interface LegalAction {
  readonly type: ActionType;
  readonly tileId?: number;
  readonly label: string;
}

export interface ScoreResult {
  readonly han: number;
  readonly fu: number;
  readonly points: number;
  readonly yaku: readonly string[];
}

export interface DispatchResult {
  readonly state: MahjongState;
  readonly accepted: boolean;
  readonly reason?: string;
}
