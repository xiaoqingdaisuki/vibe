export type GbaPhase = 'empty' | 'loading' | 'running' | 'paused' | 'error';

export type GbaButton = 'a' | 'b' | 'select' | 'start' | 'right' | 'left' | 'up' | 'down' | 'r' | 'l';

export interface GbaRom {
  name: string;
  bytes: Uint8Array;
  hash: string;
  size: number;
}

export interface GbaSaveRecord {
  romHash: string;
  data: ArrayBuffer;
  updatedAt: number;
  coreVersion: string;
}
