import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBlockMarkdown } from './render-markdown.ts';

test('streaming Markdown prefixes always render without blocking', () => {
  const partialInputs = [
    ['#', '<p>#</p>'],
    ['##', '<p>##</p>'],
    ['>', '<p>&gt;</p>'],
    ['---partial', '<p>---partial</p>'],
    ['#### heading', '<p>#### heading</p>'],
  ] as const;

  for (const [input, expected] of partialInputs) {
    assert.equal(renderBlockMarkdown(input), expected);
  }
});

test('renders supported blocks and safe inline formatting', () => {
  const markup = renderBlockMarkdown(`# 标题

- **第一项**
- 第二项

[安全链接](https://example.com)
[危险链接](javascript:alert(1))`);

  assert.match(markup, /<h1>标题<\/h1>/);
  assert.match(markup, /<ul><li><strong>第一项<\/strong><\/li><li>第二项<\/li><\/ul>/);
  assert.match(markup, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(markup, /href="javascript:/);
});

test('escapes raw HTML from agent responses', () => {
  const markup = renderBlockMarkdown('<img src=x onerror=alert(1)>');

  assert.equal(markup, '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});
