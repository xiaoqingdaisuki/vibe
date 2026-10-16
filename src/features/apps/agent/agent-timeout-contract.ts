export const AGENT_STREAM_TIMEOUT_HEADER = 'X-Agent-Stream-Timeout';
export const AGENT_STREAM_IDLE_TIMEOUT_HEADER = 'X-Agent-Stream-Idle-Timeout';
export const DEFAULT_AGENT_STREAM_TIMEOUT_MS = 295_000;
export const MIN_AGENT_STREAM_TIMEOUT_MS = 60_000;
export const MAX_AGENT_STREAM_TIMEOUT_MS = 295_000;
export const DEFAULT_AGENT_STREAM_IDLE_TIMEOUT_MS = 75_000;
export const MIN_AGENT_STREAM_IDLE_TIMEOUT_MS = 30_000;
export const MAX_AGENT_STREAM_IDLE_TIMEOUT_MS = MAX_AGENT_STREAM_TIMEOUT_MS;
export const AGENT_STREAM_CLIENT_TIMEOUT_MARGIN_MS = 5_000;

// 解析服务端通过响应头下发的流式请求超时配置
export function parseAgentStreamTimeout(value: string | null): number | undefined {
  if (!value) return undefined;
  const configured = Number(value);
  if (!Number.isFinite(configured)) return undefined;
  return Math.min(MAX_AGENT_STREAM_TIMEOUT_MS, Math.max(MIN_AGENT_STREAM_TIMEOUT_MS, Math.trunc(configured)));
}

// 解析服务端通过响应头下发的流式空闲超时配置
export function parseAgentStreamIdleTimeout(value: string | null): number | undefined {
  if (!value) return undefined;
  const configured = Number(value);
  if (!Number.isFinite(configured)) return undefined;
  return Math.min(MAX_AGENT_STREAM_IDLE_TIMEOUT_MS, Math.max(MIN_AGENT_STREAM_IDLE_TIMEOUT_MS, Math.trunc(configured)));
}
