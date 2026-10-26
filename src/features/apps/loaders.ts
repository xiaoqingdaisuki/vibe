/** 通过显式动态导入映射按需加载 Lab 应用 */

// 定义 Lab 应用按需加载器的类型
export type LabAppLoader = () => Promise<{
  default: React.ComponentType;
}>;

const LAB_APP_LOADERS: Record<string, LabAppLoader> = {
  // 按需加载地图应用
  map: () => import('./map/page-client'),
  // 按需加载在线编辑器
  editor: () => import('./editor/page-client'),
  // 按需加载冒险岛图鉴
  maplestory: () => import('./maplestory/page-client'),
  // 按需加载数独应用
  sudoku: () => import('./sudoku/page-client'),
  // 按需加载扫雷应用
  minesweeper: () => import('./minesweeper/page-client'),
  // 按需加载技能参考应用
  skill: () => import('./skill/page-client'),
  // 按需加载时区工具
  timezone: () => import('./timezone/page-client'),
  // 按需加载 RSS 阅读器
  rss: () => import('./rss/page-client'),
  // 按需加载放置角色游戏
  rpg: () => import('./game/page-client'),
  // 按需加载 AI 助手
  agent: () => import('./agent/page-client'),
  // 按需加载速记本
  note: () => import('./note/page-client'),
  // 按需加载麻将应用
  mahjong: () => import('./mahjong/page-client'),
  // 按需加载 GBA 模拟器
  gba: () => import('./gba/page-client'),
};

// 根据应用标识获取对应的按需加载器
export function getLabAppLoader(slug: string): LabAppLoader | undefined {
  return LAB_APP_LOADERS[slug];
}
