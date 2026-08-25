import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_EDITOR_CODE } from './data.ts';
import { formatCode, getPrettierParser } from './format-code.ts';

test('formats HTML, CSS, JavaScript and JSX with their matching Prettier parser', async () => {
  assert.equal(getPrettierParser('html'), 'html');
  assert.equal(getPrettierParser('css'), 'css');
  assert.equal(getPrettierParser('javascript'), 'babel');
  assert.equal(getPrettierParser('jsx'), 'babel');

  const [html, css, javascript, jsx] = await Promise.all([
    formatCode('<main><h1>Hello</h1></main>', 'html'),
    formatCode('.orb{color:red}', 'css'),
    formatCode('const value={name:"Vibe"}', 'javascript'),
    formatCode('const App=()=> <main>Hello</main>', 'jsx'),
  ]);

  assert.equal(html, '<main><h1>Hello</h1></main>\n');
  assert.equal(css, '.orb {\n  color: red;\n}\n');
  assert.equal(javascript, "const value = { name: 'Vibe' };\n");
  assert.equal(jsx, 'const App = () => <main>Hello</main>;\n');
});

test('formats the default React example with its JSX parser', async () => {
  const formatted = await formatCode(DEFAULT_EDITOR_CODE, 'jsx');

  assert.match(formatted, /const styleText = `/);
  assert.match(formatted, /createRoot\(document\.getElementById\('root'\)\)\.render\(<WelcomeAnimation \/>\);/);
});
