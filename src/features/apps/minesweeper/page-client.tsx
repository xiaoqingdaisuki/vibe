'use client';

import { useEffect, useState } from 'react';
import {
  countFlags,
  createEmptyBoard,
  DEFAULT_CUSTOM_CONFIG,
  hasWon,
  revealAllMines,
  revealBoardAt,
  toggleFlag,
  validateCustomConfig,
} from './engine';
import { DifficultySelector } from './components/DifficultySelector';
import { GameDashboard } from './components/GameDashboard';
import { MineIcon } from './components/GameIcons';
import { MinesweeperCanvas } from './components/MinesweeperCanvas';
import type { BoardConfig, Cell, DifficultyId, GameStatus, InteractionMode } from './types';
import { DIFFICULTY_PRESETS } from './engine';
import styles from './styles/Minesweeper.module.css';

const STATUS_COPY: Record<GameStatus, string> = {
  ready: '点击任意方格开始',
  playing: '雷区已激活，保持专注',
  won: '扫雷完成，漂亮！',
  lost: '踩雷了，再试一次',
};

// 扫雷主页面客户端，管理游戏状态和棋盘交互
export default function Minesweeper() {
  const initialConfig = DIFFICULTY_PRESETS[0].config;
  const [config, setConfig] = useState<BoardConfig>(initialConfig);
  const [board, setBoard] = useState<Cell[]>(() => createEmptyBoard(initialConfig));
  const [difficulty, setDifficulty] = useState<DifficultyId>('beginner');
  const [status, setStatus] = useState<GameStatus>('ready');
  const [mode, setMode] = useState<InteractionMode>('reveal');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [customConfig, setCustomConfig] = useState<BoardConfig>(DEFAULT_CUSTOM_CONFIG);
  const [customError, setCustomError] = useState<string | null>(null);
  const [gameSequence, setGameSequence] = useState(0);

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  // 初始化或重置棋盘，准备新一局游戏
  const startBoard = (nextConfig: BoardConfig, nextDifficulty: DifficultyId) => {
    setConfig(nextConfig);
    setBoard(createEmptyBoard(nextConfig));
    setDifficulty(nextDifficulty);
    setStatus('ready');
    setElapsedSeconds(0);
    setMode('reveal');
    setGameSequence((current) => current + 1);
  };

  // 根据揭棋结果判断胜负并更新游戏状态
  const finishReveal = (nextBoard: Cell[], hitMine: boolean) => {
    if (hitMine) {
      setBoard(revealAllMines(nextBoard));
      setStatus('lost');
      return;
    }

    if (hasWon(nextBoard)) {
      setBoard(nextBoard);
      setStatus('won');
      return;
    }

    setBoard(nextBoard);
    setStatus('playing');
  };

  // 揭开指定位置的单元格，首次点击时触发布雷
  const revealAt = (index: number) => {
    if (status === 'won' || status === 'lost') return;

    const result = revealBoardAt(board, config, index, status === 'ready');
    if (!result.changed) return;
    finishReveal(result.board, result.hitMine);
  };

  // 对指定单元格执行插旗或取消插旗
  const flagAt = (index: number) => {
    if (status === 'won' || status === 'lost') return;
    setBoard(toggleFlag(board, index));
  };

  // 根据选中模式对单元格执行揭开或插旗
  const activateCell = (index: number, selectedMode: InteractionMode) => {
    if (selectedMode === 'flag') {
      flagAt(index);
    } else {
      revealAt(index);
    }
  };

  // 应用自定义棋盘参数并开始新游戏
  const applyCustomConfig = () => {
    const error = validateCustomConfig(customConfig);
    setCustomError(error);
    if (error) return;
    startBoard(customConfig, 'custom');
  };

  // 选择预设难度并开始新游戏
  const selectPreset = (presetConfig: BoardConfig, presetDifficulty: Exclude<DifficultyId, 'custom'>) => {
    setCustomError(null);
    startBoard(presetConfig, presetDifficulty);
  };

  const flagsRemaining = config.mines - countFlags(board);
  const statusText = STATUS_COPY[status];

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.logo}>
            <MineIcon />
          </span>
          <div>
            <p className={styles.eyebrow}>Game</p>
            <h1 className={styles.title}>扫雷</h1>
          </div>
        </div>
        <p className={styles.subtitle}>推理每一片安全区域，在最短时间内标记所有地雷。</p>
      </header>

      <DifficultySelector
        customConfig={customConfig}
        customError={customError}
        difficulty={difficulty}
        onApplyCustom={applyCustomConfig}
        onCustomConfigChange={setCustomConfig}
        onSelectPreset={selectPreset}
      />

      <section className={styles.gameSection} aria-labelledby="game-status">
        <GameDashboard
          elapsedSeconds={elapsedSeconds}
          flagsRemaining={flagsRemaining}
          onRestart={() => startBoard(config, difficulty)}
          status={status}
          statusText={statusText}
        />
        <MinesweeperCanvas
          key={gameSequence}
          board={board}
          config={config}
          mode={mode}
          onActivate={activateCell}
          onModeChange={setMode}
          statusText={statusText}
        />
      </section>
    </div>
  );
}
