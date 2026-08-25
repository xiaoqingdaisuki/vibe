import type { EditorLanguage } from './types';

export interface CodeFoldRegion {
  endLine: number;
  key: string;
  startLine: number;
}

export interface FoldedCodeLine {
  foldRegion?: CodeFoldRegion;
  key: string;
  lineNumber?: number;
  type: 'placeholder' | 'source';
}

export interface FoldedCodeView {
  displayValue: string;
  lines: FoldedCodeLine[];
  segments: FoldedCodeSegment[];
}

export interface FoldedCodeSegment {
  displayEnd: number;
  displayStart: number;
  sourceEnd?: number;
  sourceStart?: number;
  type: 'placeholder' | 'separator' | 'source';
}

export interface SourceTextEdit {
  end: number;
  insertedText: string;
  start: number;
}

interface SourceLine {
  end: number;
  endWithLineBreak: number;
  start: number;
  value: string;
}

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const SCOPE_CLOSERS: Partial<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
};

// 为作用域生成稳定键值，避免折叠状态依赖对象引用
function getRegionKey(startLine: number, endLine: number): string {
  return `${startLine}:${endLine}`;
}

// 将源码拆分为保留原始偏移量的行，供折叠投影和编辑映射使用
function getSourceLines(source: string): SourceLine[] {
  const values = source.split('\n');
  let start = 0;

  return values.map((value, index) => {
    const end = start + value.length;
    const line = {
      end,
      endWithLineBreak: index === values.length - 1 ? end : end + 1,
      start,
      value,
    };
    start = end + 1;
    return line;
  });
}

// 统计源码位置所在的行号，供 HTML 标签作用域匹配使用
function getLineAtOffset(source: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

// 解析多行配对符号与块注释，保留模板字符串内的 CSS 等结构化代码
function getBraceFoldableRegions(source: string): CodeFoldRegion[] {
  const regions: CodeFoldRegion[] = [];
  const scopes: Array<{ closer: string; startLine: number }> = [];
  let index = 0;
  let line = 0;

  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '\n') {
      line += 1;
      index += 1;
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      const lineEnd = source.indexOf('\n', index + 2);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      const startLine = line;
      const commentEnd = source.indexOf('*/', index + 2);
      const end = commentEnd === -1 ? source.length : commentEnd + 2;
      line += source.slice(index, end).split('\n').length - 1;
      if (line > startLine) {
        regions.push({ endLine: line, key: getRegionKey(startLine, line), startLine });
      }
      index = end;
      continue;
    }

    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          if (source[index + 1] === '\n') line += 1;
          index += 2;
          continue;
        }
        if (source[index] === '\n') line += 1;
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    const closer = SCOPE_CLOSERS[character];
    if (closer) {
      scopes.push({ closer, startLine: line });
      index += 1;
      continue;
    }

    const scope = scopes.at(-1);
    if (scope?.closer === character) {
      scopes.pop();
      if (line > scope.startLine) {
        regions.push({ endLine: line, key: getRegionKey(scope.startLine, line), startLine: scope.startLine });
      }
    }

    index += 1;
  }

  return regions;
}

// 解析单反引号模板字符串与三反引号代码围栏，作为独立折叠边界
function getBacktickFoldableRegions(source: string): CodeFoldRegion[] {
  const regions: CodeFoldRegion[] = [];
  let codeFenceStartLine: number | undefined;
  let templateStartLine: number | undefined;
  let index = 0;
  let line = 0;

  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '\n') {
      line += 1;
      index += 1;
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      const lineEnd = source.indexOf('\n', index + 2);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      const end = commentEnd === -1 ? source.length : commentEnd + 2;
      line += source.slice(index, end).split('\n').length - 1;
      index = end;
      continue;
    }

    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          if (source[index + 1] === '\n') line += 1;
          index += 2;
          continue;
        }
        if (source[index] === '\n') line += 1;
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character !== '`') {
      index += 1;
      continue;
    }

    let length = 1;
    while (source[index + length] === '`') length += 1;

    if (length >= 3) {
      if (codeFenceStartLine === undefined) {
        codeFenceStartLine = line;
      } else {
        if (line > codeFenceStartLine) {
          regions.push({ endLine: line, key: getRegionKey(codeFenceStartLine, line), startLine: codeFenceStartLine });
        }
        codeFenceStartLine = undefined;
      }
      index += length;
      continue;
    }

    if (length === 1) {
      if (templateStartLine === undefined) {
        templateStartLine = line;
      } else {
        if (line > templateStartLine) {
          regions.push({ endLine: line, key: getRegionKey(templateStartLine, line), startLine: templateStartLine });
        }
        templateStartLine = undefined;
      }
    }

    index += length;
  }

  return regions;
}

// 解析 JSX 简写 Fragment，补足无标签名的成对结构
function getJsxFragmentFoldableRegions(source: string): CodeFoldRegion[] {
  const regions: CodeFoldRegion[] = [];
  const starts: number[] = [];
  const fragmentPattern = /<\/?\s*>/g;
  let match = fragmentPattern.exec(source);

  while (match) {
    const line = getLineAtOffset(source, match.index);
    if (match[0].startsWith('</')) {
      const startLine = starts.pop();
      if (startLine !== undefined && line > startLine) {
        regions.push({ endLine: line, key: getRegionKey(startLine, line), startLine });
      }
    } else {
      starts.push(line);
    }
    match = fragmentPattern.exec(source);
  }

  return regions;
}

// 解析成对 HTML 或 JSX 标签，形成可折叠的结构化区域
function getHtmlFoldableRegions(source: string): CodeFoldRegion[] {
  const regions: CodeFoldRegion[] = [];
  const stack: Array<{ line: number; tag: string }> = [];
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?\/?\s*>/g;
  let match = tagPattern.exec(source);

  while (match) {
    const fullTag = match[0];
    const tag = match[1].toLowerCase();
    const line = getLineAtOffset(source, match.index);
    const isClosingTag = fullTag.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(fullTag) || VOID_HTML_TAGS.has(tag);

    if (isClosingTag) {
      const openIndex = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (openIndex !== -1) {
        const [openingTag] = stack.splice(openIndex, 1);
        if (openingTag && line > openingTag.line) {
          regions.push({
            endLine: line,
            key: getRegionKey(openingTag.line, line),
            startLine: openingTag.line,
          });
        }
      }
    } else if (!isSelfClosing) {
      stack.push({ line, tag });
    }

    match = tagPattern.exec(source);
  }

  return regions;
}

// 合并不同语法来源的区域，并按从外到内的顺序返回
function mergeFoldRegions(...groups: CodeFoldRegion[][]): CodeFoldRegion[] {
  const regions = new Map<string, CodeFoldRegion>();
  for (const group of groups) {
    for (const region of group) regions.set(region.key, region);
  }

  return [...regions.values()].toSorted((first, second) => {
    if (first.startLine !== second.startLine) return first.startLine - second.startLine;
    return second.endLine - first.endLine;
  });
}

// 根据当前语言提取可收起的花括号或成对标签作用域
export function getFoldableRegions(source: string, language: EditorLanguage): CodeFoldRegion[] {
  if (language === 'html') return mergeFoldRegions(getHtmlFoldableRegions(source), getBacktickFoldableRegions(source));
  if (language === 'jsx') {
    return mergeFoldRegions(
      getBraceFoldableRegions(source),
      getHtmlFoldableRegions(source),
      getJsxFragmentFoldableRegions(source),
      getBacktickFoldableRegions(source),
    );
  }
  return mergeFoldRegions(getBraceFoldableRegions(source), getBacktickFoldableRegions(source));
}

// 从同一起始行中挑选最外层区域，保证行号栏只有一个折叠入口
function getFoldRegionByStartLine(regions: CodeFoldRegion[]): Map<number, CodeFoldRegion> {
  const regionsByStartLine = new Map<number, CodeFoldRegion>();
  for (const region of regions) {
    const current = regionsByStartLine.get(region.startLine);
    if (!current || region.endLine > current.endLine) regionsByStartLine.set(region.startLine, region);
  }
  return regionsByStartLine;
}

// 过滤嵌套的折叠区域，优先保留用户选择的最外层作用域
function getVisibleCollapsedRegions(
  regions: CodeFoldRegion[],
  collapsedRegionKeys: ReadonlySet<string>,
): CodeFoldRegion[] {
  const collapsedRegions = regions.filter((region) => collapsedRegionKeys.has(region.key));
  const visibleRegions: CodeFoldRegion[] = [];
  let lastEndLine = -1;

  for (const region of collapsedRegions) {
    if (region.startLine <= lastEndLine) continue;
    visibleRegions.push(region);
    lastEndLine = region.endLine;
  }
  return visibleRegions;
}

// 向折叠后的文本投影追加一段源码或占位内容
function appendSegment(
  values: string[],
  segments: FoldedCodeSegment[],
  displayStart: number,
  value: string,
  type: FoldedCodeSegment['type'],
  sourceStart?: number,
  sourceEnd?: number,
): number {
  values.push(value);
  const displayEnd = displayStart + value.length;
  segments.push({ displayEnd, displayStart, sourceEnd, sourceStart, type });
  return displayEnd;
}

// 将完整源码投影为可显示、可映射的折叠编辑文本
export function createFoldedCodeView({
  collapsedRegionKeys,
  regions,
  source,
}: {
  collapsedRegionKeys: ReadonlySet<string>;
  regions: CodeFoldRegion[];
  source: string;
}): FoldedCodeView {
  const sourceLines = getSourceLines(source);
  const collapsedByStartLine = new Map(
    getVisibleCollapsedRegions(regions, collapsedRegionKeys).map((region) => [region.startLine, region]),
  );
  const regionsByStartLine = getFoldRegionByStartLine(regions);
  const displayValues: string[] = [];
  const lines: FoldedCodeLine[] = [];
  const segments: FoldedCodeSegment[] = [];
  let displayLength = 0;
  let lineIndex = 0;

  while (lineIndex < sourceLines.length) {
    const sourceLine = sourceLines[lineIndex];
    displayLength = appendSegment(
      displayValues,
      segments,
      displayLength,
      source.slice(sourceLine.start, sourceLine.endWithLineBreak),
      'source',
      sourceLine.start,
      sourceLine.endWithLineBreak,
    );
    lines.push({
      foldRegion: regionsByStartLine.get(lineIndex),
      key: `source-${lineIndex}`,
      lineNumber: lineIndex + 1,
      type: 'source',
    });

    const collapsedRegion = collapsedByStartLine.get(lineIndex);
    if (!collapsedRegion) {
      lineIndex += 1;
      continue;
    }

    displayLength = appendSegment(displayValues, segments, displayLength, '…', 'placeholder');
    lines.push({ key: `placeholder-${collapsedRegion.key}`, type: 'placeholder' });

    displayLength = appendSegment(displayValues, segments, displayLength, '\n', 'separator');
    lineIndex = collapsedRegion.endLine;
  }

  return { displayValue: displayValues.join(''), lines, segments };
}

// 找出 textarea 前后值的最小变更片段，避免重新比对完整源码
function getChangedDisplayRange(
  previousValue: string,
  nextValue: string,
): {
  end: number;
  insertedText: string;
  start: number;
} {
  let start = 0;
  while (start < previousValue.length && start < nextValue.length && previousValue[start] === nextValue[start]) {
    start += 1;
  }

  let previousEnd = previousValue.length;
  let nextEnd = nextValue.length;
  while (previousEnd > start && nextEnd > start && previousValue[previousEnd - 1] === nextValue[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return { end: previousEnd, insertedText: nextValue.slice(start, nextEnd), start };
}

// 将折叠投影中的光标偏移量还原到原始源码的位置
function getSourceOffset(segments: FoldedCodeSegment[], displayOffset: number): number | null {
  for (const segment of segments) {
    if (segment.type !== 'source' || segment.sourceStart === undefined || segment.sourceEnd === undefined) continue;
    if (displayOffset < segment.displayStart || displayOffset > segment.displayEnd) continue;
    return segment.sourceStart + displayOffset - segment.displayStart;
  }
  return null;
}

// 将折叠文本的输入变更映射回完整源码，遇到隐藏内容时要求先展开
export function getSourceEditFromFoldedChange(view: FoldedCodeView, nextDisplayValue: string): SourceTextEdit | null {
  if (view.displayValue === nextDisplayValue) return null;

  const change = getChangedDisplayRange(view.displayValue, nextDisplayValue);
  const start = getSourceOffset(view.segments, change.start);
  const end = getSourceOffset(view.segments, change.end);
  if (start === null || end === null) return null;

  return { end, insertedText: change.insertedText, start };
}
