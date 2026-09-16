'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/base/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { getNotesSnapshot, getServerNotesSnapshot, MAX_NOTE_CONTENT_LENGTH, setNotes, subscribeNotes } from './storage';
import { parseNoteContent, type NoteContentBlock } from './content-parser';
import type { NoteEntry } from './types';
import styles from './styles/Note.module.css';

type EditorState = { id: string | null; content: string };

interface NoteComposerProps {
  initial: EditorState;
  onSubmit: (values: { content: string }) => void;
  onCancel: () => void;
}

interface CodeBlockProps {
  block: Extract<NoteContentBlock, { type: 'code' }>;
  copied: boolean;
  onCopy: () => void;
}

interface NoteCardProps {
  note: NoteEntry;
  copiedBlockKey: string | null;
  onCopy: (noteId: string, blockIndex: number, content: string) => void;
  onEdit: (note: NoteEntry) => void;
  onDelete: (id: string) => void;
}

// 复制按钮图标，统一速记本中的复制操作视觉
function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </svg>
  );
}

// 已复制图标，明确反馈当前内容已经进入剪贴板
function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.5l4 4L19 7" />
    </svg>
  );
}

// 编辑按钮图标
function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

// 删除按钮图标
function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

// 渲染独立代码块，并把复制动作限制在当前代码内容内
function CodeBlock({ block, copied, onCopy }: CodeBlockProps) {
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeRow}>
        <pre className={styles.code}>
          <code translate="no">{block.content}</code>
        </pre>
        <button
          className={`${styles.codeCopyButton} ${copied ? styles.copied : ''}`}
          type="button"
          onClick={onCopy}
          aria-label={copied ? '已复制代码块' : '复制代码块'}
          title={copied ? '已复制代码块' : '复制代码块'}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

// 生成速记本记录唯一标识，兼容不支持 randomUUID 的浏览器
function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 复制文本到系统剪贴板，必要时回退到浏览器原生复制命令
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.setAttribute('readonly', '');
    textArea.className = styles.clipboardFallback;
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();
    return copied;
  } catch {
    return false;
  }
}

// 格式化卡片更新时间，让最近编辑的内容更容易被识别
function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

// 速记本新增与编辑表单，只要求一段自由文本
function NoteComposer({ initial, onSubmit, onCancel }: NoteComposerProps) {
  const [content, setContent] = useState(initial.content);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 提交前校验内容并移除首尾无意义空白
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('写点内容再保存吧。');
      textareaRef.current?.focus();
      return;
    }
    onSubmit({ content: trimmedContent });
  }

  // 支持 Ctrl/⌘ + Enter 快速保存，Escape 返回列表
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  // 用围栏包住选中文本，帮助用户快速创建可单独复制的代码块
  function handleInsertCodeBlock(): void {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selectedText = content.slice(textarea.selectionStart, textarea.selectionEnd);
    const openingFence = selectedText ? '```\n' : '```\n\n';
    const insertion = `${openingFence}${selectedText}\n\`\`\``;
    const nextContent = `${content.slice(0, textarea.selectionStart)}${insertion}${content.slice(textarea.selectionEnd)}`;
    if (nextContent.length > MAX_NOTE_CONTENT_LENGTH) {
      setError('代码块标记会超出内容长度限制，请先删减一些文字。');
      return;
    }

    const cursorPosition = textarea.selectionStart + (selectedText ? insertion.length : openingFence.length);
    setContent(nextContent);
    setError('');
    window.requestAnimationFrame(() => {
      const currentTextarea = textareaRef.current;
      if (!currentTextarea) return;
      currentTextarea.focus();
      currentTextarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  return (
    <section className={styles.composer} aria-labelledby="note-composer-title">
      <div className={styles.composerHeader}>
        <div>
          <p className={styles.sectionLabel}>{initial.id ? '编辑内容' : '新建内容'}</p>
          <h2 id="note-composer-title" className={styles.composerTitle}>
            {initial.id ? '把这条内容改得更顺手' : '写下现在想留下的内容'}
          </h2>
        </div>
        <p className={styles.composerHint}>Ctrl/⌘ + Enter 保存</p>
      </div>
      <form className={styles.composerForm} onSubmit={handleSubmit}>
        <label className={styles.textareaLabel} htmlFor="note-content">
          内容
        </label>
        <textarea
          id="note-content"
          name="note-content"
          ref={textareaRef}
          className={`${styles.textarea} ${error ? styles.textareaError : ''}`}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={'例如：\nwindow关闭指令\n\n```shell\ntaskkill /PID 12345 /F\n```\n…'}
          maxLength={MAX_NOTE_CONTENT_LENGTH}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="note-content-meta"
          aria-invalid={error ? true : undefined}
        />
        <div id="note-content-meta" className={styles.formMeta}>
          <span className={error ? styles.formError : ''}>
            {error || '需要单独复制的片段，请用 ``` 包起来；常见命令行会自动识别。'}
          </span>
          <div className={styles.formMetaActions}>
            <button className={styles.insertCodeButton} type="button" onClick={handleInsertCodeBlock}>
              插入代码块
            </button>
            <span>
              {content.length.toLocaleString()} / {MAX_NOTE_CONTENT_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>
        <div className={styles.formActions}>
          <Button type="submit">{initial.id ? '保存修改' : '保存内容'}</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            取消
          </Button>
        </div>
      </form>
    </section>
  );
}

// 单条速记卡片，展示完整文本并提供复制、编辑、删除操作
function NoteCard({ note, copiedBlockKey, onCopy, onEdit, onDelete }: NoteCardProps) {
  const blocks = parseNoteContent(note.content);

  return (
    <article className={styles.card}>
      <div className={styles.content}>
        {blocks.map((block, blockIndex) =>
          block.type === 'code' ? (
            <CodeBlock
              key={`${note.id}-code-${blockIndex}`}
              block={block}
              copied={copiedBlockKey === `${note.id}:${blockIndex}`}
              onCopy={() => onCopy(note.id, blockIndex, block.content)}
            />
          ) : (
            <p key={`${note.id}-text-${blockIndex}`} className={styles.textBlock}>
              {block.content}
            </p>
          ),
        )}
      </div>
      <div className={styles.cardFooter}>
        <p className={styles.cardMeta}>更新于 {formatUpdatedAt(note.updatedAt)}</p>
        <div className={styles.cardActions}>
          <button className={styles.iconButton} type="button" onClick={() => onEdit(note)} aria-label="编辑这条内容">
            <EditIcon />
          </button>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => onDelete(note.id)}
            aria-label="删除这条内容"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </article>
  );
}

// 速记本主界面，管理自由文本的增删改查与一键复制
export default function NoteApp() {
  const notes = useSyncExternalStore(subscribeNotes, getNotesSnapshot, getServerNotesSnapshot);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [copiedBlockKey, setCopiedBlockKey] = useState<string | null>(null);
  const resetCopiedTimer = useRef<number | null>(null);

  // 卸载时清理复制反馈定时器，避免组件销毁后继续更新状态
  useEffect(() => {
    return () => {
      if (resetCopiedTimer.current) window.clearTimeout(resetCopiedTimer.current);
    };
  }, []);

  const visibleNotes = notes.toSorted((first, second) => second.updatedAt - first.updatedAt);

  // 打开空编辑器，用于新增一条自由文本记录
  function openCreate(): void {
    setEditor({ id: null, content: '' });
  }

  // 打开已有记录，将完整内容带入编辑器
  function openEdit(note: NoteEntry): void {
    setEditor({ id: note.id, content: note.content });
  }

  // 保存新增或编辑后的记录并持久化到当前浏览器
  function handleSubmit(values: { content: string }): void {
    const now = Date.now();
    const next = editor?.id
      ? notes.map((note) => (note.id === editor.id ? { ...note, ...values, updatedAt: now } : note))
      : [...notes, { id: createId(), ...values, createdAt: now, updatedAt: now }];
    setNotes(next);
    setEditor(null);
  }

  // 复制指定代码块，并短暂显示当前代码块的成功状态
  async function handleCopy(noteId: string, blockIndex: number, content: string): Promise<void> {
    if (resetCopiedTimer.current) window.clearTimeout(resetCopiedTimer.current);
    setCopiedBlockKey(null);

    const copied = await copyToClipboard(content);
    if (resetCopiedTimer.current) window.clearTimeout(resetCopiedTimer.current);

    if (!copied) {
      return;
    }

    setCopiedBlockKey(`${noteId}:${blockIndex}`);
    resetCopiedTimer.current = window.setTimeout(() => setCopiedBlockKey(null), 1800);
  }

  // 删除指定记录前确认，降低误操作风险
  function handleDelete(id: string): void {
    const note = notes.find((item) => item.id === id);
    if (!note || !window.confirm('确定删除这条内容吗？此操作无法撤销。')) return;

    setNotes(notes.filter((item) => item.id !== id));
  }

  return (
    <section className={styles.tool} aria-labelledby="note-tool-title">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Local notebook</p>
          <h1 id="note-tool-title" className={styles.title}>
            笔记
          </h1>
          <p className={styles.intro}>常用指令、临时备忘、突然想到的事情，写下即可保存。内容只保存在本地浏览器。</p>
        </div>
        <div className={styles.headerActions}>
          <Button type="button" onClick={openCreate}>
            写一条
          </Button>
        </div>
      </header>

      {editor ? (
        <NoteComposer
          key={editor.id ?? 'new'}
          initial={editor}
          onSubmit={handleSubmit}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      <section className={styles.library} aria-labelledby="note-library-title">
        <div className={styles.libraryHeader}>
          <div>
            <p className={styles.sectionLabel}>Notes</p>
            <h2 id="note-library-title" className={styles.sectionTitle}>
              全部内容
            </h2>
          </div>
          <div className={styles.libraryControls}>
            <p className={styles.count}>共 {notes.length} 条</p>
          </div>
        </div>

        {notes.length === 0 ? (
          <EmptyState
            title="还没有内容"
            description="把第一条指令或备忘写下来，它会一直留在这台设备的当前浏览器里。"
            action={
              <Button type="button" onClick={openCreate}>
                写下第一条
              </Button>
            }
          />
        ) : (
          <ul className={styles.list}>
            {visibleNotes.map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  copiedBlockKey={copiedBlockKey}
                  onCopy={handleCopy}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </li>
            ))}
          </ul>
        )}

        {notes.length > 0 ? (
          <footer className={styles.footer}>
            <p className={styles.storageHint}>所有内容均保存在本机中，换设备或清理浏览器缓存后不会保留。</p>
          </footer>
        ) : null}
      </section>
    </section>
  );
}
