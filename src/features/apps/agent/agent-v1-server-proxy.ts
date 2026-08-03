interface JsonProxyResult {
  status: number;
  body: Record<string, unknown>;
}

interface StreamProxyResult {
  status: 200;
  stream: ReadableStream<Uint8Array>;
  contentType: string;
}

export type AgentV1ProxyResult = JsonProxyResult | StreamProxyResult;

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 35_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_TITLE_CHARS = 100;
const MAX_MESSAGE_CHARS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequestTimeoutMs(): number {
  const configured = Number(process.env.AGENT_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(configured)));
}

function getAgentApiUrl(pathname: string): URL | null {
  const baseUrl = process.env.AGENT_API_BASE_URL?.trim();
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = pathname;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function errorResult(message: string, status: number, code = 'UPSTREAM_ERROR'): JsonProxyResult {
  return { status, body: { error: { code, message } } };
}

function getSafeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > 300 || /<\/?html/i.test(text)) return undefined;
  return text;
}

function getInputText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
}

function getUpstreamErrorMessage(payload: unknown, depth = 0): string | undefined {
  if (!isRecord(payload) || depth > 3) return undefined;
  const direct = getSafeText(payload.message) ?? getSafeText(payload.error) ?? getSafeText(payload.detail);
  if (direct) return direct;
  return getUpstreamErrorMessage(payload.error, depth + 1) ?? getUpstreamErrorMessage(payload.detail, depth + 1);
}

function isTimeoutError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const cause = isRecord(error.cause) ? error.cause : undefined;
  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    cause?.code === 'ETIMEDOUT'
  );
}

async function fetchUpstream(pathname: string, init: Omit<RequestInit, 'signal'>): Promise<Response | JsonProxyResult> {
  const url = getAgentApiUrl(pathname);
  if (!url) return errorResult('AI助手服务配置异常，请联系管理员。', 500, 'CONFIG_ERROR');

  const timeoutMs = getRequestTimeoutMs();
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'X-Request-Id': crypto.randomUUID(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    console.error('Agent v1 upstream request failed', {
      event: 'agent_v1_upstream_fetch_failed',
      pathname,
      timeoutMs,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return isTimeoutError(error)
      ? errorResult('AI助手响应超时，请稍后重试。', 504, 'AGENT_TIMEOUT')
      : errorResult('AI助手网络连接失败，请稍后重试。', 503, 'UPSTREAM_UNAVAILABLE');
  }
}

async function adaptUpstreamError(upstream: Response): Promise<JsonProxyResult> {
  const payload: unknown = await upstream.json().catch(() => null);
  const message = getUpstreamErrorMessage(payload) ?? `AI助手服务请求失败（HTTP ${upstream.status}）。`;
  return errorResult(message, upstream.status);
}

export async function proxyCreateAgentConversation(payload: unknown): Promise<JsonProxyResult> {
  if (!isRecord(payload)) return errorResult('请求体格式不正确。', 400, 'INVALID_REQUEST');
  const title = getInputText(payload.title, MAX_TITLE_CHARS);
  if (!title) {
    return errorResult('会话标题格式不正确。', 400, 'INVALID_REQUEST');
  }

  const upstream = await fetchUpstream('/api/v1/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, mode: 'chat' }),
  });
  if (!(upstream instanceof Response)) return upstream;
  if (!upstream.ok) return adaptUpstreamError(upstream);

  const responsePayload: unknown = await upstream.json().catch(() => null);
  const id = isRecord(responsePayload) ? getSafeText(responsePayload.id) : undefined;
  if (!id || !CONVERSATION_ID_PATTERN.test(id)) {
    return errorResult('AI助手服务返回了无效会话。', 502, 'INVALID_UPSTREAM_RESPONSE');
  }
  return { status: 201, body: { id } };
}

export async function proxyStreamAgentMessage(conversationId: string, payload: unknown): Promise<AgentV1ProxyResult> {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
    return errorResult('会话 ID 格式不正确。', 400, 'INVALID_REQUEST');
  }
  if (!isRecord(payload)) return errorResult('请求体格式不正确。', 400, 'INVALID_REQUEST');
  const content = getInputText(payload.content, MAX_MESSAGE_CHARS);
  if (!content) {
    return errorResult('消息内容格式不正确。', 400, 'INVALID_REQUEST');
  }

  const upstream = await fetchUpstream(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/stream`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!(upstream instanceof Response)) return upstream;
  if (!upstream.ok) return adaptUpstreamError(upstream);
  if (!upstream.body) return errorResult('AI助手服务返回了无效响应。', 502, 'INVALID_UPSTREAM_RESPONSE');

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return errorResult('AI助手服务返回了无效流式响应。', 502, 'INVALID_UPSTREAM_RESPONSE');
  }
  return { status: 200, stream: upstream.body, contentType };
}

export async function proxyDeleteAgentConversation(conversationId: string): Promise<JsonProxyResult> {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
    return errorResult('会话 ID 格式不正确。', 400, 'INVALID_REQUEST');
  }
  const upstream = await fetchUpstream(`/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });
  if (!(upstream instanceof Response)) return upstream;
  if (!upstream.ok) return adaptUpstreamError(upstream);
  return { status: 200, body: { success: true } };
}
