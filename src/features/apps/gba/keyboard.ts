import type { GbaButton } from './types';

export const GBA_KEY_BINDINGS: Readonly<Record<string, GbaButton>> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  Enter: 'start',
  KeyA: 'l',
  KeyS: 'r',
  KeyX: 'a',
  KeyZ: 'b',
  ShiftLeft: 'select',
};
