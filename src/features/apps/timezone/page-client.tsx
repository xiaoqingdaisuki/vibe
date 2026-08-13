'use client';

import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { TIME_FORMATS, WORLD_TIME_ZONES } from './data';
import { formatCopyValue, formatUtcOffset, getLocalTimeZone, getWorldTimeValue } from './timezone-utils';
import styles from './styles/Timezone.module.css';

type CopyStatus = { id: string; message: string } | null;

// 复制按钮图标，保持各处操作符号一致
function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </svg>
  );
}

interface CopyButtonProps {
  id: string;
  value: string;
  copied: boolean;
  disabled: boolean;
  onCopy: (id: string, value: string) => void;
}

// 渲染单个时间格式的复制操作
function CopyButton({ id, value, copied, disabled, onCopy }: CopyButtonProps) {
  return (
    <button className={styles.copyButton} type="button" disabled={disabled} onClick={() => onCopy(id, value)}>
      <CopyIcon />
      <span>{copied ? '已复制' : '复制'}</span>
    </button>
  );
}

// 复制文本到系统剪贴板并返回操作结果
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

// 时间工具主界面，展示本机时钟、世界时间与复制格式
export function TimezoneTool() {
  const [currentTime, setCurrentTime] = useState<Dayjs | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const [localTimeZone, setLocalTimeZone] = useState('');
  const resetCopyStatusTimer = useRef<number | null>(null);

  // 每秒同步浏览器时间，避免服务端与客户端初始时间不一致
  useEffect(() => {
    const updateTime = () => setCurrentTime(dayjs());
    const animationFrameId = window.requestAnimationFrame(() => {
      updateTime();
      setLocalTimeZone(getLocalTimeZone());
    });

    const intervalId = window.setInterval(updateTime, 1000);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(intervalId);
      if (resetCopyStatusTimer.current) window.clearTimeout(resetCopyStatusTimer.current);
    };
  }, []);

  // 处理格式复制并在短暂提示后恢复按钮状态
  async function handleCopy(id: string, value: string): Promise<void> {
    const copied = await copyToClipboard(value);
    setCopyStatus({ id, message: copied ? '时间格式已复制到剪贴板。' : '复制失败，请检查浏览器剪贴板权限。' });

    if (copied) {
      if (resetCopyStatusTimer.current) window.clearTimeout(resetCopyStatusTimer.current);
      resetCopyStatusTimer.current = window.setTimeout(() => setCopyStatus(null), 1800);
    }
  }

  const localClock = currentTime ? currentTime.format('HH:mm:ss') : '--:--:--';
  const localDate = currentTime ? currentTime.format('YYYY 年 MM 月 DD 日 dddd') : '正在同步时间…';
  const localOffset = currentTime && localTimeZone ? formatUtcOffset(currentTime, localTimeZone) : 'UTC--:--';

  return (
    <section className={styles.tool} aria-labelledby="timezone-tool-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Browser time</p>
          <h1 id="timezone-tool-title" className={styles.title}>
            时区工具
          </h1>
          <p className={styles.intro}>以当前设备时区为基准，快速查看全球时间并复制常用格式。</p>
        </div>
        <p className={styles.zonePill} translate="no">
          {localTimeZone || '正在识别时区…'}
        </p>
      </header>

      <section className={styles.localClock} aria-labelledby="local-time-heading">
        <div className={styles.localMeta}>
          <p id="local-time-heading" className={styles.sectionLabel}>
            你的本地时间
          </p>
          <p className={styles.localDate}>{localDate}</p>
        </div>
        <div className={styles.localReadout}>
          <time className={styles.localTime} dateTime={currentTime?.toISOString()}>
            {localClock}
          </time>
          <span className={styles.localOffset}>{localOffset}</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="world-times-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>UTC 世界时间</p>
            <h2 id="world-times-heading" className={styles.sectionTitle}>
              主流时区
            </h2>
          </div>
          <p className={styles.sectionHint}>夏令时偏移会自动更新</p>
        </div>
        <div className={styles.worldGrid}>
          {WORLD_TIME_ZONES.map((zone) => {
            const value = currentTime
              ? getWorldTimeValue(currentTime, zone)
              : { clock: '--:--:--', offset: 'UTC--:--' };

            return (
              <article key={zone.id} className={styles.worldCard}>
                <div>
                  <h3 className={styles.city}>{zone.city}</h3>
                  <p className={styles.region}>{zone.region}</p>
                </div>
                <div className={styles.worldReadout}>
                  <time className={styles.worldTime}>{value.clock}</time>
                  <span className={styles.worldOffset}>{value.offset}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="copy-formats-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="copy-formats-heading" className={styles.sectionTitle}>
              常用时间格式
            </h2>
          </div>
          <p className={styles.sectionHint}>点击即可复制当前格式</p>
        </div>
        <div className={styles.formatGrid}>
          {TIME_FORMATS.map((format) => {
            const value = currentTime ? formatCopyValue(currentTime, format) : '正在同步时间…';
            const copied = copyStatus?.id === format.id && copyStatus.message.startsWith('时间格式');

            return (
              <article key={format.id} className={styles.formatCard}>
                <div className={styles.formatHeading}>
                  <h3>{format.label}</h3>
                  <code>{format.pattern}</code>
                </div>
                <output className={styles.formatValue} translate="no">
                  {value}
                </output>
                <CopyButton id={format.id} value={value} copied={copied} disabled={!currentTime} onCopy={handleCopy} />
              </article>
            );
          })}
        </div>
      </section>
      <p className={styles.copyAnnouncement} aria-live="polite">
        {copyStatus?.message ?? ''}
      </p>
    </section>
  );
}

export default TimezoneTool;
