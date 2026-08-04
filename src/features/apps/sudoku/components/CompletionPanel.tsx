import { formatElapsedTime } from '../game-state';
import type { SudokuDifficultyId } from '../types';
import styles from '../styles/Sudoku.module.css';

interface CompletionPanelProps {
  difficultyLabel: string;
  elapsedSeconds: number;
  nextDifficulty: { id: SudokuDifficultyId; label: string } | undefined;
  onChallenge: (difficultyId: SudokuDifficultyId) => void;
  replayDifficultyId: SudokuDifficultyId;
}

// 通关面板，展示用时并支持挑战下一难度
export function CompletionPanel({
  difficultyLabel,
  elapsedSeconds,
  nextDifficulty,
  onChallenge,
  replayDifficultyId,
}: CompletionPanelProps) {
  return (
    <div className={styles.successPanel} role="status" aria-live="polite">
      <div>
        <p className={styles.successEyebrow}>Puzzle complete</p>
        <h2 className={styles.successTitle}>恭喜通关！</h2>
        <p className={styles.successCopy}>
          你用 {formatElapsedTime(elapsedSeconds)} 完成了{difficultyLabel}难度。
        </p>
      </div>
      <button
        type="button"
        className={styles.challengeButton}
        onClick={() => onChallenge(nextDifficulty?.id ?? replayDifficultyId)}
      >
        {nextDifficulty ? `挑战${nextDifficulty.label}难度` : '再来一局'}
      </button>
    </div>
  );
}
