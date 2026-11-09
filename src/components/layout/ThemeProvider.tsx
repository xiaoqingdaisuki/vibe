/** 传递服务端主题快照并订阅浏览器主题变化 */

'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_THEME, parseTheme, THEME_CHANGE_EVENT, type Theme } from '@/lib/theme';

const ServerThemeContext = createContext<Theme>(DEFAULT_THEME);

interface ThemeProviderProps {
  initialTheme: Theme;
  children: ReactNode;
}

// 向客户端组件提供与服务端 HTML 一致的水合主题
export function ThemeProvider({ initialTheme, children }: ThemeProviderProps) {
  return <ServerThemeContext value={initialTheme}>{children}</ServerThemeContext>;
}

// 订阅同页主题切换，卸载时移除监听
function subscribeToTheme(onThemeChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
}

// 从已在首屏绘制前初始化的根节点读取主题
function getThemeSnapshot(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

// 使用服务端快照完成水合，再同步当前浏览器主题
export function useTheme(): Theme {
  const serverTheme = useContext(ServerThemeContext);
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => serverTheme);
}
