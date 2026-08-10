const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const MIN_REQUEST_TIMEOUT_MS = 41_000;
const MAX_REQUEST_TIMEOUT_MS = 55_000;
const DEFAULT_STREAM_TIMEOUT_MS = 295_000;
const MIN_STREAM_TIMEOUT_MS = 60_000;
const MAX_STREAM_TIMEOUT_MS = 295_000;

// 读取普通Agent请求超时并限制在60秒路由预算内
export function getAgentRequestTimeoutMs(value = process.env.AGENT_REQUEST_TIMEOUT_MS): number {
  const configured = Number(value);
  if (!Number.isFinite(configured)) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(MIN_REQUEST_TIMEOUT_MS, Math.trunc(configured)));
}

// 读取流式Agent请求超时并为300秒路由预留收尾时间
export function getAgentStreamTimeoutMs(value = process.env.AGENT_STREAM_TIMEOUT_MS): number {
  const configured = Number(value);
  if (!Number.isFinite(configured)) return DEFAULT_STREAM_TIMEOUT_MS;
  return Math.min(MAX_STREAM_TIMEOUT_MS, Math.max(MIN_STREAM_TIMEOUT_MS, Math.trunc(configured)));
}
