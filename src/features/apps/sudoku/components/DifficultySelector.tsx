import { cn } from '@/lib/utils';
import { SUDOKU_DIFFICULTIES } from '../engine';
import type { SudokuDifficultyId } from '../types';
import styles from '../styles/Sudoku.module.css';

interface DifficultySelectorProps {
  difficultyId: SudokuDifficultyId;
  onSelect: (difficultyId: SudokuDifficultyId) => void;
}

// 数独难度选择器，提供预设和自定义难度
export function DifficultySelector({ difficultyId, onSelect }: DifficultySelectorProps) {
  return (
    <section className={styles.difficultySection} aria-labelledby="sudoku-difficulty-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="sudoku-difficulty-title" className={styles.sectionTitle}>
            选择难度
          </h2>
          <p className={styles.sectionHint}>提示越少，留给推理的空间越大。</p>
        </div>
        <span className={styles.levelCount}>5 levels</span>
      </div>
      <div className={styles.difficultyGrid}>
        {SUDOKU_DIFFICULTIES.map((difficulty) => (
          <button
            key={difficulty.id}
            type="button"
            className={cn(styles.difficultyButton, difficulty.id === difficultyId && styles.difficultyButtonActive)}
            aria-pressed={difficulty.id === difficultyId}
            onClick={() => onSelect(difficulty.id)}
          >
            <span className={styles.difficultyLabel}>{difficulty.label}</span>
            <span className={styles.difficultyDescription}>{difficulty.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
