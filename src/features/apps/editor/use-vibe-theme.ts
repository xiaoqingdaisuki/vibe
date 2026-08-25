'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, parseTheme, THEME_CHANGE_EVENT, type Theme } from '@/lib/theme';

// 订阅网站根节点的主题切换事件
function subscribeToTheme(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

// 从文档根节点读取浏览器当前主题
function getThemeSnapshot(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

// 提供与服务端首屏一致的默认主题快照
function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

// 在 Lab 中同步 Vibe 外壳主题，不影响固定 One Dark 代码画布
export function useVibeTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
}
