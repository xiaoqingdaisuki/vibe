export interface AgentSuggestionCard {
  id: string;
  title: string;
  description: string;
  payload: string;
}

export type AgentMessageRole = 'user' | 'assistant' | 'system';

export interface AgentApiRequest {
  conversationId: string;
  content: string;
}

export interface AgentApiResponse {
  content: string;
  suggestionCards?: AgentSuggestionCard[];
}

export interface AgentToolProgress {
  toolName: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
}

export interface AgentConversationMessage {
  id: string;
  role: Extract<AgentMessageRole, 'user' | 'assistant'>;
  content: string;
  createdAt: string;
}

const AGENT_CONVERSATIONS_URL = '/api/agent/v1/conversations';
const CONNECTION_ERROR_MESSAGE = '无法连接 AI助手服务，请检查接口地址或网络后重试';
const EMPTY_RESPONSE_MESSAGE = 'AI助手接口未返回有效内容，请稍后重试';

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

  const cards = value.flatMap((card) => {
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
  });

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

  const content = getTextField(payload, ['content', 'message']);
  if (content === undefined) throw new Error(EMPTY_RESPONSE_MESSAGE);

  return requireContent({
    content,
    suggestionCards: parseSuggestionCards(payload.suggestionCards),
  });
}

// 从JSON错误响应中提取错误信息
function getJsonErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const directMessage = getTextField(payload, ['message', 'error']);
  if (directMessage) return directMessage;

  return isRecord(payload.error) ? getTextField(payload.error, ['message']) : undefined;
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
  if (status === 'completed') return `${label}完成，正在整理结果…`;
  return `${label}未完成，正在继续处理…`;
}

// 解析流式事件中的工具进度信息
function parseToolProgress(payload: Record<string, unknown>): AgentToolProgress | undefined {
  if (payload.event !== 'tool') return undefined;
  const toolName = getTextField(payload, ['tool_name']);
  const status = getTextField(payload, ['status']);
  if (!toolName || (status !== 'started' && status !== 'completed' && status !== 'failed')) return undefined;
  return { toolName, status, message: getToolProgressMessage(toolName, status) };
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
export async function createAgentConversation(title: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(AGENT_CONVERSATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.slice(0, 100), mode: 'chat' }),
    signal,
  }).catch((error: unknown) => {
    if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(CONNECTION_ERROR_MESSAGE);
  });
  if (!response.ok) throw new Error(await readHttpError(response));

  const payload: unknown = await response.json().catch(() => null);
  const conversationId = isRecord(payload) ? getTextField(payload, ['id']) : undefined;
  if (!conversationId) throw new Error(EMPTY_RESPONSE_MESSAGE);
  return conversationId;
}

// 删除指定对话会话
export async function deleteAgentConversation(conversationId: string): Promise<void> {
  await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

// 获取指定会话的历史消息列表
export async function getAgentConversationMessages(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AgentConversationMessage[]> {
  const response = await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}/messages`, {
    signal,
  }).catch((error: unknown) => {
    if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(CONNECTION_ERROR_MESSAGE);
  });
  if (!response.ok) throw new Error(await readHttpError(response));

  const payload: unknown = await response.json().catch(() => null);
  const messages = isRecord(payload) ? payload.messages : payload;
  if (!Array.isArray(messages)) throw new Error(EMPTY_RESPONSE_MESSAGE);

  return messages.flatMap((message) => {
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
  });
}

// 发起AI流式消息请求
async function fetchAgent(request: AgentApiRequest, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  try {
    return await fetch(`${AGENT_CONVERSATIONS_URL}/${encodeURIComponent(request.conversationId)}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: request.content }),
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
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  onToolProgress?: (progress: AgentToolProgress) => void,
): Promise<AgentApiResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(EMPTY_RESPONSE_MESSAGE);

  const decoder = new TextDecoder();
  let fullContent = '';
  let lineBuffer = '';
  let suggestionCards: AgentSuggestionCard[] | undefined;
  const cancelRead = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelRead, { once: true });

  const consumeLine = (line: string): boolean => {
    if (!line.startsWith('data:')) return false;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      if (payload) {
        fullContent += payload;
        onChunk(payload);
      }
      return false;
    }

    if (isRecord(parsed)) {
      const streamError = getJsonErrorMessage(parsed);
      if (streamError) throw new Error(streamError);
      const toolProgress = parseToolProgress(parsed);
      if (toolProgress) {
        onToolProgress?.(toolProgress);
        return false;
      }
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
      onChunk(delta);
    }

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
        if (consumeLine(line)) return requireContent({ content: fullContent, suggestionCards });
      }
    }

    lineBuffer += decoder.decode();
    consumeLine(lineBuffer);
    return requireContent({ content: fullContent, suggestionCards });
  } finally {
    signal?.removeEventListener('abort', cancelRead);
    reader.releaseLock();
  }
}

// 对外统一的AI API调用入口，自动处理JSON和SSE响应
export async function callAgentApi(
  request: AgentApiRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  onToolProgress?: (progress: AgentToolProgress) => void,
): Promise<AgentApiResponse> {
  const response = await fetchAgent(request, signal);
  if (!response.ok) throw new Error(await readHttpError(response));

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json().catch(() => null);
    return parseJsonResponse(payload);
  }
  if (contentType.includes('text/event-stream')) {
    return readEventStream(response, onChunk, signal, onToolProgress);
  }

  const content = await response.text();
  return requireContent({ content });
}
