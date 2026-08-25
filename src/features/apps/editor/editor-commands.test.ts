import assert from 'node:assert/strict';
import test from 'node:test';
import { indentCode, outdentCode } from './editor-commands.ts';

test('indents the current line and preserves the cursor after the inserted indent', () => {
  assert.deepEqual(indentCode({ value: 'alpha', selectionStart: 2, selectionEnd: 2, indent: '  ' }), {
    value: '  alpha',
    selectionStart: 4,
    selectionEnd: 4,
  });
});

test('indents every selected line without touching adjacent lines', () => {
  assert.deepEqual(indentCode({ value: 'one\ntwo\nthree', selectionStart: 0, selectionEnd: 7, indent: '  ' }), {
    value: '  one\n  two\nthree',
    selectionStart: 2,
    selectionEnd: 11,
  });
});

test('outdents spaces and tabs while retaining selected source positions', () => {
  assert.deepEqual(outdentCode({ value: '  one\n\ttwo\nthree', selectionStart: 2, selectionEnd: 11, indent: '  ' }), {
    value: 'one\ntwo\nthree',
    selectionStart: 0,
    selectionEnd: 8,
  });
});

test('keeps unindented lines intact when outdenting a selection', () => {
  assert.deepEqual(outdentCode({ value: 'one\n  two', selectionStart: 0, selectionEnd: 9, indent: '  ' }), {
    value: 'one\ntwo',
    selectionStart: 0,
    selectionEnd: 7,
  });
});
