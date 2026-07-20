import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getBlogHeadings } from '../lib/headings.ts';
import { renderBlogMarkdown } from './render-blog-markdown.ts';

test('renderBlogMarkdown renders markdown as semantic HTML', async () => {
  const source = `
# Hello Web Lab

This is **bold** text.

- First
- Second

## Stable section

### Detail
      `;

  const markup = renderToStaticMarkup(await renderBlogMarkdown(source, getBlogHeadings(source)));

  assert.match(markup, /<h1 id="section-1">Hello Web Lab<\/h1>/);
  assert.match(markup, /<h2 id="section-2">Stable section<\/h2>/);
  assert.match(markup, /<h3 id="section-3">Detail<\/h3>/);
  assert.match(markup, /<strong>bold<\/strong>/);
  assert.match(markup, /<ul>\s*<li>First<\/li>\s*<li>Second<\/li>\s*<\/ul>/);
});
