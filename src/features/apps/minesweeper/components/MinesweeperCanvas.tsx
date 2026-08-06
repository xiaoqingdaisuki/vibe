import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { loadBoardAssets } from '../board-assets';
import type { BoardAssets } from '../board-assets';
import type { BoardConfig, Cell, InteractionMode } from '../types';
import { FlagIcon, RevealIcon } from './GameIcons';
import styles from '../styles/Minesweeper.module.css';

const RENDER_CELL_SIZE = 64;

interface CanvasColors {
  background: string;
  foreground: string;
  secondary: string;
  border: string;
  accent: string;
  accentWash: string;
}

interface MinesweeperCanvasProps {
  board: Cell[];
  config: BoardConfig;
  mode: InteractionMode;
  onActivate: (index: number, mode: InteractionMode) => void;
  onModeChange: (mode: InteractionMode) => void;
  statusText: string;
}

// 从 CSS 变量读取画布当前主题颜色
function readCanvasColors(): CanvasColors {
  const computed = getComputedStyle(document.documentElement);
  const read = (name: string) => computed.getPropertyValue(name).trim();

  return {
    background: read('--color-background'),
    foreground: read('--color-foreground'),
    secondary: read('--color-foreground-secondary'),
    border: read('--color-border'),
    accent: read('--color-accent'),
    accentWash: read('--color-accent-wash'),
  };
}

// 在画布上绘制整个棋盘，包括隐藏格、旗帜、数字和聚焦高亮
function drawBoard(
  canvas: HTMLCanvasElement,
  board: Cell[],
  config: BoardConfig,
  focusedIndex: number,
  hasCanvasFocus: boolean,
  colors: CanvasColors,
  assets: BoardAssets,
) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const cellSize = RENDER_CELL_SIZE;
  const inset = 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = colors.border;
  context.fillRect(0, 0, canvas.width, canvas.height);

  board.forEach((cell, index) => {
    const row = Math.floor(index / config.columns);
    const column = index % config.columns;
    const x = column * cellSize;
    const y = row * cellSize;
    const centerX = x + cellSize / 2;
    const centerY = y + cellSize / 2;

    context.fillStyle = cell.state === 'hidden' || cell.state === 'flagged' ? colors.accentWash : colors.background;
    context.fillRect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);

    if (cell.state === 'flagged') {
      context.drawImage(assets.flag, x, y, cellSize, cellSize);
    } else if (cell.state === 'revealed' && cell.mine) {
      context.drawImage(cell.detonated ? assets.detonatedMine : assets.mine, x, y, cellSize, cellSize);
    } else if (cell.state === 'revealed' && cell.adjacentMines > 0) {
      context.fillStyle = cell.adjacentMines <= 2 ? colors.secondary : colors.foreground;
      context.font = `700 ${Math.round(cellSize * 0.42)}px Inter, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(cell.adjacentMines), centerX, centerY + 1);
    }

    if (hasCanvasFocus && index === focusedIndex) {
      context.strokeStyle = colors.accent;
      context.lineWidth = 4;
      context.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
    }
  });
}

// 根据指针在画布上的坐标计算对应单元格索引
function getCellIndexFromPointer(canvas: HTMLCanvasElement, config: BoardConfig, clientX: number, clientY: number) {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return null;

  const column = Math.floor(((clientX - bounds.left) / bounds.width) * config.columns);
  const row = Math.floor(((clientY - bounds.top) / bounds.height) * config.rows);
  if (row < 0 || row >= config.rows || column < 0 || column >= config.columns) return null;
  return row * config.columns + column;
}

// 生成当前聚焦单元格的无障碍描述文本
function describeFocusedCell(board: Cell[], config: BoardConfig, focusedIndex: number): string {
  const cell = board[focusedIndex];
  const row = Math.floor(focusedIndex / config.columns) + 1;
  const column = (focusedIndex % config.columns) + 1;
  const position = `当前第 ${row} 行第 ${column} 列`;

  if (!cell || cell.state === 'hidden') return `${position}，未揭开。`;
  if (cell.state === 'flagged') return `${position}，已插旗。`;
  if (cell.mine) return `${position}，地雷。`;
  if (cell.adjacentMines === 0) return `${position}，已揭开，周围没有地雷。`;
  return `${position}，已揭开，周围有 ${cell.adjacentMines} 颗地雷。`;
}

// 扫雷画布组件，渲染棋盘并处理键盘/鼠标交互
export function MinesweeperCanvas({
  board,
  config,
  mode,
  onActivate,
  onModeChange,
  statusText,
}: MinesweeperCanvasProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hasCanvasFocus, setHasCanvasFocus] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRequestRef = useRef(0);

  // 重新绘制棋盘，忽略过期的绘制请求
  const renderLatestBoard = useEffectEvent(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const requestId = drawRequestRef.current + 1;
    drawRequestRef.current = requestId;
    const colors = readCanvasColors();
    const assets = await loadBoardAssets(colors);

    if (drawRequestRef.current !== requestId || canvasRef.current !== canvas) return;
    drawBoard(canvas, board, config, focusedIndex, hasCanvasFocus, colors, assets);
  });


  useEffect(() => {
    void renderLatestBoard();
  }, [board, config, focusedIndex, hasCanvasFocus]);

  useEffect(() => {
    const redraw = () => void renderLatestBoard();
    const observer = new MutationObserver(redraw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // 激活指定单元格，根据模式执行揭开或插旗
  const activateCell = (index: number, selectedMode: InteractionMode = mode) => {
    setFocusedIndex(index);
    onActivate(index, selectedMode);
  };

  // 处理画布鼠标点击事件
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const index = getCellIndexFromPointer(event.currentTarget, config, event.clientX, event.clientY);
    if (index !== null) activateCell(index);
  };

  // 阻止右键菜单并切换到插旗模式
  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const index = getCellIndexFromPointer(event.currentTarget, config, event.clientX, event.clientY);
    if (index !== null) activateCell(index, 'flag');
  };

  // 处理键盘事件，实现方向键移动和快捷操作
  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const row = Math.floor(focusedIndex / config.columns);
    const column = focusedIndex % config.columns;
    const movement: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const direction = movement[event.key];

    if (direction) {
      event.preventDefault();
      const nextRow = Math.min(config.rows - 1, Math.max(0, row + direction[0]));
      const nextColumn = Math.min(config.columns - 1, Math.max(0, column + direction[1]));
      setFocusedIndex(nextRow * config.columns + nextColumn);
      return;
    }

    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      activateCell(focusedIndex, 'flag');
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateCell(focusedIndex);
    }
  };

  const boardSizeClass =
    config.columns <= 9 ? styles.boardCompact : config.columns <= 16 ? styles.boardMedium : styles.boardWide;
  const focusedCellDescription = describeFocusedCell(board, config, focusedIndex);

  return (
    <>
      <div className={styles.modeBar} aria-label="方格操作方式">
        <span className={styles.modeLabel}>操作方式</span>
        <div className={styles.modeSwitch}>
          <button
            type="button"
            className={cn(styles.modeButton, mode === 'reveal' && styles.modeButtonActive)}
            aria-pressed={mode === 'reveal'}
            onClick={() => onModeChange('reveal')}
          >
            <RevealIcon />
            挖掘
          </button>
          <button
            type="button"
            className={cn(styles.modeButton, mode === 'flag' && styles.modeButtonActive)}
            aria-pressed={mode === 'flag'}
            onClick={() => onModeChange('flag')}
          >
            <FlagIcon />
            插旗
          </button>
        </div>
        <span className={styles.desktopHint}>桌面端可以右键插旗</span>
      </div>

      <div className={styles.boardScroller}>
        <div className={cn(styles.boardFrame, boardSizeClass)}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={config.columns * RENDER_CELL_SIZE}
            height={config.rows * RENDER_CELL_SIZE}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            onFocus={() => setHasCanvasFocus(true)}
            onBlur={() => setHasCanvasFocus(false)}
            tabIndex={0}
            role="application"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space F"
            aria-label={`${config.rows} 行 ${config.columns} 列的扫雷棋盘。${statusText} ${focusedCellDescription}`}
            aria-describedby="minesweeper-instructions"
          />
        </div>
      </div>
      <p id="minesweeper-instructions" className={styles.instructions}>
        点击挖掘；右键或切换到插旗模式来标记。键盘可用方向键移动，空格操作，F 键插旗。
      </p>
      <p className={styles.liveStatus} aria-live="polite" aria-atomic="true">
        {statusText} {focusedCellDescription}
      </p>
    </>
  );
}
