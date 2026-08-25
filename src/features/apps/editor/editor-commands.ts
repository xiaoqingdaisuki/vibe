export interface TextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface IndentCodeOptions {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  indent: string;
}

// 找到选区覆盖的完整行边界，便于批量调整缩进
function getSelectedLineBounds(value: string, selectionStart: number, selectionEnd: number) {
  const firstLineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const adjustedEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd;
  const nextLineBreak = value.indexOf('\n', adjustedEnd);
  const lastLineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;

  return { firstLineStart, lastLineEnd };
}

// 计算插入缩进后需要保持的光标或选区位置
function getIndentedPosition(value: string, firstLineStart: number, position: number, indentLength: number): number {
  const lineCount = value.slice(firstLineStart, position).split('\n').length;
  return position + lineCount * indentLength;
}

// 为当前行或选中的多行增加统一缩进
export function indentCode({ value, selectionStart, selectionEnd, indent }: IndentCodeOptions): TextEditResult {
  const { firstLineStart, lastLineEnd } = getSelectedLineBounds(value, selectionStart, selectionEnd);
  const selectedLines = value.slice(firstLineStart, lastLineEnd);
  const nextLines = selectedLines
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');

  return {
    value: `${value.slice(0, firstLineStart)}${nextLines}${value.slice(lastLineEnd)}`,
    selectionStart: getIndentedPosition(value, firstLineStart, selectionStart, indent.length),
    selectionEnd: getIndentedPosition(value, firstLineStart, selectionEnd, indent.length),
  };
}

// 获取单行前缀中可移除的一个缩进单位
function getRemovableIndent(line: string, indent: string): number {
  if (line.startsWith(indent)) return indent.length;
  if (line.startsWith('\t')) return 1;
  return 0;
}

// 计算移除行首缩进后需要保持的光标或选区位置
function getOutdentedPosition(lineStarts: number[], removedLengths: number[], position: number): number {
  let adjustment = 0;

  lineStarts.forEach((lineStart, index) => {
    if (position <= lineStart) return;
    adjustment -= Math.min(removedLengths[index], position - lineStart);
  });

  return position + adjustment;
}

// 为当前行或选中的多行减少一个缩进单位
export function outdentCode({ value, selectionStart, selectionEnd, indent }: IndentCodeOptions): TextEditResult {
  const { firstLineStart, lastLineEnd } = getSelectedLineBounds(value, selectionStart, selectionEnd);
  const selectedLines = value.slice(firstLineStart, lastLineEnd).split('\n');
  const lineStarts: number[] = [];
  const removedLengths: number[] = [];
  let offset = firstLineStart;

  const nextLines = selectedLines.map((line) => {
    lineStarts.push(offset);
    const removable = getRemovableIndent(line, indent);
    removedLengths.push(removable);
    offset += line.length + 1;
    return line.slice(removable);
  });

  return {
    value: `${value.slice(0, firstLineStart)}${nextLines.join('\n')}${value.slice(lastLineEnd)}`,
    selectionStart: getOutdentedPosition(lineStarts, removedLengths, selectionStart),
    selectionEnd: getOutdentedPosition(lineStarts, removedLengths, selectionEnd),
  };
}
