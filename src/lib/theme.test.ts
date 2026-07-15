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
  THEME_STORAGE_KEY,
  toggleTheme,
  type Theme,
} from './theme.ts';

function createThemeTargets(initialTheme: Theme = DEFAULT_THEME) {
  const root = { dataset: { theme: initialTheme } };
  let themeColor = '';
  let storedTheme = '';

  return {
    targets: {
      root,
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
  };
}

function runThemeInitialization(savedTheme: string | null, storageThrows = false) {
  const dataset: { theme?: string } = {};
  let themeColor = '';

  runInNewContext(getThemeInitializationScript(), {
    localStorage: {
      getItem(key: string) {
        assert.equal(key, THEME_STORAGE_KEY);
        if (storageThrows) throw new Error('Storage unavailable');
        return savedTheme;
      },
    },
    document: {
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

  return { theme: dataset.theme, themeColor };
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
  assert.deepEqual(setup.getResult(), {
    storedTheme: 'dark',
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
  });

  assert.equal(toggleTheme(setup.targets), 'light');
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
  });

  assert.equal(root.dataset.theme, 'dark');
});

test('the initialization script restores a saved dark theme before hydration', () => {
  assert.deepEqual(runThemeInitialization('dark'), {
    theme: 'dark',
    themeColor: THEME_COLORS.dark,
  });
});

test('the initialization script defaults invalid or inaccessible storage to light', () => {
  assert.deepEqual(runThemeInitialization('system'), {
    theme: DEFAULT_THEME,
    themeColor: THEME_COLORS.light,
  });
  assert.deepEqual(runThemeInitialization(null, true), {
    theme: DEFAULT_THEME,
    themeColor: THEME_COLORS.light,
  });
});
