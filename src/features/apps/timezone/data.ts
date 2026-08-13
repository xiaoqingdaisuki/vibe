import type { TimeFormat, WorldTimeZone } from './types';

export const WORLD_TIME_ZONES: readonly WorldTimeZone[] = [
  { id: 'shanghai', city: '上海', region: '中国', timeZone: 'Asia/Shanghai' },
  { id: 'tokyo', city: '东京', region: '日本', timeZone: 'Asia/Tokyo' },
  { id: 'singapore', city: '新加坡', region: '新加坡', timeZone: 'Asia/Singapore' },
  { id: 'dubai', city: '迪拜', region: '阿联酋', timeZone: 'Asia/Dubai' },
  { id: 'london', city: '伦敦', region: '英国', timeZone: 'Europe/London' },
  { id: 'paris', city: '巴黎', region: '法国', timeZone: 'Europe/Paris' },
  { id: 'new-york', city: '纽约', region: '美国东部', timeZone: 'America/New_York' },
  { id: 'los-angeles', city: '洛杉矶', region: '美国西部', timeZone: 'America/Los_Angeles' },
  { id: 'sydney', city: '悉尼', region: '澳大利亚', timeZone: 'Australia/Sydney' },
];

export const TIME_FORMATS: readonly TimeFormat[] = [
  { id: 'iso-local', label: 'ISO 8601（本地时区）', pattern: 'YYYY-MM-DDTHH:mm:ssZ' },
  { id: 'iso-utc', label: 'ISO 8601（UTC）', pattern: 'YYYY-MM-DDTHH:mm:ss[Z]' },
  { id: 'database', label: '数据库 DATETIME', pattern: 'YYYY-MM-DD HH:mm:ss' },
  { id: 'slash', label: '常用斜线格式', pattern: 'YYYY/MM/DD HH:mm:ss' },
  { id: 'date', label: '仅日期', pattern: 'YYYY-MM-DD' },
  { id: 'rfc-2822', label: 'RFC 2822', pattern: 'ddd, DD MMM YYYY HH:mm:ss [GMT]' },
  { id: 'unix-seconds', label: 'Unix 时间戳（秒）', pattern: 'X' },
  { id: 'unix-milliseconds', label: 'Unix 时间戳（毫秒）', pattern: 'x' },
];
