export type PreviewState = 'loading' | 'paused' | 'ready';

export type PreviewMessageType =
  | 'vibe:online-editor:console'
  | 'vibe:online-editor:ready'
  | 'vibe:online-editor:result'
  | 'vibe:online-editor:runtime-error';

export interface PreviewDiagnostic {
  id: string;
  level: 'error' | 'info' | 'log' | 'result' | 'warn';
  message: string;
}

export interface RuntimeMessage {
  level?: PreviewDiagnostic['level'];
  message?: string;
  sessionId: string;
  type: PreviewMessageType;
}

export type PreviewCommand = 'ready' | 'restart' | 'stop';
export type HotPreviewAction = 'none' | 'remember' | 'restart';

// 将未知的 postMessage 数据收窄为可处理的预览运行时消息
export function parseRuntimeMessage(value: unknown): RuntimeMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const message = value as Record<string, unknown>;
  const type = message.type;
  if (
    type !== 'vibe:online-editor:console' &&
    type !== 'vibe:online-editor:ready' &&
    type !== 'vibe:online-editor:result' &&
    type !== 'vibe:online-editor:runtime-error'
  ) {
    return undefined;
  }
  if (typeof message.sessionId !== 'string') return undefined;

  const level = message.level;
  const validLevel =
    level === 'error' || level === 'info' || level === 'log' || level === 'result' || level === 'warn'
      ? level
      : undefined;
  return {
    level: validLevel,
    message: typeof message.message === 'string' ? message.message : undefined,
    sessionId: message.sessionId,
    type,
  };
}

// 判断运行消息是否属于当前仍在挂载的沙箱会话
export function isCurrentPreviewMessage(message: RuntimeMessage | undefined, sessionId: string): boolean {
  return message?.sessionId === sessionId;
}

// 统一停止、恢复与就绪命令对应的预览状态
export function getPreviewStateAfterCommand(command: PreviewCommand): PreviewState {
  if (command === 'stop') return 'paused';
  if (command === 'ready') return 'ready';
  return 'loading';
}

// 决定源码变化应忽略、仅记录，还是调度一次热重建
export function getHotPreviewAction(
  previousCode: string,
  nextCode: string,
  previewState: PreviewState,
  hasFrame: boolean,
): HotPreviewAction {
  if (previousCode === nextCode) return 'none';
  if (previewState === 'paused' || !hasFrame) return 'remember';
  return 'restart';
}
