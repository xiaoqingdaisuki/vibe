export type NoteContentBlock = { type: 'text'; content: string } | { type: 'code'; content: string; language: string };

const CODE_FENCE_PATTERN = /^\s*```([^\s`]*)?\s*$/;
const CODE_CLOSE_PATTERN = /^\s*```\s*$/;
const COMMAND_PREFIX_PATTERN =
  /^(?:[$>]\s*)?(?:sudo\s+)?(?:shopify|npm|pnpm|yarn|npx|git|docker|kubectl|taskkill|netstat|findstr|curl|wget|ssh|scp|cd|mkdir|rm|kill|node|python(?:3)?|vercel|brew|chmod|code|deno|bun|go|cargo|java|php)\b/i;
const COMMAND_OPERATOR_PATTERN = /(?:\s&&\s|\s\|\s|\s\|\|\s|\s>\s|(?:^|\s)--[\w-]+|(?:^|\s)\/(?:pid|f|a)\b)/i;

// 判断未使用围栏时，一行是否足够像需要复制的命令行
function isCommandLikeLine(line: string): boolean {
  const normalizedLine = line.trim();
  return (
    normalizedLine.length > 0 &&
    (COMMAND_PREFIX_PATTERN.test(normalizedLine) || COMMAND_OPERATOR_PATTERN.test(normalizedLine))
  );
}

// 去掉代码围栏带来的首尾空行，保留代码内部的缩进和空格
function normalizeCodeContent(lines: string[]): string {
  return lines.join('\n').replace(/^\n/, '').replace(/\n$/, '');
}

// 将一组代码行转换成代码块，空代码块不参与渲染
function createCodeBlock(lines: string[], language: string): NoteContentBlock | null {
  const code = normalizeCodeContent(lines);
  return code.trim().length > 0 ? { type: 'code', content: code, language } : null;
}

// 解析自由文本中的普通说明、围栏代码块和常见命令行
export function parseNoteContent(content: string): NoteContentBlock[] {
  const blocks: NoteContentBlock[] = [];
  const lines = content.split(/\r?\n/);
  let textLines: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = '';
  let isInsideFence = false;
  let isInsideAutoCode = false;

  // 把待处理的普通文字追加为一个连续内容块
  function appendTextBlock(): void {
    const text = textLines.join('\n').trim();
    if (text.length > 0) blocks.push({ type: 'text', content: text });
    textLines = [];
  }

  // 把待处理的代码行追加为一个代码块
  function appendCodeBlock(): void {
    const codeBlock = createCodeBlock(codeLines, codeLanguage);
    if (codeBlock) blocks.push(codeBlock);
    codeLines = [];
    codeLanguage = '';
  }

  for (const line of lines) {
    const fenceMatch = line.match(CODE_FENCE_PATTERN);

    if (isInsideFence) {
      if (CODE_CLOSE_PATTERN.test(line)) {
        appendCodeBlock();
        isInsideFence = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (fenceMatch) {
      if (isInsideAutoCode) {
        appendCodeBlock();
        isInsideAutoCode = false;
      }
      appendTextBlock();
      isInsideFence = true;
      codeLanguage = fenceMatch[1] ?? '';
      continue;
    }

    if (isCommandLikeLine(line)) {
      if (!isInsideAutoCode) {
        appendTextBlock();
        isInsideAutoCode = true;
      }
      codeLines.push(line);
      continue;
    }

    if (isInsideAutoCode) {
      appendCodeBlock();
      isInsideAutoCode = false;
    }
    textLines.push(line);
  }

  if (isInsideFence || isInsideAutoCode) appendCodeBlock();
  appendTextBlock();
  return blocks;
}
