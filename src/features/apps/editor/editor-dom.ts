/** 在线编辑器：标签与面板的 DOM 标识生成 */

// 将工作区文档标识转换为可安全引用的标签 DOM id
export function getEditorTabId(editorId: string): string {
  return `editor-tab-${encodeURIComponent(editorId)}`;
}
