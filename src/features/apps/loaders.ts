// Lab app 懒加载器类型定义
export type LabAppLoader = () => Promise<{
  default: React.ComponentType<{ initialFilter?: string }>;
}>;

const LAB_APP_LOADERS: Record<string, LabAppLoader> = {
  maplestory: () => import('./maplestory/page-client'),
  sudoku: () => import('./sudoku/page-client'),
  minesweeper: () => import('./minesweeper/page-client'),
  skill: () => import('./skill/page-client'),
  timezone: () => import('./timezone/page-client'),
  rss: () => import('./rss/page-client'),
  rpg: () => import('./game/page-client'),
  ai: () => import('./agent/page-client'),
};

// 根据 slug 获取对应的 app 懒加载器
export function getLabAppLoader(slug: string): LabAppLoader | undefined {
  return LAB_APP_LOADERS[slug];
}
