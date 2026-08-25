import type { EditorLanguage } from './types';

export type PreviewSourceMode = EditorLanguage;

const REACT_SOURCE_PATTERN = /\bReact(?:DOM)?\b|\bcreateRoot\s*\(|\breturn\s*<[A-Za-z]|\)\s*=>\s*<[A-Za-z]/;
const HTML_ENTRY_PATTERN = /^<\/?(?:!doctype|body|head|html|[a-z])/i;
const JSX_COMPONENT_PATTERN = /^<[A-Z]/;
const CSS_ENTRY_PATTERN = /^(?:@[\w-]+|[.#:[*]|[a-z][\w-]*(?:[#.:[{\s>,+~]|$))/i;
const CSS_DECLARATION_PATTERN = /\{[\s\S]*(?:--[\w-]+|[a-z-]+)\s*:\s*[^=][\s\S]*\}/i;
const JAVASCRIPT_ENTRY_PATTERN =
  /^(?:async\s+)?(?:const|let|var|function|class|import|export|if|for|while|switch|try|throw|return)\b/;

// 用首个规则选择器与声明结构识别独立 CSS，排除对象赋值等 JavaScript
function isCssSource(code: string): boolean {
  const blockStart = code.indexOf('{');
  if (
    blockStart === -1 ||
    JAVASCRIPT_ENTRY_PATTERN.test(code) ||
    !CSS_ENTRY_PATTERN.test(code) ||
    !CSS_DECLARATION_PATTERN.test(code)
  ) {
    return false;
  }

  const selector = code.slice(0, blockStart);
  return !/[=;]/.test(selector);
}

// 根据源码特征自动区分 HTML、React JSX 与原生 JavaScript
export function getPreviewSourceMode(code: string): PreviewSourceMode {
  const normalizedCode = code.replace(/^\s*(?:<!--\s*[\s\S]*?\s*-->\s*)*/, '');

  if (HTML_ENTRY_PATTERN.test(normalizedCode)) {
    return 'html';
  }

  if (JSX_COMPONENT_PATTERN.test(normalizedCode) || REACT_SOURCE_PATTERN.test(normalizedCode)) {
    return 'jsx';
  }

  if (isCssSource(normalizedCode)) {
    return 'css';
  }

  return 'javascript';
}

// 将预览模式映射为对应的 Prettier 与高亮语言
export function getEditorLanguage(code: string): EditorLanguage {
  return getPreviewSourceMode(code);
}
