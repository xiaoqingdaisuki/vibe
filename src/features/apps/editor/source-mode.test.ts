import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_EDITOR_CODE } from './data.ts';
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

test('recognizes standalone CSS for formatting, highlighting and preview', () => {
  const code = '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }\nbody { animation: pulse 1s; }';

  assert.equal(getPreviewSourceMode(code), 'css');
  assert.equal(getEditorLanguage(code), 'css');
});

test('recognizes ordinary and custom element CSS selectors', () => {
  assert.equal(getPreviewSourceMode('div { color: red; }'), 'css');
  assert.equal(getPreviewSourceMode('div{color:red}'), 'css');
  assert.equal(getPreviewSourceMode('p { margin: 0; }'), 'css');
  assert.equal(getPreviewSourceMode('p{margin:0}'), 'css');
  assert.equal(getPreviewSourceMode('profile-card { display: block; }'), 'css');
});

test('does not mistake a JavaScript object assignment for body CSS', () => {
  assert.equal(getPreviewSourceMode("body = { color: 'red' };"), 'javascript');
});

test('keeps the default React example in JSX mode when it contains template CSS', () => {
  assert.equal(getPreviewSourceMode(DEFAULT_EDITOR_CODE), 'jsx');
  assert.equal(getEditorLanguage(DEFAULT_EDITOR_CODE), 'jsx');
});

test('recognizes plain JavaScript without React or HTML syntax', () => {
  const code = "function abd() {\n  return 'aaa';\n}\n\nabd();";

  assert.equal(getPreviewSourceMode(code), 'javascript');
  assert.equal(getEditorLanguage(code), 'javascript');
});
