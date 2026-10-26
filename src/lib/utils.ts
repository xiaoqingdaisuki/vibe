/** 提供共享的 CSS 类名合并工具 */

// 合并 CSS 类名，自动过滤假值
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(' ');
}
