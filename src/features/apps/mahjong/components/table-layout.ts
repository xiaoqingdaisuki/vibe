export interface TableTileMetrics {
  scale: number;
  wallWidth: number;
  wallHeight: number;
  wallInset: number;
  riverTileHeight: number;
  meldTileHeight: number;
  handTileHeight: number;
  doraTileWidth: number;
  doraGap: number;
  edgeGap: number;
  riverGap: number;
}

export interface HumanHandMetrics {
  tileWidth: number;
  tileHeight: number;
  handWidth: number;
  handX: number;
  handGap: number;
}

// 为手牌绘制与点击命中计算同一组坐标
export function getHumanHandMetrics(
  layout: { width: number; boardWidth: number; desktop: boolean },
  handLength: number,
  preferredTileHeight: number,
): HumanHandMetrics {
  const handGap = layout.desktop ? 4 : 2;
  if (handLength <= 0) return { tileWidth: 0, tileHeight: 0, handWidth: 0, handX: layout.width / 2, handGap };
  const handWidthLimit = layout.desktop ? Math.min(layout.boardWidth * 0.78, layout.width - 84) : layout.width - 16;
  const preferredTileWidth = preferredTileHeight / 1.28;
  const tileWidth = Math.max(
    18,
    Math.min(preferredTileWidth, (handWidthLimit - handGap * (handLength - 1)) / handLength),
  );
  const tileHeight = Math.min(preferredTileHeight, tileWidth * 1.28);
  const handWidth = tileWidth * handLength + handGap * (handLength - 1);
  return { tileWidth, tileHeight, handWidth, handX: (layout.width - handWidth) / 2, handGap };
}

interface TableTileLayoutInput {
  boardWidth: number;
  boardHeight: number;
}

// 根据实际牌桌尺寸生成牌墙、牌河、副露和宝牌的自适应规格
export function getTableTileMetrics({ boardWidth, boardHeight }: TableTileLayoutInput): TableTileMetrics {
  const boardScale = Math.min(boardWidth / 900, boardHeight / 500);
  const scale = Math.min(1.5, Math.max(0.86, boardScale * 1.24));
  return {
    scale,
    wallWidth: Math.round(Math.min(46, Math.max(28, 32 * scale))),
    wallHeight: Math.round(Math.min(36, Math.max(22, 24 * scale))),
    wallInset: Math.round(Math.min(28, Math.max(20, 18 * scale))),
    riverTileHeight: Math.round(Math.min(46, Math.max(28, 30 * scale))),
    meldTileHeight: Math.round(Math.min(48, Math.max(30, 32 * scale))),
    handTileHeight: Math.round(Math.min(104, Math.max(56, 82 * scale))),
    doraTileWidth: Math.round(Math.min(40, Math.max(24, 26 * scale))),
    doraGap: Math.round(Math.min(7, Math.max(3, 4 * scale))),
    edgeGap: Math.round(Math.min(12, Math.max(4, 6 * scale))),
    riverGap: Math.round(Math.min(40, Math.max(12, 24 * scale))),
  };
}
