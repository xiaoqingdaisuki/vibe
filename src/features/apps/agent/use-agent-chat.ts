import { useCallback, useEffect, useRef, useState } from 'react';
import { callAgentApi } from './agent-api';
import type { AgentApiResponse, AgentMessageRole, AgentSuggestionCard } from './agent-api';
import type { AgentConnectionStatus } from './chat-status';

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
  setInput: (value: string) => void;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  retryLast: () => void;
  stopStreaming: () => void;
  clearChat: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useAgentChat(): AgentChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<AgentConnectionStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (text: string, { appendUser = true }: SendMessageOptions = {}) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current) return;

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
    const currentMessages = messagesRef.current;
    const historyMessages = (appendUser ? [...currentMessages, userMessage] : currentMessages).slice(-10);

    setMessages((current) =>
      appendUser ? [...current, userMessage, assistantMessage] : [...current, assistantMessage],
    );
    setInput('');
    setError(null);
    setIsStreaming(true);
    setConnectionStatus('connecting');

    let streamed = '';
    let lastSync = 0;
    const syncInterval = 50;
    const updateStreamed = (chunk: string) => {
      streamed += chunk;
      setConnectionStatus('connected');
      const now = performance.now();
      if (now - lastSync < syncInterval) return;

      lastSync = now;
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, content: streamed } : message)),
      );
    };

    try {
      const response: AgentApiResponse = await callAgentApi(
        {
          messages: historyMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        updateStreamed,
        controller.signal,
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
      }
    }
  }, []);

  const retryLast = useCallback(() => {
    setError(null);
    const lastUserMessage = messagesRef.current.findLast((message) => message.role === 'user');
    if (lastUserMessage) void sendMessage(lastUserMessage.content, { appendUser: false });
  }, [sendMessage]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((current) =>
      current.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message)),
    );
  }, []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return {
    messages,
    input,
    isStreaming,
    error,
    connectionStatus,
    setInput,
    sendMessage,
    retryLast,
    stopStreaming,
    clearChat,
  };
}
