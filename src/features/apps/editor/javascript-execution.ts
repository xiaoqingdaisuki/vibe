import { parse } from 'acorn';

const RESULT_VARIABLE = 'window.__VIBE_EDITOR_EXECUTION_RESULT__';

// 使用语法树定位最终表达式，避免按行改写破坏多行 JavaScript
export function createExecutableJavaScript(source: string): string {
  try {
    const program = parse(source, { allowAwaitOutsideFunction: true, ecmaVersion: 'latest', sourceType: 'script' });
    const lastStatement = program.body.at(-1);
    if (lastStatement?.type !== 'ExpressionStatement') return source;

    const { end, start } = lastStatement.expression;
    const expression = source.slice(start, end);
    return `${source.slice(0, start)}${RESULT_VARIABLE} = (${expression})${source.slice(end)}`;
  } catch {
    return source;
  }
}
