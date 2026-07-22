type AgentMessageRole = 'user' | 'assistant' | 'system';

interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

interface ProxyResult {
  status: number;
  body: { content: string } | { error: { message: string } };
}

const DEFAULT_AGENT_API_BASE_URL = 'http://127.0.0.1:6001';
const VALID_ROLES = new Set<AgentMessageRole>(['user', 'assistant', 'system']);

function isAgentMessage(value: unknown): value is AgentMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const { role, content } = value as Record<string, unknown>;
  return typeof role === 'string' && VALID_ROLES.has(role as AgentMessageRole) && typeof content === 'string';
}

function getAgentApiUrl(): string | null {
  const baseUrl = process.env.AGENT_API_BASE_URL ?? DEFAULT_AGENT_API_BASE_URL;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return new URL('/chat', url).toString();
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

export async function proxyAgentChat(payload: unknown): Promise<ProxyResult> {
  const messages =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).messages
      : null;

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isAgentMessage)) {
    return errorResult('请求体必须包含消息列表。', 400);
  }

  const latestUserMessage = messages.findLast((message) => message.role === 'user' && message.content.trim());
  if (!latestUserMessage) {
    return errorResult('请先输入一条用户消息。', 400);
  }

  const agentApiUrl = getAgentApiUrl();
  if (!agentApiUrl) {
    return errorResult('AGENT_API_BASE_URL 配置无效。', 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(agentApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: formatConversation(messages) }),
      cache: 'no-store',
    });
  } catch {
    return errorResult('无法连接 AI小情服务，请检查本地后端是否已启动。', 503);
  }

  const upstreamPayload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message =
      typeof upstreamPayload === 'object' && upstreamPayload !== null && !Array.isArray(upstreamPayload)
        ? (upstreamPayload as { error?: unknown }).error
        : undefined;
    return errorResult(typeof message === 'string' ? message : 'AI小情服务暂时不可用。', upstream.status);
  }

  const reply =
    typeof upstreamPayload === 'object' && upstreamPayload !== null && !Array.isArray(upstreamPayload)
      ? (upstreamPayload as { reply?: unknown }).reply
      : undefined;
  if (typeof reply !== 'string' || !reply.trim()) {
    return errorResult('AI小情服务返回了无效响应。', 502);
  }

  return { status: 200, body: { content: reply } };
}
