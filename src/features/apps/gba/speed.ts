import type { GbaSpeed } from './types';

export const GBA_SPEEDS = [1, 2, 4, 8] as const satisfies readonly GbaSpeed[];

// 返回工具栏下一档运行速率，循环经过 1x、2x、4x、8x
export function getNextGbaSpeed(current: GbaSpeed): GbaSpeed {
  const currentIndex = GBA_SPEEDS.indexOf(current);
  const nextIndex = (currentIndex + 1) % GBA_SPEEDS.length;
  return GBA_SPEEDS[nextIndex] ?? GBA_SPEEDS[0];
}
