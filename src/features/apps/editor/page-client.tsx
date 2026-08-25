'use client';

import { useState, type ReactElement } from 'react';

import { CodeEditor } from './components/CodeEditor';
import { EditorTabs } from './components/EditorTabs';
import { PreviewFrame } from './components/PreviewFrame';
import { formatCode } from './format-code';
import { getEditorLanguage } from './source-mode';
import styles from './styles/OnlineEditor.module.css';
import { useOnlineEditorWorkspace } from './use-online-editor-workspace';
import { useVibeTheme } from './use-vibe-theme';

// 渲染多工作区 React 编辑器与实时预览工作台
export function OnlineEditor(): ReactElement {
  const { activeEditor, addEditor, closeEditor, editors, resetActiveEditor, selectEditor, updateEditor } =
    useOnlineEditorWorkspace();
  const theme = useVibeTheme();
  const [formatError, setFormatError] = useState('');
  const [isFormatting, setIsFormatting] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const activeLanguage = getEditorLanguage(activeEditor.code);

  // 使用识别出的语言解析器格式化当前编辑器源码
  async function handleFormat(): Promise<void> {
    if (isFormatting) return;

    setFormatError('');
    setIsFormatting(true);
    try {
      const formattedValue = await formatCode(activeEditor.code, activeLanguage);
      updateEditor(activeEditor.id, formattedValue);
    } catch {
      setFormatError('当前代码无法格式化，请先修正语法。');
    } finally {
      setIsFormatting(false);
    }
  }

  // 立即销毁并重建当前预览沙箱，确保 Runtime 显示本次执行结果
  function handleRun(): void {
    setPreviewRevision((currentRevision) => currentRevision + 1);
  }

  // 仅清空当前活动编辑器，保留其他标签的独立源码
  function handleClear(): void {
    updateEditor(activeEditor.id, '');
  }

  return (
    <section className={styles.editor} aria-labelledby="online-editor-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Live workspace</p>
          <h1 id="online-editor-title" className={styles.title}>
            代码编辑器
          </h1>
        </div>
        <p className={styles.description}>在线编辑 React 与 HTML、CSS、JavaScript，实时预览效果。</p>
      </header>

      <div className={styles.workspace}>
        <section className={styles.sourceWorkspace} aria-label="代码编辑区">
          <EditorTabs
            activeEditorId={activeEditor.id}
            editors={editors}
            onAdd={addEditor}
            onClose={closeEditor}
            onSelect={selectEditor}
          />
          <CodeEditor
            key={activeEditor.id}
            editorId={activeEditor.id}
            editorTitle={activeEditor.title}
            value={activeEditor.code}
            isFormatting={isFormatting}
            language={activeLanguage}
            onChange={(value) => updateEditor(activeEditor.id, value)}
            onClear={handleClear}
            onFormat={handleFormat}
            onReset={resetActiveEditor}
            onRun={handleRun}
          />
          {formatError ? <p className={styles.formatError}>{formatError}</p> : null}
        </section>
        <PreviewFrame key={`${activeEditor.id}-${previewRevision}`} code={activeEditor.code} theme={theme} />
      </div>
      <p className={styles.revision}>Editor → Preview · 支持最新 React CDN · 每个编辑器拥有独立作用域</p>
    </section>
  );
}

export default OnlineEditor;
