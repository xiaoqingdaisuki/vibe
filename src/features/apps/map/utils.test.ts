import assert from 'node:assert/strict';
import test from 'node:test';
import { createShareUrl, parseSharedView, isCoordinate, formatDistance, formatDuration, getMapScale } from './utils.ts';
import { getLibrary, parseLibrary, saveLibrary } from './storage.ts';
import type { Place } from './types.ts';

test('shared map views round-trip GCJ-02 coordinates and reject malformed input', () => {
  const view = { center: [116.397428, 39.90923] as [number, number], zoom: 14 };
  assert.deepEqual(parseSharedView(new URL(createShareUrl('https://example.com', view)).search), view);
  for (const value of ['?lng=200&lat=40', '?lng=abc&lat=40', '?lng=&lat=40', '?lng=116', '?lat=40']) {
    assert.equal(parseSharedView(value), null);
  }
  assert.equal(parseSharedView('?lng=116&lat=40&zoom=900')?.zoom, 15);
  assert.equal(isCoordinate([0, 0]), true);
  assert.equal(isCoordinate([NaN, 0]), false);
});

test('map distance and duration labels handle units and invalid service values', () => {
  assert.equal(formatDistance(950), '950 米');
  assert.equal(formatDistance(1500), '1.5 公里');
  assert.equal(formatDistance(Infinity), '—');
  assert.equal(formatDuration(61), '2 分钟');
  assert.equal(formatDuration(3600), '1 小时 0 分钟');
});

test('custom scale labels match the fixed visible 112 pixel bar at each latitude and zoom', () => {
  assert.equal(getMapScale({ center: [0, 0], zoom: 20 }), '约 17 米');
  assert.equal(getMapScale({ center: [0, 60], zoom: 20 }), '约 8 米');
  assert.equal(getMapScale({ center: [116, 40], zoom: 13 }), '约 1.6 公里');
});

test('map library keeps minimal versioned favorites and deduplicated bounded search history', () => {
  const place = {
    id: 'p',
    name: '地点',
    location: [116, 40],
    address: '地址',
    city: '',
    district: '',
    type: '',
    phone: '123',
    extra: 'discard',
  };
  const parsed = parseLibrary(
    JSON.stringify({
      version: 1,
      favorites: [place, place, { ...place, id: 'bad', location: [200, 0] }],
      history: ['搜索', '搜索', '', 123, ...Array.from({ length: 20 }, (_, i) => String(i))],
    }),
  );
  assert.equal(parsed.favorites.length, 1);
  assert.equal('extra' in parsed.favorites[0], false);
  assert.equal('phone' in parsed.favorites[0], false);
  assert.equal(parsed.history.length, 12);
  assert.equal(parsed.history[0], '搜索');
  for (const raw of [null, '{bad', JSON.stringify({ version: 2, favorites: [place] })]) {
    assert.deepEqual(parseLibrary(raw), { favorites: [], history: [] });
  }
});

test('all 100 valid maximum-length favorites round-trip and denied writes retain current-page data', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let raw: string | null = null;
  let denyWrites = false;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => raw,
        setItem: (_key: string, value: string) => {
          if (denyWrites) throw new Error('Storage denied');
          raw = value;
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    const favorites: Place[] = Array.from({ length: 100 }, (_, index) => ({
      id: `${index}`.padEnd(200, 'a'),
      name: '地'.repeat(200),
      address: '址'.repeat(500),
      city: '城'.repeat(100),
      district: '区'.repeat(100),
      type: '类'.repeat(100),
      location: [116, 40],
      phone: 'do not persist',
    }));
    getLibrary();
    assert.equal(saveLibrary({ favorites, history: [] }), true);
    assert.equal(getLibrary().favorites.length, 100);
    assert.equal(parseLibrary(raw).favorites.length, 100);
    assert.equal(String(raw).includes('do not persist'), false);
    denyWrites = true;
    assert.equal(saveLibrary({ favorites: [], history: ['内存记录'] }), false);
    assert.deepEqual(getLibrary(), { favorites: [], history: ['内存记录'] });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
