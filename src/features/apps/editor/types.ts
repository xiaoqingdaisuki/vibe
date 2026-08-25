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
