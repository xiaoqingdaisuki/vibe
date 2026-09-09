'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  AgentDocumentAttachment,
  AgentImageAttachment,
  AgentSessionDocument,
  AgentSuggestionCard as SuggestionCard,
} from './agent-api';
import { getAgentConnectionStatusLabel } from './chat-status';
import type { AgentConnectionStatus } from './chat-status';
import { copyText } from './clipboard';
import { renderBlockMarkdown } from './render-markdown';
import { ImageGenerator } from './image-generator';
import styles from './styles/Agent.module.css';
import { useAgentChat } from './use-agent-chat';
import type { SendMessageOptions } from './use-agent-chat';
import { useChatScroll } from './use-chat-scroll';
import { getTypewriterAnimationDuration, shouldAnimateTypewriter } from './typewriter';

// 渲染markdown内容为HTML
function MarkdownContent({ content }: { content: string }) {
  return <div className={styles.md} dangerouslySetInnerHTML={{ __html: renderBlockMarkdown(content) }} />;
}

// 流式回复完成后保留全文，并播放不遮挡内容的光标动画
function TypewriterContent({
  content,
  isStreaming,
  isStreamingComplete,
}: {
  content: string;
  isStreaming: boolean;
  isStreamingComplete: boolean;
}) {
  const [completionAnimationFinished, setCompletionAnimationFinished] = useState(false);
  const shouldShowCompletionCursor =
    isStreamingComplete && shouldAnimateTypewriter(content.length) && !completionAnimationFinished;

  useEffect(() => {
    if (!isStreamingComplete || !shouldAnimateTypewriter(content.length)) return;

    const timer = window.setTimeout(
      () => setCompletionAnimationFinished(true),
      getTypewriterAnimationDuration(content.length),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [isStreamingComplete, content]);

  return (
    <>
      <MarkdownContent content={content} />
      {!isStreaming && shouldShowCompletionCursor ? <span className={styles.cursor} aria-hidden="true" /> : null}
    </>
  );
}

/* ============================================
   Icon components (inline SVG, no dep)
   ============================================ */

// 机器人头像图标
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

// 用户头像图标
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

// 复制按钮图标
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

// 复制成功勾选图标
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

// 发送按钮图标
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

// 停止生成按钮图标
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// 附件按钮图标
function AttachmentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l8-8" />
    </svg>
  );
}

// 欢迎页面图标
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

// 错误提示图标
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

// 重试按钮图标
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

// 新会话按钮图标
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

// 滚动到底部箭头图标
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

// 格式化时间戳为 HH:mm
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/* ============================================
   Components
   ============================================ */

// 带复制反馈的消息复制按钮，优先复制气泡中的选中文本
function CopyButton({ text, contentRef }: { text: string; contentRef: RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedTextRef = useRef('');

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // 在按钮获得焦点前保存当前消息气泡内的选区
  const captureSelectedText = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? '';
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    selectedTextRef.current = range && contentRef.current?.contains(range.commonAncestorContainer) ? selectedText : '';
  };

  // 复制选中文本或整条消息，并显示短暂反馈
  const handleClick = async () => {
    const ok = await copyText(selectedTextRef.current.trim() || text);
    selectedTextRef.current = '';
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
      onPointerDown={captureSelectedText}
      onClick={handleClick}
      className={styles.messageActionBtn}
      title="复制"
      aria-label="复制消息"
    >
      <CopyIcon />
    </button>
  );
}

// AI正在输入的跳动点提示
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

// 渲染建议操作卡片列表
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

// 渲染用户消息气泡，右对齐显示
function UserMessageBubble({ content, timestamp }: { content: string; timestamp: number }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`${styles.row} ${styles.rowUser}`}>
      <div className={`${styles.msgAvatar} ${styles.msgAvatarUser}`} aria-hidden="true">
        <UserIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div ref={contentRef} className={`${styles.bubble} ${styles.bubbleUser}`}>
          {content}
        </div>
        <div className={`${styles.meta} ${styles.metaUser}`}>
          <CopyButton text={content} contentRef={contentRef} />
          <span className={styles.time}>{formatTime(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

// 渲染助手回复消息气泡，含打字机动画
function AssistantMessageBubble({
  content,
  timestamp,
  isStreaming,
  suggestionCards,
  onSuggestionSelect,
  isStreamingComplete,
}: {
  content: string;
  timestamp: number;
  isStreaming: boolean;
  suggestionCards?: SuggestionCard[];
  onSuggestionSelect: (payload: string) => void;
  isStreamingComplete: boolean;
}) {
  const hasContent = content && content.length > 0;
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.msgAvatar}`} aria-hidden="true">
        <AgentIcon />
      </div>
      <div className={styles.bubbleWrap}>
        <div ref={contentRef} className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          {hasContent ? (
            <>
              <TypewriterContent
                content={content}
                isStreaming={isStreaming}
                isStreamingComplete={isStreamingComplete}
              />
              {isStreaming && <span className={styles.cursor} aria-hidden="true" />}
            </>
          ) : isStreaming ? (
            <span className={styles.cursor} aria-hidden="true" />
          ) : null}
        </div>
        {suggestionCards && !isStreaming && <SuggestionCards cards={suggestionCards} onSelect={onSuggestionSelect} />}
        {content && (
          <div className={styles.meta}>
            <CopyButton text={content} contentRef={contentRef} />
            <span className={styles.time}>{formatTime(timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 渲染错误消息及重试按钮
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

// 聊天窗口顶部栏，显示连接状态和新会话按钮
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

interface ComposerAttachments {
  documents: AgentSessionDocument[];
  files: AgentDocumentAttachment[];
  images: AgentImageAttachment[];
}

// 计算图片内容指纹，避免重复图片触发重复模型输入。
async function getImageFingerprint(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
}

// 在浏览器内解析文本附件，文档正文只保存在当前页面状态中。
async function parseLocalSessionDocument(file: File): Promise<AgentSessionDocument> {
  if (file.size > 2_500_000) throw new Error(`${file.name} 超过 2.5MB 临时文档限制`);
  const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error(`${file.name} 内容为空`);
  if (new TextEncoder().encode(text).byteLength > 1_000_000) {
    throw new Error(`${file.name} 正文超过 1MB 临时文档限制`);
  }
  const parts = text
    .split(/\n\s*\n/)
    .map((content) => content.trim())
    .filter(Boolean)
    .map((content, partIndex) => ({ partIndex, page: 1, content: content.slice(0, 20_000) }));
  return {
    localId: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type || 'text/plain',
    size: file.size,
    parserVersion: 'browser-session-text-v1',
    parts: parts.length > 0 ? parts : [{ partIndex: 0, page: 1, content: text.slice(0, 20_000) }],
  };
}

// 底部消息输入区域，支持附件、发送和停止生成
function AgentComposer({
  input,
  isStreaming,
  isRestoring,
  attachments,
  onInputChange,
  onSend,
  onStop,
  onPickFiles,
  onRemoveDocument,
  onRemoveFile,
  onRemoveImage,
}: {
  input: string;
  isStreaming: boolean;
  isRestoring: boolean;
  attachments: ComposerAttachments;
  onInputChange: (value: string) => void;
  onSend: (value: string, options?: SendMessageOptions) => void;
  onStop: () => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveDocument: (localId: string) => void;
  onRemoveFile: (file: AgentDocumentAttachment) => void;
  onRemoveImage: (image: AgentImageAttachment) => void;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (!isStreaming && !isRestoring) {
      void onSend(input, {
        sessionDocuments: attachments.documents,
        files: attachments.files,
        images: attachments.images,
      });
    }
  };

  const hasAttachments =
    attachments.documents.length > 0 || attachments.files.length > 0 || attachments.images.length > 0;

  return (
    <div className={styles.inputArea}>
      {hasAttachments ? (
        <div className={styles.attachmentList} aria-label="待发送附件">
          {attachments.documents.map((document) => (
            <button
              key={document.localId}
              type="button"
              className={styles.attachmentChip}
              onClick={() => onRemoveDocument(document.localId)}
              title="移除文档"
            >
              <span className={styles.attachmentChipName}>{document.filename}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {attachments.files.map((file, index) => (
            <button
              key={`${file.filename}-${index}`}
              type="button"
              className={styles.attachmentChip}
              onClick={() => onRemoveFile(file)}
              title="移除文档"
            >
              <span className={styles.attachmentChipName}>{file.filename}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {attachments.images.map((image, index) => (
            <button
              key={image.fingerprint || `${image.filename}-${index}`}
              type="button"
              className={styles.attachmentChip}
              onClick={() => onRemoveImage(image)}
              title="移除图片"
            >
              <span className={styles.attachmentChipName}>{image.filename}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={`${styles.inputWrap} ${focused ? styles.inputWrapFocused : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.json,.csv,.pdf,.docx,image/*"
          multiple
          className={styles.fileInput}
          onChange={(event) => {
            onPickFiles(event.target.files);
            event.currentTarget.value = '';
          }}
          aria-label="上传文件或图片"
        />
        <button
          type="button"
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || isRestoring}
          title="上传文件或图片"
          aria-label="上传文件或图片"
        >
          <AttachmentIcon />
          <span className={styles.attachBtnLabel}>添加照片和文件</span>
        </button>
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
            disabled={(!input.trim() && !hasAttachments) || isRestoring}
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

// 开启新会话的确认弹窗，Esc关闭
function NewConversationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<boolean> }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // 删除成功后关闭弹窗，失败时保留会话并允许重试
  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (await onConfirm()) onCancel();
      else setDeleteError('旧会话删除失败，当前记录仍已保留，请稍后重试。');
    } finally {
      setIsDeleting(false);
    }
  };

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
        {deleteError ? <p className={styles.dialogText}>{deleteError}</p> : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogButton} onClick={onCancel} disabled={isDeleting}>
            取消
          </button>
          <button
            type="button"
            className={`${styles.dialogButton} ${styles.dialogButtonConfirm}`}
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? '删除中…' : '确认'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ============================================
   AgentChat — Main component
   ============================================ */

// Agent聊天主组件，组装所有子组件并管理聊天状态
export default function AgentChat() {
  const [isNewConversationDialogOpen, setIsNewConversationDialogOpen] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachments>({ documents: [], files: [], images: [] });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const {
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
  } = useAgentChat();
  const { messagesEndRef, scrollContainerRef, showScrollButton, scrollToBottom } = useChatScroll(messages, isStreaming);
  const hasMessages = messages.length > 0;

  // 将本地文件转换为临时文档、原始 PDF/DOCX 或图片附件。
  const handlePickFiles = (files: FileList | null) => {
    if (!files) return;
    void (async () => {
      try {
        const documents: AgentSessionDocument[] = [];
        const rawFiles: AgentDocumentAttachment[] = [];
        const images: AgentImageAttachment[] = [];
        const imageFingerprints = new Set<string>();
        for (const file of Array.from(files).slice(0, 6)) {
          const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
          if (isImage) {
            const fingerprint = await getImageFingerprint(file);
            if (imageFingerprints.has(fingerprint)) continue;
            imageFingerprints.add(fingerprint);
            images.push({ filename: file.name, blob: file, mimeType: file.type || 'image/*', fingerprint });
          } else if (/\.(pdf|docx)$/i.test(file.name)) {
            if (file.size > 2_500_000) throw new Error(`${file.name} 超过 2.5MB 临时文档限制`);
            rawFiles.push({
              filename: file.name,
              blob: file,
              mimeType:
                file.type ||
                (file.name.toLowerCase().endsWith('.pdf')
                  ? 'application/pdf'
                  : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            });
          } else {
            documents.push(await parseLocalSessionDocument(file));
          }
        }
        setAttachments((current) => {
          const existingImageFingerprints = new Set(
            current.images
              .map((image) => image.fingerprint)
              .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
          );
          const uniqueImages = images.filter(
            (image) => !image.fingerprint || !existingImageFingerprints.has(image.fingerprint),
          );
          return {
            documents: [...current.documents, ...documents].slice(0, 10),
            files: [...current.files, ...rawFiles].slice(0, 10),
            images: [...current.images, ...uniqueImages].slice(0, 4),
          };
        });
        setAttachmentError(null);
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : '附件读取失败，请重试');
      }
    })();
  };

  // 发送当前输入和附件；关闭记忆时保留附件供同一会话后续追问继续参考。
  const handleSend = (text: string, options?: SendMessageOptions) => {
    if (memoryEnabled === true) {
      setAttachments((current) => ({ ...current, documents: [], files: [] }));
    }
    setAttachmentError(null);
    void sendMessage(text, options);
  };

  // 开启新会话时清理上一会话中的临时附件。
  const handleStartNewConversation = async (): Promise<boolean> => {
    const succeeded = await startNewConversation();
    if (succeeded) setAttachments({ documents: [], files: [], images: [] });
    return succeeded;
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
                isStreamingComplete={streamingCompleteIds.has(message.id)}
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

          {error ? (
            <ErrorMessage
              error={error}
              onRetry={() =>
                retryLast({
                  sessionDocuments: attachments.documents,
                  files: attachments.files,
                  images: attachments.images,
                })
              }
            />
          ) : null}
          {attachmentError ? <div className={styles.attachmentError}>{attachmentError}</div> : null}

          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {showScrollButton ? (
          <button type="button" onClick={() => scrollToBottom()} className={styles.scrollBtn} aria-label="滚动到底部">
            <ChevronDownIcon />
            最新消息
          </button>
        ) : null}
      </div>

      <AgentComposer
        input={input}
        isStreaming={isStreaming}
        isRestoring={isRestoring}
        attachments={attachments}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={stopStreaming}
        onPickFiles={handlePickFiles}
        onRemoveDocument={(localId) =>
          setAttachments((current) => ({
            ...current,
            documents: current.documents.filter((item) => item.localId !== localId),
          }))
        }
        onRemoveFile={(file) =>
          setAttachments((current) => ({ ...current, files: current.files.filter((item) => item !== file) }))
        }
        onRemoveImage={(image) =>
          setAttachments((current) => ({ ...current, images: current.images.filter((item) => item !== image) }))
        }
      />
      {isNewConversationDialogOpen ? (
        <NewConversationDialog
          onCancel={() => setIsNewConversationDialogOpen(false)}
          onConfirm={handleStartNewConversation}
        />
      ) : null}
    </div>
  );
}
