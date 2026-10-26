/** 验证AI 助手：流式文本分帧发布与批处理调度的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLatestValueBatch,
  createStreamingTextPresenter,
  MARKDOWN_RENDER_INTERVAL_MS,
  TEXT_RENDER_INTERVAL_MS,
  TEXT_RENDER_MAX_CHARS_PER_TICK,
} from './stream-rendering.ts';
import type { TextFrameScheduler } from './stream-rendering.ts';

function createFrameClock() {
  let now = 0;
  let pending: (() => void) | undefined;
  const scheduler: TextFrameScheduler = {
    now: () => now,
    request(callback) {
      pending = callback;
      return () => {
        pending = undefined;
      };
    },
  };
  return {
    scheduler,
    advance(ms: number) {
      now += ms;
      const callback = pending;
      pending = undefined;
      callback?.();
    },
    hasPending: () => pending !== undefined,
  };
}

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

test('keeps a burst incremental and divides the 50-character budget across paint frames', async () => {
  const clock = createFrameClock();
  const values: string[] = [];
  const presenter = createStreamingTextPresenter({
    intervalMs: TEXT_RENDER_INTERVAL_MS,
    maxCharsPerTick: TEXT_RENDER_MAX_CHARS_PER_TICK,
    publish: (value) => values.push(value),
    scheduler: clock.scheduler,
  });
  presenter.push('a'.repeat(100));
  const drained = presenter.drain();
  clock.advance(15);
  assert.equal(values[0].length, 25);
  clock.advance(15);
  assert.equal(values[1].length, 50);
  clock.advance(30);
  assert.equal(values[2].length, 100);
  await drained;
  assert.equal(presenter.current(), 'a'.repeat(100));
  assert.equal(clock.hasPending(), false);
  presenter.cancel();
});

test('caps a stalled frame at 50 code points and cancellation resolves all drains', async () => {
  const clock = createFrameClock();
  const values: string[] = [];
  const presenter = createStreamingTextPresenter({
    intervalMs: 30,
    maxCharsPerTick: 50,
    scheduler: clock.scheduler,
    publish: (value) => values.push(value),
  });
  presenter.append('😀中'.repeat(500));
  const first = presenter.drain();
  const second = presenter.drain();
  clock.advance(1_000);
  assert.equal(Array.from(values[0]).length, 50);
  assert.equal(values[0], '😀中'.repeat(25));
  presenter.cancel();
  await Promise.all([first, second]);
  const stopped = presenter.current();
  presenter.append('late');
  clock.advance(1_000);
  assert.equal(presenter.current(), stopped);
  assert.equal(clock.hasPending(), false);
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
