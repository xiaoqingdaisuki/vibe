'use client';

import { useEffect, useRef } from 'react';
import type { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { LegalAction, MahjongState, Meld, Seat, Tile } from '../core/types';
import { getTenpaiWaits } from '../core/scoring';
import { createTileSet, tileLabel } from '../core/tiles';
import styles from '../styles/Mahjong.module.css';
import { getTableTileMetrics } from './table-layout';

export type MahjongScreen = 'lobby' | 'single';
export type MahjongUtilityPanel = 'none' | 'yaku' | 'settings';

interface PixiMahjongSurfaceProps {
  screen: MahjongScreen;
  utilityPanel: MahjongUtilityPanel;
  utilityScroll: number;
  state: MahjongState;
  reviewMode: boolean;
  selectedTileId: number | null;
  legalActions: readonly LegalAction[];
  onSelectTile: (tileId: number) => void;
  onAction: (action: LegalAction) => void;
  onRestart: () => void;
  onNextRound: () => void;
  onOpenReview: () => void;
  onCloseReview: () => void;
  onChooseMode: (mode: 'single') => void;
  onBackToLobby: () => void;
  onToggleUtilityPanel: (panel: Exclude<MahjongUtilityPanel, 'none'>) => void;
  onScrollUtility: (delta: number, limit?: number) => void;
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
  playerPanelWidth: number;
  boardX: number;
  boardY: number;
  boardWidth: number;
  boardHeight: number;
  handY: number;
  handHeight: number;
}

interface CenterMetrics {
  x: number;
  y: number;
  size: number;
  centerX: number;
  centerY: number;
  frameLeft: number;
  frameTop: number;
  frameRight: number;
  frameBottom: number;
}

interface SceneHandlers {
  onSelectTile: (tileId: number) => void;
  onAction: (action: LegalAction) => void;
  onRestart: () => void;
  onNextRound: () => void;
  onOpenReview: () => void;
  onCloseReview: () => void;
  onChooseMode: (mode: 'single') => void;
  onBackToLobby: () => void;
  onToggleUtilityPanel: (panel: Exclude<MahjongUtilityPanel, 'none'>) => void;
  onScrollUtility: (delta: number, limit?: number) => void;
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

type RiverDirection = 'horizontal' | 'vertical';

type ResultAction = 'review' | 'next' | 'restart';
type ReviewAction = 'close' | 'next' | 'restart';

interface PositionedActionButton {
  action: ResultAction | ReviewAction;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

interface ReviewPanelMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  footerHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  cardGap: number;
  cardWidth: number;
  cardHeight: number;
  columns: number;
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
  gold: 0xf3b63c,
  goldSoft: 0x8f6c3d,
  purple: 0xbba4ff,
  purpleSoft: 0x392f5c,
  red: 0xf17f76,
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

const AVATAR_ASSET_FILES = ['avatar-0.png', 'avatar-1.png', 'avatar-2.png', 'avatar-3.png'] as const;

const TABLE_CENTER_FRAME = {
  left: 0.4,
  top: 0.3,
  right: 0.6,
  bottom: 0.63,
} as const;

interface YakuReference {
  name: string;
  han: string;
  detail: string;
  sample: readonly number[];
}

const YAKU_REFERENCE_TILES = createTileSet(false);
const YAKU_TILE_BY_KIND = new Map(YAKU_REFERENCE_TILES.map((tile) => [tile.kind, tile]));
const YAKU_REFERENCES: readonly YakuReference[] = [
  {
    name: '立直',
    han: '1 番',
    detail: '门清状态宣言立直并支付 1000 点。',
    sample: [0, 1, 2, 3, 4, 5, 15, 16, 17, 18, 19, 20, 27, 27],
  },
  {
    name: '一发',
    han: '1 番',
    detail: '立直后一巡内和牌，期间没有鸣牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '门前清自摸和',
    han: '1 番',
    detail: '门清状态下以自摸方式和牌。',
    sample: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 4, 4],
  },
  {
    name: '平和',
    han: '1 番',
    detail: '四组顺子、非役牌雀头，并以两面听和牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 6, 6],
  },
  {
    name: '断幺九',
    han: '1 番',
    detail: '只使用 2 至 8 的数牌，不含幺九牌和字牌。',
    sample: [1, 2, 3, 4, 5, 6, 10, 11, 12, 19, 20, 21, 13, 13],
  },
  {
    name: '一盃口',
    han: '1 番',
    detail: '门清状态下拥有两组完全相同的顺子。',
    sample: [0, 1, 2, 0, 1, 2, 9, 10, 11, 18, 19, 20, 6, 6],
  },
  {
    name: '役牌',
    han: '1 番 / 刻',
    detail: '自风、场风、三元牌组成刻子或杠子。',
    sample: [27, 27, 27, 28, 28, 28, 31, 31, 31, 0, 1, 2, 9, 9],
  },
  {
    name: '海底摸月',
    han: '1 番',
    detail: '摸到牌山最后一张牌后自摸和牌。',
    sample: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 4, 4],
  },
  {
    name: '河底捞鱼',
    han: '1 番',
    detail: '牌山最后一张牌打出后，以荣和结束。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '岭上开花',
    han: '1 番',
    detail: '杠后从岭上摸牌并自摸和牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 28, 28],
  },
  {
    name: '抢杠和',
    han: '1 番',
    detail: '他家加杠时荣和该张牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '双立直',
    han: '2 番',
    detail: '第一巡无人鸣牌时宣言立直。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '七对子',
    han: '2 番',
    detail: '七组不同的对子组成特殊和牌形。',
    sample: [0, 0, 3, 3, 9, 9, 12, 12, 18, 18, 27, 27, 31, 31],
  },
  {
    name: '对对和',
    han: '2 番',
    detail: '四组刻子或杠子加一组雀头。',
    sample: [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 4, 4],
  },
  {
    name: '三暗刻',
    han: '2 番',
    detail: '拥有三组没有鸣出的暗刻或暗杠。',
    sample: [0, 0, 0, 9, 9, 9, 18, 18, 18, 1, 2, 3, 27, 27],
  },
  {
    name: '三色同顺',
    han: '2 番 / 1 番',
    detail: '万、筒、索各有一组相同数字的顺子。',
    sample: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 4, 4],
  },
  {
    name: '三色同刻',
    han: '2 番',
    detail: '万、筒、索各有一组相同数字的刻子。',
    sample: [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 4, 4],
  },
  {
    name: '一气通贯',
    han: '2 番 / 1 番',
    detail: '同一门完成 123、456、789 三组顺子。',
    sample: [0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 27, 27, 4, 4],
  },
  {
    name: '混全带幺九',
    han: '2 番 / 1 番',
    detail: '每组面子和雀头都含幺九牌或字牌。',
    sample: [0, 1, 2, 6, 7, 8, 9, 10, 11, 26, 26, 26, 8, 8],
  },
  {
    name: '混老头',
    han: '2 番',
    detail: '只由幺九牌和字牌组成。',
    sample: [0, 0, 0, 8, 8, 8, 9, 9, 9, 27, 27, 27, 33, 33],
  },
  {
    name: '小三元',
    han: '2 番',
    detail: '两组三元牌刻子加另一组三元牌雀头。',
    sample: [31, 31, 31, 32, 32, 32, 33, 33, 0, 1, 2, 9, 9, 9],
  },
  { name: '三杠子', han: '2 番', detail: '拥有三组杠子。', sample: [0, 0, 0, 0, 9, 9, 9, 9, 18, 18, 18, 18, 27, 27] },
  {
    name: '混一色',
    han: '3 番 / 2 番',
    detail: '同一门数牌与字牌组成，门清 3 番、鸣牌 2 番。',
    sample: [0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 27, 27, 28, 28],
  },
  {
    name: '纯全带幺九',
    han: '3 番 / 2 番',
    detail: '每组面子和雀头都含幺九牌，不含字牌。',
    sample: [0, 1, 2, 6, 7, 8, 9, 10, 11, 15, 16, 17, 8, 8],
  },
  {
    name: '二盃口',
    han: '3 番',
    detail: '门清状态下拥有两组一盃口。',
    sample: [0, 1, 2, 0, 1, 2, 3, 4, 5, 3, 4, 5, 6, 6],
  },
  {
    name: '清一色',
    han: '6 番 / 5 番',
    detail: '只使用万、筒或索其中一门数牌。',
    sample: [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 6, 6],
  },
  {
    name: '国士无双',
    han: '役满',
    detail: '十三种幺九牌和字牌各一张，并有一张重复。',
    sample: [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 0],
  },
  {
    name: '四暗刻',
    han: '役满',
    detail: '四组暗刻或暗杠，门清状态下完成。',
    sample: [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 4, 4],
  },
  {
    name: '大三元',
    han: '役满',
    detail: '白、发、中三组三元牌刻子或杠子。',
    sample: [31, 31, 31, 32, 32, 32, 33, 33, 33, 0, 1, 2, 4, 4],
  },
  {
    name: '小四喜',
    han: '役满',
    detail: '东南西北中三组刻子，另一个作雀头。',
    sample: [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 0, 1, 2],
  },
  {
    name: '大四喜',
    han: '役满',
    detail: '东南西北四组风牌刻子或杠子。',
    sample: [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 27, 27],
  },
  {
    name: '字一色',
    han: '役满',
    detail: '全部由七种字牌组成。',
    sample: [27, 27, 27, 28, 28, 28, 29, 29, 29, 31, 31, 31, 32, 32],
  },
  {
    name: '清老头',
    han: '役满',
    detail: '全部由一、九数牌组成。',
    sample: [0, 0, 0, 8, 8, 8, 9, 9, 9, 17, 17, 17, 18, 18],
  },
  {
    name: '绿一色',
    han: '役满',
    detail: '只使用索子二、三、四、六、八及发牌。',
    sample: [19, 20, 21, 19, 20, 21, 23, 23, 23, 32, 32, 32, 25, 25],
  },
  {
    name: '九莲宝灯',
    han: '役满',
    detail: '门清同一门 1112345678999 加任意同门牌。',
    sample: [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 4],
  },
  {
    name: '四杠子',
    han: '役满',
    detail: '四组杠子组成和牌。',
    sample: [0, 0, 0, 0, 9, 9, 9, 9, 18, 18, 18, 18, 27, 27, 27, 27, 31, 31],
  },
  {
    name: '天和',
    han: '役满',
    detail: '庄家在配牌后第一次摸牌前自摸和牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '地和',
    han: '役满',
    detail: '闲家在第一巡第一次摸牌时自摸和牌。',
    sample: [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27],
  },
  {
    name: '四暗刻单骑',
    han: '双倍役满',
    detail: '四暗刻以单骑听牌形式完成。',
    sample: [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 4, 4],
  },
  {
    name: '国士无双十三面',
    han: '双倍役满',
    detail: '国士无双十三种幺九牌全部听牌。',
    sample: [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 0],
  },
  {
    name: '大四喜单骑',
    han: '双倍役满',
    detail: '大四喜以单骑形式完成，部分规则计双倍役满。',
    sample: [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 4, 4],
  },
  {
    name: '流し满贯',
    han: '特殊役',
    detail: '流局时只打出幺九牌和字牌且无人鸣取。',
    sample: [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33],
  },
];

// 根据牌局风圈和本场数生成统一的局名
function roundLabel(state: MahjongState): string {
  const wind = state.roundWind === 'east' ? '东' : '南';
  return `${wind}${state.roundNumber}局${state.honba > 0 ? ` ${state.honba}本场` : ''}`;
}

// 根据实际 Canvas 尺寸计算全屏牌桌与底部手牌的绘制区域
function getLayout(width: number, height: number): LayoutMetrics {
  const desktop = width >= 900;
  const margin = desktop ? 24 : 12;
  const playerPanelWidth = desktop ? Math.min(196, Math.max(136, (width - 900) / 2)) : 132;
  const tableGutter = desktop ? playerPanelWidth + 16 : margin;
  const handHeight = desktop ? 112 : 82;
  const boardY = desktop ? 82 : 58;
  const availableBoardHeight = height - boardY - handHeight - (desktop ? 24 : 16);
  const boardHeight = desktop
    ? Math.max(240, availableBoardHeight)
    : Math.max(220, Math.min(availableBoardHeight, height * 0.58));
  const boardWidth = Math.min(width - tableGutter * 2, desktop ? 1420 : width - margin * 2);
  const boardX = (width - boardWidth) / 2;
  const handY = height - handHeight - (desktop ? 12 : 8);
  return {
    width,
    height,
    desktop,
    margin,
    playerPanelWidth,
    boardX,
    boardY,
    boardWidth,
    boardHeight,
    handY,
    handHeight,
  };
}

// 根据牌桌高度限制中央提示区，给上下牌河保留稳定的呼吸空间
function getCenterSize(layout: LayoutMetrics): number {
  if (layout.desktop) {
    return Math.min(layout.boardWidth * 0.22, layout.boardHeight * 0.38, 240);
  }
  return Math.min(layout.boardWidth * 0.4, layout.boardHeight * 0.44, 170);
}

// 根据牌桌素材中央标记计算真实中心，避免按外框几何中心定位
function getCenterMetrics(layout: LayoutMetrics): CenterMetrics {
  const size = getCenterSize(layout);
  const frameLeft = layout.boardX + layout.boardWidth * TABLE_CENTER_FRAME.left;
  const frameTop = layout.boardY + layout.boardHeight * TABLE_CENTER_FRAME.top;
  const frameRight = layout.boardX + layout.boardWidth * TABLE_CENTER_FRAME.right;
  const frameBottom = layout.boardY + layout.boardHeight * TABLE_CENTER_FRAME.bottom;
  const centerX = (frameLeft + frameRight) / 2;
  const centerY = (frameTop + frameBottom) / 2;
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    size,
    centerX,
    centerY,
    frameLeft,
    frameTop,
    frameRight,
    frameBottom,
  };
}

// 计算结算层尺寸，确保绘制按钮与 Canvas 命中区域保持一致
function getRoundOverlayMetrics(layout: LayoutMetrics): {
  modalWidth: number;
  modalHeight: number;
  modalX: number;
  modalY: number;
} {
  const modalWidth = Math.min(layout.width - 32, layout.desktop ? 500 : 340);
  const modalHeight = layout.desktop ? 290 : 270;
  return {
    modalWidth,
    modalHeight,
    modalX: (layout.width - modalWidth) / 2,
    modalY: (layout.height - modalHeight) / 2,
  };
}

// 生成结算层操作按钮，统一回顾、下一局和重新开局的布局
function getRoundActionButtons(layout: LayoutMetrics, state: MahjongState): PositionedActionButton[] {
  const metrics = getRoundOverlayMetrics(layout);
  const actions: readonly ResultAction[] =
    state.phase === 'match-over' ? ['review', 'restart'] : ['review', 'next', 'restart'];
  const gap = 8;
  const width = Math.min(112, (metrics.modalWidth - 48 - gap * (actions.length - 1)) / actions.length);
  const height = 36;
  const totalWidth = actions.length * width + (actions.length - 1) * gap;
  const startX = metrics.modalX + (metrics.modalWidth - totalWidth) / 2;
  const y = metrics.modalY + metrics.modalHeight - 56;
  return actions.map((action, index) => ({
    action,
    label: action === 'review' ? '回顾对局' : action === 'next' ? '下一局' : '重新开局',
    x: startX + index * (width + gap),
    y,
    width,
    height,
    primary: action !== 'restart',
  }));
}

// 计算回顾面板和四名玩家卡片的稳定网格尺寸
function getReviewPanelMetrics(layout: LayoutMetrics): ReviewPanelMetrics {
  const width = Math.min(layout.width - 24, layout.desktop ? 1180 : 352);
  const height = Math.min(
    layout.height - (layout.desktop ? 48 : 20),
    layout.desktop ? 720 : Math.max(420, layout.height - 20),
  );
  const x = (layout.width - width) / 2;
  const y = (layout.height - height) / 2;
  const headerHeight = layout.desktop ? 84 : 68;
  const footerHeight = layout.desktop ? 60 : 52;
  const columns = layout.desktop ? 2 : 1;
  const cardGap = layout.desktop ? 12 : 8;
  const contentX = x + 16;
  const contentY = y + headerHeight;
  const contentWidth = width - 32;
  const contentHeight = height - headerHeight - footerHeight;
  const cardWidth = (contentWidth - cardGap * (columns - 1)) / columns;
  const rows = Math.ceil(4 / columns);
  const cardHeight = (contentHeight - cardGap * (rows - 1)) / rows;
  return {
    x,
    y,
    width,
    height,
    headerHeight,
    footerHeight,
    contentX,
    contentY,
    contentWidth,
    cardGap,
    cardWidth,
    cardHeight,
    columns,
  };
}

// 生成回顾层操作按钮，保持当前牌局并允许返回结算或继续开局
function getReviewActionButtons(layout: LayoutMetrics, state: MahjongState): PositionedActionButton[] {
  const metrics = getReviewPanelMetrics(layout);
  const actions: readonly ReviewAction[] =
    state.phase === 'match-over' ? ['close', 'restart'] : ['close', 'next', 'restart'];
  const gap = 8;
  const width = Math.min(112, (metrics.width - 48 - gap * (actions.length - 1)) / actions.length);
  const height = layout.desktop ? 36 : 32;
  const totalWidth = actions.length * width + (actions.length - 1) * gap;
  const startX = metrics.x + (metrics.width - totalWidth) / 2;
  const y = metrics.y + metrics.height - metrics.footerHeight + 12;
  return actions.map((action, index) => ({
    action,
    label: action === 'close' ? '返回结算' : action === 'next' ? '下一局' : '重新开局',
    x: startX + index * (width + gap),
    y,
    width,
    height,
    primary: action === 'close' || action === 'next',
  }));
}

// 从本地 public 目录加载牌面与生成式 UI 素材，失败时保留文字后备绘制
async function loadTileTextures(api: PixiApi): Promise<TextureMap> {
  const tileEntries = await Promise.all(
    TILE_ASSET_FILES.map(async (file) => [file, await api.Assets.load(`/assets/mahjong/tiles/${file}`)] as const),
  );
  const [backgroundTexture, tableTexture, riichiStickTexture, actionBarTexture, ...avatarTextures] = await Promise.all([
    api.Assets.load('/assets/mahjong/background.png'),
    api.Assets.load('/assets/mahjong/table.png'),
    api.Assets.load('/assets/mahjong/ui/riichi-stick.png'),
    api.Assets.load('/assets/mahjong/ui/action-bar.png'),
    ...AVATAR_ASSET_FILES.map((file) => api.Assets.load(`/assets/mahjong/avatars/${file}`)),
  ]);
  return new Map([
    ...tileEntries,
    ['background.png', backgroundTexture],
    ['table.png', tableTexture],
    ['ui/riichi-stick.png', riichiStickTexture],
    ['ui/action-bar.png', actionBarTexture],
    ...AVATAR_ASSET_FILES.map((file, index) => [`avatars/${file}`, avatarTextures[index]!] as const),
  ]);
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

// 在回顾卡片中绘制一行真实牌面，保持牌种、赤牌与本局状态一致
function drawReviewTileStrip(
  api: PixiApi,
  parent: Container,
  tiles: readonly Tile[],
  x: number,
  y: number,
  width: number,
  tileHeight: number,
  textures: TextureMap,
): void {
  if (tiles.length === 0) {
    parent.addChild(createLabel(api, '暂无', x + width / 2, y + tileHeight / 2, 10, COLORS.muted, 0.5, 0.5, '500'));
    return;
  }
  const gap = Math.min(4, Math.max(1, width * 0.008));
  const tileWidth = Math.max(6, Math.min(tileHeight / 1.28, (width - gap * (tiles.length - 1)) / tiles.length));
  const totalWidth = tiles.length * tileWidth + (tiles.length - 1) * gap;
  const offsetX = Math.max(0, (width - totalWidth) / 2);
  tiles.forEach((tile, index) => {
    const tileBox = new api.Container();
    const background = new api.Graphics();
    background
      .roundRect(0, 0, tileWidth, tileHeight, 3)
      .fill(COLORS.cream)
      .stroke({ width: tile.red ? 2 : 1, color: tile.red ? COLORS.red : COLORS.creamEdge });
    tileBox.position.set(x + offsetX + index * (tileWidth + gap), y);
    tileBox.addChild(background);
    const texture = textures.get(tileAssetKey(tile));
    if (texture) {
      const sprite = new api.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(tileWidth / 2, tileHeight / 2);
      sprite.width = tileWidth * 0.82;
      sprite.height = tileHeight * 0.84;
      tileBox.addChild(sprite);
    } else {
      tileBox.addChild(
        createLabel(
          api,
          compactTileLabel(tile),
          tileWidth / 2,
          tileHeight / 2,
          Math.max(6, tileWidth * 0.32),
          tileTextColor(tile),
          0.5,
          0.5,
          '700',
        ),
      );
    }
    if (tile.red) {
      const redMark = new api.Graphics();
      redMark.circle(tileWidth - 3, 3, Math.max(1, tileWidth * 0.08)).fill(COLORS.red);
      tileBox.addChild(redMark);
    }
    parent.addChild(tileBox);
  });
}

// 绘制牌河网格，按桌面方向分行收纳弃牌并避免越过牌桌边界
function addRiverTiles(
  api: PixiApi,
  parent: Container,
  tiles: readonly Tile[],
  x: number,
  y: number,
  maxWidth: number,
  textures: TextureMap,
  direction: RiverDirection = 'horizontal',
  maxHeight?: number,
  highlightKind: number | null = null,
  riichiDiscardId: number | null = null,
  preferredTileHeight = 30,
): void {
  const visibleTiles = tiles.slice(-18);
  if (visibleTiles.length === 0) return;
  const gap = Math.max(2, Math.min(5, Math.round(preferredTileHeight * 0.12)));
  const preferredTileWidth = preferredTileHeight / 1.28;
  const maxColumns = direction === 'horizontal' ? 12 : 6;
  let columns = Math.max(
    1,
    Math.min(maxColumns, visibleTiles.length, Math.floor((maxWidth + gap) / (preferredTileWidth + gap))),
  );
  let tileWidth = Math.max(8, Math.min(preferredTileWidth, (maxWidth - gap * (columns - 1)) / columns));
  let tileHeight = tileWidth * 1.28;
  if (maxHeight !== undefined) {
    while (columns < visibleTiles.length) {
      const rows = Math.ceil(visibleTiles.length / columns);
      const gridHeight = rows * tileHeight + Math.max(0, rows - 1) * gap;
      if (gridHeight <= maxHeight) break;
      columns += 1;
      tileWidth = Math.max(8, Math.min(preferredTileWidth, (maxWidth - gap * (columns - 1)) / columns));
      tileHeight = tileWidth * 1.28;
    }
    const rows = Math.ceil(visibleTiles.length / columns);
    const heightLimit = (maxHeight - Math.max(0, rows - 1) * gap) / rows;
    if (tileHeight > heightLimit) {
      tileHeight = Math.max(8, heightLimit);
      tileWidth = tileHeight / 1.28;
    }
  }
  const rows = Math.ceil(visibleTiles.length / columns);
  const gridHeight = rows * tileHeight + Math.max(0, rows - 1) * gap;
  const offsetY = maxHeight === undefined ? 0 : Math.max(0, (maxHeight - gridHeight) / 2);
  visibleTiles.forEach((tile, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowTileCount = Math.min(columns, visibleTiles.length - row * columns);
    const rowWidth = rowTileCount * tileWidth + Math.max(0, rowTileCount - 1) * gap;
    const rowOffsetX = Math.max(0, (maxWidth - rowWidth) / 2);
    const highlighted = highlightKind !== null && tile.kind === highlightKind;
    const riichiDiscard = tile.id === riichiDiscardId;
    const tileBox = new api.Container();
    const background = new api.Graphics();
    background
      .roundRect(0, 0, tileWidth, tileHeight, 3)
      .fill(COLORS.cream)
      .stroke({ width: highlighted ? 3 : 1, color: highlighted ? COLORS.red : COLORS.creamEdge });
    const tileX = x + rowOffsetX + column * (tileWidth + gap);
    const tileY = y + offsetY + row * (tileHeight + gap);
    tileBox.position.set(tileX, tileY);
    if (riichiDiscard) {
      tileBox.pivot.set(tileWidth / 2, tileHeight / 2);
      tileBox.position.set(tileX + tileWidth / 2, tileY + tileHeight / 2);
      tileBox.rotation = Math.PI / 2;
    }
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

// 将与上下牌河相同的横向网格旋转到左右两侧，保持四边结构一致
function addRotatedRiverTiles(
  api: PixiApi,
  parent: Container,
  tiles: readonly Tile[],
  x: number,
  y: number,
  width: number,
  height: number,
  textures: TextureMap,
  rotation: number,
  highlightKind: number | null = null,
  riichiDiscardId: number | null = null,
  preferredTileHeight = 30,
): void {
  const river = new api.Container();
  river.position.set(x + width / 2, y + height / 2);
  river.pivot.set(height / 2, width / 2);
  river.rotation = rotation;
  addRiverTiles(
    api,
    river,
    tiles,
    0,
    0,
    height,
    textures,
    'horizontal',
    width,
    highlightKind,
    riichiDiscardId,
    preferredTileHeight,
  );
  parent.addChild(river);
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
      label: action.label,
      primary: action.type !== 'pass',
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
    ...legalActions
      .filter((action) => action.type === 'kan')
      .map((action) => ({ action, label: action.label, primary: true })),
  ];
}

// 计算动作按钮宽度，绘制与命中检测共用同一套尺寸
function getActionButtonWidth(label: string, desktop: boolean): number {
  return Math.max(desktop ? 100 : 76, label.length * (desktop ? 13 : 10) + 28);
}

// 绘制舒适的绿色绒面背景，使用柔和线条减少冷峻的生成式视觉感
function drawAtmosphere(
  api: PixiApi,
  root: Container,
  layout: LayoutMetrics,
  variant: 'lobby' | 'table',
  textures: TextureMap,
): void {
  const { width, height } = layout;
  const backgroundTexture = textures.get('background.png');
  if (backgroundTexture) {
    const backgroundSprite = new api.Sprite(backgroundTexture);
    backgroundSprite.anchor.set(0);
    backgroundSprite.width = width;
    backgroundSprite.height = height;
    root.addChild(backgroundSprite);
    const wash = new api.Graphics();
    wash.rect(0, 0, width, height).fill({
      color: variant === 'table' ? 0x0e4737 : 0xe2eddc,
      alpha: variant === 'table' ? 0.16 : 0.2,
    });
    root.addChild(wash);
    return;
  }
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

// 绘制中央局况信息，集中展示风圈、余牌和带素材的宝牌
function drawCenterScore(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
): void {
  const { desktop } = layout;
  const tableTiles = getTableTileMetrics(layout);
  const center = getCenterMetrics(layout);
  const centerSize = center.size;
  const centerWidth = centerSize;
  const contentCenterX = center.centerX;
  const contentCenterY = center.centerY;
  const titleY = contentCenterY - (desktop ? 50 : 34);
  const remainingY = contentCenterY - (desktop ? 14 : 10);
  root.addChild(
    createLabel(api, roundLabel(state), contentCenterX, titleY, desktop ? 21 : 16, COLORS.cyan, 0.5, 0.5, '700'),
  );
  root.addChild(
    createLabel(
      api,
      `剩余 ${state.wall.length}`,
      contentCenterX,
      remainingY,
      desktop ? 18 : 14,
      COLORS.white,
      0.5,
      0.5,
      '700',
    ),
  );
  const doraTiles = state.doraIndicators;
  const doraGap = tableTiles.doraGap;
  const doraTextWidth = Math.min(desktop ? 42 : 32, centerWidth * 0.22);
  const availableDoraWidth = Math.max(0, centerWidth * 0.86 - doraTextWidth - doraGap * (doraTiles.length + 1));
  const doraTileWidth = Math.min(
    tableTiles.doraTileWidth,
    Math.max(12, availableDoraWidth / Math.max(1, doraTiles.length)),
  );
  const doraTileHeight = doraTileWidth * 1.28;
  const doraStripWidth =
    doraTextWidth + doraGap + doraTiles.length * doraTileWidth + Math.max(0, doraTiles.length - 1) * doraGap;
  const doraStripX = contentCenterX - doraStripWidth / 2;
  const doraStripY = contentCenterY + (desktop ? 14 : 10);
  const doraDivider = new api.Graphics();
  doraDivider
    .moveTo(contentCenterX - centerWidth * 0.3, doraStripY - 9)
    .lineTo(contentCenterX + centerWidth * 0.3, doraStripY - 9)
    .stroke({ width: 1, color: COLORS.gold, alpha: 0.48 });
  root.addChild(doraDivider);
  root.addChild(
    createLabel(
      api,
      '宝牌',
      doraStripX + doraTextWidth / 2,
      doraStripY + doraTileHeight / 2,
      desktop ? 12 : 10,
      COLORS.gold,
      0.5,
      0.5,
      '700',
    ),
  );
  doraTiles.forEach((tile, index) => {
    const tileX = doraStripX + doraTextWidth + doraGap + index * (doraTileWidth + doraGap);
    const tileBackground = new api.Graphics();
    tileBackground
      .roundRect(tileX, doraStripY, doraTileWidth, doraTileHeight, 3)
      .fill(COLORS.cream)
      .stroke({ width: 1, color: COLORS.gold });
    root.addChild(tileBackground);
    const texture = textures.get(tileAssetKey(tile));
    if (texture) {
      const sprite = new api.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(tileX + doraTileWidth / 2, doraStripY + doraTileHeight / 2);
      sprite.width = doraTileWidth * 0.84;
      sprite.height = doraTileHeight * 0.86;
      root.addChild(sprite);
    } else {
      root.addChild(
        createLabel(
          api,
          compactTileLabel(tile),
          tileX + doraTileWidth / 2,
          doraStripY + doraTileHeight / 2,
          Math.max(7, doraTileWidth * 0.32),
          tileTextColor(tile),
          0.5,
          0.5,
          '700',
        ),
      );
    }
  });
  const windOffset = desktop ? 16 : 10;
  const windLabels: Array<{ text: string; x: number; y: number }> = [
    { text: '东', x: center.centerX, y: center.frameTop - windOffset },
    { text: '南', x: center.frameRight + windOffset, y: center.centerY },
    { text: '西', x: center.centerX, y: center.frameBottom + windOffset },
    { text: '北', x: center.frameLeft - windOffset, y: center.centerY },
  ];
  for (const item of windLabels)
    root.addChild(createLabel(api, item.text, item.x, item.y, desktop ? 16 : 12, COLORS.cyan, 0.5, 0.5, '700'));
}

// 绘制带耳朵、脸颊和表情的可爱动物头像，减少训练桌的生硬感
function drawAnimalAvatar(
  api: PixiApi,
  root: Container,
  centerX: number,
  centerY: number,
  radius: number,
  seat: Seat,
  textures: TextureMap,
): void {
  const avatarTexture = textures.get(`avatars/avatar-${seat}.png`);
  if (avatarTexture) {
    const frame = new api.Graphics();
    frame
      .roundRect(centerX - radius - 2, centerY - radius - 2, (radius + 2) * 2, (radius + 2) * 2, radius * 0.35)
      .fill(COLORS.panel)
      .stroke({ width: 1, color: COLORS.panelLine });
    root.addChild(frame);
    const sprite = new api.Sprite(avatarTexture);
    sprite.anchor.set(0.5);
    sprite.position.set(centerX, centerY);
    sprite.width = radius * 2.05;
    sprite.height = radius * 2.05;
    const mask = new api.Graphics();
    mask.roundRect(centerX - radius, centerY - radius, radius * 2, radius * 2, radius * 0.3).fill(COLORS.white);
    sprite.mask = mask;
    root.addChild(mask);
    root.addChild(sprite);
    return;
  }
  const palette = [0xf0bb78, 0xd7e8ef, 0xc99068, 0xe79567] as const;
  const earPalette = [0xc47a47, 0xb4cbd8, 0x9d664f, 0xc96545] as const;
  const face = new api.Graphics();
  const earSize = radius * 0.7;
  const leftEarX = centerX - radius * 0.56;
  const rightEarX = centerX + radius * 0.56;
  const earTop = centerY - radius * 0.9;
  face
    .moveTo(leftEarX - earSize * 0.46, centerY - radius * 0.36)
    .lineTo(leftEarX, earTop)
    .lineTo(leftEarX + earSize * 0.46, centerY - radius * 0.36)
    .closePath()
    .fill(earPalette[seat]);
  face
    .moveTo(rightEarX - earSize * 0.46, centerY - radius * 0.36)
    .lineTo(rightEarX, earTop)
    .lineTo(rightEarX + earSize * 0.46, centerY - radius * 0.36)
    .closePath()
    .fill(earPalette[seat]);
  face.circle(centerX, centerY, radius * 0.78).fill(palette[seat]);
  face.circle(centerX - radius * 0.27, centerY - radius * 0.08, radius * 0.09).fill(COLORS.ink);
  face.circle(centerX + radius * 0.27, centerY - radius * 0.08, radius * 0.09).fill(COLORS.ink);
  face.circle(centerX - radius * 0.42, centerY + radius * 0.2, radius * 0.1).fill({ color: COLORS.red, alpha: 0.55 });
  face.circle(centerX + radius * 0.42, centerY + radius * 0.2, radius * 0.1).fill({ color: COLORS.red, alpha: 0.55 });
  face.circle(centerX, centerY + radius * 0.16, radius * 0.08).fill(0x6c3e40);
  root.addChild(face);
}

// 绘制带当前手牌数和分数的四方玩家席位卡
function drawSeatBadge(
  api: PixiApi,
  root: Container,
  player: MahjongState['players'][number],
  layout: LayoutMetrics,
  textures: TextureMap,
  current: boolean,
  displayName = player.name,
): void {
  const { width, height, boardX, boardY, boardWidth, boardHeight, desktop, handY, handHeight } = layout;
  const boxWidth = desktop ? layout.playerPanelWidth : 132;
  const boxHeight = desktop ? 68 : 44;
  const sideGap = desktop ? 16 : 12;
  const positions: Record<Seat, { x: number; y: number }> = desktop
    ? {
        0: {
          x: Math.max(8, boardX - boxWidth - sideGap),
          y: Math.min(height - boxHeight - 8, handY + Math.max(0, (handHeight - boxHeight) / 2)),
        },
        1: {
          x: Math.min(width - boxWidth - 8, boardX + boardWidth + sideGap),
          y: boardY + boardHeight / 2 - boxHeight / 2,
        },
        2: {
          x: boardX + boardWidth / 2 - boxWidth / 2,
          y: Math.max(8, boardY - boxHeight - 12),
        },
        3: {
          x: Math.max(8, boardX - boxWidth - sideGap),
          y: boardY + boardHeight / 2 - boxHeight / 2,
        },
      }
    : {
        0: { x: boardX + boardWidth / 2 - boxWidth / 2, y: boardY + boardHeight - boxHeight - 10 },
        1: { x: boardX + boardWidth - boxWidth - 12, y: boardY + boardHeight / 2 - boxHeight / 2 },
        2: { x: boardX + boardWidth / 2 - boxWidth / 2, y: boardY + 8 },
        3: { x: boardX + 12, y: boardY + boardHeight / 2 - boxHeight / 2 },
      };
  const position = positions[player.seat];
  const panel = new api.Graphics();
  panel
    .roundRect(position.x, position.y, boxWidth, boxHeight, desktop ? 14 : 10)
    .fill({ color: current ? 0x3d6b4d : COLORS.panel, alpha: 0.94 })
    .stroke({ width: current ? 2 : 1, color: current ? COLORS.gold : COLORS.panelLine });
  root.addChild(panel);
  const avatarRadius = desktop ? Math.min(26, boxHeight * 0.38) : 13;
  const contentLeft = position.x + avatarRadius * 2 + (desktop ? 26 : 24);
  drawAnimalAvatar(
    api,
    root,
    position.x + avatarRadius + (desktop ? 12 : 11),
    position.y + boxHeight / 2,
    avatarRadius,
    player.seat,
    textures,
  );
  root.addChild(
    createLabel(
      api,
      current ? `● ${displayName}` : displayName,
      contentLeft,
      position.y + (desktop ? 23 : 17),
      desktop ? 16 : 11,
      current ? COLORS.gold : COLORS.white,
      0,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      `${player.score.toLocaleString()} 点 · 河 ${player.discards.length}${player.furiten ? ' · 振听' : ''}`,
      contentLeft,
      position.y + (desktop ? 48 : 36),
      desktop ? 12 : 9,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
}

// 绘制一组副露牌，并用横置牌标记鸣牌来源
function drawMeldTiles(
  api: PixiApi,
  parent: Container,
  meld: Meld,
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  textures: TextureMap,
): number {
  const gap = Math.max(1, tileWidth * 0.12);
  meld.tiles.forEach((tile, index) => {
    const tileBox = new api.Container();
    const background = new api.Graphics();
    background
      .roundRect(0, 0, tileWidth, tileHeight, 3)
      .fill(COLORS.cream)
      .stroke({ width: tile.red ? 2 : 1, color: tile.red ? COLORS.red : COLORS.creamEdge });
    const tileX = x + index * (tileWidth + gap);
    tileBox.position.set(tileX, y);
    if (meld.calledTileId === tile.id) {
      tileBox.pivot.set(tileWidth / 2, tileHeight / 2);
      tileBox.position.set(tileX + tileWidth / 2, y + tileHeight / 2);
      tileBox.rotation = Math.PI / 2;
    }
    tileBox.addChild(background);
    const texture = textures.get(tileAssetKey(tile));
    if (texture) {
      const sprite = new api.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(tileWidth / 2, tileHeight / 2);
      sprite.width = tileWidth * 0.82;
      sprite.height = tileHeight * 0.84;
      tileBox.addChild(sprite);
    } else {
      tileBox.addChild(
        createLabel(
          api,
          compactTileLabel(tile),
          tileWidth / 2,
          tileHeight / 2,
          Math.max(6, tileWidth * 0.32),
          tileTextColor(tile),
          0.5,
          0.5,
          '700',
        ),
      );
    }
    parent.addChild(tileBox);
  });
  return meld.tiles.length * (tileWidth + gap) - gap;
}

// 将各家的吃碰杠牌组固定展示在牌桌外沿，避开牌河与中央计分区
function drawMeldsOnTable(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
): void {
  const { boardX, boardY, boardWidth, boardHeight, desktop } = layout;
  const tableTiles = getTableTileMetrics(layout);
  const tileHeight = tableTiles.meldTileHeight;
  const tileWidth = tileHeight / 1.28;
  const leftMeldX =
    boardX + tableTiles.wallInset + tableTiles.wallHeight + tableTiles.edgeGap + tableTiles.meldTileHeight;
  const rightMeldX =
    boardX + boardWidth - tableTiles.wallInset - tableTiles.wallHeight - tableTiles.edgeGap - tableTiles.meldTileHeight;
  const positions: Record<Seat, { x: number; y: number; rotation: number }> = {
    0: {
      x: boardX + boardWidth * 0.25,
      y: boardY + boardHeight - tableTiles.meldTileHeight - tableTiles.edgeGap,
      rotation: 0,
    },
    1: { x: rightMeldX, y: boardY + boardHeight * 0.58, rotation: -Math.PI / 2 },
    2: {
      x: boardX + boardWidth * 0.12,
      y: boardY + tableTiles.wallInset + tableTiles.wallHeight + tableTiles.edgeGap,
      rotation: 0,
    },
    3: { x: leftMeldX, y: boardY + boardHeight * 0.24, rotation: Math.PI / 2 },
  };
  for (const player of state.players) {
    if (player.melds.length === 0) continue;
    const position = positions[player.seat];
    const strip = new api.Container();
    strip.position.set(position.x, position.y);
    strip.rotation = position.rotation;
    let cursor = 0;
    for (const meld of player.melds) {
      const meldWidth = drawMeldTiles(api, strip, meld, cursor, 0, tileWidth, tileHeight, textures);
      const meldLabel = createLabel(
        api,
        meld.type === 'chi' ? '吃' : meld.type === 'pon' ? '碰' : '杠',
        cursor + meldWidth / 2,
        -7,
        desktop ? 9 : 7,
        COLORS.gold,
        0.5,
        0.5,
        '700',
      );
      if (position.rotation !== 0) meldLabel.rotation = -position.rotation;
      strip.addChild(meldLabel);
      cursor += meldWidth + tileWidth * 0.65;
    }
    root.addChild(strip);
  }
}

// 将立直棒放在中央计分框四边，并按玩家座位方向旋转
function drawRiichiSticksOnTable(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
): void {
  const texture = textures.get('ui/riichi-stick.png');
  if (!texture) return;
  const center = getCenterMetrics(layout);
  const stickWidth = layout.desktop ? 112 : 82;
  const stickHeight = stickWidth * (texture.height / Math.max(1, texture.width));
  const positions: Record<Seat, { x: number; y: number; rotation: number }> = {
    0: { x: center.centerX, y: center.frameBottom - stickHeight * 0.55, rotation: 0 },
    1: { x: center.frameRight - stickHeight * 0.55, y: center.centerY, rotation: -Math.PI / 2 },
    2: { x: center.centerX, y: center.frameTop - stickHeight * 0.55, rotation: 0 },
    3: { x: center.frameLeft + stickHeight * 0.55, y: center.centerY, rotation: Math.PI / 2 },
  };
  for (const player of state.players) {
    if (!player.riichi) continue;
    const position = positions[player.seat];
    const stick = new api.Sprite(texture);
    stick.anchor.set(0.5);
    stick.position.set(position.x, position.y);
    stick.width = stickWidth;
    stick.height = stickHeight;
    stick.rotation = position.rotation;
    root.addChild(stick);
  }
}

// 绘制参考截图风格的全屏实体牌桌、牌河和四方席位
function drawBoard(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
  selectedTileId: number | null,
  seatLabels?: readonly string[],
): void {
  const { boardX, boardY, boardWidth, boardHeight, desktop } = layout;
  const tableTiles = getTableTileMetrics(layout);
  // 从已选手牌取得牌种，用于牌河中的同牌种提示
  const selectedTileKind =
    selectedTileId === null ? null : (state.players[0]?.hand.find((tile) => tile.id === selectedTileId)?.kind ?? null);
  const tableTexture = textures.get('table.png');
  if (tableTexture) {
    const tableSprite = new api.Sprite(tableTexture);
    tableSprite.position.set(boardX, boardY);
    tableSprite.width = boardWidth;
    tableSprite.height = boardHeight;
    const tableMask = new api.Graphics();
    tableMask.roundRect(boardX, boardY, boardWidth, boardHeight, desktop ? 28 : 18).fill(COLORS.white);
    tableSprite.mask = tableMask;
    root.addChild(tableMask);
    root.addChild(tableSprite);
  }
  const outer = new api.Graphics();
  outer
    .roundRect(boardX, boardY, boardWidth, boardHeight, desktop ? 28 : 18)
    .fill({ color: 0x244b36, alpha: tableTexture ? 0.12 : 0.96 })
    .stroke({ width: 2, color: COLORS.boardEdge });
  root.addChild(outer);
  const inner = new api.Graphics();
  inner
    .roundRect(boardX + 14, boardY + 14, boardWidth - 28, boardHeight - 28, desktop ? 22 : 14)
    .fill({ color: COLORS.board, alpha: tableTexture ? 0.08 : 1 })
    .stroke({ width: 1, color: COLORS.cyan, alpha: tableTexture ? 0.38 : 1 });
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
    .stroke({ width: 1, color: 0x8fd4d2, alpha: tableTexture ? 0.14 : 0.26 });
  root.addChild(lane);
  const wallWidth = tableTiles.wallWidth;
  const wallHeight = tableTiles.wallHeight;
  drawWall(
    api,
    root,
    boardX + boardWidth * 0.12,
    boardY + tableTiles.wallInset,
    7,
    wallWidth,
    wallHeight,
    'horizontal',
  );
  drawWall(api, root, boardX + tableTiles.wallInset, boardY + boardHeight * 0.22, 7, wallHeight, wallWidth, 'vertical');
  drawWall(
    api,
    root,
    boardX + boardWidth - wallHeight - tableTiles.wallInset,
    boardY + boardHeight * 0.22,
    7,
    wallHeight,
    wallWidth,
    'vertical',
  );
  const center = getCenterMetrics(layout);
  const centerSize = center.size;
  const centerWidth = centerSize;
  const centerHeight = centerSize;
  const centerX = center.x;
  const centerY = center.y;
  const riverGap = tableTiles.riverGap;
  const riverWidth = Math.min(boardWidth * (desktop ? 0.36 : 0.62), centerSize * (desktop ? 1.72 : 1.5));
  const riverHeight = Math.max(desktop ? 84 : 68, tableTiles.riverTileHeight * 2 + tableTiles.doraGap);
  const seatClearance = desktop ? 78 : 62;
  const topRiverY = Math.max(boardY + seatClearance, centerY - riverHeight - riverGap);
  const bottomRiverY = Math.min(boardY + boardHeight - seatClearance - riverHeight, centerY + centerHeight + riverGap);
  addRiverTiles(
    api,
    root,
    state.players[2]?.discards ?? [],
    centerX + centerWidth / 2 - riverWidth / 2,
    topRiverY,
    riverWidth,
    textures,
    'horizontal',
    riverHeight,
    selectedTileKind,
    state.players[2]?.riichiDiscardId ?? null,
    tableTiles.riverTileHeight,
  );
  addRiverTiles(
    api,
    root,
    state.players[0]?.discards ?? [],
    centerX + centerWidth / 2 - riverWidth / 2,
    bottomRiverY,
    riverWidth,
    textures,
    'horizontal',
    riverHeight,
    selectedTileKind,
    state.players[0]?.riichiDiscardId ?? null,
    tableTiles.riverTileHeight,
  );
  const sideWidth = Math.max(
    desktop ? 126 : 78,
    tableTiles.riverTileHeight * 3 + tableTiles.doraGap * 2 + tableTiles.edgeGap,
  );
  const sideHeight = Math.min(boardHeight * (desktop ? 0.56 : 0.5), centerSize * (desktop ? 1.45 : 1.25));
  const sideY = centerY + centerHeight / 2 - sideHeight / 2;
  addRotatedRiverTiles(
    api,
    root,
    state.players[3]?.discards ?? [],
    centerX - sideWidth - riverGap,
    sideY,
    sideWidth,
    sideHeight,
    textures,
    Math.PI / 2,
    selectedTileKind,
    state.players[3]?.riichiDiscardId ?? null,
    tableTiles.riverTileHeight,
  );
  addRotatedRiverTiles(
    api,
    root,
    state.players[1]?.discards ?? [],
    centerX + centerWidth + riverGap,
    sideY,
    sideWidth,
    sideHeight,
    textures,
    -Math.PI / 2,
    selectedTileKind,
    state.players[1]?.riichiDiscardId ?? null,
    tableTiles.riverTileHeight,
  );
  drawCenterScore(api, root, state, layout, textures);
  drawRiichiSticksOnTable(api, root, state, layout, textures);
  for (const player of state.players)
    drawSeatBadge(
      api,
      root,
      player,
      layout,
      textures,
      player.seat === state.currentPlayer && state.phase !== 'round-over' && state.phase !== 'match-over',
      seatLabels?.[player.seat] ?? player.name,
    );
  drawMeldsOnTable(api, root, state, layout, textures);
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
    .fill({ color: COLORS.panel, alpha: 0.94 })
    .stroke({ width: 1, color: COLORS.centerLine });
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
  if (actionList.length > 0) {
    const texture = textures.get('ui/action-bar.png');
    const actionBackdrop = new api.Container();
    const backdropWidth = Math.max(totalWidth + (desktop ? 36 : 24), desktop ? 184 : 144);
    const backdropHeight = actionHeight + (desktop ? 20 : 16);
    const backdropX = (width - backdropWidth) / 2;
    const backdropY = actionY - actionHeight - (desktop ? 10 : 8);
    const panel = new api.Graphics();
    panel
      .roundRect(0, 0, backdropWidth, backdropHeight, desktop ? 16 : 12)
      .fill({ color: COLORS.center, alpha: 0.96 })
      .stroke({ width: 2, color: COLORS.gold });
    panel
      .roundRect(
        desktop ? 5 : 4,
        desktop ? 5 : 4,
        backdropWidth - (desktop ? 10 : 8),
        backdropHeight - (desktop ? 10 : 8),
        desktop ? 12 : 9,
      )
      .stroke({ width: 1, color: COLORS.boardInner, alpha: 0.95 });
    actionBackdrop.addChild(panel);
    if (texture) {
      const textureRatio = texture.width / Math.max(1, texture.height);
      const decorationHeight = backdropHeight - (desktop ? 6 : 4);
      const decoration = new api.Sprite(texture);
      decoration.anchor.set(0.5);
      decoration.position.set(backdropWidth / 2, backdropHeight / 2);
      decoration.width = Math.min(backdropWidth - (desktop ? 8 : 6), decorationHeight * textureRatio);
      decoration.height = decorationHeight;
      decoration.alpha = 0.26;
      actionBackdrop.addChild(decoration);
    }
    actionBackdrop.position.set(backdropX, backdropY);
    root.addChild(actionBackdrop);
  }
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
  const selectedHand = selectedTileId === null ? null : human.hand.filter((tile) => tile.id !== selectedTileId);
  const selectedWaits = selectedHand ? getTenpaiWaits(selectedHand) : [];
  const availableWaits = new Map<number, Tile>();
  if (selectedTileId === null) {
    human.hand.forEach((tile) => {
      getTenpaiWaits(human.hand.filter((candidate) => candidate.id !== tile.id)).forEach((wait) => {
        availableWaits.set(wait.kind, wait);
      });
    });
  } else {
    selectedWaits.forEach((wait) => availableWaits.set(wait.kind, wait));
  }
  if (selectedWaits.length > 0 && !human.riichi) {
    root.addChild(
      createLabel(
        api,
        `听牌：${selectedWaits.map((wait) => compactTileLabel(wait)).join('、')}`,
        width / 2,
        actionY - actionHeight - 16,
        desktop ? 13 : 11,
        COLORS.gold,
        0.5,
        0.5,
        '700',
      ),
    );
  }
  if (actionList.length === 0) {
    const hint =
      human.riichi && state.phase === 'player-turn'
        ? '立直中 · 摸牌后自动摸切'
        : selectedWaits.length > 0
          ? `听牌：${selectedWaits.map((wait) => compactTileLabel(wait)).join('、')}`
          : availableWaits.size > 0
            ? `选择舍牌后可听：${Array.from(availableWaits.values())
                .slice(0, 6)
                .map((wait) => compactTileLabel(wait))
                .join('、')}`
            : state.phase === 'player-turn'
              ? human.furiten || human.temporaryFuriten
                ? '振听中 · 只能自摸，不能荣和'
                : ''
              : state.phase === 'ai-turn'
                ? 'AI 正在读取牌河与向听数…'
                : state.phase === 'match-over'
                  ? '半庄完成 · 可重新开局'
                  : '等待结算';
    if (hint) {
      root.addChild(
        createLabel(
          api,
          hint,
          width / 2,
          handY - (desktop ? 28 : 20),
          desktop ? 13 : 11,
          COLORS.muted,
          0.5,
          0.5,
          '500',
        ),
      );
    }
  }
  root.addChild(
    createLabel(
      api,
      '点击手牌选择 · 再点一次出牌 · Esc 取消选择',
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
  title = '日本麻将 · 单人训练',
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
      `${roundLabel(state)}  ·  牌山 ${state.wall.length}`,
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
}

// 计算牌型说明和配置面板的统一尺寸，避免绘制与命中区域产生偏差
function getUtilityPanelMetrics(
  layout: LayoutMetrics,
  panel: Exclude<MahjongUtilityPanel, 'none'>,
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(layout.width - 32, layout.desktop ? 760 : 348);
  const height =
    panel === 'yaku'
      ? Math.min(layout.height - 48, layout.desktop ? 650 : Math.max(420, layout.height - 48))
      : layout.desktop
        ? 250
        : 224;
  return { x: (layout.width - width) / 2, y: (layout.height - height) / 2, width, height };
}

// 计算配置面板的重新开局与返回主页按钮，确保绘制和命中区域一致
function getSettingsActionButtons(
  layout: LayoutMetrics,
  metrics: ReturnType<typeof getUtilityPanelMetrics>,
): Array<{
  action: 'restart' | 'home';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const height = layout.desktop ? 46 : 42;
  const gap = layout.desktop ? 12 : 10;
  const width = metrics.width - 56;
  const x = metrics.x + 28;
  const firstY = metrics.y + 98;
  return [
    { action: 'restart', label: '重新开局', x, y: firstY, width, height },
    { action: 'home', label: '返回主页', x, y: firstY + height + gap, width, height },
  ];
}

// 计算胡牌图鉴内容超出视口时允许滚动的最大距离
function getUtilityScrollLimit(layout: LayoutMetrics, panel: Exclude<MahjongUtilityPanel, 'none'>): number {
  if (panel !== 'yaku') return 0;
  const metrics = getUtilityPanelMetrics(layout, panel);
  const cardHeight = layout.desktop ? 150 : 142;
  const gap = layout.desktop ? 12 : 8;
  const viewportHeight = metrics.height - (layout.desktop ? 116 : 110);
  const contentHeight = YAKU_REFERENCES.length * (cardHeight + gap) - gap;
  return Math.max(0, contentHeight - viewportHeight);
}

// 绘制胡牌牌型图鉴或真实的返回主页配置面板
function drawUtilityPanel(
  api: PixiApi,
  root: Container,
  panel: Exclude<MahjongUtilityPanel, 'none'>,
  layout: LayoutMetrics,
  textures: TextureMap,
  utilityScroll: number,
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
  const subtitle = panel === 'yaku' ? '役种与牌面参考 · 滚动浏览完整列表' : '牌局菜单';
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
    const cardHeight = desktop ? 150 : 142;
    const gap = desktop ? 12 : 8;
    const viewportX = metrics.x + 28;
    const viewportY = metrics.y + 88;
    const viewportWidth = metrics.width - 56;
    const viewportHeight = metrics.height - (desktop ? 116 : 110);
    const limit = getUtilityScrollLimit(layout, panel);
    const scroll = Math.max(0, Math.min(limit, utilityScroll));
    const clip = new api.Graphics();
    clip.rect(viewportX, viewportY, viewportWidth, viewportHeight).fill({ color: 0xffffff, alpha: 0.01 });
    root.addChild(clip);
    const content = new api.Container();
    content.mask = clip;
    root.addChild(content);
    YAKU_REFERENCES.forEach((entry, index) => {
      const x = viewportX;
      const y = viewportY + index * (cardHeight + gap) - scroll;
      const card = new api.Graphics();
      card
        .roundRect(x, y, viewportWidth, cardHeight, 10)
        .fill({ color: 0x376d4d, alpha: 0.9 })
        .stroke({ width: 1, color: COLORS.panelLine });
      content.addChild(card);
      content.addChild(createLabel(api, entry.name, x + 14, y + 21, desktop ? 16 : 14, COLORS.gold, 0, 0.5, '700'));
      content.addChild(
        createLabel(api, entry.han, x + viewportWidth - 14, y + 21, desktop ? 10 : 9, COLORS.cyan, 1, 0.5, '600'),
      );
      const tileY = y + (desktop ? 54 : 50);
      const tileGap = desktop ? 4 : 3;
      const tileWidth = Math.max(
        desktop ? 12 : 8,
        Math.min(desktop ? 26 : 20, (viewportWidth - 28 - tileGap * (entry.sample.length - 1)) / entry.sample.length),
      );
      const tileHeight = tileWidth * 1.28;
      entry.sample.forEach((kind, tileIndex) => {
        const tile = YAKU_TILE_BY_KIND.get(kind);
        if (!tile) return;
        const tileX = x + 14 + tileIndex * (tileWidth + tileGap);
        const tileBackground = new api.Graphics();
        tileBackground
          .roundRect(tileX, tileY, tileWidth, tileHeight, 3)
          .fill(COLORS.cream)
          .stroke({ width: 1, color: COLORS.creamEdge });
        content.addChild(tileBackground);
        const texture = textures.get(tileAssetKey(tile));
        if (texture) {
          const sprite = new api.Sprite(texture);
          sprite.anchor.set(0.5);
          sprite.position.set(tileX + tileWidth / 2, tileY + tileHeight / 2);
          sprite.width = tileWidth * 0.84;
          sprite.height = tileHeight * 0.86;
          content.addChild(sprite);
        } else {
          content.addChild(
            createLabel(
              api,
              compactTileLabel(tile),
              tileX + tileWidth / 2,
              tileY + tileHeight / 2,
              Math.max(7, tileWidth * 0.32),
              tileTextColor(tile),
              0.5,
              0.5,
              '700',
            ),
          );
        }
      });
      content.addChild(
        createLabel(
          api,
          entry.detail,
          x + 14,
          y + cardHeight - (desktop ? 16 : 14),
          desktop ? 11 : 10,
          COLORS.white,
          0,
          0.5,
          '500',
        ),
      );
    });
    if (limit > 0) {
      const track = new api.Graphics();
      const trackX = metrics.x + metrics.width - 18;
      track.roundRect(trackX, viewportY, 5, viewportHeight, 3).fill({ color: COLORS.panel, alpha: 0.6 });
      const thumbHeight = Math.max(34, (viewportHeight / (viewportHeight + limit)) * viewportHeight);
      const thumbY = viewportY + (scroll / limit) * (viewportHeight - thumbHeight);
      track.roundRect(trackX, thumbY, 5, thumbHeight, 3).fill(COLORS.gold);
      root.addChild(track);
    }
  } else {
    for (const action of getSettingsActionButtons(layout, metrics)) {
      addButton(
        api,
        root,
        action.label,
        action.x,
        action.y,
        action.width,
        action.height,
        action.action === 'restart',
        !desktop,
      );
    }
    root.addChild(
      createLabel(
        api,
        '结束当前牌局，返回主页。',
        metrics.x + 28,
        metrics.y + metrics.height - 28,
        desktop ? 11 : 9,
        COLORS.muted,
        0,
        0.5,
        '500',
      ),
    );
  }
}

// 绘制真实牌局快照，公开三名 AI 的实际手牌、牌河与牌数校验信息
function drawReviewOverlay(
  api: PixiApi,
  root: Container,
  state: MahjongState,
  layout: LayoutMetrics,
  textures: TextureMap,
): void {
  const metrics = getReviewPanelMetrics(layout);
  const veil = new api.Graphics();
  veil.rect(0, 0, layout.width, layout.height).fill({ color: COLORS.background, alpha: 0.82 });
  root.addChild(veil);
  const modal = new api.Graphics();
  modal
    .roundRect(metrics.x, metrics.y, metrics.width, metrics.height, layout.desktop ? 20 : 16)
    .fill(COLORS.panel)
    .stroke({ width: 2, color: COLORS.gold });
  root.addChild(modal);

  root.addChild(
    createLabel(
      api,
      '对局回顾 · 真实牌面校验',
      metrics.x + 20,
      metrics.y + (layout.desktop ? 28 : 22),
      layout.desktop ? 22 : 17,
      COLORS.gold,
      0,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      '展示本局实际状态，不重新生成牌面',
      metrics.x + 20,
      metrics.y + (layout.desktop ? 52 : 43),
      layout.desktop ? 12 : 9,
      COLORS.muted,
      0,
      0.5,
      '500',
    ),
  );
  const doraText = state.doraIndicators.map((tile) => compactTileLabel(tile)).join('、') || '无';
  const tileCount = state.players.reduce(
    (total, player) =>
      total +
      player.hand.length +
      player.discards.length +
      player.melds.reduce((meldTotal, meld) => meldTotal + meld.tiles.length, 0),
    0,
  );
  const trackedTileCount =
    tileCount + state.wall.length + state.rinshan.length + state.deadWall.length + state.doraIndicators.length;
  root.addChild(
    createLabel(
      api,
      layout.desktop
        ? `种子 ${state.seed} · 牌数校验 ${trackedTileCount}/136 · 剩余 ${state.wall.length} · 宝牌 ${doraText}`
        : `牌数校验 ${trackedTileCount}/136 · 剩余 ${state.wall.length} · 宝牌 ${doraText}`,
      metrics.x + 20,
      metrics.y + (layout.desktop ? 72 : 59),
      layout.desktop ? 10 : 8,
      COLORS.cyan,
      0,
      0.5,
      '600',
    ),
  );

  state.players.forEach((player, index) => {
    const column = index % metrics.columns;
    const row = Math.floor(index / metrics.columns);
    const cardX = metrics.contentX + column * (metrics.cardWidth + metrics.cardGap);
    const cardY = metrics.contentY + row * (metrics.cardHeight + metrics.cardGap);
    const card = new api.Graphics();
    card
      .roundRect(cardX, cardY, metrics.cardWidth, metrics.cardHeight, 10)
      .fill({ color: COLORS.board, alpha: 0.92 })
      .stroke({ width: 1, color: player.isHuman ? COLORS.gold : COLORS.panelLine });
    root.addChild(card);

    const winningTile = state.result?.type === 'ron' && state.result.winner === player.seat ? state.lastDiscard : null;
    const reviewHand = winningTile ? [...player.hand, winningTile] : player.hand;
    const score = state.matchScores[player.seat] ?? player.score;
    const tileHeight = Math.max(12, Math.min(layout.desktop ? 30 : 20, metrics.cardHeight * 0.19));
    const labelSize = layout.desktop ? 10 : 8;
    const titleSize = layout.desktop ? 14 : 11;
    root.addChild(
      createLabel(
        api,
        `${player.isHuman ? '你' : 'AI'} · ${player.name}`,
        cardX + 12,
        cardY + metrics.cardHeight * 0.15,
        titleSize,
        COLORS.white,
        0,
        0.5,
        '700',
      ),
    );
    root.addChild(
      createLabel(
        api,
        `${score.toLocaleString()} 点 · 牌河 ${player.discards.length}`,
        cardX + metrics.cardWidth - 12,
        cardY + metrics.cardHeight * 0.15,
        labelSize,
        COLORS.muted,
        1,
        0.5,
        '500',
      ),
    );
    root.addChild(
      createLabel(
        api,
        winningTile
          ? `手牌 ${player.hand.length} 张 · 和牌 ${compactTileLabel(winningTile)}`
          : `手牌 ${reviewHand.length} 张`,
        cardX + 12,
        cardY + metrics.cardHeight * 0.31,
        labelSize,
        COLORS.cyan,
        0,
        0.5,
        '600',
      ),
    );
    drawReviewTileStrip(
      api,
      root,
      reviewHand,
      cardX + 12,
      cardY + metrics.cardHeight * 0.36,
      metrics.cardWidth - 24,
      tileHeight,
      textures,
    );
    root.addChild(
      createLabel(
        api,
        `牌河 ${player.discards.length} 张`,
        cardX + 12,
        cardY + metrics.cardHeight * 0.62,
        labelSize,
        COLORS.cyan,
        0,
        0.5,
        '600',
      ),
    );
    drawReviewTileStrip(
      api,
      root,
      player.discards,
      cardX + 12,
      cardY + metrics.cardHeight * 0.68,
      metrics.cardWidth - 24,
      tileHeight,
      textures,
    );
  });

  getReviewActionButtons(layout, state).forEach((action) => {
    addButton(
      api,
      root,
      action.label,
      action.x,
      action.y,
      action.width,
      action.height,
      action.primary,
      !layout.desktop,
    );
  });
}

// 绘制结算层，避免结束状态下误触牌面并提供下一步操作
function drawRoundOverlay(api: PixiApi, root: Container, state: MahjongState, layout: LayoutMetrics): void {
  if ((state.phase !== 'round-over' && state.phase !== 'match-over') || !state.result) return;
  const { width, height, desktop } = layout;
  const metrics = getRoundOverlayMetrics(layout);
  const overlay = new api.Graphics();
  overlay.rect(0, 0, width, height).fill({ color: COLORS.background, alpha: 0.66 });
  root.addChild(overlay);
  const modal = new api.Graphics();
  modal
    .roundRect(metrics.modalX, metrics.modalY, metrics.modalWidth, metrics.modalHeight, 20)
    .fill(COLORS.panelRaised)
    .stroke({ width: 1, color: COLORS.gold });
  root.addChild(modal);
  const matchOver = state.phase === 'match-over';
  root.addChild(
    createLabel(
      api,
      matchOver ? '半庄完成' : '本局结算',
      width / 2,
      metrics.modalY + 36,
      desktop ? 22 : 18,
      COLORS.gold,
      0.5,
      0.5,
      '700',
    ),
  );
  root.addChild(
    createLabel(
      api,
      state.result.message,
      width / 2,
      metrics.modalY + 82,
      desktop ? 16 : 13,
      COLORS.white,
      0.5,
      0.5,
      '600',
    ),
  );
  root.addChild(
    createLabel(
      api,
      matchOver
        ? state.players
            .map((player) => `${player.name} ${(state.matchScores[player.seat] ?? player.score).toLocaleString()}`)
            .join('  ·  ')
        : state.result.yaku.length > 0
          ? state.result.yaku.join('  ·  ')
          : '流局 · 继续观察牌河',
      width / 2,
      metrics.modalY + 118,
      desktop ? 13 : 11,
      COLORS.muted,
      0.5,
      0.5,
      '500',
    ),
  );
  getRoundActionButtons(layout, state).forEach((action) => {
    addButton(api, root, action.label, action.x, action.y, action.width, action.height, action.primary, !desktop);
  });
}

// 计算单人模式横条的命中区域，视觉和交互共用同一组坐标
function getLobbyModeRegions(layout: LayoutMetrics): Array<{ x: number; y: number; width: number; height: number }> {
  const cardWidth = Math.min(layout.desktop ? 560 : 360, layout.width - 32);
  const cardHeight = layout.desktop ? 82 : 68;
  return [{ x: (layout.width - cardWidth) / 2, y: layout.height * 0.48, width: cardWidth, height: cardHeight }];
}

// 绘制单人模式横条入口，只保留名称与进入箭头
function drawLobbyCard(
  api: PixiApi,
  root: Container,
  rect: { x: number; y: number; width: number; height: number },
  title: string,
): void {
  const card = new api.Graphics();
  card
    .roundRect(rect.x, rect.y, rect.width, rect.height, 16)
    .fill({ color: COLORS.panel, alpha: 0.94 })
    .stroke({ width: 2, color: COLORS.gold });
  root.addChild(card);
  root.addChild(createLabel(api, title, rect.x + 26, rect.y + rect.height / 2, 20, COLORS.white, 0, 0.5, '700'));
  root.addChild(
    createLabel(api, '>', rect.x + rect.width - 28, rect.y + rect.height / 2, 26, COLORS.gold, 0.5, 0.5, '700'),
  );
}

// 绘制模式入口，所有文字和按钮都留在同一个 Pixi Canvas 内
function drawLobbyScene(api: PixiApi, root: Container, layout: LayoutMetrics, textures: TextureMap): void {
  drawAtmosphere(api, root, layout, 'lobby', textures);
  const { width, height, desktop } = layout;
  root.addChild(createLabel(api, '日本麻将', width / 2, height * 0.2, desktop ? 52 : 38, COLORS.ink, 0.5, 0.5, '700'));
  root.addChild(
    createLabel(
      api,
      '本地牌手训练',
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
    createLabel(api, '选择训练模式', width / 2, height * 0.36, desktop ? 19 : 15, COLORS.mutedDark, 0.5, 0.5, '500'),
  );
  const regions = getLobbyModeRegions(layout);
  drawLobbyCard(api, root, regions[0]!, '单人模式');
}

// 绘制当前 Canvas 屏幕，状态变化时重建轻量 Pixi 场景
function drawScene(
  api: PixiApi,
  app: Application,
  screen: MahjongScreen,
  utilityPanel: MahjongUtilityPanel,
  utilityScroll: number,
  state: MahjongState,
  reviewMode: boolean,
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
    drawLobbyScene(api, root, layout, textures);
    return;
  }
  drawAtmosphere(api, root, layout, 'table', textures);
  drawBoard(api, root, state, layout, textures, selectedTileId);
  if (reviewMode) {
    drawReviewOverlay(api, root, state, layout, textures);
    return;
  }
  drawHumanControls(api, root, state, selectedTileId, legalActions, layout, textures);
  drawTrainingPanel(api, root, state, layout);
  drawRoundOverlay(api, root, state, layout);
  if (utilityPanel !== 'none' && state.phase !== 'round-over' && state.phase !== 'match-over') {
    drawUtilityPanel(api, root, utilityPanel, layout, textures, utilityScroll);
  }
}

// 计算 Canvas 指针命中区域，确保模式入口与牌局动作共用坐标
function getCanvasHitRegions(
  screen: MahjongScreen,
  utilityPanel: MahjongUtilityPanel,
  state: MahjongState,
  reviewMode: boolean,
  selectedTileId: number | null,
  legalActions: readonly LegalAction[],
  layout: LayoutMetrics,
  handlers: SceneHandlers,
): HitRegion[] {
  if (screen === 'lobby') {
    const single = getLobbyModeRegions(layout)[0];
    return single ? [{ ...single, onClick: () => handlers.onChooseMode('single') }] : [];
  }
  if (reviewMode) {
    return getReviewActionButtons(layout, state).map((action) => ({
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height,
      onClick: () => {
        if (action.action === 'close') handlers.onCloseReview();
        if (action.action === 'next') handlers.onNextRound();
        if (action.action === 'restart') handlers.onRestart();
      },
    }));
  }
  if (utilityPanel !== 'none' && state.phase !== 'round-over' && state.phase !== 'match-over') {
    const metrics = getUtilityPanelMetrics(layout, utilityPanel);
    const closeWidth = layout.desktop ? 76 : 64;
    const closeHeight = layout.desktop ? 30 : 28;
    const regions: HitRegion[] = [
      {
        x: metrics.x + metrics.width - (layout.desktop ? 104 : 86),
        y: metrics.y + 18,
        width: closeWidth,
        height: closeHeight,
        onClick: () => handlers.onToggleUtilityPanel(utilityPanel),
      },
    ];
    if (utilityPanel === 'settings') {
      for (const action of getSettingsActionButtons(layout, metrics)) {
        regions.push({
          x: action.x,
          y: action.y,
          width: action.width,
          height: action.height,
          onClick: action.action === 'restart' ? handlers.onRestart : handlers.onBackToLobby,
        });
      }
    }
    return regions;
  }
  if ((state.phase === 'round-over' || state.phase === 'match-over') && state.result) {
    return getRoundActionButtons(layout, state).map((action) => ({
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height,
      onClick: () => {
        if (action.action === 'review') handlers.onOpenReview();
        if (action.action === 'next') handlers.onNextRound();
        if (action.action === 'restart') handlers.onRestart();
      },
    }));
  }
  const regions: HitRegion[] = [];
  const human = state.players[0];
  const { boardWidth, desktop, handY } = layout;
  if (state.phase === 'player-turn' && !human.riichi) {
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
  context.fillText('日本麻将', 24, 48);
  context.fillStyle = '#244b36';
  context.font = '500 16px Inter, sans-serif';
  context.fillText('渲染初始化失败，请检查浏览器硬件加速设置。', 24, 88);
}

// 创建单一 Pixi Canvas，并在路由离开时释放 WebGL 资源
export function PixiMahjongSurface({
  screen,
  utilityPanel,
  utilityScroll,
  state,
  reviewMode,
  selectedTileId,
  legalActions,
  onSelectTile,
  onAction,
  onRestart,
  onNextRound,
  onOpenReview,
  onCloseReview,
  onChooseMode,
  onBackToLobby,
  onToggleUtilityPanel,
  onScrollUtility,
}: PixiMahjongSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const apiRef = useRef<PixiApi | null>(null);
  const stateRef = useRef(state);
  const reviewModeRef = useRef(reviewMode);
  const selectedTileRef = useRef(selectedTileId);
  const legalActionsRef = useRef(legalActions);
  const screenRef = useRef(screen);
  const utilityPanelRef = useRef(utilityPanel);
  const utilityScrollRef = useRef(utilityScroll);
  const texturesRef = useRef<TextureMap>(new Map());
  const hitRegionsRef = useRef<readonly HitRegion[]>([]);
  const handlersRef = useRef<SceneHandlers>({
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onOpenReview,
    onCloseReview,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onScrollUtility,
  });

  // 同步最新的 React 状态，避免异步 Pixi 初始化读取旧牌局
  useEffect(() => {
    stateRef.current = state;
    reviewModeRef.current = reviewMode;
    selectedTileRef.current = selectedTileId;
    legalActionsRef.current = legalActions;
    screenRef.current = screen;
    utilityPanelRef.current = utilityPanel;
    utilityScrollRef.current = utilityScroll;
    handlersRef.current = {
      onSelectTile,
      onAction,
      onRestart,
      onNextRound,
      onOpenReview,
      onCloseReview,
      onChooseMode,
      onBackToLobby,
      onToggleUtilityPanel,
      onScrollUtility,
    };
  }, [
    screen,
    utilityPanel,
    utilityScroll,
    state,
    reviewMode,
    selectedTileId,
    legalActions,
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onOpenReview,
    onCloseReview,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onScrollUtility,
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
          utilityScrollRef.current,
          stateRef.current,
          reviewModeRef.current,
          selectedTileRef.current,
          legalActionsRef.current,
          texturesRef.current,
        );
        hitRegionsRef.current = getCanvasHitRegions(
          screenRef.current,
          utilityPanelRef.current,
          stateRef.current,
          reviewModeRef.current,
          selectedTileRef.current,
          legalActionsRef.current,
          getLayout(app.screen.width, app.screen.height),
          handlersRef.current,
        );

        let lastPointerDispatch = 0;
        let utilityPointerStartY: number | null = null;
        let utilityPointerDragged = false;
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
        // 记录图鉴拖拽起点，避免滚动时误触关闭或返回按钮
        const handlePointerDown = (event: PointerEvent) => {
          if (utilityPanelRef.current !== 'yaku') return;
          utilityPointerStartY = event.clientY;
          utilityPointerDragged = false;
        };
        // 拖拽胡牌图鉴时按指针位移更新滚动距离
        const handlePointerMove = (event: PointerEvent) => {
          if (utilityPanelRef.current !== 'yaku' || utilityPointerStartY === null) return;
          const delta = utilityPointerStartY - event.clientY;
          if (Math.abs(delta) < 1) return;
          utilityPointerStartY = event.clientY;
          utilityPointerDragged = true;
          event.preventDefault();
          handlersRef.current.onScrollUtility(
            delta,
            getUtilityScrollLimit(getLayout(app.screen.width, app.screen.height), 'yaku'),
          );
        };
        // 用指针抬起事件提供低延迟的鼠标和触摸反馈
        const handlePointerUp = (event: PointerEvent) => {
          if (utilityPointerStartY !== null) {
            const dragged = utilityPointerDragged;
            utilityPointerStartY = null;
            utilityPointerDragged = false;
            if (dragged) {
              event.preventDefault();
              return;
            }
          }
          event.preventDefault();
          lastPointerDispatch = performance.now();
          dispatchCanvasPoint(event.clientX, event.clientY);
        };
        // 允许鼠标滚轮和触控板在图鉴视口内连续浏览所有牌型
        const handleWheel = (event: WheelEvent) => {
          if (utilityPanelRef.current !== 'yaku') return;
          event.preventDefault();
          handlersRef.current.onScrollUtility(
            event.deltaY,
            getUtilityScrollLimit(getLayout(app.screen.width, app.screen.height), 'yaku'),
          );
        };
        // 某些浏览器只派发 click 时仍保持 Canvas 交互可用
        const handleClick = (event: MouseEvent) => {
          if (performance.now() - lastPointerDispatch < 400) return;
          dispatchCanvasPoint(event.clientX, event.clientY);
        };
        // 键盘输入保留图鉴滚动和单人牌局的 Escape 行为
        const handleKeyDown = (event: KeyboardEvent) => {
          if (reviewModeRef.current) {
            if (event.key === 'Escape') {
              event.preventDefault();
              handlersRef.current.onCloseReview();
            }
            return;
          }
          if (utilityPanelRef.current === 'yaku') {
            const pageStep = Math.max(160, window.innerHeight * 0.55);
            if (event.key === 'ArrowDown' || event.key === 'PageDown') {
              event.preventDefault();
              handlersRef.current.onScrollUtility(
                event.key === 'PageDown' ? pageStep : 64,
                getUtilityScrollLimit(getLayout(app.screen.width, app.screen.height), 'yaku'),
              );
              return;
            }
            if (event.key === 'ArrowUp' || event.key === 'PageUp') {
              event.preventDefault();
              handlersRef.current.onScrollUtility(
                event.key === 'PageUp' ? -pageStep : -64,
                getUtilityScrollLimit(getLayout(app.screen.width, app.screen.height), 'yaku'),
              );
              return;
            }
          }
          if (event.key === 'Escape' && utilityPanelRef.current !== 'none') {
            handlersRef.current.onToggleUtilityPanel(utilityPanelRef.current);
            return;
          }
          if (event.key === 'Escape' && selectedTileRef.current !== null) {
            handlersRef.current.onSelectTile(selectedTileRef.current);
          }
        };
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        removeCanvasListeners = () => {
          canvas.removeEventListener('pointerdown', handlePointerDown);
          canvas.removeEventListener('pointermove', handlePointerMove);
          canvas.removeEventListener('pointerup', handlePointerUp);
          canvas.removeEventListener('click', handleClick);
          canvas.removeEventListener('keydown', handleKeyDown);
          canvas.removeEventListener('wheel', handleWheel);
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
              utilityScrollRef.current,
              stateRef.current,
              reviewModeRef.current,
              selectedTileRef.current,
              legalActionsRef.current,
              texturesRef.current,
            );
            hitRegionsRef.current = getCanvasHitRegions(
              screenRef.current,
              utilityPanelRef.current,
              stateRef.current,
              reviewModeRef.current,
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
            utilityScrollRef.current,
            stateRef.current,
            reviewModeRef.current,
            selectedTileRef.current,
            legalActionsRef.current,
            texturesRef.current,
          );
          hitRegionsRef.current = getCanvasHitRegions(
            screenRef.current,
            utilityPanelRef.current,
            stateRef.current,
            reviewModeRef.current,
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
        utilityScroll,
        state,
        reviewMode,
        selectedTileId,
        legalActions,
        texturesRef.current,
      );
      hitRegionsRef.current = getCanvasHitRegions(
        screen,
        utilityPanel,
        state,
        reviewMode,
        selectedTileId,
        legalActions,
        getLayout(appRef.current.screen.width, appRef.current.screen.height),
        {
          onSelectTile,
          onAction,
          onRestart,
          onNextRound,
          onOpenReview,
          onCloseReview,
          onChooseMode,
          onBackToLobby,
          onToggleUtilityPanel,
          onScrollUtility,
        },
      );
    }
  }, [
    screen,
    utilityPanel,
    utilityScroll,
    state,
    reviewMode,
    selectedTileId,
    legalActions,
    onSelectTile,
    onAction,
    onRestart,
    onNextRound,
    onOpenReview,
    onCloseReview,
    onChooseMode,
    onBackToLobby,
    onToggleUtilityPanel,
    onScrollUtility,
  ]);

  return (
    <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} role="application" aria-label="日本麻将训练牌桌" />
  );
}
