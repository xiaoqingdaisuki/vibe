import { cn } from '@/lib/utils';
import { CUSTOM_LIMITS, DIFFICULTY_PRESETS } from '../engine';
import type { BoardConfig, DifficultyId } from '../types';
import { SlidersIcon } from './GameIcons';
import styles from '../styles/Minesweeper.module.css';

interface DifficultySelectorProps {
  customConfig: BoardConfig;
  customError: string | null;
  difficulty: DifficultyId;
  onApplyCustom: () => void;
  onCustomConfigChange: (config: BoardConfig) => void;
  onSelectPreset: (config: BoardConfig, difficulty: Exclude<DifficultyId, 'custom'>) => void;
}

// 难度选择器，提供预设和自定义棋盘参数
export function DifficultySelector({
  customConfig,
  customError,
  difficulty,
  onApplyCustom,
  onCustomConfigChange,
  onSelectPreset,
}: DifficultySelectorProps) {
  return (
    <section className={styles.difficultySection} aria-labelledby="difficulty-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="difficulty-title" className={styles.sectionTitle}>
            选择难度
          </h2>
          <p className={styles.sectionHint}>切换难度会立即开始一局新游戏</p>
        </div>
        <SlidersIcon className={styles.sectionIcon} />
      </div>
      <div className={styles.difficultyGrid}>
        {DIFFICULTY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={cn(styles.difficultyButton, difficulty === preset.id && styles.difficultyButtonActive)}
            aria-pressed={difficulty === preset.id}
            onClick={() => onSelectPreset(preset.config, preset.id)}
          >
            <span className={styles.difficultyLabel}>{preset.label}</span>
            <span className={styles.difficultyDescription}>{preset.description}</span>
          </button>
        ))}
        <button
          type="button"
          className={cn(styles.difficultyButton, difficulty === 'custom' && styles.difficultyButtonActive)}
          aria-pressed={difficulty === 'custom'}
          onClick={onApplyCustom}
        >
          <span className={styles.difficultyLabel}>自设</span>
          <span className={styles.difficultyDescription}>
            {customConfig.rows} × {customConfig.columns} · {customConfig.mines} 雷
          </span>
        </button>
      </div>

      {difficulty === 'custom' ? (
        <div className={styles.customPanel}>
          <div className={styles.customFields}>
            <label className={styles.field}>
              <span>行数</span>
              <input
                type="number"
                min={CUSTOM_LIMITS.rows.min}
                max={CUSTOM_LIMITS.rows.max}
                value={customConfig.rows}
                onChange={(event) => onCustomConfigChange({ ...customConfig, rows: Number(event.target.value) })}
              />
            </label>
            <label className={styles.field}>
              <span>列数</span>
              <input
                type="number"
                min={CUSTOM_LIMITS.columns.min}
                max={CUSTOM_LIMITS.columns.max}
                value={customConfig.columns}
                onChange={(event) => onCustomConfigChange({ ...customConfig, columns: Number(event.target.value) })}
              />
            </label>
            <label className={styles.field}>
              <span>雷数</span>
              <input
                type="number"
                min="1"
                max={Math.max(1, customConfig.rows * customConfig.columns - 9)}
                value={customConfig.mines}
                onChange={(event) => onCustomConfigChange({ ...customConfig, mines: Number(event.target.value) })}
              />
            </label>
            <button type="button" className={styles.applyButton} onClick={onApplyCustom}>
              应用设置
            </button>
          </div>
          {customError ? (
            <p className={styles.customError} role="alert">
              {customError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
