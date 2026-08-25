import type { EditorLanguage } from './types';

export type SyntaxTokenKind =
  | 'plain'
  | 'comment'
  | 'tag'
  | 'attribute'
  | 'string'
  | 'keyword'
  | 'number'
  | 'function'
  | 'operator'
  | 'property'
  | 'atRule';

export interface SyntaxToken {
  kind: SyntaxTokenKind;
  value: string;
}

const JAVASCRIPT_KEYWORDS = new Set([
  'await',
  'false',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'of',
  'return',
  'static',
  'switch',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'undefined',
]);

const IDENTIFIER_PATTERN = /[a-zA-Z0-9_$-]/;
const IDENTIFIER_START_PATTERN = /[a-zA-Z_$-]/;
const NUMBER_PATTERN = /[0-9a-fA-F.xX%]/;
const CSS_TEMPLATE_PATTERN = /(?:^|[;{])\s*(?:--[\w-]+|[a-z-]+)\s*:\s*[^=]/i;

// 将相邻同类 token 合并，保持高亮层节点数量稳定
function pushToken(tokens: SyntaxToken[], kind: SyntaxTokenKind, value: string): void {
  if (!value) return;

  const previous = tokens[tokens.length - 1];
  if (previous?.kind === kind) {
    previous.value += value;
    return;
  }

  tokens.push({ kind, value });
}

// 从当前位置读取满足指定字符条件的连续片段
function consumeWhile(source: string, start: number, condition: (character: string) => boolean): number {
  let index = start;
  while (index < source.length && condition(source[index])) index += 1;
  return index;
}

// 读取引号包裹的字符串，保留转义字符和未闭合输入
function consumeString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }

  return source.length;
}

// 返回当前位置之后的第一个非空白字符索引
function getNextNonWhitespaceIndex(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

// 返回当前位置之前的第一个非空白字符索引
function getPreviousNonWhitespaceIndex(source: string, start: number): number {
  let index = start;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return index;
}

// 对 HTML 标签、属性、注释和文本执行容错分词
function tokenizeHtml(source: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const normalizedSource = source.toLowerCase();
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      const commentEnd = end === -1 ? source.length : end + 3;
      pushToken(tokens, 'comment', source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (source[index] !== '<') {
      const nextTag = source.indexOf('<', index);
      const textEnd = nextTag === -1 ? source.length : nextTag;
      pushToken(tokens, 'plain', source.slice(index, textEnd));
      index = textEnd;
      continue;
    }

    pushToken(tokens, 'plain', '<');
    index += 1;

    const isClosingTag = source[index] === '/';
    if (source[index] === '/' || source[index] === '!') {
      pushToken(tokens, 'plain', source[index]);
      index += 1;
    }

    const tagStart = index;
    index = consumeWhile(source, index, (character) => IDENTIFIER_PATTERN.test(character));
    const tagName = source.slice(tagStart, index).toLowerCase();
    if (tagName) pushToken(tokens, 'tag', source.slice(tagStart, index));

    while (index < source.length && source[index] !== '>') {
      if (/\s/.test(source[index])) {
        const whitespaceEnd = consumeWhile(source, index, (character) => /\s/.test(character));
        pushToken(tokens, 'plain', source.slice(index, whitespaceEnd));
        index = whitespaceEnd;
        continue;
      }

      if (source[index] === '"' || source[index] === "'") {
        const stringEnd = consumeString(source, index);
        pushToken(tokens, 'string', source.slice(index, stringEnd));
        index = stringEnd;
        continue;
      }

      const attributeStart = index;
      index = consumeWhile(source, index, (character) => IDENTIFIER_PATTERN.test(character));
      if (index > attributeStart) {
        pushToken(tokens, 'attribute', source.slice(attributeStart, index));
        continue;
      }

      pushToken(tokens, 'plain', source[index]);
      index += 1;
    }

    if (source[index] === '>') {
      pushToken(tokens, 'plain', '>');
      index += 1;
    }

    if (!isClosingTag && (tagName === 'script' || tagName === 'style')) {
      const closingTagStart = normalizedSource.indexOf(`</${tagName}`, index);
      const embeddedEnd = closingTagStart === -1 ? source.length : closingTagStart;
      const embeddedSource = source.slice(index, embeddedEnd);
      const embeddedTokens = tagName === 'style' ? tokenizeCss(embeddedSource) : tokenizeJsx(embeddedSource);
      for (const token of embeddedTokens) pushToken(tokens, token.kind, token.value);
      index = embeddedEnd;
    }
  }

  return tokens;
}

// 对 CSS 注释、规则、属性和值执行轻量分词
function tokenizeCss(source: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      pushToken(tokens, 'comment', source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (source[index] === '"' || source[index] === "'") {
      const stringEnd = consumeString(source, index);
      pushToken(tokens, 'string', source.slice(index, stringEnd));
      index = stringEnd;
      continue;
    }

    if (source[index] === '@') {
      const ruleEnd = consumeWhile(source, index + 1, (character) => IDENTIFIER_PATTERN.test(character));
      pushToken(tokens, 'atRule', source.slice(index, ruleEnd));
      index = ruleEnd;
      continue;
    }

    if (source[index] === '#' && NUMBER_PATTERN.test(source[index + 1] ?? '')) {
      const colorEnd = consumeWhile(source, index + 1, (character) => NUMBER_PATTERN.test(character));
      pushToken(tokens, 'number', source.slice(index, colorEnd));
      index = colorEnd;
      continue;
    }

    if (/[0-9]/.test(source[index])) {
      const numberEnd = consumeWhile(source, index + 1, (character) => NUMBER_PATTERN.test(character));
      pushToken(tokens, 'number', source.slice(index, numberEnd));
      index = numberEnd;
      continue;
    }

    if (IDENTIFIER_START_PATTERN.test(source[index])) {
      const wordEnd = consumeWhile(source, index + 1, (character) => IDENTIFIER_PATTERN.test(character));
      const nextIndex = getNextNonWhitespaceIndex(source, wordEnd);
      const kind: SyntaxTokenKind =
        source[nextIndex] === ':' ? 'property' : source[nextIndex] === '(' ? 'function' : 'plain';
      pushToken(tokens, kind, source.slice(index, wordEnd));
      index = wordEnd;
      continue;
    }

    pushToken(tokens, 'plain', source[index]);
    index += 1;
  }

  return tokens;
}

// 对 JavaScript 注释、字符串、关键字、属性和函数调用执行轻量分词
function tokenizeJavascript(source: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index);
      const commentEnd = lineEnd === -1 ? source.length : lineEnd;
      pushToken(tokens, 'comment', source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      pushToken(tokens, 'comment', source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (source[index] === '`') {
      const stringEnd = consumeString(source, index);
      const hasClosingBacktick = source[stringEnd - 1] === '`';
      const contentEnd = hasClosingBacktick ? stringEnd - 1 : stringEnd;
      const content = source.slice(index + 1, contentEnd);

      if (CSS_TEMPLATE_PATTERN.test(content)) {
        pushToken(tokens, 'string', '`');
        for (const token of tokenizeCss(content)) pushToken(tokens, token.kind, token.value);
        if (hasClosingBacktick) pushToken(tokens, 'string', '`');
      } else {
        pushToken(tokens, 'string', source.slice(index, stringEnd));
      }
      index = stringEnd;
      continue;
    }

    if (source[index] === '"' || source[index] === "'") {
      const stringEnd = consumeString(source, index);
      pushToken(tokens, 'string', source.slice(index, stringEnd));
      index = stringEnd;
      continue;
    }

    if (/[0-9]/.test(source[index])) {
      const numberEnd = consumeWhile(source, index + 1, (character) => NUMBER_PATTERN.test(character));
      pushToken(tokens, 'number', source.slice(index, numberEnd));
      index = numberEnd;
      continue;
    }

    if (IDENTIFIER_START_PATTERN.test(source[index])) {
      const wordEnd = consumeWhile(source, index + 1, (character) => IDENTIFIER_PATTERN.test(character));
      const word = source.slice(index, wordEnd);
      const nextIndex = getNextNonWhitespaceIndex(source, wordEnd);
      const previousIndex = getPreviousNonWhitespaceIndex(source, index - 1);
      const kind: SyntaxTokenKind = JAVASCRIPT_KEYWORDS.has(word)
        ? 'keyword'
        : source[nextIndex] === ':' || source[previousIndex] === '.'
          ? 'property'
          : source[nextIndex] === '('
            ? 'function'
            : 'plain';
      pushToken(tokens, kind, word);
      index = wordEnd;
      continue;
    }

    if ('=+-*/%!<>|&?:'.includes(source[index])) {
      const operatorEnd = consumeWhile(source, index + 1, (character) => '=+-*/%!<>|&?:'.includes(character));
      pushToken(tokens, 'operator', source.slice(index, operatorEnd));
      index = operatorEnd;
      continue;
    }

    pushToken(tokens, 'plain', source[index]);
    index += 1;
  }

  return tokens;
}

// 判断当前位置是否为 JSX 标签或简写 Fragment 的起始位置
function isJsxTagStart(source: string, index: number): boolean {
  if (source[index] !== '<') return false;

  const next = source[index + 1];
  if (next === '>') return true;
  if (next === '/') return source[index + 2] === '>' || IDENTIFIER_START_PATTERN.test(source[index + 2] ?? '');
  return IDENTIFIER_START_PATTERN.test(next ?? '');
}

// 读取 JSX 标签的结束位置，跳过属性表达式和字符串内的尖括号
function getJsxTagEnd(source: string, start: number): number {
  let braceDepth = 0;
  let index = start + 1;

  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === '`') {
      index = consumeString(source, index);
      continue;
    }
    if (character === '{') braceDepth += 1;
    if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (character === '>' && braceDepth === 0) return index + 1;
    index += 1;
  }

  return source.length;
}

// 对 JSX 标签使用 HTML 语义色，对标签外表达式使用 JavaScript 语义色
function tokenizeJsx(source: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let expressionStart = 0;
  let index = 0;

  while (index < source.length) {
    if (!isJsxTagStart(source, index)) {
      index += 1;
      continue;
    }

    for (const token of tokenizeJavascript(source.slice(expressionStart, index))) {
      pushToken(tokens, token.kind, token.value);
    }

    const tagEnd = getJsxTagEnd(source, index);
    for (const token of tokenizeHtml(source.slice(index, tagEnd))) {
      pushToken(tokens, token.kind, token.value);
    }
    index = tagEnd;
    expressionStart = tagEnd;
  }

  for (const token of tokenizeJavascript(source.slice(expressionStart))) {
    pushToken(tokens, token.kind, token.value);
  }

  return tokens;
}

// 按文件语言选择对应的容错代码 tokenizer
export function tokenizeCode(source: string, language: EditorLanguage): SyntaxToken[] {
  if (language === 'html') return tokenizeHtml(source);
  if (language === 'css') return tokenizeCss(source);
  if (language === 'jsx') return tokenizeJsx(source);
  return tokenizeJavascript(source);
}
