import type { SudokuDigit, SudokuStatus } from '../types';
import styles from '../styles/Sudoku.module.css';

const DIGITS: SudokuDigit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface NumberPanelProps {
  completedDigits: SudokuDigit[];
  selectedIndex: number;
  status: SudokuStatus;
  onDigit: (digit: number) => void;
  onErase: () => void;
}

export function NumberPanel({ completedDigits, selectedIndex, status, onDigit, onErase }: NumberPanelProps) {
  return (
    <aside className={styles.numberPanel} aria-label="数字选择">
      <div className={styles.numberPanelHeading}>
        <div>
          <h2 className={styles.numberPanelTitle}>填入数字</h2>
          <p className={styles.numberPanelHint}>紫色为你的答案，红色表示需要修正。</p>
        </div>
        <span className={styles.selectedPosition}>
          R{Math.floor(selectedIndex / 9) + 1} · C{(selectedIndex % 9) + 1}
        </span>
      </div>
      <div className={styles.numberGrid}>
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={styles.numberButton}
            disabled={status === 'won' || completedDigits.includes(digit)}
            onClick={() => onDigit(digit)}
            aria-label={`填入数字 ${digit}`}
          >
            {digit}
          </button>
        ))}
      </div>
      <button type="button" className={styles.eraseButton} onClick={onErase} disabled={status === 'won'}>
        清除当前格
      </button>
    </aside>
  );
}
