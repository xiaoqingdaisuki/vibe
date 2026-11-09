/** 验证管理明暗主题的初始化、切换与持久化的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  applyTheme,
  DEFAULT_THEME,
  getNextTheme,
  getThemeInitializationScript,
  parseTheme,
  THEME_COLORS,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  toggleTheme,
  type Theme,
} from './theme.ts';

function createThemeTargets(initialTheme: Theme = DEFAULT_THEME) {
  const root = { dataset: { theme: initialTheme } };
  const cookieDocument = { cookie: '' };
  let themeColor = '';
  let storedTheme = '';

  return {
    targets: {
      root,
      cookieDocument,
      themeColorMeta: {
        setAttribute(name: string, value: string) {
          assert.equal(name, 'content');
          themeColor = value;
        },
      },
      storage: {
        setItem(key: string, value: string) {
          assert.equal(key, THEME_STORAGE_KEY);
          storedTheme = value;
        },
      },
    },
    getResult: () => ({ storedTheme, theme: root.dataset.theme, themeColor }),
    cookieDocument,
  };
}

function runThemeInitialization(
  savedTheme: string | null,
  storageThrows = false,
  cookieTheme?: string,
  cookieThrows = false,
) {
  const dataset: { theme?: string } = {};
  let themeColor = '';
  let cookie = '';

  runInNewContext(getThemeInitializationScript(cookieTheme), {
    localStorage: {
      getItem(key: string) {
        assert.equal(key, THEME_STORAGE_KEY);
        if (storageThrows) throw new Error('Storage unavailable');
        return savedTheme;
      },
    },
    document: {
      set cookie(value: string) {
        if (cookieThrows) throw new Error('Cookies unavailable');
        cookie = value;
      },
      documentElement: { dataset },
      querySelector(selector: string) {
        assert.equal(selector, 'meta[name="theme-color"]');
        return {
          setAttribute(name: string, value: string) {
            assert.equal(name, 'content');
            themeColor = value;
          },
        };
      },
    },
  });

  return { theme: dataset.theme, themeColor, cookie };
}

function expectedCookie(theme: Theme): string {
  return `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

test('parseTheme defaults missing or invalid values to light', () => {
  assert.equal(parseTheme(null), DEFAULT_THEME);
  assert.equal(parseTheme('system'), DEFAULT_THEME);
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('dark'), 'dark');
});

test('getNextTheme switches between the two supported themes', () => {
  assert.equal(getNextTheme('light'), 'dark');
  assert.equal(getNextTheme('dark'), 'light');
});

test('toggleTheme updates the document theme, browser theme color, and versioned storage value', () => {
  const setup = createThemeTargets();

  assert.equal(toggleTheme(setup.targets), 'dark');
  assert.equal(setup.cookieDocument.cookie, expectedCookie('dark'));
  assert.deepEqual(setup.getResult(), {
    storedTheme: 'dark',
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
  });

  assert.equal(toggleTheme(setup.targets), 'light');
  assert.equal(setup.cookieDocument.cookie, expectedCookie('light'));
  assert.deepEqual(setup.getResult(), {
    storedTheme: 'light',
    theme: 'light',
    themeColor: THEME_COLORS.light,
  });
});

test('applyTheme still updates the page when storage is unavailable', () => {
  const root = { dataset: { theme: DEFAULT_THEME } };

  applyTheme('dark', {
    root,
    storage: {
      setItem() {
        throw new Error('Storage unavailable');
      },
    },
    cookieDocument: {
      set cookie(_value: string) {
        throw new Error('Cookies unavailable');
      },
    },
  });

  assert.equal(root.dataset.theme, 'dark');
});

test('the initialization script restores a saved dark theme before hydration', () => {
  assert.deepEqual(runThemeInitialization('dark'), {
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
    cookie: expectedCookie('dark'),
  });
});

test('the initialization script defaults invalid or inaccessible storage to light', () => {
  assert.deepEqual(runThemeInitialization('system'), {
    theme: DEFAULT_THEME,
    themeColor: THEME_COLORS.light,
    cookie: expectedCookie('light'),
  });
  assert.deepEqual(runThemeInitialization(null, true), {
    theme: DEFAULT_THEME,
    themeColor: THEME_COLORS.light,
    cookie: expectedCookie('light'),
  });
});

test('the initialization script preserves the server cookie theme over stale local storage', () => {
  for (const theme of ['light', 'dark'] as const) {
    assert.deepEqual(runThemeInitialization(getNextTheme(theme), false, theme), {
      theme,
      themeColor: THEME_COLORS[theme],
      cookie: expectedCookie(theme),
    });
    assert.equal(runThemeInitialization(null, true, theme).theme, theme);
  }
});

test('invalid cookie values migrate legacy storage safely without interpolating untrusted input', () => {
  assert.deepEqual(runThemeInitialization('dark', false, '</script>'), {
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
    cookie: expectedCookie('dark'),
  });
  assert.ok(!getThemeInitializationScript('</script>').includes('</script>'));
});

test('blocked cookies do not prevent the initialization script from restoring the theme', () => {
  assert.deepEqual(runThemeInitialization('dark', false, undefined, true), {
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
    cookie: '',
  });
});
