'use client';

import { useEffect, useRef } from 'react';
import type { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { FriendRoomSeat, FriendRoomSnapshot } from '../friend-room';
import type { LegalAction, MahjongState, Seat, Tile } from '../core/types';
import { tileLabel } from '../core/tiles';
import styles from '../styles/Mahjong.module.css';

export type MahjongScreen = 'lobby' | 'single' | 'friends';
export type MahjongUtilityPanel = 'none' | 'yaku' | 'settings';
export type MahjongFriendView = 'entry' | 'room' | 'game';
export type MahjongFriendTransportMode = 'network' | 'unavailable';
export type MahjongFriendAction =
  | { type: 'create-room' }
  | { type: 'join-room' }
  | { type: 'copy-code' }
  | { type: 'back' }
  | { type: 'digit'; digit: string }
  | { type: 'backspace' }
  | { type: 'request-ready' }
  | { type: 'confirm-ready' }
  | { type: 'cancel-ready' }
  | { type: 'start-game' };

interface PixiMahjongSurfaceProps {
  screen: MahjongScreen;
  utilityPanel: MahjongUtilityPanel;
  friendView: MahjongFriendView;
  friendTransportMode: MahjongFriendTransportMode;
  friendRoom: FriendRoomSnapshot | null;
  friendLocalPlayerId: string | null;
  friendCodeInput: string;
  friendNotice: string;
  friendReadyConfirm: boolean;
  state: MahjongState;
  selectedTileId: number | null;
  legalActions: readonly LegalAction[];
  onSelectTile: (tileId: number) => void;
  onAction: (action: LegalAction) => void;
  onRestart: () => void;
  onNextRound: () => void;
  onChooseMode: (mode: 'single' | 'friends') => void;
  onBackToLobby: () => void;
  onToggleUtilityPanel: (panel: Exclude<MahjongUtilityPanel, 'none'>) => void;
  onFriendAction: (action: MahjongFriendAction) => void;
  onFriendKey: (key: string) => void;
}

interface PixiApi {
  Application: new () => Application;
  Assets: { load: (url: string) => Promise<Texture> };
  Container: new () => Container;
  Graphics: new () => Graphics;
  Rectangle: new (x?: number, y?: number, width?: number, height?: number) => Rectangle;
  Sprite: new (texture?: Texture) => Sprite;
  Text: new (options: { text: string; style: Record<string, unknown> }) => Text;
}

interface LayoutMetrics {
  width: number;
  height: number;
  desktop: boolean;
  margin: number;
  boardX: number;
  boardY: number;
  boardWidth: number;
  boardHeight: number;
  handY: number;
  handHeight: number;
}

interface SceneHandlers {
  onSelectTile: (tileId: number) => void;
  onAction: (action: LegalAction) => void;
  onRestart: () => void;
  onNextRound: () => void;
  onChooseMode: (mode: 'single' | 'friends') => void;
  onBackToLobby: () => void;
  onToggleUtilityPanel: (panel: Exclude<MahjongUtilityPanel, 'none'>) => void;
  onFriendAction: (action: MahjongFriendAction) => void;
  onFriendKey: (key: string) => void;
}

type TextureMap = ReadonlyMap<string, Texture>;

interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  onClick: () => void;
}

interface HumanActionItem {
  action: LegalAction;
  label: string;
  primary?: boolean;
}

const COLORS = {
  background: 0xc8dac8,
  backgroundSoft: 0xe7efe4,
  panel: 0x224734,
  panelRaised: 0x2d5b43,
  panelLine: 0x9ab396,
  board: 0x2f815c,
  boardEdge: 0xa47744,
  boardInner: 0x48976d,
  center: 0x193d31,
  centerLine: 0xd1ad63,
  ink: 0x263426,
  white: 0xf4f7f2,
  cream: 0xf9f4e9,
  creamEdge: 0xe2d5bc,
  muted: 0xc2d6c4,
  mutedDark: 0x6a7f6e,
  gold: 0xe0b45b,
  goldSoft: 0x8f6c3d,
  purple: 0xbba4ff,
  purpleSoft: 0x392f5c,
  red: 0xf17f76,
  redSoft: 0x5b2c31,
  green: 0x8ed6a8,
  cyan: 0xa8e0b8,
  wall: 0xd7842d,
  wallEdge: 0xf1b04c,
  suitMan: 0x2d647b,
  suitPin: 0xb76c3f,
  suitSou: 0x448c6b,
  honor: 0x806bc2,
} as const;

const TILE_ASSET_FILES = [
  'Back.png',
  ...Array.from({ length: 9 }, (_, index) => `Man${index + 1}.png`),
  'Man5-Dora.png',
  ...Array.from({ length: 9 }, (_, index) => `Pin${index + 1}.png`),
  'Pin5-Dora.png',
  ...Array.from({ length: 9 }, (_, index) => `Sou${index + 1}.png`),
  'Sou5-Dora.png',
  'Ton.png',
  'Nan.png',
  'Shaa.png',
  'Pei.png',
  'Haku.png',
  'Hatsu.png',
  'Chun.png',
] as const;

// 根据实际 Canvas 尺寸计算全屏牌桌与底部手牌的绘制区域
function getLayout(width: number, height: number): LayoutMetrics {
  const desktop = width >= 900;
  const margin = desktop ? 24 : 12;
  const handHeight = desktop ? 112 : 82;
  const boardY = desktop ? 82 : 58;
  const boardHeight = Math.max(300, height - boardY - handHeight - (desktop ? 24 : 16));
  const boardWidth = Math.min(width - margin * 2, desktop ? 1420 : width - margin * 2);
  const boardX = (width - boardWidth) / 2;
  const handY = height - handHeight - (desktop ? 12 : 8);
  return {
    width,
    height,
    desktop,
    margin,
    boardX,
    boardY,
    boardWidth,
    boardHeight,
    handY,
    handHeight,
  };
}

// 从本地 public 目录加载公有领域牌面，失败时保留矢量文字后备绘制
async function loadTileTextures(api: PixiApi): Promise<TextureMap> {
  const entries = await Promise.all(
    TILE_ASSET_FILES.map(async (file) => [file, await api.Assets.load(`/assets/mahjong/tiles/${file}`)] as const),
  );
  return new Map(entries);
}

// 创建 Pixi 文本，统一训练桌的字体、颜色和锚点
function createLabel(
  api: PixiApi,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: number,
  anchorX = 0,
  anchorY = 0,
  weight: '400' | '500' | '600' | '700' = '500',
): Text {
  const label = new api.Text({
    text,
    style: {
      fontFamily: 'Inter, Microsoft YaHei, sans-serif',
      fontSize,
      fill,
      fontWeight: weight,
      letterSpacing: 0.2,
    },
  });
  label.anchor.set(anchorX, anchorY);
  label.position.set(x, y);
  return label;
}

// 绘制可点击按钮，保证 Canvas 内部拥有完整的交互反馈
function addButton(
  api: PixiApi,
  parent: Container,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  primary = false,
  compact = false,
): void {
  const button = new api.Container();
  const background = new api.Graphics();
  background
    .roundRect(0, 0, width, height, compact ? 8 : 10)
    .fill(primary ? COLORS.gold : COLORS.panelRaised)
    .stroke({
      width: 1,
      color: primary ? COLORS.gold : COLORS.panelLine,
    });
  button.position.set(x, y);
  button.addChild(background);
  const text = createLabel(
    api,
    label,
    width / 2,
    height / 2,
    compact ? 12 : 14,
    primary ? COLORS.ink : COLORS.white,
    0.5,
    0.5,
    '600',
  );
  button.addChild(text);
  parent.addChild(button);
}

// 返回适合窄屏牌面的短牌名，赤牌用颜色与角标表达
function compactTileLabel(tile: Tile): string {
  return tileLabel(tile).replace('赤', '');
}

// 根据牌种切换牌面文字颜色，保持万筒索和字牌可快速区分
function tileTextColor(tile: Tile): number {
  if (tile.kind >= 0 && tile.kind <= 8) return COLORS.suitMan;
  if (tile.kind >= 9 && tile.kind <= 17) return COLORS.suitPin;
  if (tile.kind >= 18 && tile.kind <= 26) return COLORS.suitSou;
  return COLORS.honor;
}

// 将逻辑牌种映射到本地公有领域牌面素材文件名
function tileAssetKey(tile: Tile): string {
  if (tile.kind <= 8) return `Man${tile.kind + 1}${tile.red ? '-Dora' : ''}.png`;
  if (tile.kind <= 17) return `Pin${tile.kind - 8}${tile.red ? '-Dora' : ''}.png`;
  if (tile.kind <= 26) return `Sou${tile.kind - 17}${tile.red ? '-Dora' : ''}.png`;
  return (
    ['Ton.png', 'Nan.png', 'Shaa.png', 'Pei.png', 'Haku.png', 'Hatsu.png', 'Chun.png'][tile.kind - 27] ?? 'Ton.png'
  );
}

// 绘制一张带选中态和点击区域的手牌
function addHandTile(
  api: PixiApi,
  parent: Container,
  tile: Tile,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean,
  textures: TextureMap,
): void {
  const card = new api.Container();
  const background = new api.Graphics();
  background
    .roundRect(0, 0, width, height, Math.max(5, Math.min(9, width * 0.18)))
    .fill(selected ? COLORS.gold : COLORS.cream)
    .stroke({
      width: tile.red ? 2 : 1,
      color: tile.red ? COLORS.red : selected ? COLORS.gold : COLORS.creamEdge,
    });
  card.position.set(x, y - (selected ? 8 : 0));
  card.addChild(background);
  const texture = textures.get(tileAssetKey(tile));
  if (texture) {
    const sprite = new api.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(width / 2, height / 2);
    sprite.width = width * 0.82;
    sprite.height = height * 0.86;
    card.addChild(sprite);
  } else {
    const fontSize = Math.max(10, Math.min(18, width * 0.34));
    const text = createLabel(
      api,
      compactTileLabel(tile),
      width / 2,
      height / 2,
      fontSize,
      tileTextColor(tile),
      0.5,
      0.5,
      '700',
    );
    card.addChild(text);
  }
  if (tile.red) {
    const redMark = new api.Graphics();
    redMark.circle(width - 6, 6, 3).fill(COLORS.red);
    card.addChild(redMark);
  }
  parent.addChild(card);
}

// 绘制牌河中的小牌块，保持公开信息在不同尺寸下可扫描
function addRiverTiles(
  api: PixiApi,
  parent: Container,
  tiles: readonly Tile[],
  x: number,
  y: number,
  maxWidth: number,
  textures: TextureMap,
): void {
  const tileWidth = Math.max(15, Math.min(24, maxWidth / 10));
  const tileHeight = tileWidth * 1.28;
  const gap = Math.max(2, tileWidth * 0.12);
  const visibleTiles = tiles.slice(-18);
  visibleTiles.forEach((tile, index) => {
    const tileBox = new api.Container();
    const background = new api.Graphics();
    background
      .roundRect(0, 0, tileWidth, tileHeight, 3)
      .fill(COLORS.cream)
      .stroke({ width: 1, color: COLORS.creamEdge });
    tileBox.position.set(x + index * (tileWidth + gap), y);
    tileBox.addChild(background);
    parent.addChild(tileBox);
    const texture = textures.get(tileAssetKey(tile));
    if (texture) {
      const sprite = new api.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(tileWidth / 2, tileHeight / 2);
      sprite.width = tileWidth * 0.84;
      sprite.height = tileHeight * 0.86;
      tileBox.addChild(sprite);
    } else {
      const label = createLabel(
        api,
        compactTileLabel(tile),
        tileWidth / 2,
        tileHeight / 2,
        Math.max(7, tileWidth * 0.32),
        tileTextColor(tile),
        0.5,
        0.5,
        '700',
      );
      tileBox.addChild(label);
    }
  });
}

// 根据当前阶段整理 Canvas 需要展示的动作按钮
function getHumanActionItems(
  state: MahjongState,
  selectedTileId: number | null,
  legalActions: readonly LegalAction[],
): HumanActionItem[] {
  const human = state.players[0];
  const selectedDiscard = legalActions.find((action) => action.type === 'discard' && action.tileId === selectedTileId);
  const selectedRiichi = legalActions.find((action) => action.type === 'riichi' && action.tileId === selectedTileId);
  if (state.phase === 'reaction') {
    return legalActions.map((action) => ({
      action,
      label: action.type === 'ron' ? '荣和' : '跳过',
      primary: action.type === 'ron',
    }));
  }
  return [
    ...(selectedDiscard
      ? [
          {
            action: selectedDiscard,
            label: `打出 ${compactTileLabel(human.hand.find((tile) => tile.id === selectedTileId) ?? human.hand[0])}`,
            primary: true,
          },
        ]
      : []),
    ...(selectedRiichi ? [{ action: selectedRiichi, label: '立直并打出', primary: true }] : []),
    ...(legalActions.some((action) => action.type === 'tsumo')
      ? [{ action: { type: 'tsumo', label: '自摸' } as LegalAction, label: '自摸', primary: true }]
      : []),
  ];
}

// 计算动作按钮宽度，绘制与命中检测共用同一套尺寸
function getActionButtonWidth(label: string, desktop: boolean): number {
  return Math.max(desktop ? 100 : 76, label.length * (desktop ? 13 : 10) + 28);
}

// 绘制舒适的绿色绒面背景，使用柔和线条减少冷峻的生成式视觉感
function drawAtmosphere(api: PixiApi, root: Container, layout: LayoutMetrics, variant: 'lobby' | 'table'): void {
  const { width, height } = layout;
  const background = new api.Graphics();
  background.rect(0, 0, width, height).fill(COLORS.background);
  root.addChild(background);
  const felt = new api.Graphics();
  felt.rect(0, 0, width, height * 0.18).fill({ color: 0xf4f1dc, alpha: 0.42 });
  felt.rect(0, height * 0.78, width, height * 0.22).fill({ color: 0x96b99a, alpha: 0.2 });
  felt.circle(width * 0.12, height * 0.18, Math.min(width, height) * 0.2).fill({ color: 0xf4edd0, alpha: 0.22 });
  felt.circle(width * 0.9, height * 0.74, Math.min(width, height) * 0.24).fill({ color: 0x79a98b, alpha: 0.16 });
  root.addChild(felt);
  const texture = new api.Graphics();
  const lineColor = variant === 'table' ? 0x2e6e50 : 0x7a9b7a;
  for (let index = -2; index < 14; index += 1) {
    const y = height * 0.12 + index * Math.max(32, height * 0.08);
    texture
      .moveTo(0, y)
      .quadraticCurveTo(width * 0.35, y - 18, width * 0.68, y + 4)
      .quadraticCurveTo(width * 0.84, y + 12, width, y - 6)
      .stroke({ width: 1, color: lineColor, alpha: variant === 'table' ? 0.08 : 0.12 });
  }
  for (let index = 0; index < 7; index += 1) {
    const x = width * 0.1 + index * width * 0.15;
    texture
      .circle(x, height * 0.17 + (index % 3) * height * 0.3, Math.max(28, Math.min(width, height) * 0.06))
      .stroke({ width: 1, color: lineColor, alpha: 0.1 });
  }
  root.addChild(texture);
}

// 绘制四边牌墙，使用层叠色块表现参考图中的实体牌感
function drawWall(
  api: PixiApi,
  root: Container,
  x: number,
  y: number,
  count: number,
  tileWidth: number,
  tileHeight: number,
  direction: 'horizontal' | 'vertical',
): void {
  for (let index = 0; index < count; index += 1) {
    const offset = index * (direction === 'horizontal' ? tileWidth + 2 : tileHeight + 2);
    const tileX = direction === 'horizontal' ? x + offset : x;
    const tileY = direction === 'horizontal' ? y : y + offset;
    const shadow = new api.Graphics();
    shadow.roundRect(tileX + 3, tileY + 5, tileWidth, tileHeight, 4).fill({ color: 0x02070d, alpha: 0.5 });
    root.addChild(shadow);
    const tile = new api.Graphics();
    tile
      .roundRect(tileX, tileY, tileWidth, tileHeight, 4)
      .fill(COLORS.wall)
      .stroke({ width: 1, color: COLORS.wallEdge });
    root.addChild(tile);
    const top = new api.Graphics();
    top
      .rect(tileX + 3, tileY + 2, tileWidth - 6, Math.max(2, tileHeight * 0.14))
      .fill({ color: 0xffd37a, alpha: 0.72 });
    root.addChild(top);
  }
}

// 绘制中央八边形局况牌，集中展示风圈、余牌和宝牌
function drawCenterScore(api: PixiApi, root: Container, state: MahjongState, layout: LayoutMetrics): void {
  const { boardX, boardY, boardWidth, boardHeight, desktop } = layout;
  const centerWidth = Math.min(boardWidth * 0.34, desktop ? 440 : 280);
  const centerHeight = Math.min(boardHeight * 0.34, desktop ? 194 : 132);
  const centerX = boardX + (boardWidth - centerWidth) / 2;
  const centerY = boardY + (boardHeight - centerHeight) / 2;
  const octagon = new api.Graphics();
  const cut = Math.min(28, centerWidth * 0.12);
  octagon
    .moveTo(centerX + cut, centerY)
    .lineTo(centerX + centerWidth - cut, centerY)
    .lineTo(centerX + centerWidth, centerY + cut)
    .lineTo(centerX + centerWidth, centerY + centerHeight - cut)
    .lineTo(centerX + centerWidth - cut, centerY + centerHeight)
    .lineTo(centerX + cut, centerY + centerHeight)
    .lineTo(centerX, centerY + centerHeight - cut)
    .lineTo(centerX, centerY + cut)
    .closePath()
    .fill(COLORS.center)
    .stroke({ width: 2, color: COLORS.centerLine });
  root.addChild(octagon);
  root.addChild(
    createLabel(
      api,
      `东${state.roundNumber}局`,
      centerX + centerWidth / 2,
      centerY + centerHeight * 0.29,
      desktop ? 23 : 17,
      COLORS.cyan,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      `余 ${state.wall.length}`,
      centerX + centerWidth / 2,
      centerY + centerHeight * 0.55,
      desktop ? 18 : 14,
      COLORS.white,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      `${state.players[0].score.toLocaleString()} 点`,
      centerX + centerWidth / 2,
      centerY + centerHeight * 0.8,
      desktop ? 13 : 11,
      COLORS.gold,
      0.5,
      0.5,
      '600',
    ),
  );
  const doraLabel = state.doraIndicators.map((tile) => compactTileLabel(tile)).join('  ') || '—';
  root.addChild(
    createLabel(
      api,
      `宝牌 ${doraLabel}`,
      centerX + centerWidth / 2,
      centerY + centerHeight * 0.94,
      desktop ? 11 : 9,
      COLORS.muted,
      0.5,
      0.5,
      '500',
    ),
  );
  const windLabels: Array<{ text: string; x: number; y: number }> = [
    { text: '东', x: centerX + centerWidth / 2, y: centerY - 20 },
    { text: '南', x: centerX + centerWidth + 24, y: centerY + centerHeight / 2 },
    { text: '西', x: centerX + centerWidth / 2, y: centerY + centerHeight + 20 },
    { text: '北', x: centerX - 24, y: centerY + centerHeight / 2 },
  ];
  for (const item of windLabels)
    root.addChild(createLabel(api, item.text, item.x, item.y, desktop ? 14 : 11, COLORS.gold, 0.5, 0.5, '700'));
}

// 绘制带当前手牌数和分数的四方玩家席位卡
function drawSeatBadge(
  api: PixiApi,
  root: Container,
  player: MahjongState['players'][number],
  layout: LayoutMetrics,
  current: boolean,
  displayName = player.name,
): void {
  const { boardX, boardY, boardWidth, boardHeight, desktop } = layout;
  const boxWidth = desktop ? 168 : 132;
  const boxHeight = desktop ? 54 : 44;
  const positions: Record<Seat, { x: number; y: number }> = {
    0: { x: boardX + 42, y: boardY + boardHeight - boxHeight - 10 },
    1: { x: boardX + boardWidth - boxWidth - 12, y: boardY + boardHeight / 2 - boxHeight / 2 },
    2: { x: boardX + boardWidth - boxWidth - 42, y: boardY + 8 },
    3: { x: boardX + 12, y: boardY + boardHeight / 2 - boxHeight / 2 },
  };
  const position = positions[player.seat];
  const panel = new api.Graphics();
  panel
    .roundRect(position.x, position.y, boxWidth, boxHeight, 10)
    .fill({ color: current ? 0x3d6b4d : COLORS.panel, alpha: 0.94 })
    .stroke({ width: current ? 2 : 1, color: current ? COLORS.gold : COLORS.panelLine });
  root.addChild(panel);
  const avatar = new api.Graphics();
  avatar
    .circle(position.x + 24, position.y + boxHeight / 2, desktop ? 16 : 13)
    .fill([0x8f6aa6, 0xb76c3f, 0x438c89, 0x6d7fb2][player.seat]);
  avatar.circle(position.x + 24, position.y + boxHeight / 2, desktop ? 11 : 9).fill({ color: 0xf7e8ca, alpha: 0.84 });
  root.addChild(avatar);
  root.addChild(
    createLabel(
      api,
      current ? `● ${displayName}` : displayName,
      position.x + 46,
      position.y + 17,
      desktop ? 13 : 11,
      current ? COLORS.gold : COLORS.white,
      0,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      `${player.score.toLocaleString()} 点 · 河 ${player.discards.length}`,
      position.x + 46,
      position.y + 36,
      desktop ? 10 : 9,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
}

// 绘制参考截图风格的全屏实体牌桌、牌河和四方席位
function drawBoard(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
  seatLabels?: readonly string[],
): void {
  const { boardX, boardY, boardWidth, boardHeight, desktop } = layout;
  const outer = new api.Graphics();
  outer
    .roundRect(boardX, boardY, boardWidth, boardHeight, desktop ? 28 : 18)
    .fill({ color: 0x244b36, alpha: 0.96 })
    .stroke({ width: 2, color: COLORS.boardEdge });
  root.addChild(outer);
  const inner = new api.Graphics();
  inner
    .roundRect(boardX + 14, boardY + 14, boardWidth - 28, boardHeight - 28, desktop ? 22 : 14)
    .fill(COLORS.board)
    .stroke({ width: 1, color: COLORS.cyan });
  root.addChild(inner);
  const lane = new api.Graphics();
  lane
    .roundRect(
      boardX + boardWidth * 0.13,
      boardY + boardHeight * 0.12,
      boardWidth * 0.74,
      boardHeight * 0.72,
      desktop ? 18 : 12,
    )
    .stroke({ width: 1, color: 0x8fd4d2, alpha: 0.26 });
  root.addChild(lane);
  const wallWidth = desktop ? 34 : 22;
  const wallHeight = desktop ? 22 : 16;
  drawWall(api, root, boardX + boardWidth * 0.2, boardY + 25, 12, wallWidth, wallHeight, 'horizontal');
  drawWall(
    api,
    root,
    boardX + boardWidth * 0.2,
    boardY + boardHeight - wallHeight - 28,
    12,
    wallWidth,
    wallHeight,
    'horizontal',
  );
  drawWall(api, root, boardX + 23, boardY + boardHeight * 0.22, 7, wallHeight, wallWidth, 'vertical');
  drawWall(
    api,
    root,
    boardX + boardWidth - wallHeight - 23,
    boardY + boardHeight * 0.22,
    7,
    wallHeight,
    wallWidth,
    'vertical',
  );
  const centerWidth = Math.min(boardWidth * 0.34, desktop ? 440 : 280);
  const centerHeight = Math.min(boardHeight * 0.34, desktop ? 194 : 132);
  const centerX = boardX + (boardWidth - centerWidth) / 2;
  const centerY = boardY + (boardHeight - centerHeight) / 2;
  const riverWidth = desktop ? 320 : Math.min(boardWidth * 0.32, 210);
  const topRiverY = centerY - (desktop ? 90 : 62);
  const bottomRiverY = centerY + centerHeight + (desktop ? 55 : 34);
  addRiverTiles(
    api,
    root,
    state.players[2]?.discards ?? [],
    centerX + centerWidth / 2 - riverWidth / 2,
    topRiverY,
    riverWidth,
    textures,
  );
  addRiverTiles(
    api,
    root,
    state.players[0]?.discards ?? [],
    centerX + centerWidth / 2 - riverWidth / 2,
    bottomRiverY,
    riverWidth,
    textures,
  );
  addRiverTiles(
    api,
    root,
    state.players[3]?.discards ?? [],
    boardX + 56,
    centerY - 18,
    Math.min(220, boardWidth * 0.2),
    textures,
  );
  addRiverTiles(
    api,
    root,
    state.players[1]?.discards ?? [],
    boardX + boardWidth - Math.min(276, boardWidth * 0.25),
    centerY - 18,
    Math.min(220, boardWidth * 0.2),
    textures,
  );
  drawCenterScore(api, root, state, layout);
  for (const player of state.players)
    drawSeatBadge(
      api,
      root,
      player,
      layout,
      player.seat === state.currentPlayer && state.phase !== 'round-over' && state.phase !== 'match-over',
      seatLabels?.[player.seat] ?? player.name,
    );
  if (state.lastDiscard) {
    const discardWidth = desktop ? 42 : 30;
    const discardHeight = desktop ? 54 : 40;
    const x = centerX + centerWidth / 2 - discardWidth / 2;
    const y = centerY + centerHeight / 2 - discardHeight / 2;
    const discard = new api.Graphics();
    discard.roundRect(x, y, discardWidth, discardHeight, 5).fill(COLORS.cream).stroke({ width: 2, color: COLORS.red });
    root.addChild(discard);
    const texture = textures.get(tileAssetKey(state.lastDiscard));
    if (texture) {
      const sprite = new api.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x + discardWidth / 2, y + discardHeight / 2);
      sprite.width = discardWidth * 0.82;
      sprite.height = discardHeight * 0.84;
      root.addChild(sprite);
    }
  }
}

// 绘制底部手牌轨道、动作按钮和训练状态提示
function drawHumanControls(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  selectedTileId: number | null,
  legalActions: readonly LegalAction[],
  layout: LayoutMetrics,
  textures: TextureMap,
): void {
  const { width, boardX, boardWidth, desktop, handY, handHeight } = layout;
  const human = state.players[0];
  const tileHeight = desktop ? 78 : 52;
  const handGap = desktop ? 4 : 2;
  const handWidthLimit = Math.min(boardWidth * 0.78, width - (desktop ? 84 : 24));
  const tileWidth = Math.max(
    24,
    Math.min(desktop ? 62 : 38, (handWidthLimit - handGap * (human.hand.length - 1)) / human.hand.length),
  );
  const handWidth = tileWidth * human.hand.length + handGap * (human.hand.length - 1);
  const handX = (width - handWidth) / 2;
  const rail = new api.Graphics();
  rail
    .roundRect(
      Math.max(12, handX - 18),
      handY - 12,
      handWidth + 36,
      Math.min(handHeight, tileHeight + 28),
      desktop ? 14 : 10,
    )
    .fill({ color: 0x101b2c, alpha: 0.9 })
    .stroke({ width: 1, color: COLORS.panelLine });
  root.addChild(rail);
  human.hand.forEach((tile, index) =>
    addHandTile(
      api,
      root,
      tile,
      handX + index * (tileWidth + handGap),
      handY,
      tileWidth,
      tileHeight,
      tile.id === selectedTileId,
      textures,
    ),
  );
  const actionList = getHumanActionItems(state, selectedTileId, legalActions);
  const actionHeight = desktop ? 34 : 28;
  const actionY = handY - (desktop ? 18 : 10);
  const actionWidths = actionList.map((item) => getActionButtonWidth(item.label, desktop));
  const totalWidth =
    actionWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + Math.max(0, actionList.length - 1) * 8;
  let actionX = (width - totalWidth) / 2;
  for (const [index, item] of actionList.entries()) {
    const actionWidth = actionWidths[index] ?? 90;
    addButton(
      api,
      root,
      item.label,
      actionX,
      actionY - actionHeight,
      actionWidth,
      actionHeight,
      item.primary,
      !desktop,
    );
    actionX += actionWidth + 8;
  }
  if (actionList.length === 0) {
    const hint =
      state.phase === 'player-turn'
        ? '选择手牌 · 点击后再确认打出'
        : state.phase === 'ai-turn'
          ? 'AI 正在读取牌河与向听数…'
          : state.phase === 'match-over'
            ? '半庄完成 · 可重新开局'
            : '等待结算';
    root.addChild(
      createLabel(api, hint, width / 2, handY - (desktop ? 28 : 20), desktop ? 13 : 11, COLORS.muted, 0.5, 0.5, '500'),
    );
  }
  root.addChild(
    createLabel(
      api,
      '点击手牌选择 · Esc 取消选择',
      boardX + 12,
      handY + handHeight - 10,
      desktop ? 10 : 9,
      COLORS.mutedDark,
      0,
      1,
      '500',
    ),
  );
}

// 绘制顶部局况、帮助设置图标和当前牌局标识
function drawTrainingPanel(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  title = '日麻 · 单人训练',
  subtitle = 'LOCAL REPLAY',
): void {
  const { width, margin, desktop } = layout;
  const panel = new api.Graphics();
  panel
    .roundRect(margin, 14, desktop ? 246 : 184, desktop ? 54 : 44, 10)
    .fill({ color: COLORS.panel, alpha: 0.92 })
    .stroke({ width: 1, color: COLORS.panelLine });
  root.addChild(panel);
  root.addChild(
    createLabel(api, title, margin + 14, desktop ? 29 : 25, desktop ? 14 : 11, COLORS.white, 0, 0.5, '700'),
  );
  root.addChild(
    createLabel(
      api,
      `东${state.roundNumber}局  ·  ${subtitle}  ·  牌山 ${state.wall.length}`,
      margin + 14,
      desktop ? 47 : 42,
      desktop ? 10 : 9,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
  const iconSize = desktop ? 42 : 34;
  const iconY = desktop ? 20 : 18;
  const icons = ['?', '⚙'];
  icons.forEach((icon, index) => {
    const x = width - margin - (icons.length - index) * (iconSize + 10);
    const button = new api.Graphics();
    button
      .roundRect(x, iconY, iconSize, iconSize, 10)
      .fill({ color: COLORS.panel, alpha: 0.92 })
      .stroke({ width: 1, color: COLORS.panelLine });
    root.addChild(button);
    root.addChild(
      createLabel(api, icon, x + iconSize / 2, iconY + iconSize / 2, desktop ? 21 : 17, COLORS.gold, 0.5, 0.5, '700'),
    );
  });
  root.addChild(
    createLabel(
      api,
      'WEBGL2  ·  OFFLINE  ·  LOCAL REPLAY',
      width - margin,
      desktop ? 74 : 66,
      desktop ? 10 : 8,
      COLORS.mutedDark,
      1,
      0.5,
      '500',
    ),
  );
}

// 计算牌型说明和配置面板的统一尺寸，避免绘制与命中区域产生偏差
function getUtilityPanelMetrics(
  layout: LayoutMetrics,
  panel: Exclude<MahjongUtilityPanel, 'none'>,
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(layout.width - 32, layout.desktop ? 760 : 348);
  const height = panel === 'yaku' ? 430 : layout.desktop ? 336 : 320;
  return { x: (layout.width - width) / 2, y: (layout.height - height) / 2, width, height };
}

// 绘制胡牌牌型或牌局配置面板，所有内容继续留在 Pixi Canvas 内
function drawUtilityPanel(
  api: PixiApi,
  root: Container,
  panel: Exclude<MahjongUtilityPanel, 'none'>,
  layout: LayoutMetrics,
): void {
  const { desktop } = layout;
  const metrics = getUtilityPanelMetrics(layout, panel);
  const veil = new api.Graphics();
  veil.rect(0, 0, layout.width, layout.height).fill({ color: 0x183b2a, alpha: 0.42 });
  root.addChild(veil);
  const modal = new api.Graphics();
  modal
    .roundRect(metrics.x, metrics.y, metrics.width, metrics.height, 18)
    .fill(COLORS.panelRaised)
    .stroke({ width: 2, color: COLORS.gold });
  root.addChild(modal);
  const title = panel === 'yaku' ? '胡牌牌型图鉴' : '牌局配置';
  const subtitle = panel === 'yaku' ? '常用役种 · 训练时快速查阅' : '本地训练偏好 · 当前版本即时生效';
  root.addChild(
    createLabel(api, title, metrics.x + 28, metrics.y + 30, desktop ? 22 : 18, COLORS.white, 0, 0.5, '700'),
  );
  root.addChild(
    createLabel(api, subtitle, metrics.x + 28, metrics.y + 58, desktop ? 12 : 10, COLORS.muted, 0, 0.5, '500'),
  );
  addButton(
    api,
    root,
    '关闭',
    metrics.x + metrics.width - (desktop ? 104 : 86),
    metrics.y + 18,
    desktop ? 76 : 64,
    desktop ? 30 : 28,
    false,
    !desktop,
  );
  if (panel === 'yaku') {
    const yaku = [
      ['立直', '门清宣言后和牌 · 1 番', '门清'],
      ['断幺九', '只用 2–8 数牌，不含字牌 · 1 番', '断幺'],
      ['平和', '四组顺子、两面听，雀头非役牌 · 1 番', '门清'],
      ['一盃口', '同一顺子组合出现两次 · 1 番', '门清'],
      ['混一色', '同一门数牌与字牌组成 · 3 番 / 2 番', '染手'],
      ['清一色', '只使用同一门数牌 · 6 番 / 5 番', '染手'],
    ];
    const columns = desktop ? 2 : 1;
    const gap = desktop ? 12 : 8;
    const rowHeight = desktop ? 72 : 54;
    const rowWidth = (metrics.width - 56 - gap * (columns - 1)) / columns;
    yaku.forEach(([name, detail, tag], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = metrics.x + 28 + column * (rowWidth + gap);
      const y = metrics.y + 92 + row * (rowHeight + gap);
      const card = new api.Graphics();
      card
        .roundRect(x, y, rowWidth, rowHeight, 10)
        .fill({ color: 0x376d4d, alpha: 0.9 })
        .stroke({ width: 1, color: COLORS.panelLine });
      root.addChild(card);
      root.addChild(createLabel(api, name, x + 14, y + 21, desktop ? 16 : 14, COLORS.gold, 0, 0.5, '700'));
      root.addChild(createLabel(api, tag, x + rowWidth - 14, y + 21, desktop ? 10 : 9, COLORS.cyan, 1, 0.5, '600'));
      root.addChild(createLabel(api, detail, x + 14, y + 47, desktop ? 11 : 10, COLORS.white, 0, 0.5, '500'));
    });
  } else {
    const settings = [
      ['提示等级', '标准 · 在确认出牌前显示提醒'],
      ['AI 思考速度', '0.42 秒 · 保留观察节奏'],
      ['牌桌主题', '绿幕 · 柔和绒面与木色边框'],
      ['音效', '关闭 · 音频开关将在后续加入'],
    ];
    settings.forEach(([name, detail], index) => {
      const y = metrics.y + 94 + index * (desktop ? 48 : 44);
      const row = new api.Graphics();
      row.roundRect(metrics.x + 28, y, metrics.width - 56, desktop ? 38 : 36, 8).fill({ color: 0x376d4d, alpha: 0.86 });
      root.addChild(row);
      root.addChild(
        createLabel(api, name, metrics.x + 42, y + (desktop ? 19 : 18), desktop ? 13 : 11, COLORS.gold, 0, 0.5, '700'),
      );
      root.addChild(
        createLabel(
          api,
          detail,
          metrics.x + (desktop ? 180 : 124),
          y + (desktop ? 19 : 18),
          desktop ? 11 : 9,
          COLORS.white,
          0,
          0.5,
          '500',
        ),
      );
    });
    root.addChild(
      createLabel(
        api,
        '配置保存在当前浏览器会话中，不需要服务器。',
        metrics.x + 28,
        metrics.y + metrics.height - 24,
        desktop ? 11 : 9,
        COLORS.muted,
        0,
        0.5,
        '500',
      ),
    );
  }
}

// 绘制结算层，避免结束状态下误触牌面并提供下一步操作
function drawRoundOverlay(api: PixiApi, root: Container, state: MahjongState, layout: LayoutMetrics): void {
  if ((state.phase !== 'round-over' && state.phase !== 'match-over') || !state.result) return;
  const { width, height, desktop } = layout;
  const overlay = new api.Graphics();
  overlay.rect(0, 0, width, height).fill({ color: COLORS.background, alpha: 0.66 });
  root.addChild(overlay);
  const modalWidth = Math.min(width - 32, desktop ? 500 : 340);
  const modalHeight = desktop ? 250 : 230;
  const modalX = (width - modalWidth) / 2;
  const modalY = (height - modalHeight) / 2;
  const modal = new api.Graphics();
  modal
    .roundRect(modalX, modalY, modalWidth, modalHeight, 20)
    .fill(COLORS.panelRaised)
    .stroke({ width: 1, color: COLORS.gold });
  root.addChild(modal);
  const matchOver = state.phase === 'match-over';
  root.addChild(
    createLabel(
      api,
      matchOver ? '半庄完成' : '本局结算',
      width / 2,
      modalY + 36,
      desktop ? 22 : 18,
      COLORS.gold,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(api, state.result.message, width / 2, modalY + 82, desktop ? 16 : 13, COLORS.white, 0.5, 0.5, '600'),
  );
  root.addChild(
    createLabel(
      api,
      matchOver
        ? state.players.map((player) => `${player.name} ${player.score.toLocaleString()}`).join('  ·  ')
        : state.result.yaku.length > 0
          ? state.result.yaku.join('  ·  ')
          : '流局 · 继续观察牌河',
      width / 2,
      modalY + 118,
      desktop ? 13 : 11,
      COLORS.muted,
      0.5,
      0.5,
      '500',
    ),
  );
  if (matchOver) {
    addButton(api, root, '重新开局', modalX + modalWidth / 2 - 56, modalY + modalHeight - 56, 112, 36, true, !desktop);
  } else {
    addButton(
      api,
      root,
      '重新开局',
      modalX + modalWidth / 2 - 124,
      modalY + modalHeight - 56,
      112,
      36,
      false,
      !desktop,
    );
    addButton(api, root, '下一局', modalX + modalWidth / 2 + 12, modalY + modalHeight - 56, 112, 36, true, !desktop);
  }
}

// 计算模式入口两张大卡片的命中区域，视觉和交互共用同一组坐标
function getLobbyModeRegions(layout: LayoutMetrics): Array<{ x: number; y: number; width: number; height: number }> {
  const cardWidth = layout.desktop ? 300 : Math.min(300, layout.width - 32);
  const cardHeight = layout.desktop ? 188 : 148;
  const gap = layout.desktop ? 24 : 14;
  const startX = layout.desktop ? (layout.width - cardWidth * 2 - gap) / 2 : (layout.width - cardWidth) / 2;
  const startY = layout.height * (layout.desktop ? 0.46 : 0.42);
  return [
    { x: startX, y: startY, width: cardWidth, height: cardHeight },
    {
      x: layout.desktop ? startX + cardWidth + gap : startX,
      y: layout.desktop ? startY : startY + cardHeight + gap,
      width: cardWidth,
      height: cardHeight,
    },
  ];
}

// 绘制模式入口的大型选择卡片，让打开 Canvas 后先做明确的模式分流
function drawLobbyCard(
  api: PixiApi,
  root: Container,
  rect: { x: number; y: number; width: number; height: number },
  title: string,
  subtitle: string,
  detail: string,
  primary: boolean,
): void {
  const card = new api.Graphics();
  card
    .roundRect(rect.x, rect.y, rect.width, rect.height, 16)
    .fill({ color: primary ? 0x386b4d : COLORS.panel, alpha: 0.94 })
    .stroke({ width: primary ? 2 : 1, color: primary ? COLORS.gold : COLORS.panelLine });
  root.addChild(card);
  const icon = new api.Graphics();
  icon
    .circle(rect.x + 42, rect.y + 48, 22)
    .fill({ color: primary ? COLORS.gold : COLORS.purpleSoft, alpha: 0.94 })
    .stroke({ width: 1, color: primary ? 0xffe0a2 : COLORS.purple });
  root.addChild(icon);
  root.addChild(
    createLabel(
      api,
      primary ? 'AI' : '友',
      rect.x + 42,
      rect.y + 48,
      14,
      primary ? COLORS.ink : COLORS.white,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(createLabel(api, title, rect.x + 78, rect.y + 38, 21, COLORS.white, 0, 0.5, '700'));
  root.addChild(
    createLabel(api, subtitle, rect.x + 78, rect.y + 66, 11, primary ? COLORS.gold : COLORS.muted, 0, 0.5, '600'),
  );
  root.addChild(createLabel(api, detail, rect.x + 24, rect.y + rect.height - 30, 11, COLORS.muted, 0, 0.5, '500'));
  const arrow = new api.Graphics();
  arrow
    .moveTo(rect.x + rect.width - 38, rect.y + rect.height / 2 - 8)
    .lineTo(rect.x + rect.width - 26, rect.y + rect.height / 2)
    .lineTo(rect.x + rect.width - 38, rect.y + rect.height / 2 + 8)
    .stroke({ width: 2, color: primary ? COLORS.gold : COLORS.muted });
  root.addChild(arrow);
}

// 绘制模式入口，所有文字和按钮都留在同一个 Pixi Canvas 内
function drawLobbyScene(api: PixiApi, root: Container, layout: LayoutMetrics): void {
  drawAtmosphere(api, root, layout, 'lobby');
  const { width, height, desktop } = layout;
  root.addChild(createLabel(api, '日麻', width / 2, height * 0.2, desktop ? 56 : 42, COLORS.ink, 0.5, 0.5, '700'));
  root.addChild(
    createLabel(
      api,
      'RIICHI TRAINING',
      width / 2,
      height * 0.2 + (desktop ? 54 : 40),
      desktop ? 15 : 11,
      COLORS.gold,
      0.5,
      0.5,
      '600',
    ),
  );
  root.addChild(
    createLabel(
      api,
      '选择你的牌局方式',
      width / 2,
      height * 0.36,
      desktop ? 19 : 15,
      COLORS.mutedDark,
      0.5,
      0.5,
      '500',
    ),
  );
  const regions = getLobbyModeRegions(layout);
  drawLobbyCard(api, root, regions[0]!, '单人模式', 'LOCAL AI TRAINING', '离线牌局 · 可重复训练与复盘', true);
  drawLobbyCard(api, root, regions[1]!, '友人牌局', 'FRIEND ROOM', '四位房间码 · 跨设备准备同步', false);
  root.addChild(
    createLabel(
      api,
      'WEBGL2  ·  PIXI.JS 8  ·  ONE CANVAS',
      width / 2,
      height - (desktop ? 30 : 20),
      desktop ? 11 : 9,
      COLORS.mutedDark,
      0.5,
      0.5,
      '600',
    ),
  );
}

interface FriendEntryMetrics {
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  createCard: { x: number; y: number; width: number; height: number };
  joinCard: { x: number; y: number; width: number; height: number };
  digitRects: Array<{ x: number; y: number; width: number; height: number; digit: string }>;
  backspaceRect: { x: number; y: number; width: number; height: number };
  createButton: { x: number; y: number; width: number; height: number };
  joinButton: { x: number; y: number; width: number; height: number };
  backButton: { x: number; y: number; width: number; height: number };
}

// 计算友人房入口的卡片、键盘和按钮坐标
function getFriendEntryMetrics(layout: LayoutMetrics): FriendEntryMetrics {
  const { width, height, desktop } = layout;
  const panelWidth = Math.min(width - 32, desktop ? 1020 : 360);
  const panelHeight = desktop ? 472 : Math.min(height - 150, 620);
  const panelX = (width - panelWidth) / 2;
  const panelY = desktop ? Math.max(176, height * 0.22) : 92;
  const gap = desktop ? 18 : 12;
  const cardWidth = desktop ? (panelWidth - 48 - gap) / 2 : panelWidth - 48;
  const cardHeight = desktop ? 328 : 260;
  const createCard = { x: panelX + 24, y: panelY + 82, width: cardWidth, height: cardHeight };
  const joinCard = {
    x: desktop ? createCard.x + cardWidth + gap : createCard.x,
    y: desktop ? createCard.y : createCard.y + cardHeight + gap,
    width: cardWidth,
    height: cardHeight,
  };
  const keypadX = joinCard.x + 24;
  const keypadY = joinCard.y + 138;
  const keypadWidth = joinCard.width - 48;
  const keypadGap = desktop ? 8 : 6;
  const keypadHeight = desktop ? 30 : 28;
  const digitWidth = (keypadWidth - keypadGap * 2) / 3;
  const digitRects = Array.from({ length: 9 }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    return {
      x: keypadX + column * (digitWidth + keypadGap),
      y: keypadY + row * (keypadHeight + keypadGap),
      width: digitWidth,
      height: keypadHeight,
      digit: String(index + 1),
    };
  });
  const backspaceRect = {
    x: keypadX,
    y: keypadY + 3 * (keypadHeight + keypadGap),
    width: digitWidth,
    height: keypadHeight,
  };
  const zeroRect = {
    x: keypadX + digitWidth + keypadGap,
    y: backspaceRect.y,
    width: digitWidth,
    height: keypadHeight,
  };
  digitRects.push({ ...zeroRect, digit: '0' });
  return {
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    createCard,
    joinCard,
    digitRects,
    backspaceRect,
    createButton: {
      x: createCard.x + 24,
      y: createCard.y + cardHeight - (desktop ? 52 : 46),
      width: createCard.width - 48,
      height: desktop ? 36 : 32,
    },
    joinButton: {
      x: joinCard.x + joinCard.width / 2 - (desktop ? 76 : 66),
      y: joinCard.y + cardHeight - (desktop ? 52 : 46),
      width: desktop ? 152 : 132,
      height: desktop ? 36 : 32,
    },
    backButton: {
      x: panelX,
      y: panelY - (desktop ? 42 : 38),
      width: desktop ? 124 : 108,
      height: desktop ? 30 : 28,
    },
  };
}

// 绘制四位房间码输入框和数字键盘
function drawFriendCodeInput(
  api: PixiApi,
  root: Container,
  value: string,
  metrics: FriendEntryMetrics,
  layout: LayoutMetrics,
): void {
  const { desktop } = layout;
  const { joinCard } = metrics;
  const inputLabelY = joinCard.y + (desktop ? 76 : 68);
  const inputCellY = joinCard.y + (desktop ? 92 : 82);
  root.addChild(
    createLabel(api, '输入 4 位房间码', joinCard.x + 24, inputLabelY, desktop ? 13 : 11, COLORS.gold, 0, 0.5, '600'),
  );
  const gap = desktop ? 8 : 6;
  const width = desktop ? 46 : 38;
  const totalWidth = width * 4 + gap * 3;
  const startX = joinCard.x + (joinCard.width - totalWidth) / 2;
  for (let index = 0; index < 4; index += 1) {
    const cell = new api.Graphics();
    cell
      .roundRect(startX + index * (width + gap), inputCellY, width, desktop ? 42 : 36, 8)
      .fill(COLORS.cream)
      .stroke({ width: 1, color: index < value.length ? COLORS.gold : COLORS.creamEdge });
    root.addChild(cell);
    root.addChild(
      createLabel(
        api,
        value[index] ?? '·',
        startX + index * (width + gap) + width / 2,
        inputCellY + (desktop ? 21 : 18),
        desktop ? 20 : 16,
        COLORS.ink,
        0.5,
        0.5,
        '700',
      ),
    );
  }
}

// 绘制房间码数字键盘，鼠标和触摸均由 Canvas 命中区域处理
function drawFriendKeypad(api: PixiApi, root: Container, metrics: FriendEntryMetrics, layout: LayoutMetrics): void {
  const { desktop } = layout;
  const { joinCard } = metrics;
  const keypadX = joinCard.x + 24;
  const keypadY = joinCard.y + (desktop ? 142 : 126);
  const keypadWidth = joinCard.width - 48;
  const keypadGap = desktop ? 8 : 6;
  const keypadHeight = desktop ? 30 : 28;
  const digitWidth = (keypadWidth - keypadGap * 2) / 3;
  const labels = [...Array.from({ length: 9 }, (_, index) => String(index + 1)), '⌫', '0'];
  labels.forEach((label, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const key = new api.Graphics();
    key
      .roundRect(
        keypadX + column * (digitWidth + keypadGap),
        keypadY + row * (keypadHeight + keypadGap),
        digitWidth,
        keypadHeight,
        8,
      )
      .fill({ color: COLORS.panelRaised, alpha: 0.92 })
      .stroke({ width: 1, color: COLORS.panelLine });
    root.addChild(key);
    root.addChild(
      createLabel(
        api,
        label,
        keypadX + column * (digitWidth + keypadGap) + digitWidth / 2,
        keypadY + row * (keypadHeight + keypadGap) + keypadHeight / 2,
        desktop ? 13 : 12,
        COLORS.white,
        0.5,
        0.5,
        '600',
      ),
    );
  });
}

// 绘制友人房创建与加入入口，输入和按钮均保留在同一张 Canvas
function drawFriendsEntryScene(
  api: PixiApi,
  root: Container,
  layout: LayoutMetrics,
  transportMode: MahjongFriendTransportMode,
  codeInput: string,
  notice: string,
): void {
  drawAtmosphere(api, root, layout, 'lobby');
  const { width, height, desktop } = layout;
  const metrics = getFriendEntryMetrics(layout);
  root.addChild(createLabel(api, '友人牌局', width / 2, height * 0.13, desktop ? 40 : 30, COLORS.ink, 0.5, 0.5, '700'));
  root.addChild(
    createLabel(
      api,
      transportMode === 'network' ? 'FRIEND ROOM · ONLINE SIGNAL' : 'FRIEND ROOM · SERVICE REQUIRED',
      width / 2,
      height * 0.13 + (desktop ? 46 : 34),
      desktop ? 13 : 10,
      COLORS.gold,
      0.5,
      0.5,
      '600',
    ),
  );
  addButton(
    api,
    root,
    '返回模式选择',
    metrics.backButton.x,
    metrics.backButton.y,
    metrics.backButton.width,
    metrics.backButton.height,
    false,
    !desktop,
  );
  const panel = new api.Graphics();
  panel
    .roundRect(metrics.panelX, metrics.panelY, metrics.panelWidth, metrics.panelHeight, 20)
    .fill({ color: COLORS.panel, alpha: 0.94 })
    .stroke({ width: 1, color: COLORS.panelLine });
  root.addChild(panel);
  // 绘制创建或加入卡片的统一容器
  const drawCard = (rect: { x: number; y: number; width: number; height: number }, title: string, detail: string) => {
    const card = new api.Graphics();
    card
      .roundRect(rect.x, rect.y, rect.width, rect.height, 14)
      .fill({ color: 0x376d4d, alpha: 0.9 })
      .stroke({ width: 1, color: COLORS.panelLine });
    root.addChild(card);
    root.addChild(createLabel(api, title, rect.x + 24, rect.y + 30, desktop ? 20 : 16, COLORS.white, 0, 0.5, '700'));
    root.addChild(createLabel(api, detail, rect.x + 24, rect.y + 56, desktop ? 11 : 10, COLORS.muted, 0, 0.5, '500'));
  };
  drawCard(metrics.createCard, '创建房间', '成为房主，分享 4 位数字给好友');
  drawCard(metrics.joinCard, '加入房间', '输入房主分享的房间码');
  addButton(
    api,
    root,
    '创建房间',
    metrics.createButton.x,
    metrics.createButton.y,
    metrics.createButton.width,
    metrics.createButton.height,
    true,
    !desktop,
  );
  drawFriendCodeInput(api, root, codeInput, metrics, layout);
  drawFriendKeypad(api, root, metrics, layout);
  addButton(
    api,
    root,
    '加入房间',
    metrics.joinButton.x,
    metrics.joinButton.y,
    metrics.joinButton.width,
    metrics.joinButton.height,
    true,
    !desktop,
  );
  root.addChild(
    createLabel(
      api,
      notice,
      width / 2,
      metrics.panelY + metrics.panelHeight - 18,
      desktop ? 11 : 9,
      COLORS.muted,
      0.5,
      0.5,
      '500',
    ),
  );
}

interface FriendRoomMetrics {
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  backButton: { x: number; y: number; width: number; height: number };
  copyButton: { x: number; y: number; width: number; height: number };
  readyButton: { x: number; y: number; width: number; height: number };
  startButton: { x: number; y: number; width: number; height: number };
  seatRects: Array<{ x: number; y: number; width: number; height: number }>;
}

// 计算房间等待页的席位与操作按钮坐标
function getFriendRoomMetrics(layout: LayoutMetrics): FriendRoomMetrics {
  const { width, height, desktop } = layout;
  const panelWidth = Math.min(width - 32, desktop ? 1040 : 360);
  const panelHeight = desktop ? Math.min(520, height - 150) : Math.min(height - 120, 600);
  const panelX = (width - panelWidth) / 2;
  const panelY = desktop ? Math.max(126, height * 0.16) : 72;
  const gap = desktop ? 14 : 10;
  const seatWidth = (panelWidth - 48 - gap) / 2;
  const seatHeight = desktop ? 88 : 72;
  const seatY = panelY + 150;
  const seatRects = Array.from({ length: 4 }, (_, index) => ({
    x: panelX + 24 + (index % 2) * (seatWidth + gap),
    y: seatY + Math.floor(index / 2) * (seatHeight + gap),
    width: seatWidth,
    height: seatHeight,
  }));
  const buttonY = panelY + panelHeight - (desktop ? 52 : 46);
  return {
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    backButton: { x: panelX + 24, y: buttonY, width: desktop ? 120 : 104, height: desktop ? 36 : 32 },
    copyButton: {
      x: panelX + panelWidth - (desktop ? 178 : 154),
      y: panelY + 28,
      width: desktop ? 76 : 66,
      height: desktop ? 30 : 28,
    },
    readyButton: {
      x: panelX + panelWidth / 2 - (desktop ? 72 : 60),
      y: buttonY,
      width: desktop ? 144 : 120,
      height: desktop ? 36 : 32,
    },
    startButton: {
      x: panelX + panelWidth - (desktop ? 168 : 144),
      y: buttonY,
      width: desktop ? 144 : 120,
      height: desktop ? 36 : 32,
    },
    seatRects,
  };
}

// 绘制一张友人房席位卡，显示连接状态、准备状态和本地玩家标识
function drawFriendSeatCard(
  api: PixiApi,
  root: Container,
  rect: { x: number; y: number; width: number; height: number },
  seat: FriendRoomSeat | undefined,
  localPlayerId: string | null,
  layout: LayoutMetrics,
): void {
  const { desktop } = layout;
  const card = new api.Graphics();
  card
    .roundRect(rect.x, rect.y, rect.width, rect.height, 12)
    .fill({ color: seat ? 0x376d4d : 0x2b5841, alpha: seat ? 0.94 : 0.72 })
    .stroke({
      width: seat?.id === localPlayerId ? 2 : 1,
      color: seat?.id === localPlayerId ? COLORS.gold : COLORS.panelLine,
    });
  root.addChild(card);
  const title = seat ? `${seat.label}${seat.id === localPlayerId ? ' · 你' : ''}` : '等待好友加入';
  const connection = seat ? (seat.connected ? '● 已连接' : '○ 等待通信') : '○ 空席';
  const readiness = seat ? (seat.ready ? '已准备' : '等待准备') : '—';
  root.addChild(
    createLabel(api, title, rect.x + 18, rect.y + (desktop ? 28 : 23), desktop ? 16 : 13, COLORS.white, 0, 0.5, '700'),
  );
  root.addChild(
    createLabel(
      api,
      connection,
      rect.x + 18,
      rect.y + (desktop ? 56 : 47),
      desktop ? 11 : 9,
      seat?.connected ? COLORS.cyan : COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
  root.addChild(
    createLabel(
      api,
      readiness,
      rect.x + rect.width - 18,
      rect.y + (desktop ? 28 : 23),
      desktop ? 13 : 11,
      seat?.ready ? COLORS.gold : COLORS.muted,
      1,
      0.5,
      '700',
    ),
  );
}

// 绘制等待房间、房间码和四席准备状态
function drawFriendRoomScene(
  api: PixiApi,
  root: Container,
  layout: LayoutMetrics,
  transportMode: MahjongFriendTransportMode,
  room: FriendRoomSnapshot | null,
  localPlayerId: string | null,
  notice: string,
  readyConfirm: boolean,
): void {
  drawAtmosphere(api, root, layout, 'lobby');
  const { width, height, desktop } = layout;
  const metrics = getFriendRoomMetrics(layout);
  root.addChild(
    createLabel(api, '友人房 · 等待席位', width / 2, height * 0.1, desktop ? 32 : 24, COLORS.ink, 0.5, 0.5, '700'),
  );
  root.addChild(
    createLabel(
      api,
      transportMode === 'network' ? 'FRIEND ROOM · ONLINE SIGNAL' : 'FRIEND ROOM · SERVICE REQUIRED',
      width / 2,
      height * 0.1 + (desktop ? 38 : 30),
      desktop ? 12 : 9,
      COLORS.gold,
      0.5,
      0.5,
      '600',
    ),
  );
  const panel = new api.Graphics();
  panel
    .roundRect(metrics.panelX, metrics.panelY, metrics.panelWidth, metrics.panelHeight, 20)
    .fill({ color: COLORS.panel, alpha: 0.94 })
    .stroke({ width: 1, color: COLORS.panelLine });
  root.addChild(panel);
  addButton(
    api,
    root,
    '退出房间',
    metrics.backButton.x,
    metrics.backButton.y,
    metrics.backButton.width,
    metrics.backButton.height,
    false,
    !desktop,
  );
  const code = room?.code ?? '----';
  root.addChild(
    createLabel(
      api,
      '房间码',
      metrics.panelX + 28,
      metrics.panelY + 38,
      desktop ? 12 : 10,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
  root.addChild(
    createLabel(api, code, metrics.panelX + 28, metrics.panelY + 78, desktop ? 34 : 28, COLORS.gold, 0, 0.5, '700'),
  );
  addButton(
    api,
    root,
    '复制房间码',
    metrics.copyButton.x,
    metrics.copyButton.y,
    metrics.copyButton.width,
    metrics.copyButton.height,
    false,
    !desktop,
  );
  root.addChild(
    createLabel(
      api,
      '分享给好友后，在任意设备输入 4 位房间码即可加入',
      metrics.panelX + 28,
      metrics.panelY + 108,
      desktop ? 11 : 9,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
  for (let index = 0; index < 4; index += 1)
    drawFriendSeatCard(api, root, metrics.seatRects[index]!, room?.seats[index], localPlayerId, layout);
  const localSeat = room?.seats.find((seat) => seat.id === localPlayerId);
  addButton(
    api,
    root,
    localSeat?.ready ? '取消准备' : localSeat ? '准备' : '连接中',
    metrics.readyButton.x,
    metrics.readyButton.y,
    metrics.readyButton.width,
    metrics.readyButton.height,
    Boolean(localSeat),
    !desktop,
  );
  if (room?.hostId === localPlayerId) {
    addButton(
      api,
      root,
      room && room.seats.length === 4 && room.seats.every((seat) => seat.ready) ? '开始对局' : '等待全员准备',
      metrics.startButton.x,
      metrics.startButton.y,
      metrics.startButton.width,
      metrics.startButton.height,
      room ? room.seats.length === 4 && room.seats.every((seat) => seat.ready) : false,
      !desktop,
    );
  }
  root.addChild(
    createLabel(
      api,
      notice,
      width / 2,
      metrics.panelY + metrics.panelHeight + 24,
      desktop ? 11 : 9,
      COLORS.mutedDark,
      0.5,
      0.5,
      '500',
    ),
  );
  if (readyConfirm) drawFriendReadyConfirmation(api, root, layout, localSeat?.ready ?? false);
}

// 绘制准备动作的二次确认层，确认前不发送任何通信消息
function drawFriendReadyConfirmation(
  api: PixiApi,
  root: Container,
  layout: LayoutMetrics,
  currentlyReady: boolean,
): void {
  const { width, height, desktop } = layout;
  const modalWidth = Math.min(width - 32, desktop ? 460 : 320);
  const modalHeight = desktop ? 190 : 176;
  const modalX = (width - modalWidth) / 2;
  const modalY = (height - modalHeight) / 2;
  const veil = new api.Graphics();
  veil.rect(0, 0, width, height).fill({ color: COLORS.center, alpha: 0.48 });
  root.addChild(veil);
  const modal = new api.Graphics();
  modal
    .roundRect(modalX, modalY, modalWidth, modalHeight, 16)
    .fill(COLORS.panelRaised)
    .stroke({ width: 2, color: COLORS.gold });
  root.addChild(modal);
  root.addChild(
    createLabel(
      api,
      currentlyReady ? '确认取消准备？' : '确认准备并同步？',
      width / 2,
      modalY + 44,
      desktop ? 20 : 17,
      COLORS.white,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      '点击确认后会向房主发送当前准备状态。',
      width / 2,
      modalY + 78,
      desktop ? 12 : 10,
      COLORS.muted,
      0.5,
      0.5,
      '500',
    ),
  );
  addButton(api, root, '取消', modalX + 28, modalY + modalHeight - 50, desktop ? 116 : 96, 32, false, !desktop);
  addButton(
    api,
    root,
    '确认',
    modalX + modalWidth - (desktop ? 144 : 124),
    modalY + modalHeight - 50,
    desktop ? 116 : 96,
    32,
    true,
    !desktop,
  );
}

// 绘制友人对局桌，沿用单人牌桌视觉并替换为房间席位名称
function drawFriendGameScene(
  api: PixiApi,
  root: Container,
  layout: LayoutMetrics,
  state: MahjongState,
  textures: TextureMap,
  transportMode: MahjongFriendTransportMode,
  room: FriendRoomSnapshot | null,
  notice: string,
): void {
  drawAtmosphere(api, root, layout, 'table');
  const seatLabels = room?.seats.map((seat) => seat.label);
  drawBoard(api, root, state, layout, textures, seatLabels);
  drawHumanControls(api, root, state, null, [], layout, textures);
  drawTrainingPanel(api, root, state, layout, '日麻 · 友人牌局', room ? `房间 ${room.code}` : 'ONLINE ROOM');
  root.addChild(
    createLabel(
      api,
      transportMode === 'network' ? 'WSS · ONLINE ROOM' : 'SERVICE REQUIRED',
      layout.width - layout.margin,
      layout.desktop ? 74 : 66,
      layout.desktop ? 10 : 8,
      transportMode === 'network' ? COLORS.green : COLORS.red,
      1,
      0.5,
      '500',
    ),
  );
  addButton(
    api,
    root,
    '退出友人局',
    layout.margin,
    layout.desktop ? 82 : 70,
    layout.desktop ? 112 : 96,
    layout.desktop ? 28 : 26,
    false,
    !layout.desktop,
  );
  root.addChild(
    createLabel(
      api,
      notice,
      layout.width / 2,
      layout.height - 18,
      layout.desktop ? 11 : 9,
      COLORS.mutedDark,
      0.5,
      0.5,
      '500',
    ),
  );
}

// 绘制当前 Canvas 屏幕，状态变化时重建轻量 Pixi 场景
function drawScene(
  api: PixiApi,
  app: Application,
  screen: MahjongScreen,
  utilityPanel: MahjongUtilityPanel,
  friendView: MahjongFriendView,
  friendTransportMode: MahjongFriendTransportMode,
  friendRoom: FriendRoomSnapshot | null,
  friendLocalPlayerId: string | null,
  friendCodeInput: string,
  friendNotice: string,
  friendReadyConfirm: boolean,
  state: MahjongState,
  selectedTileId: number | null,
  legalActions: readonly LegalAction[],
  textures: TextureMap,
): void {
  const width = app.screen.width;
  const height = app.screen.height;
  const layout = getLayout(width, height);
  app.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
  app.stage.eventMode = 'static';
  app.stage.hitArea = new api.Rectangle(0, 0, width, height);
  const root = new api.Container();
  app.stage.addChild(root);
  if (screen === 'lobby') {
    drawLobbyScene(api, root, layout);
    return;
  }
  if (screen === 'friends') {
    if (friendView === 'entry') {
      drawFriendsEntryScene(api, root, layout, friendTransportMode, friendCodeInput, friendNotice);
    } else if (friendView === 'room') {
      drawFriendRoomScene(
        api,
        root,
        layout,
        friendTransportMode,
        friendRoom,
        friendLocalPlayerId,
        friendNotice,
        friendReadyConfirm,
      );
    } else {
      drawFriendGameScene(api, root, layout, state, textures, friendTransportMode, friendRoom, friendNotice);
    }
    return;
  }
  drawAtmosphere(api, root, layout, 'table');
  drawBoard(api, root, state, layout, textures);
  drawHumanControls(api, root, state, selectedTileId, legalActions, layout, textures);
  drawTrainingPanel(api, root, state, layout);
  drawRoundOverlay(api, root, state, layout);
  if (utilityPanel !== 'none' && state.phase !== 'round-over' && state.phase !== 'match-over') {
    drawUtilityPanel(api, root, utilityPanel, layout);
  }
}

// 计算友人房入口的 Canvas 命中区域
function getFriendEntryHitRegions(layout: LayoutMetrics, handlers: SceneHandlers): HitRegion[] {
  const metrics = getFriendEntryMetrics(layout);
  return [
    { ...metrics.backButton, onClick: () => handlers.onFriendAction({ type: 'back' }) },
    { ...metrics.createButton, onClick: () => handlers.onFriendAction({ type: 'create-room' }) },
    { ...metrics.joinButton, onClick: () => handlers.onFriendAction({ type: 'join-room' }) },
    ...metrics.digitRects.map((rect) => ({
      ...rect,
      onClick: () => handlers.onFriendAction({ type: 'digit', digit: rect.digit }),
    })),
    { ...metrics.backspaceRect, onClick: () => handlers.onFriendAction({ type: 'backspace' }) },
  ];
}

// 计算友人房等待页和准备确认层的 Canvas 命中区域
function getFriendRoomHitRegions(
  layout: LayoutMetrics,
  room: FriendRoomSnapshot | null,
  localPlayerId: string | null,
  readyConfirm: boolean,
  handlers: SceneHandlers,
): HitRegion[] {
  const metrics = getFriendRoomMetrics(layout);
  if (readyConfirm) {
    const modalWidth = Math.min(layout.width - 32, layout.desktop ? 460 : 320);
    const modalHeight = layout.desktop ? 190 : 176;
    const modalX = (layout.width - modalWidth) / 2;
    const modalY = (layout.height - modalHeight) / 2;
    return [
      {
        x: modalX + 28,
        y: modalY + modalHeight - 50,
        width: layout.desktop ? 116 : 96,
        height: 32,
        onClick: () => handlers.onFriendAction({ type: 'cancel-ready' }),
      },
      {
        x: modalX + modalWidth - (layout.desktop ? 144 : 124),
        y: modalY + modalHeight - 50,
        width: layout.desktop ? 116 : 96,
        height: 32,
        onClick: () => handlers.onFriendAction({ type: 'confirm-ready' }),
      },
    ];
  }
  const regions: HitRegion[] = [
    { ...metrics.backButton, onClick: () => handlers.onFriendAction({ type: 'back' }) },
    { ...metrics.copyButton, onClick: () => handlers.onFriendAction({ type: 'copy-code' }) },
    { ...metrics.readyButton, onClick: () => handlers.onFriendAction({ type: 'request-ready' }) },
  ];
  if (room?.hostId === localPlayerId) {
    regions.push({ ...metrics.startButton, onClick: () => handlers.onFriendAction({ type: 'start-game' }) });
  }
  return regions;
}

// 计算 Canvas 指针命中区域，确保模式选择与牌局动作共用坐标
function getCanvasHitRegions(
  screen: MahjongScreen,
  utilityPanel: MahjongUtilityPanel,
  friendView: MahjongFriendView,
  friendRoom: FriendRoomSnapshot | null,
  friendLocalPlayerId: string | null,
  friendReadyConfirm: boolean,
  state: MahjongState,
  selectedTileId: number | null,
  legalActions: readonly LegalAction[],
  layout: LayoutMetrics,
  handlers: SceneHandlers,
): HitRegion[] {
  if (screen === 'lobby') {
    const [single, friends] = getLobbyModeRegions(layout);
    return [
      { ...single!, onClick: () => handlers.onChooseMode('single') },
      { ...friends!, onClick: () => handlers.onChooseMode('friends') },
    ];
  }
  if (screen === 'friends') {
    if (friendView === 'entry') return getFriendEntryHitRegions(layout, handlers);
    if (friendView === 'room')
      return getFriendRoomHitRegions(layout, friendRoom, friendLocalPlayerId, friendReadyConfirm, handlers);
    return [
      {
        x: layout.margin,
        y: layout.desktop ? 82 : 70,
        width: layout.desktop ? 112 : 96,
        height: layout.desktop ? 28 : 26,
        onClick: () => handlers.onFriendAction({ type: 'back' }),
      },
    ];
  }
  if (utilityPanel !== 'none' && state.phase !== 'round-over' && state.phase !== 'match-over') {
    const metrics = getUtilityPanelMetrics(layout, utilityPanel);
    const closeWidth = layout.desktop ? 76 : 64;
    const closeHeight = layout.desktop ? 30 : 28;
    return [
      {
        x: metrics.x + metrics.width - (layout.desktop ? 104 : 86),
        y: metrics.y + 18,
        width: closeWidth,
        height: closeHeight,
        onClick: () => handlers.onToggleUtilityPanel(utilityPanel),
      },
    ];
  }
  if ((state.phase === 'round-over' || state.phase === 'match-over') && state.result) {
    const modalWidth = Math.min(layout.width - 32, layout.desktop ? 500 : 340);
    const modalHeight = layout.desktop ? 250 : 230;
    const modalX = (layout.width - modalWidth) / 2;
    const modalY = (layout.height - modalHeight) / 2;
    const matchOver = state.phase === 'match-over';
    return [
      {
        x: modalX + modalWidth / 2 - (matchOver ? 56 : 124),
        y: modalY + modalHeight - 56,
        width: 112,
        height: 36,
        onClick: handlers.onRestart,
      },
      ...(matchOver
        ? []
        : [
            {
              x: modalX + modalWidth / 2 + 12,
              y: modalY + modalHeight - 56,
              width: 112,
              height: 36,
              onClick: handlers.onNextRound,
            },
          ]),
    ];
  }
  const regions: HitRegion[] = [];
  const human = state.players[0];
  const { boardWidth, desktop, handY } = layout;
  if (state.phase === 'player-turn') {
    const handGap = desktop ? 4 : 2;
    const handWidthLimit = Math.min(boardWidth * 0.78, layout.width - (desktop ? 84 : 24));
    const tileWidth = Math.max(
      24,
      Math.min(desktop ? 62 : 38, (handWidthLimit - handGap * (human.hand.length - 1)) / human.hand.length),
    );
    const tileHeight = desktop ? 78 : 52;
    const handWidth = tileWidth * human.hand.length + handGap * (human.hand.length - 1);
    const handX = (layout.width - handWidth) / 2;
    human.hand.forEach((tile, index) => {
      const selected = tile.id === selectedTileId;
      regions.push({
        x: handX + index * (tileWidth + handGap),
        y: handY - (selected ? 8 : 0),
        width: tileWidth,
        height: tileHeight + (selected ? 8 : 0),
        onClick: () => handlers.onSelectTile(tile.id),
      });
    });
  }
  const actionList = getHumanActionItems(state, selectedTileId, legalActions);
  const actionHeight = desktop ? 34 : 28;
  const actionY = handY - (desktop ? 18 : 10);
  const actionWidths = actionList.map((item) => getActionButtonWidth(item.label, desktop));
  const totalWidth =
    actionWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + Math.max(0, actionList.length - 1) * 8;
  let actionX = (layout.width - totalWidth) / 2;
  for (const [index, item] of actionList.entries()) {
    const actionWidth = actionWidths[index] ?? 90;
    regions.push({
      x: actionX,
      y: actionY - actionHeight,
      width: actionWidth,
      height: actionHeight,
      onClick: () => handlers.onAction(item.action),
    });
    actionX += actionWidth + 8;
  }
  const iconSize = desktop ? 42 : 34;
  const iconY = desktop ? 20 : 18;
  const iconGap = 10;
  regions.push({
    x: layout.width - layout.margin - (iconSize + iconGap) * 2,
    y: iconY,
    width: iconSize,
    height: iconSize,
    onClick: () => handlers.onToggleUtilityPanel('yaku'),
  });
  regions.push({
    x: layout.width - layout.margin - iconSize - iconGap,
    y: iconY,
    width: iconSize,
    height: iconSize,
    onClick: () => handlers.onToggleUtilityPanel('settings'),
  });
  return regions;
}

// 在 WebGL 初始化失败时仍用同一张 Canvas 显示可诊断信息
function drawCanvasFallback(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#c8dac8';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#386b4d';
  context.font = '700 24px Inter, sans-serif';
  context.fillText('日麻', 24, 48);
  context.fillStyle = '#244b36';
  context.font = '500 16px Inter, sans-serif';
  context.fillText('WebGL2 初始化失败，请检查浏览器硬件加速设置。', 24, 88);
}

// 创建单一 Pixi Canvas，并在路由离开时释放 WebGL 资源
export function PixiMahjongSurface({
  screen,
  utilityPanel,
  friendView,
  friendTransportMode,
  friendRoom,
  friendLocalPlayerId,
  friendCodeInput,
  friendNotice,
  friendReadyConfirm,
  state,
  selectedTileId,
  legalActions,
  onSelectTile,
  onAction,
  onRestart,
  onNextRound,
  onChooseMode,
  onBackToLobby,
  onToggleUtilityPanel,
  onFriendAction,
  onFriendKey,
}: PixiMahjongSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const apiRef = useRef<PixiApi | null>(null);
  const stateRef = useRef(state);
  const selectedTileRef = useRef(selectedTileId);
  const legalActionsRef = useRef(legalActions);
  const screenRef = useRef(screen);
  const utilityPanelRef = useRef(utilityPanel);
  const friendViewRef = useRef(friendView);
  const friendTransportModeRef = useRef(friendTransportMode);
  const friendRoomRef = useRef(friendRoom);
  const friendLocalPlayerIdRef = useRef(friendLocalPlayerId);
  const friendCodeInputRef = useRef(friendCodeInput);
  const friendNoticeRef = useRef(friendNotice);
  const friendReadyConfirmRef = useRef(friendReadyConfirm);
  const texturesRef = useRef<TextureMap>(new Map());
  const hitRegionsRef = useRef<readonly HitRegion[]>([]);
  const handlersRef = useRef<SceneHandlers>({
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onFriendAction,
    onFriendKey,
  });

  // 同步最新的 React 状态，避免异步 Pixi 初始化读取旧牌局
  useEffect(() => {
    stateRef.current = state;
    selectedTileRef.current = selectedTileId;
    legalActionsRef.current = legalActions;
    screenRef.current = screen;
    utilityPanelRef.current = utilityPanel;
    friendViewRef.current = friendView;
    friendTransportModeRef.current = friendTransportMode;
    friendRoomRef.current = friendRoom;
    friendLocalPlayerIdRef.current = friendLocalPlayerId;
    friendCodeInputRef.current = friendCodeInput;
    friendNoticeRef.current = friendNotice;
    friendReadyConfirmRef.current = friendReadyConfirm;
    handlersRef.current = {
      onSelectTile,
      onAction,
      onRestart,
      onNextRound,
      onChooseMode,
      onBackToLobby,
      onToggleUtilityPanel,
      onFriendAction,
      onFriendKey,
    };
  }, [
    screen,
    utilityPanel,
    friendView,
    friendTransportMode,
    friendRoom,
    friendLocalPlayerId,
    friendCodeInput,
    friendNotice,
    friendReadyConfirm,
    state,
    selectedTileId,
    legalActions,
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onFriendAction,
    onFriendKey,
  ]);

  // 进入训练桌时隐藏站点壳层，保证可视页面只有游戏 Canvas
  useEffect(() => {
    document.body.classList.add('mahjong-mode');
    return () => document.body.classList.remove('mahjong-mode');
  }, []);

  // 初始化 Pixi WebGL2 渲染器、监听尺寸变化并销毁资源
  useEffect(() => {
    let disposed = false;
    let removeCanvasListeners: (() => void) | undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const initialize = async () => {
      try {
        const pixiModule = (await import('pixi.js')) as unknown as PixiApi;
        if (disposed) return;
        const app = new pixiModule.Application();
        await app.init({
          canvas,
          width: Math.max(320, window.innerWidth),
          height: Math.max(420, window.innerHeight),
          antialias: true,
          preference: 'webgl',
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          backgroundAlpha: 0,
        });
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        apiRef.current = pixiModule;
        drawScene(
          pixiModule,
          app,
          screenRef.current,
          utilityPanelRef.current,
          friendViewRef.current,
          friendTransportModeRef.current,
          friendRoomRef.current,
          friendLocalPlayerIdRef.current,
          friendCodeInputRef.current,
          friendNoticeRef.current,
          friendReadyConfirmRef.current,
          stateRef.current,
          selectedTileRef.current,
          legalActionsRef.current,
          texturesRef.current,
        );
        hitRegionsRef.current = getCanvasHitRegions(
          screenRef.current,
          utilityPanelRef.current,
          friendViewRef.current,
          friendRoomRef.current,
          friendLocalPlayerIdRef.current,
          friendReadyConfirmRef.current,
          stateRef.current,
          selectedTileRef.current,
          legalActionsRef.current,
          getLayout(app.screen.width, app.screen.height),
          handlersRef.current,
        );

        let lastPointerDispatch = 0;
        // 把浏览器坐标转换为 Canvas 命中区域并执行动作
        const dispatchCanvasPoint = (clientX: number, clientY: number) => {
          const rect = canvas.getBoundingClientRect();
          const scaleX = app.screen.width / Math.max(1, rect.width);
          const scaleY = app.screen.height / Math.max(1, rect.height);
          const x = (clientX - rect.left) * scaleX;
          const y = (clientY - rect.top) * scaleY;
          const region = [...hitRegionsRef.current]
            .reverse()
            .find(
              (candidate) =>
                x >= candidate.x &&
                x <= candidate.x + candidate.width &&
                y >= candidate.y &&
                y <= candidate.y + candidate.height,
            );
          if (region) {
            region.onClick();
          }
        };
        // 用指针抬起事件提供低延迟的鼠标和触摸反馈
        const handlePointerUp = (event: PointerEvent) => {
          event.preventDefault();
          lastPointerDispatch = performance.now();
          dispatchCanvasPoint(event.clientX, event.clientY);
        };
        // 某些浏览器只派发 click 时仍保持 Canvas 交互可用
        const handleClick = (event: MouseEvent) => {
          if (performance.now() - lastPointerDispatch < 400) return;
          dispatchCanvasPoint(event.clientX, event.clientY);
        };
        // 键盘输入驱动友人房数字码，并保留单人牌局的 Escape 行为
        const handleKeyDown = (event: KeyboardEvent) => {
          if (screenRef.current === 'friends') {
            handlersRef.current.onFriendKey(event.key);
            return;
          }
          if (event.key === 'Escape' && utilityPanelRef.current !== 'none') {
            handlersRef.current.onToggleUtilityPanel(utilityPanelRef.current);
            return;
          }
          if (event.key === 'Escape' && selectedTileRef.current !== null) {
            handlersRef.current.onSelectTile(selectedTileRef.current);
          }
        };
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('keydown', handleKeyDown);
        removeCanvasListeners = () => {
          canvas.removeEventListener('pointerup', handlePointerUp);
          canvas.removeEventListener('click', handleClick);
          canvas.removeEventListener('keydown', handleKeyDown);
        };

        void loadTileTextures(pixiModule)
          .then((textures) => {
            if (disposed || !appRef.current || !apiRef.current) return;
            texturesRef.current = textures;
            drawScene(
              apiRef.current,
              appRef.current,
              screenRef.current,
              utilityPanelRef.current,
              friendViewRef.current,
              friendTransportModeRef.current,
              friendRoomRef.current,
              friendLocalPlayerIdRef.current,
              friendCodeInputRef.current,
              friendNoticeRef.current,
              friendReadyConfirmRef.current,
              stateRef.current,
              selectedTileRef.current,
              legalActionsRef.current,
              texturesRef.current,
            );
            hitRegionsRef.current = getCanvasHitRegions(
              screenRef.current,
              utilityPanelRef.current,
              friendViewRef.current,
              friendRoomRef.current,
              friendLocalPlayerIdRef.current,
              friendReadyConfirmRef.current,
              stateRef.current,
              selectedTileRef.current,
              legalActionsRef.current,
              getLayout(appRef.current.screen.width, appRef.current.screen.height),
              handlersRef.current,
            );
          })
          .catch(() => undefined);

        const resize = () => {
          if (!appRef.current || !apiRef.current) return;
          appRef.current.renderer.resize(Math.max(320, window.innerWidth), Math.max(420, window.innerHeight));
          drawScene(
            apiRef.current,
            appRef.current,
            screenRef.current,
            utilityPanelRef.current,
            friendViewRef.current,
            friendTransportModeRef.current,
            friendRoomRef.current,
            friendLocalPlayerIdRef.current,
            friendCodeInputRef.current,
            friendNoticeRef.current,
            friendReadyConfirmRef.current,
            stateRef.current,
            selectedTileRef.current,
            legalActionsRef.current,
            texturesRef.current,
          );
          hitRegionsRef.current = getCanvasHitRegions(
            screenRef.current,
            utilityPanelRef.current,
            friendViewRef.current,
            friendRoomRef.current,
            friendLocalPlayerIdRef.current,
            friendReadyConfirmRef.current,
            stateRef.current,
            selectedTileRef.current,
            legalActionsRef.current,
            getLayout(appRef.current.screen.width, appRef.current.screen.height),
            handlersRef.current,
          );
        };
        window.addEventListener('resize', resize, { passive: true });
        canvas.focus({ preventScroll: true });
        (app as Application & { __mahjongResize?: () => void }).__mahjongResize = resize;
      } catch {
        if (!disposed) drawCanvasFallback(canvas);
      }
    };
    void initialize();
    return () => {
      disposed = true;
      removeCanvasListeners?.();
      const app = appRef.current as (Application & { __mahjongResize?: () => void }) | null;
      if (app?.__mahjongResize) window.removeEventListener('resize', app.__mahjongResize);
      app?.destroy(true, { children: true });
      appRef.current = null;
      apiRef.current = null;
    };
  }, []);

  // 牌局变化时只重绘 Pixi 场景，保持 Canvas DOM 节点稳定
  useEffect(() => {
    if (appRef.current && apiRef.current) {
      drawScene(
        apiRef.current,
        appRef.current,
        screen,
        utilityPanel,
        friendView,
        friendTransportMode,
        friendRoom,
        friendLocalPlayerId,
        friendCodeInput,
        friendNotice,
        friendReadyConfirm,
        state,
        selectedTileId,
        legalActions,
        texturesRef.current,
      );
      hitRegionsRef.current = getCanvasHitRegions(
        screen,
        utilityPanel,
        friendView,
        friendRoom,
        friendLocalPlayerId,
        friendReadyConfirm,
        state,
        selectedTileId,
        legalActions,
        getLayout(appRef.current.screen.width, appRef.current.screen.height),
        {
          onSelectTile,
          onAction,
          onRestart,
          onNextRound,
          onChooseMode,
          onBackToLobby,
          onToggleUtilityPanel,
          onFriendAction,
          onFriendKey,
        },
      );
    }
  }, [
    screen,
    utilityPanel,
    friendView,
    friendTransportMode,
    friendRoom,
    friendLocalPlayerId,
    friendCodeInput,
    friendNotice,
    friendReadyConfirm,
    state,
    selectedTileId,
    legalActions,
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onFriendAction,
    onFriendKey,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      tabIndex={0}
      role="application"
      aria-label="日麻 WebGL2 训练牌桌"
    />
  );
}
