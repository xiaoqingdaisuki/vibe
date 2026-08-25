import type { EditorLanguage } from './types';

export type PreviewSourceMode = 'html' | 'javascript' | 'jsx';

const REACT_SOURCE_PATTERN = /\bReact(?:DOM)?\b|\bcreateRoot\s*\(|\breturn\s*<[A-Za-z]|\)\s*=>\s*<[A-Za-z]/;
const HTML_ENTRY_PATTERN = /^<\/?(?:!doctype|body|head|html|[a-z])/i;
const JSX_COMPONENT_PATTERN = /^<[A-Z]/;

// 根据源码特征自动区分 HTML、React JSX 与原生 JavaScript
export function getPreviewSourceMode(code: string): PreviewSourceMode {
  const normalizedCode = code.replace(/^\s*(?:<!--\s*[\s\S]*?\s*-->\s*)*/, '');

  if (HTML_ENTRY_PATTERN.test(normalizedCode)) {
    return 'html';
  }

  if (JSX_COMPONENT_PATTERN.test(normalizedCode) || REACT_SOURCE_PATTERN.test(normalizedCode)) {
    return 'jsx';
  }

  return 'javascript';
}

// 将预览模式映射为对应的 Prettier 与高亮语言
export function getEditorLanguage(code: string): EditorLanguage {
  return getPreviewSourceMode(code);
}
