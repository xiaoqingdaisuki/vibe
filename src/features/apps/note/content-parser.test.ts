import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNoteContent } from './content-parser.ts';

test('keeps explanatory text separate from fenced code blocks', () => {
  assert.deepEqual(parseNoteContent('window关闭指令\n\n```shell\ntaskkill /PID 12345 /F\n```'), [
    { type: 'text', content: 'window关闭指令' },
    { type: 'code', language: 'shell', content: 'taskkill /PID 12345 /F' },
  ]);
});

test('automatically recognizes common command lines in existing notes', () => {
  assert.deepEqual(parseNoteContent('window关闭指令\n\ntaskkill /PID 12345 /F\nnetstat -ano | findstr :5173'), [
    { type: 'text', content: 'window关闭指令' },
    { type: 'code', language: '', content: 'taskkill /PID 12345 /F\nnetstat -ano | findstr :5173' },
  ]);
});

test('renders an unclosed fence as a code block instead of losing its content', () => {
  assert.deepEqual(parseNoteContent('说明\n```\npnpm run build'), [
    { type: 'text', content: '说明' },
    { type: 'code', language: '', content: 'pnpm run build' },
  ]);
});
