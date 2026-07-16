import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getSudokuKeyboardCommand } from '../game-state';
import styles from '../styles/Sudoku.module.css';

const GRID_SIZE = 9;
const CELL_SIZE = 60;
const BOARD_SIZE = GRID_SIZE * CELL_SIZE;

interface CanvasColors {
  background: string;
  foreground: string;
  secondary: string;
  muted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentWash: string;
  accentFaint: string;
  error: string;
}

interface SudokuCanvasProps {
  puzzle: number[];
  values: number[];
  solution: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDigit: (digit: number) => void;
  onErase: () => void;
}

function readCanvasColors(): CanvasColors {
  const computed = getComputedStyle(document.documentElement);
  const read = (name: string) => computed.getPropertyValue(name).trim();

  return {
    background: read('--color-background'),
    foreground: read('--color-foreground'),
    secondary: read('--color-foreground-secondary'),
    muted: read('--color-foreground-muted'),
    border: read('--color-border'),
    borderStrong: read('--color-border-strong'),
    accent: read('--color-accent'),
    accentWash: read('--color-accent-wash'),
    accentFaint: read('--color-accent-faint'),
    error: read('--color-error'),
  };
}

function isRelatedCell(firstIndex: number, secondIndex: number): boolean {
  const firstRow = Math.floor(firstIndex / GRID_SIZE);
  const firstColumn = firstIndex % GRID_SIZE;
  const secondRow = Math.floor(secondIndex / GRID_SIZE);
  const secondColumn = secondIndex % GRID_SIZE;
  const sameBox =
    Math.floor(firstRow / 3) === Math.floor(secondRow / 3) &&
    Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3);

  return firstRow === secondRow || firstColumn === secondColumn || sameBox;
}

interface DrawBoardOptions {
  canvas: HTMLCanvasElement;
  puzzle: number[];
  values: number[];
  solution: number[];
  selectedIndex: number;
  hasFocus: boolean;
  colors: CanvasColors;
}

function drawBoard({ canvas, puzzle, values, solution, selectedIndex, hasFocus, colors }: DrawBoardOptions) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const renderSize = BOARD_SIZE * pixelRatio;
  if (canvas.width !== renderSize || canvas.height !== renderSize) {
    canvas.width = renderSize;
    canvas.height = renderSize;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  const selectedValue = values[selectedIndex];

  values.forEach((value, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const x = column * CELL_SIZE;
    const y = row * CELL_SIZE;

    if (index === selectedIndex) {
      context.fillStyle = colors.accentWash;
      context.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    } else if (selectedValue !== 0 && value === selectedValue) {
      context.fillStyle = colors.accentWash;
      context.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    } else if (isRelatedCell(index, selectedIndex)) {
      context.fillStyle = colors.accentFaint;
      context.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }

    if (value === 0) return;

    const isGiven = puzzle[index] !== 0;
    const isIncorrect = !isGiven && value !== solution[index];
    context.fillStyle = isIncorrect ? colors.error : isGiven ? colors.foreground : colors.accent;
    context.font = `${isGiven ? 700 : 600} 28px Inter, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(value), x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
  });

  for (let line = 0; line <= GRID_SIZE; line += 1) {
    const position = line * CELL_SIZE;
    const isBoxLine = line % 3 === 0;
    context.beginPath();
    context.strokeStyle = isBoxLine ? colors.secondary : colors.border;
    context.lineWidth = isBoxLine ? 2 : 1;
    context.moveTo(position, 0);
    context.lineTo(position, BOARD_SIZE);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(BOARD_SIZE, position);
    context.stroke();
  }

  if (hasFocus) {
    const row = Math.floor(selectedIndex / GRID_SIZE);
    const column = selectedIndex % GRID_SIZE;
    context.strokeStyle = colors.accent;
    context.lineWidth = 3;
    context.strokeRect(column * CELL_SIZE + 3, row * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6);
  }
}

function getCellIndex(canvas: HTMLCanvasElement, clientX: number, clientY: number): number | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return null;

  const column = Math.floor(((clientX - bounds.left) / bounds.width) * GRID_SIZE);
  const row = Math.floor(((clientY - bounds.top) / bounds.height) * GRID_SIZE);
  if (row < 0 || row >= GRID_SIZE || column < 0 || column >= GRID_SIZE) return null;
  return row * GRID_SIZE + column;
}

function describeCell(puzzle: number[], values: number[], selectedIndex: number): string {
  const row = Math.floor(selectedIndex / GRID_SIZE) + 1;
  const column = (selectedIndex % GRID_SIZE) + 1;
  const value = values[selectedIndex];
  const kind = puzzle[selectedIndex] === 0 ? '可填写格' : '题目数字';
  return `第 ${row} 行第 ${column} 列，${kind}，${value === 0 ? '空白' : `数字 ${value}`}。`;
}

export function SudokuCanvas({
  puzzle,
  values,
  solution,
  selectedIndex,
  onSelect,
  onDigit,
  onErase,
}: SudokuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const drawLatestBoard = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawBoard({ canvas, puzzle, values, solution, selectedIndex, hasFocus, colors: readCanvasColors() });
  });

  useEffect(() => {
    drawLatestBoard();
  }, [puzzle, values, solution, selectedIndex, hasFocus]);

  useEffect(() => {
    const observer = new MutationObserver(drawLatestBoard);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const index = getCellIndex(event.currentTarget, event.clientX, event.clientY);
    if (index !== null) onSelect(index);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const command = getSudokuKeyboardCommand(event.key, selectedIndex);
    if (!command) return;

    event.preventDefault();
    if (command.type === 'select') onSelect(command.index);
    if (command.type === 'digit') onDigit(command.digit);
    if (command.type === 'erase') onErase();
  };

  const description = describeCell(puzzle, values, selectedIndex);

  return (
    <>
      <div className={styles.boardFrame}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onFocus={() => setHasFocus(true)}
          onBlur={() => setHasFocus(false)}
          tabIndex={0}
          role="application"
          aria-label={`九宫格数独棋盘。${description}`}
          aria-describedby="sudoku-instructions"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight 1 2 3 4 5 6 7 8 9 Backspace Delete"
        />
      </div>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {description}
      </p>
    </>
  );
}
