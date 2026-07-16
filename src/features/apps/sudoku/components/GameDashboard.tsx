import { formatElapsedTime } from '../game-state';
import styles from '../styles/Sudoku.module.css';

interface GameDashboardProps {
  difficultyLabel: string;
  elapsedSeconds: number;
  mistakes: number;
  onRestart: () => void;
}

export function GameDashboard({ difficultyLabel, elapsedSeconds, mistakes, onRestart }: GameDashboardProps) {
  return (
    <div className={styles.dashboard}>
      <div className={styles.stat}>
        <span className={styles.statLabel}>难度</span>
        <strong className={styles.statValue}>{difficultyLabel}</strong>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>用时</span>
        <strong className={styles.statValue}>{formatElapsedTime(elapsedSeconds)}</strong>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>错误</span>
        <strong className={styles.statValue}>{mistakes}</strong>
      </div>
      <button type="button" className={styles.newGameButton} onClick={onRestart}>
        换一题
      </button>
    </div>
  );
}
