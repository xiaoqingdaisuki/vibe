'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { callAgentApi } from './agent-api';
import type { AgentApiResponse as ApiResponse, AgentSuggestionCard as SuggestionCard } from './agent-api';
import { copyText } from './clipboard';
import { renderBlockMarkdown } from './render-markdown';
import styles from './styles/Agent.module.css';

/* ============================================
   Types
   ============================================ */

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  suggestionCards?: SuggestionCard[];
}

function MarkdownContent({ content }: { content: string }) {
  return <span className={styles.md} dangerouslySetInnerHTML={{ __html: renderBlockMarkdown(content) }} />;
}

/* ============================================
   Icon components (inline SVG, no dep)
   ============================================ */

function AgentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="3" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <rect x="10" y="3" width="4" height="5" rx="2" />
      <path d="M12 3V1" />
      <path d="M8 8h8" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function WelcomeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 11a8 8 0 1 0 2 5.3" />
      <polyline points="20 4 20 11 13 11" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/* ============================================
   Helpers
   ============================================ */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/* ============================================
   Components
   ============================================ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleClick = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  return copied ? (
    <span className={styles.messageActionStatus} title="已复制" aria-label="已复制">
      <CheckIcon />
    </span>
  ) : (
    <button
      type="button"
      onClick={handleClick}
      className={styles.messageActionBtn}
      title="复制"
      aria-label="复制消息"
    >
      <CopyIcon />
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className={styles.typingIndicator} role="status" aria-label="正在输入">
      <div className={styles.typingDots}>
        <span className={styles.typingDot} />
        <span className={styles.typingDot} />
        <span className={styles.typingDot} />
      </div>
    </div>
  );
}

function SuggestionCards({ cards, onSelect }: { cards: SuggestionCard[]; onSelect: (payload: string) => void }) {
  return (
    <div className={styles.cards}>
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(card.payload)}
          className={styles.card}
        >
          <div className={styles.cardTitle}>{card.title}</div>
          <div className={styles.cardDesc}>{card.description}</div>
        </button>
      ))}
    </div>
  );
}

function UserMessageBubble({ content, timestamp }: { content: string; timestamp: number }) {
  return (
    <div className={`${styles.row} ${styles.rowUser}`}>
      <div className={`${styles.msgAvatar} ${styles.msgAvatarUser}`} aria-hidden="true">
        <UserIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div className={`${styles.bubble} ${styles.bubbleUser}`}>{content}</div>
        <div className={`${styles.meta} ${styles.metaUser}`}>
          <CopyButton text={content} />
          <span className={styles.time}>{formatTime(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

function AssistantMessageBubble({
  content,
  timestamp,
  isStreaming,
  suggestionCards,
  onSuggestionSelect,
}: {
  content: string;
  timestamp: number;
  isStreaming: boolean;
  suggestionCards?: SuggestionCard[];
  onSuggestionSelect: (payload: string) => void;
}) {
  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.msgAvatar}`} aria-hidden="true">
        <AgentIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          {content ? (
            <>
              <MarkdownContent content={content} />
              {isStreaming && <span className={styles.cursor} aria-hidden="true" />}
            </>
          ) : isStreaming ? (
            <span className={styles.cursor} aria-hidden="true" />
          ) : null}
        </div>
        {suggestionCards && !isStreaming && (
          <SuggestionCards cards={suggestionCards} onSelect={onSuggestionSelect} />
        )}
        {content && (
          <div className={`${styles.meta}`}>
            <CopyButton text={content} />
            <span className={styles.time}>{formatTime(timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.msgAvatar}`} aria-hidden="true">
        <AgentIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div className={styles.errorBubble}>
          <span className={styles.errorIcon} aria-hidden="true">
            <ErrorIcon />
          </span>
          <div>{error}</div>
        </div>
        <div className={styles.meta}>
          <button
            type="button"
            onClick={onRetry}
            className={styles.messageActionBtn}
            title="重试"
            aria-label="重试请求"
          >
            <RetryIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   AgentChat — Main component
   ============================================ */

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  /* ---- Auto-scroll ---- */

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      setShowScrollBtn(!checkNearBottom());
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    // Set initial state
    handleScroll();

    return () => el.removeEventListener('scroll', handleScroll);
  }, [checkNearBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    // During streaming: always follow; when idle: only if near bottom
    if (isStreaming || checkNearBottom()) {
      scrollToBottom(isStreaming ? 'auto' : 'smooth');
    }
  }, [messages, isStreaming, scrollToBottom, checkNearBottom]);

  /* ---- Send message ---- */

  const sendMessage = useCallback(
    async (text: string, { appendUser = true }: { appendUser?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const assistantId = generateId();
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => (appendUser ? [...prev, userMsg, assistantMsg] : [...prev, assistantMsg]));
      setInput('');
      setError(null);
      setIsStreaming(true);

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      // Build context: last 10 messages for API
      const historyMessages = (appendUser ? [...messages, userMsg] : messages).slice(-10);

      // Accumulate streamed text in a ref; throttle React re-renders to ~20fps.
      // This prevents layout thrashing (checkNearBottom reads the DOM on every
      // render) which caused cascading renders, memory spikes, and eventual crash.
      let streamed = '';
      let lastSync = 0;
      const SYNC_INTERVAL = 50; // ms between React re-renders during streaming
      const updateStreamed = (chunk: string) => {
        streamed += chunk;
        const now = performance.now();
        if (now - lastSync >= SYNC_INTERVAL) {
          lastSync = now;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m)),
          );
        }
      };

      try {
        const response: ApiResponse = await callAgentApi(
          {
            messages: historyMessages.map((m) => ({ role: m.role, content: m.content })),
          },
          updateStreamed,
          controller.signal,
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: response.content,
                  isStreaming: false,
                  suggestionCards: response.suggestionCards,
                }
              : m,
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User intentionally stopped — finalize with whatever we have
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamed, isStreaming: false } : m,
            ),
          );
        } else {
          const message = err instanceof Error ? err.message : '请求失败，请稍后重试';
          setError(message);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [messages],
  );

  const retryLast = useCallback(() => {
    setError(null);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) sendMessage(lastUser.content, { appendUser: false });
  }, [messages, sendMessage]);

  const stopStreaming = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

  const handleSubmit = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  /* ---- Clear chat ---- */

  const clearChat = useCallback(() => {
    if (isStreaming) stopStreaming();
    setMessages([]);
    setError(null);
  }, [isStreaming, stopStreaming]);

  /* ---- Input auto-resize ---- */

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  /* ---- Focus input on mount ---- */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* ---- Derived ---- */

  const hasMessages = messages.length > 0;

  return (
    <div className={styles.shell}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar} aria-hidden="true">
            <AgentIcon />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.headerName}>Agent</div>
            <div className={styles.headerStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>在线</span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          {hasMessages && (
            <button
              type="button"
              onClick={clearChat}
              className={styles.headerBtn}
              title="清空对话"
              aria-label="Clear conversation"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className={styles.messages} ref={scrollContainerRef} role="log" aria-live="polite" aria-label="对话消息">
        {!hasMessages && (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon} aria-hidden="true">
              <WelcomeIcon />
            </div>
            <div className={styles.welcomeTitle}>有什么可以帮你的？</div>
            <div className={styles.welcomeDesc}>
              输入你的问题
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserMessageBubble key={msg.id} content={msg.content} timestamp={msg.timestamp} />
          ) : msg.content ? (
            <AssistantMessageBubble
              key={msg.id}
              content={msg.content}
              timestamp={msg.timestamp}
              isStreaming={msg.isStreaming ?? false}
              suggestionCards={msg.suggestionCards}
              onSuggestionSelect={sendMessage}
            />
          ) : null,
        )}

        {isStreaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
          <div className={`${styles.row} ${styles.rowAssistant}`}>
            <div className={`${styles.msgAvatar}`} aria-hidden="true">
              <AgentIcon />
            </div>
            <TypingIndicator />
          </div>
        )}

        {error && <ErrorMessage error={error} onRetry={retryLast} />}

        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && !isStreaming && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className={styles.scrollBtn}
          aria-label="滚动到底部"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          新消息
        </button>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className={`${styles.inputWrap} ${focused ? styles.inputWrapFocused : ''}`}
        >
          <textarea
            ref={inputRef}
            id={fieldId}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="输入消息..."
            rows={1}
            disabled={isStreaming}
            className={styles.input}
            aria-label="消息输入"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className={styles.sendBtn}
              title="停止生成"
              aria-label="Stop generating"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className={styles.sendBtn}
              title="发送"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          )}
        </form>
        <div className={styles.inputHint}>
          <div className={styles.hintKeys}>
            <span className={styles.hintKey}>Enter</span> 发送
            <span className={styles.hintKey}>Shift + Enter</span> 换行
          </div>
          <span>AI 生成内容可能不准确</span>
        </div>
      </div>
    </div>
  );
}
