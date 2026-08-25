import assert from 'node:assert/strict';
import test from 'node:test';

import { getEditorLanguage, getPreviewSourceMode } from './source-mode.ts';

test('detects raw HTML, including a root element and native script tag', () => {
  const code = '<div id="root"></div>\n<script>document.getElementById("root").textContent = "Hello";</script>';

  assert.equal(getPreviewSourceMode(code), 'html');
  assert.equal(getEditorLanguage(code), 'html');
});

test('keeps HTML mode when a Babel script references React', () => {
  const code =
    '<div id="root"></div><script type="text/babel">ReactDOM.createRoot(document.getElementById("root"));</script>';

  assert.equal(getPreviewSourceMode(code), 'html');
});

test('keeps React component source in JSX mode', () => {
  const code =
    'const App = () => <main>Hello</main>;\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';

  assert.equal(getPreviewSourceMode(code), 'jsx');
  assert.equal(getEditorLanguage(code), 'jsx');
});

test('recognizes plain JavaScript without React or HTML syntax', () => {
  const code = "function abd() {\n  return 'aaa';\n}\n\nabd();";

  assert.equal(getPreviewSourceMode(code), 'javascript');
  assert.equal(getEditorLanguage(code), 'javascript');
});
