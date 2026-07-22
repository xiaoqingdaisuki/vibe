export type LabAppLoader = () => Promise<{
  default: React.ComponentType;
}>;

const LAB_APP_LOADERS: Record<string, LabAppLoader> = {
  sudoku: () => import('./sudoku/page-client'),
  minesweeper: () => import('./minesweeper/page-client'),
  skills: () => import('./skills/page-client'),
  rss: () => import('./rss/page-client'),
  rpg: () => import('./game/page-client'),
  agent: () => import('./agent/page-client'),
};

export function getLabAppLoader(slug: string): LabAppLoader | undefined {
  return LAB_APP_LOADERS[slug];
}
