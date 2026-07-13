'use client';

import type { LogEntry } from '../types';
import { RarityBadge } from './RarityBadge';
import styles from './LogEntry.module.css';

const DIFFICULTY_NAMES: Record<number, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
  4: '极难',
  5: '不可能',
};

interface LogEntryComponentProps {
  entry: LogEntry;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function LogEntryComponent({ entry, expanded, onToggleExpand }: LogEntryComponentProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const hasDetails = entry.details && entry.details.length > 0;

  return (
    <div className={`${styles.entry} ${styles[entry.type]}`}>
      <span className={styles.time}>{time}</span>
      <div className={styles.text}>
        {entry.rarity && <RarityBadge rarity={entry.rarity} />}
        {entry.difficulty && (
          <span className={`${styles.diffBadge} ${styles[`diff${entry.difficulty}`]}`}>
            {DIFFICULTY_NAMES[entry.difficulty] || '?'}
          </span>
        )}
        {entry.text.split('\n').map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
        {hasDetails && onToggleExpand && (
          <button onClick={onToggleExpand} className={styles.expandBtn}>
            {expanded ? '收起详情' : '查看详情'}
          </button>
        )}
        {expanded && hasDetails && (
          <div className={styles.details}>
            {entry.details!.map((detail) => (
              <div key={`${entry.timestamp}-${entry.id ?? 'x'}-${detail.round}`} className={styles.detailRow}>
                <span className={styles.detailRound}>第 {detail.round} 回合</span>
                <span>
                  你造成 <span className={styles.detailPlayerAtk}>{detail.playerDmg}</span>
                  {detail.isCritical && <span className={styles.detailCrit}> [暴击]</span>}
                  {detail.skillUsed && <span className={styles.detailSkill}> [{detail.skillUsed}]</span>}
                  {detail.isDodged ? (
                    <span className={styles.detailDodge}> | 闪避</span>
                  ) : (
                    <>
                      {' | 怪物造成 '}
                      <span className={styles.detailMonsterHp}>{detail.monsterDmg}</span>
                    </>
                  )}
                  {' | 怪物HP '}
                  <span className={styles.detailMonsterHp}>{detail.monsterHpAfter}</span>
                  {' | 你的HP '}
                  <span className={styles.detailPlayerHp}>{detail.playerHpAfter}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
