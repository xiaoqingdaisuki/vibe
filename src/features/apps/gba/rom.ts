import type { GbaRom } from './types';

export const GBA_ROM_MAX_SIZE = 32 * 1024 * 1024;

export interface RomReadProgress {
  loaded: number;
  total: number;
}

// 复制字节到独立 ArrayBuffer，避免 SharedArrayBuffer 类型传入浏览器 API
export function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

// 判断文件名是否使用 GBA ROM 扩展名
export function isGbaFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.gba');
}

// 把文件名转换为适合在模拟器虚拟文件系统中使用的名称
export function getRomFileName(fileName: string, hash: string): string {
  const baseName = fileName
    .replace(/\.gba$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  const safeBaseName = baseName || 'game';
  return `${safeBaseName}-${hash.slice(0, 16)}.gba`;
}

// 使用 SHA-256 生成 ROM 身份，确保不同 ROM 的存档互不覆盖
export async function hashRom(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前浏览器不支持安全的 ROM 校验，请使用 HTTPS 或现代浏览器。');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyBytesToArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 读取并校验本地 GBA 文件，同时报告读取进度
export async function readGbaRom(file: File, onProgress?: (progress: RomReadProgress) => void): Promise<GbaRom> {
  if (!isGbaFile(file)) {
    throw new Error('请选择 .gba 格式的 Game Boy Advance ROM。');
  }

  if (file.size <= 0) {
    throw new Error('ROM 文件为空，无法启动模拟器。');
  }

  if (file.size > GBA_ROM_MAX_SIZE) {
    throw new Error('ROM 文件超过 32 MB，暂不支持该文件。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.({ loaded: bytes.byteLength, total: file.size });
  const hash = await hashRom(bytes);

  return {
    name: file.name,
    bytes,
    hash,
    size: bytes.byteLength,
  };
}

// 格式化 ROM 大小，供状态栏显示
export function formatRomSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
