import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableTileMetrics } from './table-layout.ts';

test('牌桌尺寸变大时，桌面牌面规格同步放大', () => {
  const compact = getTableTileMetrics({ boardWidth: 868, boardHeight: 502 });
  const wide = getTableTileMetrics({ boardWidth: 1420, boardHeight: 682 });

  assert.ok(wide.riverTileHeight > compact.riverTileHeight);
  assert.ok(wide.meldTileHeight > compact.meldTileHeight);
  assert.ok(wide.wallWidth > compact.wallWidth);
  assert.ok(wide.doraTileWidth > compact.doraTileWidth);
});

test('窄屏仍保留可读的桌面牌面下限', () => {
  const narrow = getTableTileMetrics({ boardWidth: 360, boardHeight: 480 });

  assert.ok(narrow.riverTileHeight >= 25);
  assert.ok(narrow.meldTileHeight >= 26);
  assert.ok(narrow.wallHeight >= 20);
  assert.ok(narrow.doraTileWidth >= 22);
});
