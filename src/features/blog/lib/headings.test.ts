import assert from 'node:assert/strict';
import test from 'node:test';
import { getBlogHeadings } from './headings.ts';

test('getBlogHeadings keeps document order and skips fenced code blocks', () => {
  const headings = getBlogHeadings(`
## First section

\`\`\`ts
## Not a heading
\`\`\`

### [Second section](https://example.com)
`);

  assert.deepEqual(headings, [
    { id: 'section-1', level: 2, text: 'First section' },
    { id: 'section-2', level: 3, text: 'Second section' },
  ]);
});
