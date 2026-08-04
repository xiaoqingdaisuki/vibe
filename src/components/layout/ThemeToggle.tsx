'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  getNextTheme,
  parseTheme,
  THEME_CHANGE_EVENT,
  toggleTheme,
  type Theme,
  type ThemeStorage,
} from '@/lib/theme';
import styles from './ThemeToggle.module.css';

// 太阳图标组件
function SunIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3 6.7 6.7M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

// 月亮图标组件
function MoonIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
    </svg>
  );
}

// 订阅主题变更事件
function subscribeToTheme(onThemeChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
}

// 获取当前主题快照
function getThemeSnapshot(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

// 获取服务端默认主题
function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

// 获取本地存储用于主题持久化
function getThemeStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// 亮色/暗色主题切换按钮
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const nextTheme = getNextTheme(theme);

  const handleToggle = () => {
    toggleTheme({
      root: document.documentElement,
      themeColorMeta: document.querySelector('meta[name="theme-color"]'),
      storage: getThemeStorage(),
    });
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={handleToggle}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${nextTheme} theme`}
    >
      <span className={styles.state} aria-hidden="true">
        {theme === 'light' ? <SunIcon /> : <MoonIcon />}
        <span className={styles.label}>{theme === 'light' ? 'Light' : 'Dark'}</span>
      </span>
    </button>
  );
}
