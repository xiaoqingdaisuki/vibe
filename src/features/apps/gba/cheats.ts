import type { GbaCheat } from './types';

// 规范化多行金手指代码，保留每一行供 mGBA 解析
export function normalizeGbaCheatCode(code: string): string {
  return code
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .toUpperCase();
}

// 清理名称中的换行，避免用户输入破坏 mGBA 金手指分组
function normalizeGbaCheatName(name: string): string {
  return name.replace(/[\r\n]+/gu, ' ').trim() || '未命名';
}

// 生成不依赖服务器的金手指标识
function createGbaCheatId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `cheat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 创建一条可编辑的金手指记录
export function createGbaCheat(input: Partial<Omit<GbaCheat, 'id'>> = {}): GbaCheat {
  return {
    id: createGbaCheatId(),
    name: normalizeGbaCheatName(input.name ?? ''),
    code: normalizeGbaCheatCode(input.code ?? ''),
    enabled: input.enabled ?? true,
  };
}

// 判断未知值是否为普通对象，供本地存储数据校验使用
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 将本地存储中的一条记录转换为可信的金手指对象
function sanitizeGbaCheat(value: unknown, index: number): GbaCheat | null {
  if (!isRecord(value) || typeof value.code !== 'string') return null;
  const code = normalizeGbaCheatCode(value.code);
  if (!code) return null;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `stored-${index}`,
    name: typeof value.name === 'string' ? normalizeGbaCheatName(value.name) : '未命名金手指',
    code,
    enabled: value.enabled !== false,
  };
}

// 校验并清理外部来源的金手指列表
export function sanitizeGbaCheats(value: unknown): GbaCheat[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .map((entry, index) => sanitizeGbaCheat(entry, index))
    .filter((entry): entry is GbaCheat => {
      if (!entry || ids.has(entry.id)) return false;
      ids.add(entry.id);
      return true;
    });
}

// 按 mGBA .cheats 格式序列化金手指，让核心自动识别代码类型
export function serializeGbaCheats(cheats: readonly GbaCheat[]): string {
  const lines: string[] = [];

  for (const cheat of cheats) {
    const code = normalizeGbaCheatCode(cheat.code);
    if (!code) continue;
    if (!cheat.enabled) lines.push('!disabled');
    lines.push(`# ${normalizeGbaCheatName(cheat.name)}`, ...code.split('\n'));
  }

  return lines.length ? `${lines.join('\n')}\n` : '';
}
