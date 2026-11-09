/** 管理明暗主题的初始化、切换与持久化 */

export const DEFAULT_THEME = 'light';
export const THEME_STORAGE_KEY = 'vibe-theme-v1';
export const THEME_COOKIE_NAME = THEME_STORAGE_KEY;
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
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
  cookieDocument?: { cookie: string };
}

// 生成全站可读的主题 Cookie，供后续服务端请求恢复首屏主题
export function getThemeCookie(theme: Theme): string {
  return `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
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
export function applyTheme(theme: Theme, { root, themeColorMeta, storage, cookieDocument }: ThemeTargets): void {
  root.dataset.theme = theme;
  themeColorMeta?.setAttribute('content', THEME_COLORS[theme]);

  try {
    if (cookieDocument) cookieDocument.cookie = getThemeCookie(theme);
  } catch {
    // Cookie 不可用时仍保留当前页面主题和本地存储回退
  }

  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存储不可用时仍应用已选择的主题
  }
}

// 切换主题并持久化，返回新主题值
export function toggleTheme(targets: ThemeTargets): Theme {
  const nextTheme = getNextTheme(parseTheme(targets.root.dataset.theme));
  applyTheme(nextTheme, targets);
  return nextTheme;
}

// 生成防闪烁的主题初始化内联脚本
export function getThemeInitializationScript(cookieTheme?: string): string {
  const serverTheme = parseTheme(cookieTheme);
  const hasCookieTheme = cookieTheme === 'light' || cookieTheme === 'dark';

  return `
    (() => {
      let theme = '${serverTheme}';
      try {
        if (!${hasCookieTheme}) {
          const savedTheme = localStorage.getItem('${THEME_STORAGE_KEY}');
          if (savedTheme === 'light' || savedTheme === 'dark') theme = savedTheme;
        }
      } catch {
        // 本地存储受限时沿用服务端主题
      }
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        theme === 'dark' ? '${THEME_COLORS.dark}' : '${THEME_COLORS.light}',
      );
      try {
        document.cookie = '${THEME_COOKIE_NAME}=' + theme + '; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax';
      } catch {
        // Cookie 受限时仍在首屏绘制前应用主题
      }
    })();
  `;
}
