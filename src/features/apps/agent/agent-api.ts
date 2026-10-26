/** AI 助手：会话请求、响应校验与流式事件解析 */

import {
  AGENT_STREAM_CLIENT_TIMEOUT_MARGIN_MS,
  AGENT_STREAM_IDLE_TIMEOUT_HEADER,
  AGENT_STREAM_TIMEOUT_HEADER,
  DEFAULT_AGENT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_AGENT_STREAM_TIMEOUT_MS,
  parseAgentStreamIdleTimeout,
  parseAgentStreamTimeout,
} from './agent-timeout-contract.ts';

export interface AgentSuggestionCard {
  id: string;
  title: string;
  description: string;
  payload: string;
}

export type AgentMessageRole = 'user' | 'assistant' | 'system';

export interface AgentSessionDocumentPart {
  partIndex: number;
  page?: number;
  section?: string;
  content: string;
}

export interface AgentSessionDocument {
  localId: string;
  filename: string;
  mimeType: string;
  size: number;
  parserVersion: string;
  parts: AgentSessionDocumentPart[];
}

export interface AgentImageAttachment {
  filename: string;
  blob: Blob;
  mimeType: string;
  fingerprint?: string;
}

export interface AgentDocumentAttachment {
  filename: string;
  blob: Blob;
  mimeType: string;
}

export interface AgentApiRequest {
  conversationId: string;
  content: string;
  userId: string;
  sessionDocuments?: AgentSessionDocument[];
  documentAttachmentIds?: string[];
  images?: AgentImageAttachment[];
  files?: AgentDocumentAttachment[];
  clientMessageId?: string;
}

export interface AgentApiResponse {
  content: string;
  suggestionCards?: AgentSuggestionCard[];
}

export interface AgentToolProgress {
  toolName: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  callId?: string;
  output?: string;
}

export interface AgentTextDelivery {
  immediate: boolean;
}

export interface AgentConversationMessage {
  id: string;
  role: Extract<AgentMessageRole, 'user' | 'assistant'>;
  content: string;
  createdAt: string;
}

export interface AgentCapabilities {
  memory_enabled: boolean;
  attachments?: {
    enabled?: boolean;
    documents_enabled?: boolean;
    images_enabled?: boolean;
    document_mode?: 'session_only' | 'persistent_rag' | string;
    persistent_rag_enabled?: boolean;
  };
}

const AGENT_CONVERSATIONS_URL = '/api/conversations';
const CONNECTION_ERROR_MESSAGE = '无法连接 AI助手服务，请检查接口地址或网络后重试';
const EMPTY_RESPONSE_MESSAGE = 'AI助手接口未返回有效内容，请稍后重试';

export class AgentHttpError extends Error {
  readonly status: number;

  // 保存上游HTTP状态码，便于调用方区分资源不存在与临时故障
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AgentHttpError';
    this.status = status;
  }
}

// 判断恢复失败是否表示持久化会话已经不存在
export function shouldDiscardStoredConversation(error: unknown): boolean {
  return error instanceof AgentHttpError && error.status === 404;
}

// 判断是否为请求中止错误
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// 类型守卫：判断值是否为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 从对象中查找第一个字符串类型的字段值
function getTextField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string') return value;
  }

  return undefined;
}

// 解析AI返回的建议卡片数据
function parseSuggestionCards(value: unknown): AgentSuggestionCard[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const cards = value.flatMap(
    // 过滤字段不完整的建议卡片并转换为应用数据结构
    (card) => {
      if (!isRecord(card)) return [];
      const { id, title, description, payload } = card;
      if (
        typeof id !== 'string' ||
        typeof title !== 'string' ||
        typeof description !== 'string' ||
        typeof payload !== 'string'
      ) {
        return [];
      }

      return [{ id, title, description, payload }];
    },
  );

  return cards.length > 0 ? cards : undefined;
}

// 确保API响应包含有效内容
function requireContent(response: AgentApiResponse): AgentApiResponse {
  if (!response.content.trim()) throw new Error(EMPTY_RESPONSE_MESSAGE);
  return response;
}

// 解析JSON格式的API响应
function parseJsonResponse(payload: unknown): AgentApiResponse {
  if (!isRecord(payload)) throw new Error(EMPTY_RESPONSE_MESSAGE);

  const content = getTextField(payload, ['content', 'message', 'reply']);
  if (content === undefined) throw new Error(EMPTY_RESPONSE_MESSAGE);

  return requireContent({
    content,
    suggestionCards: parseSuggestionCards(payload.suggestionCards),
  });
}

// 从JSON错误响应中提取错误信息
function getJsonErrorMessage(payload: unknown, depth = 0): string | undefined {
  if (!isRecord(payload) || depth > 3) return undefined;

  const directMessage = getTextField(payload, ['message', 'error']);
  if (directMessage) return directMessage;

  return getJsonErrorMessage(payload.error, depth + 1) ?? getJsonErrorMessage(payload.detail, depth + 1);
}

// 将工具调用状态转换为中文用户提示
function getToolProgressMessage(toolName: string, status: AgentToolProgress['status']): string {
  const labels: Record<string, string> = {
    web_search: '网络搜索',
    'web.search': '网络搜索',
    web_read: '网页读取',
    'web.read': '网页读取',
    get_weather: '天气查询',
    'weather.get': '天气查询',
    knowledge_search: '知识库检索',
    'knowledge.search': '知识库检索',
  };
  const label = labels[toolName] ?? '信息查询';
  if (status === 'started') return `正在${label}…`;
  if (status === 'completed') return `${label}完成`;
  return `${label}未完成，正在继续处理…`;
}

// 解析流式事件中的工具进度信息
function parseToolProgress(payload: Record<string, unknown>, eventName: string): AgentToolProgress | undefined {
  const event = eventName || getTextField(payload, ['event', 'type']);
  if (event !== 'tool' && event !== 'tool.output') return undefined;
  const toolName = getTextField(payload, ['tool_name']);
  const status = event === 'tool.output' ? 'completed' : getTextField(payload, ['status']);
  if (!toolName || (status !== 'started' && status !== 'completed' && status !== 'failed')) return undefined;
  const callId = getTextField(payload, ['call_id']);
  const output = getTextField(payload, event === 'tool.output' ? ['output', 'content', 'text'] : ['output']);
  return {
    toolName,
    status,
    message: getToolProgressMessage(toolName, status),
    ...(callId ? { callId } : {}),
    ...(output !== undefined ? { output } : {}),
  };
}

// 读取HTTP错误响应的可读错误信息
async function readHttpError(response: Response): Promise<string> {
  const fallback = `AI助手请求失败（HTTP ${response.status}）`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json().catch(() => null);
    return getJsonErrorMessage(payload) ?? fallback;
  }

  const text = (await response.text().catch(() => '')).trim();
  if (text && text.length <= 200 && !/[<>]/.test(text)) return text;
  return fallback;
}

// 创建新的AI对话会话
export async function createAgentConversation(title: string, userId: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(AGENT_CONVERSATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.slice(0, 100), mode: 'chat', user_id: userId }),
    signal,
  }).catch(
    // 保留主动中止错误，其余连接失败转换为统一提示
    (error: unknown) => {
      if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(CONNECTION_ERROR_MESSAGE);
    },
  );
  if (!response.ok) throw new AgentHttpError(await readHttpError(response), response.status);

  const payload: unknown = await response.json().catch(() => null);
  const conversationId = isRecord(payload) ? getTextField(payload, ['id']) : undefined;
  if (!conversationId) throw new Error(EMPTY_RESPONSE_MESSAGE);
  return conversationId;
}

// 获取 Agent 能力配置，决定文档是否在发送后继续留在临时会话状态
export async function getAgentCapabilities(userId: string, signal?: AbortSignal): Promise<AgentCapabilities> {
  const query = new URLSearchParams({ user_id: userId });
  const response = await fetch(`/api/capabilities?${query}`, { signal }).catch(
    // 保留主动中止错误，其余连接失败转换为统一提示
    (error: unknown) => {
      if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(CONNECTION_ERROR_MESSAGE);
    },
  );
  if (!response.ok) throw new AgentHttpError(await readHttpError(response), response.status);
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.memory_enabled !== 'boolean') {
    throw new Error(EMPTY_RESPONSE_MESSAGE);
  }
  const attachments = isRecord(payload.attachments) ? payload.attachments : undefined;
  return {
    memory_enabled: payload.memory_enabled,
    attachments: attachments
      ? {
          enabled: typeof attachments.enabled === 'boolean' ? attachments.enabled : undefined,
          documents_enabled:
            typeof attachments.documents_enabled === 'boolean' ? attachments.documents_enabled : undefined,
          images_enabled: typeof attachments.images_enabled === 'boolean' ? attachments.images_enabled : undefined,
          document_mode: typeof attachments.document_mode === 'string' ? attachments.document_mode : undefined,
          persistent_rag_enabled:
            typeof attachments.persistent_rag_enabled === 'boolean' ? attachments.persistent_rag_enabled : undefined,
        }
      : undefined,
  };
}

// 删除指定对话会话，失败时保留本地引用以便重试
export async function deleteAgentConversation(conversationId: string, userId: string): Promise<void> {
  const query = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}?${query}`, {
    method: 'DELETE',
  }).catch(() => {
    throw new Error(CONNECTION_ERROR_MESSAGE);
  });
  if (!response.ok && response.status !== 404) {
    throw new AgentHttpError(await readHttpError(response), response.status);
  }
}

// 获取指定会话的历史消息列表
export async function getAgentConversationMessages(
  conversationId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<AgentConversationMessage[]> {
  const query = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}/messages?${query}`, {
    signal,
  }).catch(
    // 保留主动中止错误，其余连接失败转换为统一提示
    (error: unknown) => {
      if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(CONNECTION_ERROR_MESSAGE);
    },
  );
  if (!response.ok) throw new AgentHttpError(await readHttpError(response), response.status);

  const payload: unknown = await response.json().catch(() => null);
  const messages = isRecord(payload) ? payload.messages : payload;
  if (!Array.isArray(messages)) throw new Error(EMPTY_RESPONSE_MESSAGE);

  return messages.flatMap(
    // 校验历史消息字段，并映射服务端创建时间字段
    (message) => {
      if (!isRecord(message)) return [];
      const { id, role, content, created_at: createdAt } = message;
      if (
        typeof id !== 'string' ||
        (role !== 'user' && role !== 'assistant') ||
        typeof content !== 'string' ||
        typeof createdAt !== 'string'
      ) {
        return [];
      }
      return [{ id, role, content, createdAt }];
    },
  );
}

// 发起AI流式消息请求
async function fetchAgent(request: AgentApiRequest, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  try {
    const metadata = {
      content: request.content,
      user_id: request.userId,
      client_message_id: request.clientMessageId,
      session_documents: request.sessionDocuments,
      document_attachment_ids: request.documentAttachmentIds,
    };
    const headers: HeadersInit = { Accept: 'application/json, text/event-stream' };
    let body: BodyInit;
    if (request.images?.length || request.files?.length) {
      const formData = new FormData();
      formData.append('metadata', JSON.stringify(metadata));
      request.images?.forEach((image) => formData.append('images', image.blob, image.filename));
      request.files?.forEach((file) => formData.append('documents', file.blob, file.filename));
      body = formData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(metadata);
    }
    return await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(request.conversationId)}/messages/stream`, {
      method: 'POST',
      headers,
      body,
      signal,
    });
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }
}

// 读取SSE流式响应，实时处理内容块和工具进度事件
async function readEventStream(
  response: Response,
  onChunk: (chunk: string, delivery?: AgentTextDelivery) => void,
  signal?: AbortSignal,
  onToolProgress?: (progress: AgentToolProgress) => void,
): Promise<AgentApiResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(EMPTY_RESPONSE_MESSAGE);

  const decoder = new TextDecoder();
  let fullContent = '';
  let lineBuffer = '';
  let eventName = '';
  let dataLines: string[] = [];
  let suggestionCards: AgentSuggestionCard[] | undefined;
  // 取消流读取并忽略取消过程中的次要错误
  const cancelRead = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelRead, { once: true });

  // 按SSE事件边界分类分发，网络读取不等待动画或Markdown解析
  const consumeEvent = (): boolean => {
    const name = eventName;
    const payload = dataLines.join('\n').trim();
    eventName = '';
    dataLines = [];
    if (name === 'done' || payload === '[DONE]') return true;
    if (!payload) return false;
    if (name && !['text', 'message', 'tool', 'tool.output', 'error'].includes(name)) return false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      if (!name || name === 'text' || name === 'message') {
        fullContent += payload;
        onChunk(payload);
      }
      return false;
    }

    if ((name === 'tool' || name === 'tool.output') && !isRecord(parsed)) return false;
    if (name === 'error' && !isRecord(parsed)) {
      throw new Error(typeof parsed === 'string' ? parsed : 'AI助手处理失败');
    }
    if (isRecord(parsed)) {
      const toolProgress = parseToolProgress(parsed, name);
      if (toolProgress) {
        onToolProgress?.(toolProgress);
        return false;
      }
      if (name === 'tool' || name === 'tool.output') return false;
      if (name === 'error' || parsed.error !== undefined || parsed.ok === false) {
        throw new Error(getJsonErrorMessage(parsed) ?? 'AI助手处理失败');
      }
      const kind = name || getTextField(parsed, ['event', 'type']);
      if (kind && kind !== 'text' && kind !== 'message') return false;
      suggestionCards = parseSuggestionCards(parsed.suggestionCards) ?? suggestionCards;
    }

    const delta =
      typeof parsed === 'string'
        ? parsed
        : isRecord(parsed)
          ? (getTextField(parsed, ['delta', 'content', 'text', 'chunk']) ?? '')
          : '';
    if (delta) {
      fullContent += delta;
      const immediate = isRecord(parsed) && (parsed.delivery === 'immediate' || parsed.replayed === true);
      onChunk(delta, { immediate });
    }

    return false;
  };

  // 累积多行data并识别event名称，忽略心跳与事件ID
  const consumeLine = (line: string): boolean => {
    if (line === '') return consumeEvent();
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (consumeLine(line)) return requireContent({ content: fullContent, suggestionCards });
      }
    }

    lineBuffer += decoder.decode();
    consumeLine(lineBuffer);
    consumeEvent();
    return requireContent({ content: fullContent, suggestionCards });
  } finally {
    signal?.removeEventListener('abort', cancelRead);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// 对外统一的AI API调用入口，自动处理JSON和SSE响应
export async function callAgentApi(
  request: AgentApiRequest,
  onChunk: (chunk: string, delivery?: AgentTextDelivery) => void,
  signal?: AbortSignal,
  onToolProgress?: (progress: AgentToolProgress) => void,
): Promise<AgentApiResponse> {
  const controller = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timedOut = false;
  // 正文或工具进度长期停滞时退出加载，SSE 心跳不延长业务等待
  const onTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const requestStartedAt = Date.now();
  let idleTimeoutMs = DEFAULT_AGENT_STREAM_IDLE_TIMEOUT_MS;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer = setTimeout(onTimeout, DEFAULT_AGENT_STREAM_TIMEOUT_MS - AGENT_STREAM_CLIENT_TIMEOUT_MARGIN_MS);
  // 有业务进度时重置停滞计时，同时保留请求总时限
  const refreshProgress = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onTimeout, idleTimeoutMs);
  };
  // 根据服务端响应头调整客户端超时，避免两端各自维护不同的生产配置
  const alignStreamTimeouts = (response: Response) => {
    const serverTimeout =
      parseAgentStreamTimeout(response.headers.get(AGENT_STREAM_TIMEOUT_HEADER)) ?? DEFAULT_AGENT_STREAM_TIMEOUT_MS;
    idleTimeoutMs =
      parseAgentStreamIdleTimeout(response.headers.get(AGENT_STREAM_IDLE_TIMEOUT_HEADER)) ??
      DEFAULT_AGENT_STREAM_IDLE_TIMEOUT_MS;
    const elapsed = Date.now() - requestStartedAt;
    const remaining = Math.max(0, serverTimeout - AGENT_STREAM_CLIENT_TIMEOUT_MARGIN_MS - elapsed);
    clearTimeout(totalTimer);
    totalTimer = setTimeout(onTimeout, remaining);
  };
  try {
    const response = await fetchAgent(request, combinedSignal);
    alignStreamTimeouts(response);
    if (!response.ok) throw new AgentHttpError(await readHttpError(response), response.status);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload: unknown = await response.json().catch(() => null);
      return parseJsonResponse(payload);
    }
    if (contentType.includes('text/event-stream')) {
      refreshProgress();
      return await readEventStream(
        response,
        // 收到文本分片后刷新进度计时并转发内容
        (chunk, delivery) => {
          refreshProgress();
          onChunk(chunk, delivery);
        },
        combinedSignal,
        // 收到工具进度后刷新计时并通知订阅方
        (progress) => {
          refreshProgress();
          onToolProgress?.(progress);
        },
      );
    }

    const content = await response.text();
    return requireContent({ content });
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new Error('AI助手响应超时，请稍后重试。');
    throw error;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
  }
}
