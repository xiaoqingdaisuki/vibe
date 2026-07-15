export type CellState = 'hidden' | 'revealed' | 'flagged';

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export type InteractionMode = 'reveal' | 'flag';

export type DifficultyId = 'beginner' | 'intermediate' | 'expert' | 'custom';

export interface BoardConfig {
  rows: number;
  columns: number;
  mines: number;
}

export interface Cell {
  mine: boolean;
  adjacentMines: number;
  state: CellState;
  detonated: boolean;
}

export interface DifficultyPreset {
  id: Exclude<DifficultyId, 'custom'>;
  label: string;
  description: string;
  config: BoardConfig;
}
