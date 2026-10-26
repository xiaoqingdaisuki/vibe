/** 时区工具：类型与数据契约 */

export interface WorldTimeZone {
  id: string;
  city: string;
  region: string;
  timeZone: string;
}

export interface TimeFormat {
  id: string;
  label: string;
  pattern: string;
}
