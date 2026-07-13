'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, LogEntry } from '../types';
import { LogEntryComponent } from './LogEntry';
import styles from './GameLog.module.css';

interface GameLogProps {
  logs: LogEntry[];
  character: Character | null;
  nextCombatIn: number | null;
  onClearLogs?: () => void;
}

export function GameLog({ logs, character, nextCombatIn, onClearLogs }: GameLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [isAtBottom, setIsAtBottom] = useState(true);

  const toggleExpand = useCallback((timestamp: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) next.delete(timestamp);
      else next.add(timestamp);
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 60;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    setIsAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>战斗日志</h2>
        <div className={styles.headerActions}>
          {onClearLogs && (
            <button onClick={onClearLogs} className={styles.clearBtn}>
              清屏
            </button>
          )}
          <div className={styles.status}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>{character ? `${character.name} 运行中` : '本地运行'}</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className={styles.logContainer} onScroll={handleScroll}>
        {logs.length === 0 ? (
          <div className={styles.empty}>
            <p>等待战斗开始...</p>
            <p className={styles.hint}>角色进入游戏后会自动开始战斗。</p>
          </div>
        ) : (
          <>
            {logs.map((log, idx) => (
              <LogEntryComponent
                key={log.id ?? `${log.timestamp}-${idx}`}
                entry={log}
                expanded={expandedLogs.has(log.id ?? log.timestamp)}
                onToggleExpand={() => toggleExpand(log.id ?? log.timestamp)}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {!isAtBottom && (
        <button onClick={scrollToBottom} className={styles.scrollBtn}>
          查看最新
        </button>
      )}

      {nextCombatIn !== null && (
        <div className={styles.footer}>
          <span className={styles.timer}>下一场战斗：{nextCombatIn}s</span>
        </div>
      )}
    </div>
  );
}
