import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from 'react';

import {
  createFoldedCodeView,
  getFoldableRegions,
  getSourceEditFromFoldedChange,
  type CodeFoldRegion,
} from '../code-folding';
import { indentCode, outdentCode, type TextEditResult } from '../editor-commands';
import styles from '../styles/OnlineEditor.module.css';
import { tokenizeCode, type SyntaxTokenKind } from '../tokenizer';
import type { EditorLanguage } from '../types';

interface CodeEditorProps {
  editorTitle: string;
  isFormatting: boolean;
  language: EditorLanguage;
  onChange: (value: string) => void;
  onClear: () => void;
  onFormat: () => Promise<void>;
  onReset: () => void;
  onRun: () => void;
  value: string;
}

const INDENT = '  ';

const SOURCE_LABELS: Record<EditorLanguage, string> = {
  css: 'CSS source',
  html: 'HTML source',
  javascript: 'JavaScript source',
  jsx: 'React source',
};

const TOKEN_CLASS_NAMES: Partial<Record<SyntaxTokenKind, string>> = {
  atRule: styles.tokenAtRule,
  attribute: styles.tokenAttribute,
  comment: styles.tokenComment,
  function: styles.tokenFunction,
  keyword: styles.tokenKeyword,
  number: styles.tokenNumber,
  operator: styles.tokenOperator,
  property: styles.tokenProperty,
  string: styles.tokenString,
  tag: styles.tokenTag,
};

// 渲染统一的原生输入层与 One Dark 代码显示层
export function CodeEditor({
  editorTitle,
  isFormatting,
  language,
  onChange,
  onClear,
  onFormat,
  onReset,
  onRun,
  value,
}: CodeEditorProps) {
  const codeLayerRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<TextEditResult | null>(null);
  const [collapsedRegionKeys, setCollapsedRegionKeys] = useState<Set<string>>(() => new Set());
  const foldableRegions = getFoldableRegions(value, language);
  const foldedCodeView = createFoldedCodeView({ collapsedRegionKeys, regions: foldableRegions, source: value });
  const tokens = tokenizeCode(foldedCodeView.displayValue, language);

  // 内容更新后恢复缩进操作计算出的文本选区
  useEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    const input = inputRef.current;
    if (!pendingSelection || !input) return;

    input.setSelectionRange(pendingSelection.selectionStart, pendingSelection.selectionEnd);
    pendingSelectionRef.current = null;
  }, [value]);

  // 应用缩进文本编辑并让输入框继续保持焦点
  function applyTextEdit(result: TextEditResult): void {
    pendingSelectionRef.current = result;
    onChange(result.value);
    inputRef.current?.focus();
  }

  // 在基于完整源码计算文本命令前先展开折叠区域，避免投影偏移错位
  function ensureExpandedForTextEdit(): boolean {
    if (collapsedRegionKeys.size === 0) return true;

    setCollapsedRegionKeys(new Set());
    inputRef.current?.focus();
    return false;
  }

  // 为当前光标或选区增加一个缩进单位
  function handleIndent(): void {
    const input = inputRef.current;
    if (!input || !ensureExpandedForTextEdit()) return;

    applyTextEdit(
      indentCode({
        value,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        indent: INDENT,
      }),
    );
  }

  // 为当前光标或选区减少一个缩进单位
  function handleOutdent(): void {
    const input = inputRef.current;
    if (!input || !ensureExpandedForTextEdit()) return;

    applyTextEdit(
      outdentCode({
        value,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        indent: INDENT,
      }),
    );
  }

  // 格式化前后清除折叠状态，避免格式变化后折叠到不对应的代码行
  async function handleFormat(): Promise<void> {
    await onFormat();
    setCollapsedRegionKeys(new Set());
  }

  // 恢复示例前清除折叠状态，让完整源码立即可见
  function handleReset(): void {
    setCollapsedRegionKeys(new Set());
    onReset();
  }

  // 强制当前源码重新创建预览沙箱并清空旧的运行结果
  function handleRun(): void {
    setCollapsedRegionKeys(new Set());
    onRun();
  }

  // 清空当前编辑器源码，并同步移除所有折叠状态
  function handleClear(): void {
    setCollapsedRegionKeys(new Set());
    onClear();
    inputRef.current?.focus();
  }

  // 拦截键盘命令以执行缩进或按需格式化源码
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void handleFormat();
      return;
    }

    if (event.key !== 'Tab') return;

    event.preventDefault();
    if (event.shiftKey) {
      handleOutdent();
      return;
    }

    handleIndent();
  }

  // 将输入层滚动位置同步给代码和行号显示层
  function handleScroll(event: UIEvent<HTMLTextAreaElement>): void {
    const { scrollLeft, scrollTop } = event.currentTarget;
    if (codeLayerRef.current) {
      codeLayerRef.current.scrollLeft = scrollLeft;
      codeLayerRef.current.scrollTop = scrollTop;
    }
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
  }

  // 将折叠投影中的输入变更还原到完整源码，并在编辑后展开作用域
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const edit = getSourceEditFromFoldedChange(foldedCodeView, event.currentTarget.value);
    if (!edit) {
      setCollapsedRegionKeys(new Set());
      return;
    }

    setCollapsedRegionKeys(new Set());
    onChange(`${value.slice(0, edit.start)}${edit.insertedText}${value.slice(edit.end)}`);
  }

  // 切换指定作用域的展开状态，保留其他独立作用域的选择
  function handleToggleFold(region: CodeFoldRegion): void {
    setCollapsedRegionKeys((current) => {
      const next = new Set(current);
      if (next.has(region.key)) {
        next.delete(region.key);
      } else {
        next.add(region.key);
      }
      return next;
    });
  }

  // 鼠标操作折叠按钮时保持输入框焦点与现有光标位置
  function handleFoldPointerDown(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
  }

  return (
    <section className={styles.codePanel} aria-labelledby="source-panel-title">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelLabel}>{SOURCE_LABELS[language]}</p>
          <h2 id="source-panel-title" className={styles.panelTitle}>
            {editorTitle}
          </h2>
        </div>
        <p className={styles.language}>{language.toUpperCase()}</p>
      </div>

      <div className={styles.editorToolbar} aria-label="编辑命令">
        <button className={styles.editorButton} type="button" onClick={handleRun}>
          立即运行
        </button>
        <button className={styles.editorButton} type="button" onClick={handleClear}>
          清空编辑器
        </button>
        <button
          className={styles.editorButton}
          type="button"
          onClick={() => void handleFormat()}
          disabled={isFormatting}
        >
          {isFormatting ? '格式化中' : '格式化'}
        </button>
        <button className={styles.editorButton} type="button" onClick={handleReset}>
          重置示例
        </button>
      </div>

      <div className={styles.editorSurface}>
        <div ref={lineNumbersRef} className={styles.lineNumbers} aria-label="代码折叠控制">
          {foldedCodeView.lines.map((line) => {
            if (line.type === 'placeholder') {
              return (
                <div key={line.key} className={styles.lineNumberRow} aria-hidden="true">
                  <span className={styles.foldPlaceholder}>…</span>
                </div>
              );
            }

            const region = line.foldRegion;
            const isCollapsed = region ? collapsedRegionKeys.has(region.key) : false;
            return (
              <div key={line.key} className={styles.lineNumberRow}>
                {region ? (
                  <button
                    className={styles.foldButton}
                    type="button"
                    onClick={() => handleToggleFold(region)}
                    onMouseDown={handleFoldPointerDown}
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? '展开' : '收起'}第 ${line.lineNumber} 行作用域`}
                    title={`${isCollapsed ? '展开' : '收起'}作用域`}
                  >
                    <svg
                      className={styles.foldIcon}
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M11.7637 17.2041L10.1729 15.6133L10.1758 15.6104L3.28125 8.71582L4.87207 7.125L11.7666 14.0195L18.6582 7.12793L20.249 8.71875L11.7637 17.2041Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                ) : (
                  <span className={styles.foldPlaceholder} aria-hidden="true" />
                )}
                <span className={styles.lineNumberText}>{line.lineNumber}</span>
              </div>
            );
          })}
        </div>
        <pre ref={codeLayerRef} className={styles.codeLayer} aria-hidden="true">
          <code>
            {tokens.map((token, index) => {
              const className = TOKEN_CLASS_NAMES[token.kind];
              if (!className) return <span key={`${token.kind}-${index}`}>{token.value}</span>;

              return (
                <span key={`${token.kind}-${index}`} className={className}>
                  {token.value}
                </span>
              );
            })}
          </code>
        </pre>
        <textarea
          ref={inputRef}
          className={styles.codeInput}
          value={foldedCodeView.displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          aria-label={`编辑 ${editorTitle}`}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          wrap="off"
        />
      </div>
    </section>
  );
}
