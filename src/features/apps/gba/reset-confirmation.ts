export const RESET_CONFIRMATION_MESSAGES = [
  '确定要重置当前 ROM 吗？游戏会立即重新启动，尚未保存的运行进度可能会丢失。',
  '请再次确认：重置当前运行状态后无法撤销。已保存到 IndexedDB 的电池存档不会被删除，继续重置吗？',
] as const;

type ConfirmReset = (message: string) => boolean;

// 连续执行两次重置确认，任一步取消都会终止高危操作
export function confirmGbaReset(confirm: ConfirmReset): boolean {
  for (const message of RESET_CONFIRMATION_MESSAGES) {
    if (!confirm(message)) return false;
  }
  return true;
}
