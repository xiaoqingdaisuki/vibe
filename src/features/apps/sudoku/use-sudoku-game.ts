import { useEffect, useRef, useState } from 'react';
import { createSudokuGame, getDifficultyProgression, SUDOKU_DIFFICULTIES } from './engine';
import {
  createSudokuSession,
  enterDigitInSession,
  eraseSelectedInSession,
  getElapsedSeconds,
  selectCellInSession,
} from './game-state';
import type { SudokuSessionState } from './game-state';
import type { SudokuDifficultyId, SudokuDigit } from './types';

const DIGITS: SudokuDigit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// 创建初始数独会话，使用固定种子生成可复现的棋盘
function createInitialSession(): SudokuSessionState {
  let seed = 20260716;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return createSudokuSession(createSudokuGame('starter', random), 'starter');
}

type SudokuDifficulty = (typeof SUDOKU_DIFFICULTIES)[number];

interface UseSudokuGameResult {
  session: SudokuSessionState;
  elapsedSeconds: number;
  currentDifficulty: SudokuDifficulty;
  nextDifficulty: SudokuDifficulty | undefined;
  completedDigits: SudokuDigit[];
  startGame: (difficultyId: SudokuDifficultyId) => void;
  selectCell: (index: number) => void;
  enterDigit: (digit: number) => void;
  eraseSelected: () => void;
}

// 数独游戏逻辑 Hook，管理棋盘状态、计时和交互
export function useSudokuGame(): UseSudokuGameResult {
  const [session, setSession] = useState(createInitialSession);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (session.status !== 'playing') return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const updateElapsed = () => {
      const startedAt = startedAtRef.current;
      if (startedAt !== null) setElapsedSeconds(getElapsedSeconds(startedAt, Date.now()));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateElapsed();
    };
    const timer = window.setInterval(updateElapsed, 1_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session.status]);

  const startGame = (difficultyId: SudokuDifficultyId) => {
    const game = createSudokuGame(difficultyId);
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setSession(createSudokuSession(game, difficultyId));
  };

  const selectCell = (index: number) => {
    setSession((current) => selectCellInSession(current, index));
  };

  const enterDigit = (digit: number) => {
    const nextSession = enterDigitInSession(session, digit);
    if (nextSession === session) return;

    if (session.status === 'playing' && nextSession.status === 'won') {
      const completedAt = Date.now();
      const startedAt = startedAtRef.current ?? completedAt;
      setElapsedSeconds(getElapsedSeconds(startedAt, completedAt));
    }

    setSession(nextSession);
  };

  const eraseSelected = () => {
    setSession((current) => eraseSelectedInSession(current));
  };

  const { current: currentDifficulty, next: nextDifficulty } = getDifficultyProgression(session.difficultyId);
  const completedCounts = Array<number>(10).fill(0);
  session.values.forEach((value, index) => {
    if (value === session.game.solution[index]) completedCounts[value] += 1;
  });
  const completedDigits = DIGITS.filter((digit) => completedCounts[digit] === 9);

  return {
    session,
    elapsedSeconds,
    currentDifficulty,
    nextDifficulty,
    completedDigits,
    startGame,
    selectCell,
    enterDigit,
    eraseSelected,
  };
}
