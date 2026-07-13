import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderSkillNotes } from './render-skill-notes.ts';

test('renderSkillNotes formats inline markdown without injecting unsafe HTML', () => {
  const markup = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      ...renderSkillNotes(`
# Notes

This is **bold**, *italic*, and \`code\`.

- First
- Second

Raw HTML: <img src=x onerror=alert(1)>

[Safe](https://example.com)
[Unsafe](javascript:alert(1))
      `),
    ),
  );

  assert.match(markup, /<h1>Notes<\/h1>/);
  assert.match(markup, /<strong>bold<\/strong>/);
  assert.match(markup, /<em>italic<\/em>/);
  assert.match(markup, /<code>code<\/code>/);
  assert.match(markup, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(markup, /Raw HTML: &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, /<a href="https:\/\/example\.com"/);
  assert.doesNotMatch(markup, /href="javascript:/);
  assert.doesNotMatch(markup, /<img/);
});
