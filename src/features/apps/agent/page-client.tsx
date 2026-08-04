'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AgentSuggestionCard as SuggestionCard } from './agent-api';
import { getAgentConnectionStatusLabel } from './chat-status';
import type { AgentConnectionStatus } from './chat-status';
import { copyText } from './clipboard';
import { renderBlockMarkdown } from './render-markdown';
import { ImageGenerator } from './image-generator';
import styles from './styles/Agent.module.css';
import { useAgentChat } from './use-agent-chat';
import { useChatScroll } from './use-chat-scroll';

function MarkdownContent({ content }: { content: string }) {
  return <div className={styles.md} dangerouslySetInnerHTML={{ __html: renderBlockMarkdown(content) }} />;
}

/* ---- Typewriter effect for streaming responses ---- */

function TypewriterContent({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [visibleCount, setVisibleCount] = useState(() => content.length);
  const rafRef = useRef<number | undefined>(undefined);
  const targetRef = useRef(content.length);
  const visibleRef = useRef(content.length);

  useEffect(() => {
    targetRef.current = content.length;

    if (!isStreaming) {
      visibleRef.current = content.length;
      setVisibleCount(content.length);
      return;
    }

    // Already fully visible — no animation needed
    if (visibleRef.current >= content.length) return;

    const tick = () => {
      const target = targetRef.current;
      const current = visibleRef.current;
      if (current >= target) return;

      const diff = target - current;
      // Ease-out: reveal faster at the start, slow down as we catch up
      const speed = Math.max(1, Math.ceil(diff * 0.15));
      visibleRef.current = Math.min(current + speed, target);
      setVisibleCount(visibleRef.current);

      if (visibleRef.current < target) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [content, isStreaming]);

  // When streaming stops, render full markdown HTML immediately
  if (!isStreaming) {
    return <MarkdownContent content={content} />;
  }

  // During streaming, reveal characters one-by-one with per-char CSS animation
  const visibleContent = content.slice(0, visibleCount);
  const chars = visibleContent.split('');

  return (
    <div className={styles.md}>
      {chars.map((char, i) => {
        if (char === '\n') {
          return <br key={i} />;
        }
        if (char === ' ') {
          // Use non-breaking space to preserve spacing in inline spans
          return (
            <span key={i} className={styles.char}>
              &nbsp;
            </span>
          );
        }
        return (
          <span key={i} className={styles.char}>
            {char}
          </span>
        );
      })}
    </div>
  );
}

/* ============================================
   Icon components (inline SVG, no dep)
   ============================================ */

function AgentIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SendIcon() {
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
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ErrorIcon() {
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

function NewConversationIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* ============================================
   Helpers
   ============================================ */

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
    <button type="button" onClick={handleClick} className={styles.messageActionBtn} title="复制" aria-label="复制消息">
      <CopyIcon />
    </button>
  );
}

function TypingIndicator({ message }: { message?: string }) {
  return (
    <div className={styles.typingIndicator} role="status" aria-label={message ?? '正在输入'}>
      <div className={styles.typingDots}>
        <span className={styles.typingDot} />
        <span className={styles.typingDot} />
        <span className={styles.typingDot} />
      </div>
      {message ? <span className={styles.typingLabel}>{message}</span> : null}
    </div>
  );
}

function SuggestionCards({ cards, onSelect }: { cards: SuggestionCard[]; onSelect: (payload: string) => void }) {
  return (
    <div className={styles.cards}>
      {cards.map((card) => (
        <button key={card.id} type="button" onClick={() => onSelect(card.payload)} className={styles.card}>
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
  const hasContent = content && content.length > 0;

  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.msgAvatar}`} aria-hidden="true">
        <AgentIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          {hasContent ? (
            <>
              <TypewriterContent content={content} isStreaming={isStreaming} />
              {isStreaming && <span className={styles.cursor} aria-hidden="true" />}
            </>
          ) : isStreaming ? (
            <span className={styles.cursor} aria-hidden="true" />
          ) : null}
        </div>
        {suggestionCards && !isStreaming && <SuggestionCards cards={suggestionCards} onSelect={onSuggestionSelect} />}
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

function AgentHeader({
  connectionStatus,
  showNewConversation,
  newConversationDisabled,
  onStartNewConversation,
}: {
  connectionStatus: AgentConnectionStatus;
  showNewConversation: boolean;
  newConversationDisabled: boolean;
  onStartNewConversation: () => void;
}) {
  const isConnected = connectionStatus === 'connected';
  const hasConnectionError = connectionStatus === 'error';

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.avatar} aria-hidden="true">
          <AgentIcon />
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerName}>AI助手</div>
          <div
            className={`${styles.headerStatus} ${isConnected ? styles.headerStatusConnected : ''} ${hasConnectionError ? styles.headerStatusError : ''}`}
          >
            <span
              className={`${styles.statusDot} ${isConnected ? styles.statusDotConnected : ''} ${hasConnectionError ? styles.statusDotError : ''}`}
              aria-hidden="true"
            />
            <span>{getAgentConnectionStatusLabel(connectionStatus)}</span>
          </div>
        </div>
      </div>
      <div className={styles.headerActions}>
        {showNewConversation ? (
          <button
            type="button"
            onClick={onStartNewConversation}
            className={styles.headerBtn}
            aria-label="开启新会话"
            disabled={newConversationDisabled}
          >
            <NewConversationIcon />
            <span>开启新会话</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AgentComposer({
  input,
  isStreaming,
  isRestoring,
  onInputChange,
  onSend,
  onStop,
}: {
  input: string;
  isStreaming: boolean;
  isRestoring: boolean;
  onInputChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!isStreaming && !isRestoring) void onSend(input);
  };

  return (
    <div className={styles.inputArea}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={`${styles.inputWrap} ${focused ? styles.inputWrapFocused : ''}`}
      >
        <textarea
          ref={inputRef}
          id={fieldId}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="输入消息..."
          rows={1}
          disabled={isStreaming || isRestoring}
          className={styles.input}
          aria-label="消息输入"
        />
        {isStreaming ? (
          <button type="button" onClick={onStop} className={styles.sendBtn} title="停止生成" aria-label="停止生成">
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || isRestoring}
            className={styles.sendBtn}
            title="发送"
            aria-label="发送消息"
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
        <span className={styles.inputDisclaimer}>AI 生成内容可能不准确</span>
      </div>
    </div>
  );
}

function NewConversationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className={styles.dialogOverlay} onMouseDown={onCancel}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="new-conversation-title" className={styles.dialogTitle}>
          开启新会话
        </h2>
        <p className={styles.dialogText}>开启新会话后会忘记当前所有对话记录</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogButton} onClick={onCancel}>
            取消
          </button>
          <button type="button" className={`${styles.dialogButton} ${styles.dialogButtonConfirm}`} onClick={onConfirm}>
            确认
          </button>
        </div>
      </section>
    </div>
  );
}

/* ============================================
   AgentChat — Main component
   ============================================ */

export default function AgentChat() {
  const [isNewConversationDialogOpen, setIsNewConversationDialogOpen] = useState(false);
  const {
    messages,
    input,
    isStreaming,
    error,
    connectionStatus,
    hasConversation,
    isRestoring,
    toolProgress,
    setInput,
    sendMessage,
    retryLast,
    stopStreaming,
    startNewConversation,
  } = useAgentChat();
  const { messagesEndRef, scrollContainerRef, showScrollButton, scrollToBottom } = useChatScroll(messages, isStreaming);
  const hasMessages = messages.length > 0;
  const confirmNewConversation = () => {
    startNewConversation();
    setIsNewConversationDialogOpen(false);
  };

  return (
    <div className={styles.shell}>
      <AgentHeader
        connectionStatus={connectionStatus}
        showNewConversation={hasConversation}
        newConversationDisabled={isStreaming || isRestoring}
        onStartNewConversation={() => setIsNewConversationDialogOpen(true)}
      />
      <ImageGenerator />

      <div className={styles.messagesArea}>
        <div className={styles.messages} ref={scrollContainerRef} role="log" aria-live="polite" aria-label="对话消息">
          {!hasMessages ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon} aria-hidden="true">
                <WelcomeIcon />
              </div>
              <div className={styles.welcomeTitle}>有什么可以帮你的？</div>
              <div className={styles.welcomeDesc}>输入你的问题</div>
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === 'user' ? (
              <UserMessageBubble key={message.id} content={message.content} timestamp={message.timestamp} />
            ) : message.content ? (
              <AssistantMessageBubble
                key={message.id}
                content={message.content}
                timestamp={message.timestamp}
                isStreaming={message.isStreaming ?? false}
                suggestionCards={message.suggestionCards}
                onSuggestionSelect={sendMessage}
              />
            ) : null,
          )}

          {isStreaming &&
          messages[messages.length - 1]?.role === 'assistant' &&
          !messages[messages.length - 1]?.content ? (
            <div className={`${styles.row} ${styles.rowAssistant}`}>
              <div className={styles.msgAvatar} aria-hidden="true">
                <AgentIcon />
              </div>
              <TypingIndicator message={toolProgress?.message} />
            </div>
          ) : null}

          {error ? <ErrorMessage error={error} onRetry={retryLast} /> : null}

          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {showScrollButton && !isStreaming ? (
          <button type="button" onClick={() => scrollToBottom()} className={styles.scrollBtn} aria-label="滚动到底部">
            <ChevronDownIcon />
            新消息
          </button>
        ) : null}
      </div>

      <AgentComposer
        input={input}
        isStreaming={isStreaming}
        isRestoring={isRestoring}
        onInputChange={setInput}
        onSend={sendMessage}
        onStop={stopStreaming}
      />
      {isNewConversationDialogOpen ? (
        <NewConversationDialog
          onCancel={() => setIsNewConversationDialogOpen(false)}
          onConfirm={confirmNewConversation}
        />
      ) : null}
    </div>
  );
}
