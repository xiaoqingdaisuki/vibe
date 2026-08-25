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
export function EditorTabs({ activeEditorId, editors, onAdd, onClose, onSelect }: EditorTabsProps) {
  const canCloseEditor = editors.length > 1;

  return (
    <div className={styles.tabs} role="tablist" aria-label="编辑器列表">
      {editors.map((editor, index) => {
        const selected = editor.id === activeEditorId;

        return (
          <div key={editor.id} className={styles.tabSequenceItem}>
            <div className={styles.editorTabItem} data-active={selected}>
              <button
                className={selected ? styles.tabActive : styles.tab}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="source-panel-title"
                onClick={() => onSelect(editor.id)}
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
