import type { KeyboardEvent, ReactElement } from 'react';

import { getEditorTabId } from '../editor-dom';
import type { EditorDocument } from '../types';
import styles from '../styles/OnlineEditor.module.css';

interface EditorTabsProps {
  activeEditorId: string;
  editors: EditorDocument[];
  onAdd: () => void;
  onClose: (editorId: string) => void;
  onSelect: (editorId: string) => void;
}

// 渲染可新建、切换与按需关闭的独立编辑器标签
export function EditorTabs({ activeEditorId, editors, onAdd, onClose, onSelect }: EditorTabsProps): ReactElement {
  const canCloseEditor = editors.length > 1;

  // 使用方向键和 Home/End 在编辑器标签之间移动焦点
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, editorId: string): void {
    const currentIndex = editors.findIndex((editor) => editor.id === editorId);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % editors.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + editors.length) % editors.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = editors.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextEditor = editors[nextIndex];
    if (!nextEditor) return;
    onSelect(nextEditor.id);
    document.getElementById(getEditorTabId(nextEditor.id))?.focus();
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label="编辑器列表">
      {editors.map((editor, index) => {
        const selected = editor.id === activeEditorId;

        return (
          <div key={editor.id} className={styles.tabSequenceItem}>
            <div className={styles.editorTabItem} data-active={selected}>
              <button
                id={getEditorTabId(editor.id)}
                className={selected ? styles.tabActive : styles.tab}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="source-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(editor.id)}
                onKeyDown={(event) => handleTabKeyDown(event, editor.id)}
              >
                {editor.title}
              </button>
              {canCloseEditor ? (
                <button
                  className={styles.closeEditorButton}
                  type="button"
                  aria-label={`关闭 ${editor.title}`}
                  onClick={() => onClose(editor.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
            {index < editors.length - 1 ? (
              <span className={styles.tabSeparator} aria-hidden="true">
                /
              </span>
            ) : null}
          </div>
        );
      })}
      <button className={styles.addEditorButton} type="button" onClick={onAdd} aria-label="新建编辑器">
        + 新建
      </button>
    </div>
  );
}
