/** AI 助手：增量 Markdown 块解析 */

import { renderBlockMarkdown } from './render-markdown.ts';

export interface StableMarkdownBlock {
  start: number;
  html: string;
}

export interface MarkdownStreamSnapshot {
  blocks: StableMarkdownBlock[];
  offset: number;
}

// 只解析已结束的块，保留围栏内空行并复用历史块的HTML和对象
export function createStreamingMarkdownParser(): (content: string) => MarkdownStreamSnapshot {
  let previous = '';
  let scanned = 0;
  let offset = 0;
  let fenced = false;
  let blocks: StableMarkdownBlock[] = [];

  // 提交新结束的源文本，空白只推进游标而不生成额外DOM
  const commit = (content: string, end: number) => {
    const source = content.slice(offset, end);
    if (source.trim()) blocks = [...blocks, { start: offset, html: renderBlockMarkdown(source) }];
    offset = end;
  };

  // 从上次扫描位置继续寻找块边界，目标被替换时清空当前消息的解析缓存
  return (content: string): MarkdownStreamSnapshot => {
    if (!content.startsWith(previous)) {
      scanned = 0;
      offset = 0;
      fenced = false;
      blocks = [];
    }
    previous = content;
    let newline = content.indexOf('\n', scanned);
    while (newline !== -1) {
      const line = content.slice(scanned, newline).replace(/\r$/, '');
      scanned = newline + 1;
      if (line.startsWith('```')) {
        fenced = !fenced;
        if (!fenced) commit(content, scanned);
      } else if (!fenced && !line.trim()) {
        commit(content, scanned);
      }
      newline = content.indexOf('\n', scanned);
    }
    return { blocks, offset };
  };
}
