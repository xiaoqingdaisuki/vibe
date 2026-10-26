/** 放置角色游戏：战斗日志与倒计时组件 */

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

// 战斗日志面板，显示实时战斗信息和倒计时
export function GameLog({ logs, character, combatCycleStartedAt, onClearLogs }: GameLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // 战斗周期开始后每秒刷新当前时间，并在周期结束时清理计时器
  useEffect(() => {
    if (combatCycleStartedAt === null) return;

    // 更新当前时间以刷新战斗倒计时
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(interval);
  }, [combatCycleStartedAt]);

  const nextCombatIn =
    combatCycleStartedAt === null ? null : Math.max(0, Math.ceil((combatCycleStartedAt + 10_000 - now) / 1_000));

  // 切换日志条目的展开/收起状态
  const toggleExpand = useCallback((timestamp: number) => {
    setExpandedLogs(
      // 切换指定日志的展开状态并保留其他展开项
      (prev) => {
        const next = new Set(prev);
        if (next.has(timestamp)) next.delete(timestamp);
        else next.add(timestamp);
        return next;
      },
    );
  }, []);

  // 检测滚动位置，判断是否在底部
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 60;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  // 自动滚动日志容器到最新内容
  const scrollToLatest = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // 直接滚动日志容器，保持页面滚动位置不变
    el.scrollTop = el.scrollHeight;
  }, []);

  // 日志更新时仅在用户处于底部时跟随最新记录
  useEffect(() => {
    if (isAtBottom) {
      scrollToLatest();
    }
  }, [logs, isAtBottom, scrollToLatest]);

  // 手动滚动日志到底部并标记在底部状态
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
