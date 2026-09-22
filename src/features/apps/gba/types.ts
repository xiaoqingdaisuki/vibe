export type GbaPhase = 'empty' | 'loading' | 'running' | 'paused' | 'error';

export type GbaButton = 'a' | 'b' | 'select' | 'start' | 'right' | 'left' | 'up' | 'down' | 'r' | 'l';

export type GbaSpeed = 1 | 2 | 4 | 8;

export interface GbaCheat {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

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
