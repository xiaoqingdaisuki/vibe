import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import type { TimeFormat, WorldTimeZone } from './types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('zh-cn');

// 读取浏览器报告的本地 IANA 时区标识
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// 按指定时区格式化世界时间卡片的时钟读数
export function formatWorldClock(time: Dayjs, timeZone: string): string {
  return time.tz(timeZone).format('HH:mm:ss');
}

// 按指定时区生成带 UTC 偏移的简短标签
export function formatUtcOffset(time: Dayjs, timeZone: string): string {
  return `UTC${time.tz(timeZone).format('Z')}`;
}

// 汇总世界时间卡片需要的显示数据
export function getWorldTimeValue(time: Dayjs, zone: WorldTimeZone) {
  return {
    clock: formatWorldClock(time, zone.timeZone),
    offset: formatUtcOffset(time, zone.timeZone),
  };
}

// 生成可复制的常用代码时间格式
export function formatCopyValue(time: Dayjs, format: TimeFormat): string {
  if (format.id === 'iso-utc') return time.utc().format(format.pattern);
  if (format.id === 'rfc-2822') return time.locale('en').utc().format(format.pattern);
  if (format.id === 'unix-seconds') return String(time.unix());
  if (format.id === 'unix-milliseconds') return String(time.valueOf());

  return time.format(format.pattern);
}
