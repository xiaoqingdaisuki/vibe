import assert from 'node:assert/strict';
import test from 'node:test';

import { createPreviewDocument } from './preview-document.ts';

test('builds a React JSX sandbox document with latest CDN runtime dependencies', () => {
  const document = createPreviewDocument({
    code: 'ReactDOM.createRoot(document.getElementById("root")).render(<h1>Hello</h1>);',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'dark',
  });

  assert.match(document, /react@latest/);
  assert.match(document, /react-dom@latest/);
  assert.match(document, /@babel\/standalone@latest/);
  assert.match(document, /runtime: 'classic'/);
  assert.match(document, /<div id="vibe-preview-root"><\/div>/);
  assert.match(document, /script-src 'nonce-test-nonce' https:/);
});

test('marks HTML source for native script execution inside the sandbox', () => {
  const document = createPreviewDocument({
    code: '<div id="root"></div><script>document.getElementById("root").textContent = "Native";</script>',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /"mode":"html"/);
  assert.match(document, /executeHtmlScript/);
  assert.match(document, /sourceScript\.getAttribute\('src'\)/);
});

test('keeps the preview viewport scrollable when source CSS hides body overflow', () => {
  const document = createPreviewDocument({
    code: '<style>body { overflow: hidden; }</style><main>Long content</main>',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /document\.documentElement\.style\.setProperty\('overflow', 'auto', 'important'\)/);
  assert.match(document, /enableViewportScroll\(\);/);
});

test('uses the editor scrollbar treatment inside the preview document', () => {
  const document = createPreviewDocument({
    code: '<main>Long content</main>',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /::-webkit-scrollbar \{\s+width: 5px;/);
  assert.match(document, /::-webkit-scrollbar-thumb \{\s+border-radius: 4px;\s+background: #cccccc;/);
});

test('instruments plain JavaScript and publishes its final expression to Runtime', () => {
  const document = createPreviewDocument({
    code: "function abd() { return 'aaa'; }\nabd();",
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /"mode":"javascript"/);
  assert.match(document, /window\.__VIBE_EDITOR_EXECUTION_RESULT__ = \(abd\(\)\)/);
  assert.match(document, /vibe:online-editor:result/);
  assert.match(document, /runJavaScript/);
});

test('uses AST instrumentation so multiline final expressions remain valid', () => {
  const document = createPreviewDocument({
    code: 'Math.max(\n  1,\n  2,\n);',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /__VIBE_EDITOR_EXECUTION_RESULT__ = \(Math\.max\(\\n  1,\\n  2,\\n\)\)/);
  assert.doesNotMatch(document, /__VIBE_EDITOR_EXECUTION_RESULT__ = \(\);/);
});

test('creates a stylesheet runtime for standalone CSS source', () => {
  const document = createPreviewDocument({
    code: 'body { color: rebeccapurple; }',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.match(document, /"mode":"css"/);
  assert.match(document, /const runCss/);
  assert.match(document, /style\.textContent = payload\.code/);
});

test('serializes editor source without allowing a script-breakout sequence', () => {
  const document = createPreviewDocument({
    code: '</script><script>window.escape = true;</script>',
    nonce: 'test-nonce',
    sessionId: 'session-1',
    theme: 'light',
  });

  assert.doesNotMatch(document, /<\/script><script>window\.escape/);
  assert.match(document, /\\u003c\/script\\u003e/);
});
