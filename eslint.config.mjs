/** 配置 Next 与 TypeScript 静态检查，并排除构建产物及第三方代码 */

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import("eslint").Linter.FlatConfig[]} */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'desktop/dist/**',
      'desktop/.build/**',
      'desktop/release/**',
      'public/assets/gba/mgba.js',
    ],
  },
];

export default eslintConfig;
