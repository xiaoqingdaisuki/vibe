import type { EditorLanguage } from './types';

type PrettierPlugin = Record<string, unknown>;

// 为当前文件语言选择 Prettier 可识别的解析器
export function getPrettierParser(language: EditorLanguage): string {
  if (language === 'html') return 'html';
  if (language === 'css') return 'css';
  return 'babel';
}

// 按文件语言动态加载最小的 Prettier 插件集合
async function loadPrettierPlugins(language: EditorLanguage): Promise<PrettierPlugin[]> {
  if (language === 'html') {
    const html = await import('prettier/plugins/html');
    return [html];
  }

  if (language === 'css') {
    const postcss = await import('prettier/plugins/postcss');
    return [postcss];
  }

  const [babel, estree] = await Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]);
  return [babel, estree];
}

// 在浏览器端按需加载格式化器并返回规范化后的源码
export async function formatCode(value: string, language: EditorLanguage): Promise<string> {
  const [prettier, plugins] = await Promise.all([import('prettier/standalone'), loadPrettierPlugins(language)]);

  return prettier.format(value, {
    parser: getPrettierParser(language),
    plugins,
    printWidth: 100,
    tabWidth: 2,
    semi: true,
    singleQuote: true,
  });
}
