type AgentMessageRole = 'user' | 'assistant' | 'system';

interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

interface ProxyResult {
  status: number;
  body: { content: string } | { error: { message: string } };
}

const VALID_ROLES = new Set<AgentMessageRole>(['user', 'assistant', 'system']);
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 30_000;
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 60_000;
const SLOW_REQUEST_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAgentMessage(value: unknown): value is AgentMessage {
  if (!isRecord(value)) return false;

  const { role, content } = value;
  return (
    typeof role === 'string' &&
    VALID_ROLES.has(role as AgentMessageRole) &&
    typeof content === 'string' &&
    content.length <= MAX_MESSAGE_CHARS
  );
}

function getRequestTimeoutMs(): number {
  const configured = Number(process.env.AGENT_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(configured)));
}

function getAgentApiUrl(): URL | null {
  const baseUrl = process.env.AGENT_API_BASE_URL?.trim();
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    url.pathname = '/chat';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function errorResult(message: string, status: number): ProxyResult {
  return { status, body: { error: { message } } };
}

function formatConversation(messages: AgentMessage[]): string {
  return messages.map(({ role, content }) => `${role}: ${content.trim()}`).join('\n\n');
}

function getSafeErrorText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const text = value.trim();
  if (!text || text.length > 300 || /<\/?html/i.test(text)) return undefined;
  return text;
}

function getUpstreamErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const direct =
    getSafeErrorText(payload.error) ?? getSafeErrorText(payload.detail) ?? getSafeErrorText(payload.message);
  if (direct) return direct;

  for (const field of ['error', 'detail']) {
    const nested = payload[field];
    if (!isRecord(nested)) continue;

    const message = getSafeErrorText(nested.message) ?? getSafeErrorText(nested.detail);
    if (message) return message;
  }

  return undefined;
}

function getErrorMetadata(error: unknown): {
  errorName: string;
  errorMessage: string;
  errorCode?: string;
} {
  if (!isRecord(error)) {
    return {
      errorName: 'UnknownError',
      errorMessage: String(error),
    };
  }

  const cause = isRecord(error.cause) ? error.cause : undefined;
  const errorCode = getSafeErrorText(error.code) ?? getSafeErrorText(cause?.code);

  return {
    errorName: getSafeErrorText(error.name) ?? 'Error',
    errorMessage: getSafeErrorText(error.message) ?? 'Unknown upstream error',
    ...(errorCode ? { errorCode } : {}),
  };
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

export async function proxyAgentChat(payload: unknown): Promise<ProxyResult> {
  if (!isRecord(payload)) {
    return errorResult('请求体格式不正确。', 400);
  }

  const messages = payload.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isAgentMessage)
  ) {
    return errorResult(`消息列表必须包含 1-${MAX_MESSAGES} 条有效消息。`, 400);
  }

  const totalChars = messages.reduce((total, message) => total + message.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return errorResult('对话内容过长，请清空部分历史后重试。', 413);
  }

  const latestUserMessage = messages.findLast((message) => message.role === 'user' && message.content.trim());
  if (!latestUserMessage) {
    return errorResult('请先输入一条用户消息。', 400);
  }

  const rawThreadId = payload.thread_id;
  if (rawThreadId !== undefined && (typeof rawThreadId !== 'string' || !THREAD_ID_PATTERN.test(rawThreadId.trim()))) {
    return errorResult('thread_id 格式不正确。', 400);
  }
  const threadId = typeof rawThreadId === 'string' ? rawThreadId.trim() : undefined;

  const agentApiUrl = getAgentApiUrl();
  if (!agentApiUrl) {
    console.error('Agent upstream configuration is missing or invalid', {
      event: 'agent_upstream_config_error',
    });
    return errorResult('AI助手服务配置异常，请联系管理员。', 500);
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const timeoutMs = getRequestTimeoutMs();

  // Backward compatible: the current Vibe client does not send thread_id, so
  // preserve the formatted transcript expected by the Agent compatibility layer.
  // Once the client sends a stable thread_id, use the normal single-turn protocol.
  const upstreamBody = threadId
    ? { message: latestUserMessage.content.trim(), thread_id: threadId }
    : { message: formatConversation(messages) };

  let upstream: Response;
  try {
    upstream = await fetch(agentApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const metadata = getErrorMetadata(error);
    console.error('Agent upstream request failed', {
      event: 'agent_upstream_fetch_failed',
      requestId,
      upstreamOrigin: agentApiUrl.origin,
      elapsedMs,
      timeoutMs,
      ...metadata,
    });

    if (isTimeoutError(error)) {
      return errorResult('AI助手响应超时，请稍后重试。', 504);
    }
    return errorResult('AI助手网络连接失败，请稍后重试。', 503);
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= SLOW_REQUEST_MS) {
    console.warn('Agent upstream request was slow', {
      event: 'agent_upstream_slow',
      requestId,
      upstreamOrigin: agentApiUrl.origin,
      elapsedMs,
      status: upstream.status,
    });
  }

  const upstreamPayload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const upstreamMessage = getUpstreamErrorMessage(upstreamPayload);
    console.warn('Agent upstream returned an error response', {
      event: 'agent_upstream_http_error',
      requestId,
      upstreamOrigin: agentApiUrl.origin,
      elapsedMs,
      status: upstream.status,
      upstreamMessage,
    });

    const publicMessage =
      upstream.status === 429
        ? 'AI助手请求过于频繁，请稍后重试。'
        : upstream.status === 451
          ? '请求内容被模型服务拒绝，请调整内容后重试。'
          : (upstreamMessage ?? `AI助手服务请求失败（HTTP ${upstream.status}）。`);
    return errorResult(publicMessage, upstream.status);
  }

  const reply = isRecord(upstreamPayload)
    ? (getSafeErrorText(upstreamPayload.reply) ?? getSafeErrorText(upstreamPayload.content))
    : undefined;
  if (!reply) {
    console.error('Agent upstream returned an invalid response', {
      event: 'agent_upstream_invalid_response',
      requestId,
      upstreamOrigin: agentApiUrl.origin,
      elapsedMs,
      status: upstream.status,
    });
    return errorResult('AI助手服务返回了无效响应。', 502);
  }

  return { status: 200, body: { content: reply } };
}
