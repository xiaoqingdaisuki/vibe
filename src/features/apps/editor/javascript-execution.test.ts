import assert from 'node:assert/strict';
import test from 'node:test';

import { createExecutableJavaScript } from './javascript-execution.ts';

test('captures the final JavaScript expression for the Runtime result', () => {
  const source = "function abd() {\n  return 'aaa';\n}\n\nabd();";

  assert.equal(
    createExecutableJavaScript(source),
    "function abd() {\n  return 'aaa';\n}\n\nwindow.__VIBE_EDITOR_EXECUTION_RESULT__ = (abd());",
  );
});

test('runs declarations without incorrectly treating them as an expression result', () => {
  assert.equal(
    createExecutableJavaScript("const greeting = 'hello';"),
    "const greeting = 'hello';\nwindow.__VIBE_EDITOR_EXECUTION_RESULT__ = undefined;",
  );
});
