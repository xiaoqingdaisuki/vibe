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

test('preserves a complete multiline final expression', () => {
  const source = 'Math.max(\n  1,\n  2,\n);';

  assert.equal(
    createExecutableJavaScript(source),
    'window.__VIBE_EDITOR_EXECUTION_RESULT__ = (Math.max(\n  1,\n  2,\n));',
  );
});

test('leaves declarations and invalid in-progress source unchanged', () => {
  assert.equal(createExecutableJavaScript("const greeting = 'hello';"), "const greeting = 'hello';");
  assert.equal(createExecutableJavaScript('const greeting ='), 'const greeting =');
});
