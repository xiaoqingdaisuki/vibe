/** AI 助手：稳定块与增量尾部的流式渲染 */

'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { renderBlockMarkdown } from './render-markdown';
import { createLatestValueBatch, MARKDOWN_RENDER_INTERVAL_MS } from './stream-rendering';
import type { LatestValueBatch } from './stream-rendering';
import { createStreamingMarkdownParser } from './streaming-markdown-parser';
import type { MarkdownStreamSnapshot } from './streaming-markdown-parser';
import styles from './styles/Agent.module.css';

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

const EMPTY_SNAPSHOT: MarkdownStreamSnapshot = { blocks: [], offset: 0 };

// 复用已结束块的DOM，后续分片不重新解析或替换历史段落
const ParsedMarkdownBlock = memo(function ParsedMarkdownBlock({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

// 未完成的代码直接更新文本节点，避免长围栏反复解析和重建
function StreamingTail({ content }: { content: string }) {
  const source = content.trimStart();
  if (source.startsWith('```')) {
    const newline = source.indexOf('\n');
    const code = newline === -1 ? '' : source.slice(newline + 1).replace(/\n```[^\n]*\n?$/, '');
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  return <div className={styles.streamingText}>{content}</div>;
}

// 按100ms确认已完成的Markdown块，绘制帧只更新末尾文本
export function StreamingMarkdown({ content, isStreaming }: StreamingMarkdownProps) {
  const [snapshot, setSnapshot] = useState<MarkdownStreamSnapshot>(EMPTY_SNAPSHOT);
  const batchRef = useRef<LatestValueBatch<string> | null>(null);

  // 为每条消息建立独立解析缓存，组件卸载时取消待执行解析
  useEffect(() => {
    const parse = createStreamingMarkdownParser();
    const batch = createLatestValueBatch<string>(MARKDOWN_RENDER_INTERVAL_MS, (value) => setSnapshot(parse(value)));
    batchRef.current = batch;
    return () => batch.cancel();
  }, []);

  // 流输入只更新待确认快照，结束时由最后一个块一次性补齐排版
  useEffect(() => {
    if (isStreaming) batchRef.current?.push(content);
    else batchRef.current?.cancel();
  }, [content, isStreaming]);

  const current = content.length < snapshot.offset ? EMPTY_SNAPSHOT : snapshot;
  const tail = content.slice(current.offset);
  // 最终排版仅解析尚未完成的尾部，历史块继续复用
  const finalHtml = useMemo(() => (isStreaming ? '' : renderBlockMarkdown(tail)), [tail, isStreaming]);

  return (
    <div className={styles.md}>
      {current.blocks.map((block) => (
        <ParsedMarkdownBlock key={block.start} html={block.html} />
      ))}
      {isStreaming ? <StreamingTail content={tail} /> : <ParsedMarkdownBlock html={finalHtml} />}
    </div>
  );
}
