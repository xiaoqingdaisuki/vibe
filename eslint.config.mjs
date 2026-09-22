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
