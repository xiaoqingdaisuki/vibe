/** AI 助手：消息发送、会话恢复与流式状态管理 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  callAgentApi,
  createAgentConversation,
  deleteAgentConversation,
  getAgentCapabilities,
  getAgentConversationMessages,
  shouldDiscardStoredConversation,
} from './agent-api';
import type {
  AgentApiResponse,
  AgentDocumentAttachment,
  AgentImageAttachment,
  AgentMessageRole,
  AgentSessionDocument,
  AgentSuggestionCard,
  AgentToolProgress,
} from './agent-api';
import type { AgentConnectionStatus } from './chat-status';
import {
  clearStoredConversationId,
  getOrCreateStoredAgentUserId,
  readStoredConversationId,
  writeStoredConversationId,
} from './conversation-storage';
import {
  createStreamingTextPresenter,
  TEXT_RENDER_INTERVAL_MS,
  TEXT_RENDER_MAX_CHARS_PER_TICK,
} from './stream-rendering';

export interface ChatMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  suggestionCards?: AgentSuggestionCard[];
  toolCalls?: AgentToolProgress[];
}

export interface SendMessageOptions {
  appendUser?: boolean;
  sessionDocuments?: AgentSessionDocument[];
  documentAttachmentIds?: string[];
  images?: AgentImageAttachment[];
  files?: AgentDocumentAttachment[];
}

interface AgentChatState {
  messages: ChatMessage[];
  input: string;
  isStreaming: boolean;
  error: string | null;
  connectionStatus: AgentConnectionStatus;
  hasConversation: boolean;
  isRestoring: boolean;
  memoryEnabled: boolean | null;
  toolProgress: AgentToolProgress | null;
  streamingCompleteIds: Set<string>;
  setInput: (value: string) => void;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  retryLast: (options?: SendMessageOptions) => void;
  stopStreaming: () => void;
  startNewConversation: () => Promise<boolean>;
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
  const [memoryEnabled, setMemoryEnabled] = useState<boolean | null>(null);
  const [toolProgress, setToolProgress] = useState<AgentToolProgress | null>(null);
  const [streamingCompleteIds, setStreamingCompleteIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const isRestoringRef = useRef(true);
  const streamingCompleteIdsRef = useRef<Set<string>>(new Set());

  // 同步最新消息引用，供异步发送流程读取
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
    const userId = storage
      ? getOrCreateStoredAgentUserId(storage, () => crypto.randomUUID())
      : `web_${crypto.randomUUID().replace(/-/g, '')}`;
    userIdRef.current = userId;
    void getAgentCapabilities(userId)
      .then((capabilities) => {
        if (!cancelled) setMemoryEnabled(capabilities.memory_enabled);
      })
      .catch(() => {
        // 能力探测失败时保留附件，避免误把临时会话内容丢掉
      });
    const conversationId = storage ? readStoredConversationId(storage, userId) : null;

    // 仅在恢复任务仍有效时结束会话恢复状态
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
    void getAgentConversationMessages(conversationId, userId)
      .then(
        // 恢复成功后同步历史消息与连接状态，忽略已取消的任务
        (restoredMessages) => {
          if (cancelled) return;
          const messages = restoredMessages.map(toChatMessage);
          messagesRef.current = messages;
          setMessages(messages);
          setHasConversation(true);
          setConnectionStatus('connected');
        },
      )
      .catch(
        // 区分会话失效与临时故障，决定清理引用或保留恢复入口
        (restoreError: unknown) => {
          if (cancelled || isAbortError(restoreError)) return;
          if (shouldDiscardStoredConversation(restoreError)) {
            // 仅在服务端确认会话不存在时清理失效的本地引用
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
            return;
          }

          // 临时网络或服务错误保留会话标识，刷新页面后仍可重试恢复
          const message = restoreError instanceof Error ? restoreError.message : '会话历史恢复失败，请稍后刷新重试';
          setError(message);
          setConnectionStatus('error');
          setHasConversation(true);
        },
      )
      .finally(completeRestore);

    return () => {
      cancelled = true;
    };
  }, []);

  // 发送消息并处理流式响应
  const sendMessage = useCallback(
    async (
      text: string,
      { appendUser = true, sessionDocuments, documentAttachmentIds, images, files }: SendMessageOptions = {},
    ) => {
      const trimmed = text.trim();
      const hasAttachments = Boolean(
        sessionDocuments?.length || documentAttachmentIds?.length || images?.length || files?.length,
      );
      if ((!trimmed && !hasAttachments) || abortRef.current || isRestoringRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed || '已上传附件，请分析这些内容',
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
      // 跟随绘制帧推进文本，每帧最多50字符并保持原有平均输出速度
      const textPresenter = createStreamingTextPresenter({
        intervalMs: TEXT_RENDER_INTERVAL_MS,
        maxCharsPerTick: TEXT_RENDER_MAX_CHARS_PER_TICK,
        // 将分帧输出的文本合并到对应的助手消息
        publish: (content) => {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, content } : message)),
          );
        },
      });
      controller.signal.addEventListener('abort', textPresenter.cancel, { once: true });

      // SSE接收只更新显示目标，不等待React渲染完成
      const updateStreamed = (chunk: string) => {
        streamed += chunk;
        setConnectionStatus('connected');
        setToolProgress(null);
        textPresenter.append(chunk);
      };

      // 工具状态及整段输出即时更新到独立区域，保留此前已收到的结果
      const updateToolProgress = (progress: AgentToolProgress) => {
        setConnectionStatus('connected');
        setToolProgress(progress);
        setMessages((current) =>
          current.map(
            // 按调用标识合并当前助手消息中的工具执行进度
            (message) => {
              if (message.id !== assistantId) return message;
              const calls = message.toolCalls || [];
              const index = calls.findIndex(
                (call) => (call.callId || call.toolName) === (progress.callId || progress.toolName),
              );
              const toolCalls =
                index < 0
                  ? [...calls, progress]
                  : calls.map((call, callIndex) => (callIndex === index ? { ...call, ...progress } : call));
              return { ...message, toolCalls };
            },
          ),
        );
      };

      try {
        let conversationId = conversationIdRef.current;
        const userId = userIdRef.current;
        if (!userId) throw new Error('用户会话初始化失败，请刷新页面后重试');
        if (!conversationId) {
          conversationId = await createAgentConversation(trimmed || '附件分析', userId, controller.signal);
          conversationIdRef.current = conversationId;
          const storage = getBrowserStorage();
          if (storage) writeStoredConversationId(storage, userId, conversationId);
          setHasConversation(true);
        }
        const response: AgentApiResponse = await callAgentApi(
          {
            conversationId,
            content: trimmed,
            userId,
            sessionDocuments,
            documentAttachmentIds,
            images,
            files,
          },
          updateStreamed,
          controller.signal,
          updateToolProgress,
        );

        const completeContent = response.content || streamed;
        if (completeContent !== streamed) {
          streamed = completeContent;
          textPresenter.push(completeContent);
        }
        await textPresenter.drain();
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: completeContent,
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
        const visibleContent = textPresenter.current();
        textPresenter.cancel();
        if (isAbortError(requestError)) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: visibleContent, isStreaming: false } : message,
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
        textPresenter.cancel();
        controller.signal.removeEventListener('abort', textPresenter.cancel);
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsStreaming(false);
          setToolProgress(null);
        }
      }
    },
    [],
  );

  // 重试最后一条用户消息
  const retryLast = useCallback(
    (options: SendMessageOptions = {}) => {
      setError(null);
      const lastUserMessage = messagesRef.current.findLast((message) => message.role === 'user');
      if (lastUserMessage) void sendMessage(lastUserMessage.content, { appendUser: false, ...options });
    },
    [sendMessage],
  );

  // 中止当前流式生成
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((current) =>
      current.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message)),
    );
  }, []);

  // 删除服务端旧会话后再清空本地状态
  const startNewConversation = useCallback(async (): Promise<boolean> => {
    if (abortRef.current) return false;
    const conversationId = conversationIdRef.current;
    const userId = userIdRef.current;
    if (conversationId) {
      if (!userId) {
        setError('用户会话初始化失败，请刷新页面后重试');
        return false;
      }
      try {
        await deleteAgentConversation(conversationId, userId);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : '旧会话删除失败，请稍后重试');
        setConnectionStatus('error');
        return false;
      }
    }

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
    return true;
  }, []);

  return {
    messages,
    input,
    isStreaming,
    error,
    connectionStatus,
    hasConversation,
    isRestoring,
    memoryEnabled,
    toolProgress,
    streamingCompleteIds,
    setInput,
    sendMessage,
    retryLast,
    stopStreaming,
    startNewConversation,
  };
}
