'use client';

import type { ClassType } from '../types';
import { CLASSES } from '../static-data';
import styles from './ClassSelect.module.css';

interface ClassSelectProps {
  selected: ClassType | null;
  onSelect: (classType: ClassType) => void;
}

// 职业选择卡片组，点击切换选中职业
export function ClassSelect({ selected, onSelect }: ClassSelectProps) {
  return (
    <div className={styles.grid}>
      {CLASSES.map((cls) => (
        <button
          key={cls.id}
          onClick={() => onSelect(cls.id)}
          className={`${styles.card} ${selected === cls.id ? styles.selected : ''}`}
          type="button"
        >
          <h3 className={styles.name}>{cls.name}</h3>
          <p className={styles.description}>{cls.description}</p>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>HP</span>
              <span className={styles.statValue}>{cls.baseHp}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>力量</span>
              <span className={styles.statValue}>{cls.baseStats.str}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>智力</span>
              <span className={styles.statValue}>{cls.baseStats.int}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>敏捷</span>
              <span className={styles.statValue}>{cls.baseStats.dex}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>体力</span>
              <span className={styles.statValue}>{cls.baseStats.vit}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>幸运</span>
              <span className={styles.statValue}>{cls.baseStats.luk}</span>
            </div>
          </div>
          {selected === cls.id && <div className={styles.checkmark}>✓</div>}
        </button>
      ))}
    </div>
  );
}
