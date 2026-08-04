export const DEFAULT_THEME = 'light';
export const THEME_STORAGE_KEY = 'vibe-theme-v1';
export const THEME_CHANGE_EVENT = 'vibe:themechange';

export type Theme = 'light' | 'dark';

export const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#121116',
};

export interface ThemeRoot {
  dataset: {
    theme?: string;
  };
}

export interface ThemeColorMeta {
  setAttribute(name: string, value: string): void;
}

export interface ThemeStorage {
  setItem(key: string, value: string): void;
}

export interface ThemeTargets {
  root: ThemeRoot;
  themeColorMeta?: ThemeColorMeta | null;
  storage?: ThemeStorage | null;
}

// 解析主题值，非法值回退到默认主题
export function parseTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : DEFAULT_THEME;
}

// 获取与当前主题相反的主题值
export function getNextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light';
}

// 将主题应用到 DOM 和存储中
export function applyTheme(theme: Theme, { root, themeColorMeta, storage }: ThemeTargets): void {
  root.dataset.theme = theme;
  themeColorMeta?.setAttribute('content', THEME_COLORS[theme]);

  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies when storage is unavailable.
  }
}

// 切换主题并持久化，返回新主题值
export function toggleTheme(targets: ThemeTargets): Theme {
  const nextTheme = getNextTheme(parseTheme(targets.root.dataset.theme));
  applyTheme(nextTheme, targets);
  return nextTheme;
}

// 生成防闪烁的主题初始化内联脚本
export function getThemeInitializationScript(): string {
  return `
    const applyInitialTheme = (theme) => {
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        theme === 'dark' ? '${THEME_COLORS.dark}' : '${THEME_COLORS.light}',
      );
    };

    try {
      const savedTheme = localStorage.getItem('${THEME_STORAGE_KEY}');
      applyInitialTheme(savedTheme === 'dark' ? 'dark' : '${DEFAULT_THEME}');
    } catch {
      applyInitialTheme('${DEFAULT_THEME}');
    }
  `;
}
