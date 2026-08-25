'use client';

import { useEffect, useRef, useState } from 'react';

import type { Theme } from '@/lib/theme';

import { createPreviewDocument } from '../preview-document';
import styles from '../styles/OnlineEditor.module.css';

interface PreviewFrameProps {
  code: string;
  theme: Theme;
}

type PreviewState = 'loading' | 'paused' | 'ready';

type PreviewMessageType =
  | 'vibe:online-editor:console'
  | 'vibe:online-editor:ready'
  | 'vibe:online-editor:result'
  | 'vibe:online-editor:runtime-error';

interface PreviewFrameState {
  sessionId: string;
  source: string;
}

interface PreviewDiagnostic {
  id: string;
  level: 'error' | 'info' | 'log' | 'result' | 'warn';
  message: string;
}

interface RuntimeMessage {
  level?: PreviewDiagnostic['level'];
  message?: string;
  sessionId: string;
  type: PreviewMessageType;
}

// 创建无法从预览外部猜测的会话标识和 CSP nonce
function createFrameToken(): string {
  const values = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(values);
  return `${values[0]?.toString(36) ?? Math.random().toString(36).slice(2)}${values[1]?.toString(36) ?? Date.now().toString(36)}`;
}

// 从当前 JSX 源码创建完整的独立 iframe 文档状态
function createFrameState(code: string, theme: Theme): PreviewFrameState {
  const sessionId = createFrameToken();
  const nonce = createFrameToken();

  return {
    sessionId,
    source: createPreviewDocument({ code, nonce, sessionId, theme }),
  };
}

// 将未知的 postMessage 数据收窄为可处理的预览运行时消息
function parseRuntimeMessage(value: unknown): RuntimeMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const message = value as Record<string, unknown>;
  const type = message.type;
  if (
    type !== 'vibe:online-editor:console' &&
    type !== 'vibe:online-editor:ready' &&
    type !== 'vibe:online-editor:result' &&
    type !== 'vibe:online-editor:runtime-error'
  ) {
    return undefined;
  }
  if (typeof message.sessionId !== 'string') return undefined;

  const level = message.level;
  const validLevel =
    level === 'error' || level === 'info' || level === 'log' || level === 'result' || level === 'warn'
      ? level
      : undefined;
  return {
    level: validLevel,
    message: typeof message.message === 'string' ? message.message : undefined,
    sessionId: message.sessionId,
    type,
  };
}

// 渲染可停止、可重启，并随 JSX 源码热重建的隔离运行时
export function PreviewFrame({ code, theme }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previousCodeRef = useRef(code);
  const [diagnostics, setDiagnostics] = useState<PreviewDiagnostic[]>([]);
  const [frame, setFrame] = useState<PreviewFrameState | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('loading');

  // 客户端挂载后生成随机会话，避免服务端与客户端的 iframe 文档不一致
  useEffect(() => {
    if (frame) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      setFrame(createFrameState(code, theme));
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [code, frame, theme]);

  // 重建 iframe 以撤销当前脚本、计时器和资源产生的副作用
  function restartPreview(): void {
    previousCodeRef.current = code;
    setDiagnostics([]);
    setFrame(createFrameState(code, theme));
    setPreviewState('loading');
  }

  // 中止 iframe 运行，让高负载脚本不再占用预览执行环境
  function stopPreview(): void {
    setPreviewState('paused');
  }

  // 接收且仅接收当前沙箱会话主动发出的运行消息
  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>): void {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const message = parseRuntimeMessage(event.data);
      if (!frame || !message || message.sessionId !== frame.sessionId) return;

      if (message.type === 'vibe:online-editor:ready') {
        setPreviewState('ready');
        return;
      }

      const level =
        message.type === 'vibe:online-editor:runtime-error'
          ? 'error'
          : message.type === 'vibe:online-editor:result'
            ? 'result'
            : (message.level ?? 'log');
      const diagnostic = message.message?.trim();
      if (!diagnostic) return;

      setDiagnostics((currentDiagnostics) => [
        ...currentDiagnostics.slice(-3),
        { id: `${Date.now()}-${Math.random()}`, level, message: diagnostic },
      ]);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frame]);

  // 在短暂输入空闲后以新 iframe 热更新 JSX，确保运行时彻底隔离
  useEffect(() => {
    const previousCode = previousCodeRef.current;
    if (previousCode === code) return;

    previousCodeRef.current = code;
    if (previewState === 'paused' || !frame) return;

    const timeoutId = window.setTimeout(() => {
      setDiagnostics([]);
      setFrame(createFrameState(code, theme));
      setPreviewState('loading');
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [code, frame, previewState, theme]);

  // 网站主题变更只透传给 iframe 根节点，不重新执行用户代码
  useEffect(() => {
    if (previewState === 'paused' || !frame) return;
    iframeRef.current?.contentWindow?.postMessage(
      { sessionId: frame.sessionId, theme, type: 'vibe:online-editor:theme' },
      '*',
    );
  }, [frame, previewState, theme]);

  // iframe 装载后补发当前网站主题，覆盖异步装载期间的主题变化
  function handleFrameLoad(): void {
    if (!frame) return;
    iframeRef.current?.contentWindow?.postMessage(
      { sessionId: frame.sessionId, theme, type: 'vibe:online-editor:theme' },
      '*',
    );
  }

  const statusLabel = previewState === 'paused' ? '已停止' : previewState === 'ready' ? '运行中' : '正在运行';

  return (
    <section className={styles.previewPanel} aria-labelledby="preview-panel-title">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelLabel}>Preview</p>
          <h2 id="preview-panel-title" className={styles.panelTitle}>
            实时预览
          </h2>
        </div>
        <p className={styles.previewState} data-state={previewState} aria-live="polite">
          {statusLabel}
        </p>
      </div>

      <div className={styles.previewToolbar} aria-label="预览命令">
        <button
          className={styles.editorButton}
          type="button"
          onClick={stopPreview}
          disabled={previewState === 'paused'}
        >
          停止预览
        </button>
      </div>

      {previewState === 'paused' ? (
        <div className={styles.previewPaused}>
          <p>预览已停止，之前的脚本、计时器与网络活动已随 iframe 一并销毁。</p>
          <button className={styles.editorButton} type="button" onClick={restartPreview}>
            恢复运行
          </button>
        </div>
      ) : frame ? (
        <iframe
          key={frame.sessionId}
          ref={iframeRef}
          className={styles.previewFrame}
          title="代码编辑器实时预览"
          sandbox="allow-scripts"
          scrolling="auto"
          referrerPolicy="no-referrer"
          srcDoc={frame.source}
          onLoad={handleFrameLoad}
        />
      ) : (
        <div className={styles.previewLoading}>正在准备安全沙箱…</div>
      )}

      <div className={styles.previewConsole} aria-live="polite">
        <p className={styles.consoleLabel}>Runtime</p>
        {diagnostics.length > 0 ? (
          <ul className={styles.diagnosticList}>
            {diagnostics.map((diagnostic) => (
              <li key={diagnostic.id} className={styles.diagnosticItem} data-level={diagnostic.level}>
                <span>{diagnostic.level}</span>
                <code>{diagnostic.message}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.consoleEmpty}>控制台与运行错误会显示在这里。</p>
        )}
      </div>
    </section>
  );
}
