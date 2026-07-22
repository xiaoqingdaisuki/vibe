export interface AgentSuggestionCard {
  id: string;
  title: string;
  description: string;
  payload: string;
}

export type AgentMessageRole = 'user' | 'assistant' | 'system';

export interface AgentApiRequest {
  messages: { role: AgentMessageRole; content: string }[];
}

export interface AgentApiResponse {
  content: string;
  suggestionCards?: AgentSuggestionCard[];
}

const AGENT_API_URL = '/api/agent/chat';
const CONNECTION_ERROR_MESSAGE = '无法连接 Agent 服务，请检查接口地址或网络后重试';
const EMPTY_RESPONSE_MESSAGE = 'Agent 接口未返回有效内容，请稍后重试';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTextField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string') return value;
  }

  return undefined;
}

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

function requireContent(response: AgentApiResponse): AgentApiResponse {
  if (!response.content.trim()) throw new Error(EMPTY_RESPONSE_MESSAGE);
  return response;
}

function parseJsonResponse(payload: unknown): AgentApiResponse {
  if (!isRecord(payload)) throw new Error(EMPTY_RESPONSE_MESSAGE);

  const content = getTextField(payload, ['content', 'message']);
  if (content === undefined) throw new Error(EMPTY_RESPONSE_MESSAGE);

  return requireContent({
    content,
    suggestionCards: parseSuggestionCards(payload.suggestionCards),
  });
}

function getJsonErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const directMessage = getTextField(payload, ['message', 'error']);
  if (directMessage) return directMessage;

  return isRecord(payload.error) ? getTextField(payload.error, ['message']) : undefined;
}

async function readHttpError(response: Response): Promise<string> {
  const fallback = `Agent 请求失败（HTTP ${response.status}）`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json().catch(() => null);
    return getJsonErrorMessage(payload) ?? fallback;
  }

  const text = (await response.text().catch(() => '')).trim();
  if (text && text.length <= 200 && !/[<>]/.test(text)) return text;
  return fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function fetchAgent(request: AgentApiRequest, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  try {
    return await fetch(AGENT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: request.messages }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }
}

async function readEventStream(
  response: Response,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
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

    try {
      const parsed: unknown = JSON.parse(payload);
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
      if (isRecord(parsed)) {
        suggestionCards = parseSuggestionCards(parsed.suggestionCards) ?? suggestionCards;
      }
    } catch {
      if (payload) {
        fullContent += payload;
        onChunk(payload);
      }
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

export async function callAgentApi(
  request: AgentApiRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<AgentApiResponse> {
  const response = await fetchAgent(request, signal);
  if (!response.ok) throw new Error(await readHttpError(response));

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json().catch(() => null);
    return parseJsonResponse(payload);
  }
  if (contentType.includes('text/event-stream')) {
    return readEventStream(response, onChunk, signal);
  }

  const content = await response.text();
  return requireContent({ content });
}
