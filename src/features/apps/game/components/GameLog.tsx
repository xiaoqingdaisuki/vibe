'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, LogEntry } from '../types';
import { LogEntryComponent } from './LogEntry';
import styles from './GameLog.module.css';

interface GameLogProps {
  logs: LogEntry[];
  character: Character | null;
  combatCycleStartedAt: number | null;
  onClearLogs?: () => void;
}

export function GameLog({ logs, character, combatCycleStartedAt, onClearLogs }: GameLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (combatCycleStartedAt === null) return;

    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(interval);
  }, [combatCycleStartedAt]);

  const nextCombatIn =
    combatCycleStartedAt === null ? null : Math.max(0, Math.ceil((combatCycleStartedAt + 10_000 - now) / 1_000));

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

  const scrollToLatest = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Scrolling the container directly keeps page scroll position unchanged.
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToLatest();
    }
  }, [logs, isAtBottom, scrollToLatest]);

  const scrollToBottom = useCallback(() => {
    setIsAtBottom(true);
    scrollToLatest();
  }, [scrollToLatest]);

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
