import assert from 'node:assert/strict';
import test from 'node:test';
import { createLatestValueBatch, MARKDOWN_RENDER_INTERVAL_MS, TEXT_RENDER_INTERVAL_MS } from './stream-rendering.ts';

test('coalesces bursts at 30ms while Markdown receives only the newest 100ms snapshot', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const text: string[] = [];
  const markdown: string[] = [];
  const rich = createLatestValueBatch<string>(MARKDOWN_RENDER_INTERVAL_MS, (value) => markdown.push(value));
  const plain = createLatestValueBatch<string>(TEXT_RENDER_INTERVAL_MS, (value) => {
    text.push(value);
    rich.push(value);
  });
  t.after(() => {
    plain.cancel();
    rich.cancel();
  });

  plain.push('A');
  plain.push('AB');
  t.mock.timers.tick(29);
  assert.deepEqual(text, []);
  t.mock.timers.tick(1);
  assert.deepEqual(text, ['AB']);
  for (const value of ['ABC', 'ABCD', 'ABCDE']) {
    plain.push(value);
    t.mock.timers.tick(30);
  }
  assert.deepEqual(markdown, []);
  t.mock.timers.tick(10);
  assert.deepEqual(markdown, ['ABCDE']);
  assert.deepEqual(text, ['AB', 'ABC', 'ABCD', 'ABCDE']);
});

test('flushes the latest final answer immediately and cancels pending updates on stop', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const values: string[] = [];
  const batch = createLatestValueBatch<string>(30, (value) => values.push(value));
  batch.push('first');
  batch.push('complete answer');
  batch.flush();
  t.mock.timers.tick(100);
  assert.deepEqual(values, ['complete answer']);
  batch.push('cancelled');
  batch.cancel();
  t.mock.timers.tick(100);
  assert.deepEqual(values, ['complete answer']);
});

test('aligns later Markdown updates to the last publication without an extra text window', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const values: string[] = [];
  const batch = createLatestValueBatch<string>(100, (value) => values.push(value));
  t.after(() => batch.cancel());
  batch.push('first');
  t.mock.timers.tick(100);
  t.mock.timers.tick(25);
  batch.push('latest');
  t.mock.timers.tick(74);
  assert.deepEqual(values, ['first']);
  t.mock.timers.tick(1);
  assert.deepEqual(values, ['first', 'latest']);
});
