'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { renderBlockMarkdown } from './render-markdown';
import { createLatestValueBatch, MARKDOWN_RENDER_INTERVAL_MS } from './stream-rendering';
import type { LatestValueBatch } from './stream-rendering';
import styles from './styles/Agent.module.css';

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

// 隔离昂贵解析，只有低频Markdown快照变化时才重新生成HTML
const ParsedMarkdown = memo(function ParsedMarkdown({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: renderBlockMarkdown(content) }} />;
});

// 每100ms更新Markdown，期间收到的新文本直接展示，结束时立即渲染全文
export function StreamingMarkdown({ content, isStreaming }: StreamingMarkdownProps) {
  const [parsedContent, setParsedContent] = useState('');
  const batchRef = useRef<LatestValueBatch<string> | null>(null);

  // 为当前消息维护独立解析窗口，并在卸载时清理
  useEffect(() => {
    const batch = createLatestValueBatch(MARKDOWN_RENDER_INTERVAL_MS, setParsedContent);
    batchRef.current = batch;
    return () => batch.cancel();
  }, []);

  // 更新待解析快照，使用固定窗口避免持续流输入导致解析饥饿
  useEffect(() => {
    if (isStreaming) batchRef.current?.push(content);
    else batchRef.current?.cancel();
  }, [content, isStreaming]);

  if (!isStreaming) {
    return (
      <div className={styles.md}>
        <ParsedMarkdown content={content} />
      </div>
    );
  }

  const prefix = content.startsWith(parsedContent) ? parsedContent : '';
  return (
    <div className={styles.md}>
      {prefix ? <ParsedMarkdown content={prefix} /> : null}
      <span className={styles.streamingText}>{content.slice(prefix.length)}</span>
    </div>
  );
}
