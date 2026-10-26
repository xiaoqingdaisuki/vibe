/** 在线编辑器：类型与数据契约 */

export type EditorLanguage = 'css' | 'html' | 'javascript' | 'jsx';

export interface EditorDocument {
  code: string;
  id: string;
  title: string;
}

export interface OnlineEditorWorkspace {
  activeEditorId: string;
  editors: EditorDocument[];
  version: 2;
}
