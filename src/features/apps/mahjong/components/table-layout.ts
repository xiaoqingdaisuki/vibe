export interface TableTileMetrics {
  scale: number;
  wallWidth: number;
  wallHeight: number;
  wallInset: number;
  riverTileHeight: number;
  meldTileHeight: number;
  doraTileWidth: number;
  doraGap: number;
  edgeGap: number;
  riverGap: number;
}

interface TableTileLayoutInput {
  boardWidth: number;
  boardHeight: number;
}

// 根据实际牌桌尺寸生成牌墙、牌河、副露和宝牌的自适应规格
export function getTableTileMetrics({ boardWidth, boardHeight }: TableTileLayoutInput): TableTileMetrics {
  const boardScale = Math.min(boardWidth / 900, boardHeight / 500);
  const scale = Math.min(1.35, Math.max(0.82, boardScale * 1.15));
  return {
    scale,
    wallWidth: Math.round(Math.min(42, Math.max(26, 32 * scale))),
    wallHeight: Math.round(Math.min(34, Math.max(20, 24 * scale))),
    wallInset: Math.round(Math.min(26, Math.max(18, 18 * scale))),
    riverTileHeight: Math.round(Math.min(40, Math.max(25, 30 * scale))),
    meldTileHeight: Math.round(Math.min(42, Math.max(26, 32 * scale))),
    doraTileWidth: Math.round(Math.min(36, Math.max(22, 26 * scale))),
    doraGap: Math.round(Math.min(6, Math.max(3, 4 * scale))),
    edgeGap: Math.round(Math.min(10, Math.max(4, 6 * scale))),
    riverGap: Math.round(Math.min(36, Math.max(10, 24 * scale))),
  };
}
