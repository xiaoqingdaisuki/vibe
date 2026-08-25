import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenizeCode } from './tokenizer.ts';

function getTokenValues(source: string, language: 'html' | 'css' | 'javascript' | 'jsx', kind: string): string[] {
  return tokenizeCode(source, language)
    .filter((token) => token.kind === kind)
    .map((token) => token.value);
}

function reconstructSource(source: string, language: 'html' | 'css' | 'javascript' | 'jsx'): string {
  return tokenizeCode(source, language)
    .map((token) => token.value)
    .join('');
}

test('preserves every character while tokenizing malformed HTML', () => {
  const source = '<button aria-label="Run">Run<!-- note';
  assert.equal(reconstructSource(source, 'html'), source);
  assert.deepEqual(getTokenValues(source, 'html', 'tag'), ['button']);
  assert.deepEqual(getTokenValues(source, 'html', 'attribute'), ['aria-label']);
  assert.deepEqual(getTokenValues(source, 'html', 'string'), ['"Run"']);
  assert.deepEqual(getTokenValues(source, 'html', 'comment'), ['<!-- note']);
});

test('recognizes CSS rules, properties, values and comments', () => {
  const source = '@keyframes spin { color: #7c3aed; animation: orbit 1s; /* loop */ }';
  assert.equal(reconstructSource(source, 'css'), source);
  assert.deepEqual(getTokenValues(source, 'css', 'atRule'), ['@keyframes']);
  assert.deepEqual(getTokenValues(source, 'css', 'property'), ['color', 'animation']);
  assert.deepEqual(getTokenValues(source, 'css', 'number'), ['#7c3aed', '1']);
  assert.deepEqual(getTokenValues(source, 'css', 'comment'), ['/* loop */']);
});

test('recognizes JavaScript comments, keywords, calls, strings and operators', () => {
  const source = 'const run = () => log("ok"); // done';
  assert.equal(reconstructSource(source, 'javascript'), source);
  assert.deepEqual(getTokenValues(source, 'javascript', 'keyword'), ['const']);
  assert.deepEqual(getTokenValues(source, 'javascript', 'function'), ['log']);
  assert.deepEqual(getTokenValues(source, 'javascript', 'string'), ['"ok"']);
  assert.deepEqual(getTokenValues(source, 'javascript', 'comment'), ['// done']);
});

test('recognizes JavaScript properties and literal values', () => {
  const source = 'const settings = { enabled: true }; settings.enabled;';

  assert.equal(reconstructSource(source, 'javascript'), source);
  assert.deepEqual(getTokenValues(source, 'javascript', 'property'), ['enabled', 'enabled']);
  assert.deepEqual(getTokenValues(source, 'javascript', 'keyword'), ['const', 'true']);
});

test('recognizes JSX tags, attributes and surrounding JavaScript', () => {
  const source = 'const view = <Button tone="primary" onClick={run}>Save</Button>;';

  assert.equal(reconstructSource(source, 'jsx'), source);
  assert.deepEqual(getTokenValues(source, 'jsx', 'keyword'), ['const']);
  assert.deepEqual(getTokenValues(source, 'jsx', 'tag'), ['Button', 'Button']);
  assert.deepEqual(getTokenValues(source, 'jsx', 'attribute'), ['tone', 'onClick', 'run']);
  assert.deepEqual(getTokenValues(source, 'jsx', 'string'), ['"primary"']);
});

test('highlights CSS and JavaScript embedded in HTML with their language colors', () => {
  const source = '<style>.card { color: #7c3aed; }</style>\n<script>const total = Math.max(1, 2);</script>';

  assert.deepEqual(getTokenValues(source, 'html', 'property'), ['color', 'max']);
  assert.deepEqual(getTokenValues(source, 'html', 'number'), ['#7c3aed', '1', '2']);
  assert.deepEqual(getTokenValues(source, 'html', 'keyword'), ['const']);
  assert.equal(reconstructSource(source, 'html'), source);
});

test('highlights CSS declarations inside a JavaScript template literal', () => {
  const source = 'const styleText = `\n.card {\n  color: #7c3aed;\n}\n`;';

  assert.deepEqual(getTokenValues(source, 'jsx', 'property'), ['color']);
  assert.deepEqual(getTokenValues(source, 'jsx', 'number'), ['#7c3aed']);
  assert.equal(reconstructSource(source, 'jsx'), source);
});
