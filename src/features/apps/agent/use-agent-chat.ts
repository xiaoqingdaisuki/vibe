import { useCallback, useEffect, useRef, useState } from 'react';
import { callAgentApi, createAgentConversation, getAgentConversationMessages } from './agent-api';
import type { AgentApiResponse, AgentMessageRole, AgentSuggestionCard, AgentToolProgress } from './agent-api';
import type { AgentConnectionStatus } from './chat-status';
import { clearStoredConversationId, readStoredConversationId, writeStoredConversationId } from './conversation-storage';

export interface ChatMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  suggestionCards?: AgentSuggestionCard[];
}

interface SendMessageOptions {
  appendUser?: boolean;
}

interface AgentChatState {
  messages: ChatMessage[];
  input: string;
  isStreaming: boolean;
  error: string | null;
  connectionStatus: AgentConnectionStatus;
  hasConversation: boolean;
  isRestoring: boolean;
  toolProgress: AgentToolProgress | null;
  streamingCompleteIds: Set<string>;
  setInput: (value: string) => void;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  retryLast: () => void;
  stopStreaming: () => void;
  startNewConversation: () => void;
}

// 生成唯一消息ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 判断是否为请求中止错误
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// 安全获取浏览器localStorage
function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// 将API返回的消息转换为内部ChatMessage格式
function toChatMessage(message: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}): ChatMessage {
  const timestamp = Date.parse(message.createdAt);
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
  };
}

// 管理聊天核心状态：消息列表、发送、流式输出、重试、会话恢复
export function useAgentChat(): AgentChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<AgentConnectionStatus>('idle');
  const [hasConversation, setHasConversation] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [toolProgress, setToolProgress] = useState<AgentToolProgress | null>(null);
  const [streamingCompleteIds, setStreamingCompleteIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const isRestoringRef = useRef(true);
  const streamingCompleteIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 组件卸载时中止进行中的请求
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 页面加载时从localStorage恢复历史会话
  useEffect(() => {
    let cancelled = false;
    const storage = getBrowserStorage();
    const conversationId = storage ? readStoredConversationId(storage) : null;

    const completeRestore = () => {
      if (cancelled) return;
      isRestoringRef.current = false;
      setIsRestoring(false);
    };

    if (!conversationId) {
      completeRestore();
      return () => {
        cancelled = true;
      };
    }

    conversationIdRef.current = conversationId;
    void getAgentConversationMessages(conversationId)
      .then((restoredMessages) => {
        if (cancelled) return;
        const messages = restoredMessages.map(toChatMessage);
        messagesRef.current = messages;
        setMessages(messages);
        setHasConversation(true);
        setConnectionStatus('connected');
      })
      .catch((restoreError: unknown) => {
        if (cancelled || isAbortError(restoreError)) return;
        // 会话恢复失败：静默开启新会话，不展示错误
        conversationIdRef.current = null;
        const storage = getBrowserStorage();
        if (storage) clearStoredConversationId(storage);
        messagesRef.current = [];
        streamingCompleteIdsRef.current = new Set();
        setMessages([]);
        setStreamingCompleteIds(new Set());
        setInput('');
        setError(null);
        setConnectionStatus('idle');
        setHasConversation(false);
        setToolProgress(null);
      })
      .finally(completeRestore);

    return () => {
      cancelled = true;
    };
  }, []);

  // 发送消息并处理流式响应
  const sendMessage = useCallback(async (text: string, { appendUser = true }: SendMessageOptions = {}) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current || isRestoringRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((current) =>
      appendUser ? [...current, userMessage, assistantMessage] : [...current, assistantMessage],
    );
    setInput('');
    setError(null);
    setToolProgress(null);
    setIsStreaming(true);
    setConnectionStatus('connecting');

    let streamed = '';
    let lastSync = 0;
    const syncInterval = 50;
    const updateStreamed = (chunk: string) => {
      streamed += chunk;
      setConnectionStatus('connected');
      const now = performance.now();
      setToolProgress(null);
      if (now - lastSync < syncInterval) return;

      lastSync = now;
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, content: streamed } : message)),
      );
    };

    try {
      let conversationId = conversationIdRef.current;
      if (!conversationId) {
        conversationId = await createAgentConversation(trimmed, controller.signal);
        conversationIdRef.current = conversationId;
        const storage = getBrowserStorage();
        if (storage) writeStoredConversationId(storage, conversationId);
        setHasConversation(true);
      }
      const response: AgentApiResponse = await callAgentApi(
        {
          conversationId,
          content: trimmed,
        },
        updateStreamed,
        controller.signal,
        setToolProgress,
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: response.content,
                isStreaming: false,
                suggestionCards: response.suggestionCards,
              }
            : message,
        ),
      );
      setConnectionStatus('connected');
      streamingCompleteIdsRef.current.add(assistantId);
      setStreamingCompleteIds((prev) => new Set([...prev, assistantId]));
    } catch (requestError) {
      if (isAbortError(requestError)) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: streamed, isStreaming: false } : message,
          ),
        );
        setConnectionStatus(streamed ? 'connected' : 'idle');
      } else {
        const message = requestError instanceof Error ? requestError.message : '请求失败，请稍后重试';
        setError(message);
        setMessages((current) => current.filter((item) => item.id !== assistantId));
        setConnectionStatus('error');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsStreaming(false);
        setToolProgress(null);
      }
    }
  }, []);

  // 重试最后一条用户消息
  const retryLast = useCallback(() => {
    setError(null);
    const lastUserMessage = messagesRef.current.findLast((message) => message.role === 'user');
    if (lastUserMessage) void sendMessage(lastUserMessage.content, { appendUser: false });
  }, [sendMessage]);

  // 中止当前流式生成
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((current) =>
      current.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message)),
    );
  }, []);

  // 开启新会话，清空所有状态
  const startNewConversation = useCallback(() => {
    if (abortRef.current) return;
    conversationIdRef.current = null;
    const storage = getBrowserStorage();
    if (storage) clearStoredConversationId(storage);
    messagesRef.current = [];
    streamingCompleteIdsRef.current = new Set();
    setMessages([]);
    setStreamingCompleteIds(new Set());
    setInput('');
    setError(null);
    setConnectionStatus('idle');
    setHasConversation(false);
    setToolProgress(null);
  }, []);

  return {
    messages,
    input,
    isStreaming,
    error,
    connectionStatus,
    hasConversation,
    isRestoring,
    toolProgress,
    streamingCompleteIds,
    setInput,
    sendMessage,
    retryLast,
    stopStreaming,
    startNewConversation,
  };
}
