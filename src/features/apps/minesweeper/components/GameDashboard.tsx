import { cn } from '@/lib/utils';
import type { GameStatus } from '../types';
import { ClockIcon, FlagIcon, MineIcon, RestartIcon, TrophyIcon } from './GameIcons';
import styles from '../styles/Minesweeper.module.css';

interface GameDashboardProps {
  elapsedSeconds: number;
  flagsRemaining: number;
  onRestart: () => void;
  status: GameStatus;
  statusText: string;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function GameDashboard({ elapsedSeconds, flagsRemaining, onRestart, status, statusText }: GameDashboardProps) {
  const statusClassName = `gameState${status[0].toUpperCase()}${status.slice(1)}`;

  return (
    <div className={styles.dashboard}>
      <div className={styles.stat}>
        <FlagIcon className={styles.statIcon} />
        <div>
          <span className={styles.statLabel}>剩余标记</span>
          <strong className={styles.statValue}>{flagsRemaining}</strong>
        </div>
      </div>
      <div className={styles.stat}>
        <ClockIcon className={styles.statIcon} />
        <div>
          <span className={styles.statLabel}>用时</span>
          <strong className={styles.statValue}>{formatTime(elapsedSeconds)}</strong>
        </div>
      </div>
      <div className={cn(styles.gameState, styles[statusClassName])}>
        {status === 'won' ? <TrophyIcon className={styles.stateIcon} /> : <MineIcon className={styles.stateIcon} />}
        <span id="game-status">{statusText}</span>
      </div>
      <button type="button" className={styles.restartButton} onClick={onRestart}>
        <RestartIcon />
        <span>重新开始</span>
      </button>
    </div>
  );
}
