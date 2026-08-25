const RESULT_VARIABLE = 'window.__VIBE_EDITOR_EXECUTION_RESULT__';

const DECLARATION_PREFIX = /^(?:async\s+)?(?:const|let|var|function|class|import|export)\b/;
const STATEMENT_PREFIX = /^(?:await\s+)?(?:if|for|while|switch|try|throw|return)\b/;

// 判断最后一行是否可作为 JavaScript 的返回值表达式
function isResultExpression(value: string): boolean {
  return value.length > 0 && !DECLARATION_PREFIX.test(value) && !STATEMENT_PREFIX.test(value) && value !== '}';
}

// 将最后一个简单表达式改写为可被 Runtime 捕获的执行结果
export function createExecutableJavaScript(source: string): string {
  const lines = source.split('\n');
  const lastLineIndex = lines.findLastIndex((line) => line.trim().length > 0);

  if (lastLineIndex === -1) {
    return `${RESULT_VARIABLE} = undefined;`;
  }

  const lastLine = lines[lastLineIndex] ?? '';
  const indentation = lastLine.match(/^\s*/)?.[0] ?? '';
  const expression = lastLine.trim().replace(/;\s*$/, '');

  if (!isResultExpression(expression)) {
    return `${source}\n${RESULT_VARIABLE} = undefined;`;
  }

  lines[lastLineIndex] = `${indentation}${RESULT_VARIABLE} = (${expression});`;
  return lines.join('\n');
}
