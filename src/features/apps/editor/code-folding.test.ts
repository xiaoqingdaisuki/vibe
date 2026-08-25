import assert from 'node:assert/strict';
import test from 'node:test';

import { createFoldedCodeView, getFoldableRegions, getSourceEditFromFoldedChange } from './code-folding.ts';

test('识别 JavaScript 作用域并忽略字符串和注释内的花括号', () => {
  const source = [
    'function render() {',
    "  const message = '{ not a scope }';",
    '  // { not a scope }',
    "  return 'ok';",
    '}',
  ].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'javascript'), [{ endLine: 4, key: '0:4', startLine: 0 }]);
});

test('识别多行模板字符串内的 CSS 作用域', () => {
  const source = ['const styleText = `', '.card {', '  color: #fff;', '}', '`;'].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'jsx'), [
    { endLine: 4, key: '0:4', startLine: 0 },
    { endLine: 3, key: '1:3', startLine: 1 },
  ]);
});

test('识别三反引号代码围栏范围', () => {
  const source = ['```html', '<section>', '</section>', '```'].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'javascript'), [{ endLine: 3, key: '0:3', startLine: 0 }]);
});

test('折叠时保留模板字符串的结束符，避免污染后续代码高亮', () => {
  const source = ['const styleText = `', '.card { color: #fff; }', '`;', 'function run() {}'].join('\n');
  const regions = getFoldableRegions(source, 'javascript');
  const view = createFoldedCodeView({ collapsedRegionKeys: new Set(['0:2']), regions, source });

  assert.equal(view.displayValue, 'const styleText = `\n…\n`;\nfunction run() {}');
});

test('识别多行括号、数组和块注释范围', () => {
  const source = ['run(', '  [', '    1,', '  ],', ');', '/*', ' * description', ' */'].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'javascript'), [
    { endLine: 4, key: '0:4', startLine: 0 },
    { endLine: 3, key: '1:3', startLine: 1 },
    { endLine: 7, key: '5:7', startLine: 5 },
  ]);
});

test('识别 JSX Fragment 作用域', () => {
  const source = ['<>', '  <span>content</span>', '</>'].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'jsx'), [{ endLine: 2, key: '0:2', startLine: 0 }]);
});

test('识别 HTML 成对标签作用域', () => {
  const source = ['<main>', '  <section>', '    content', '  </section>', '</main>'].join('\n');

  assert.deepEqual(getFoldableRegions(source, 'html'), [
    { endLine: 4, key: '0:4', startLine: 0 },
    { endLine: 3, key: '1:3', startLine: 1 },
  ]);
});

test('折叠后仍可将可见内容的编辑映射回完整源码', () => {
  const source = ['function demo() {', "  return 'ok';", '}', 'demo();'].join('\n');
  const regions = getFoldableRegions(source, 'javascript');
  const view = createFoldedCodeView({ collapsedRegionKeys: new Set(['0:2']), regions, source });

  assert.equal(view.displayValue, 'function demo() {\n…\n}\ndemo();');
  assert.deepEqual(getSourceEditFromFoldedChange(view, 'function demo() {\n…\n}\nrun();'), {
    end: source.length - 'demo();'.length + 'demo'.length,
    insertedText: 'run',
    start: source.length - 'demo();'.length,
  });
});
