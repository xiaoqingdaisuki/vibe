import assert from 'node:assert/strict';
import test from 'node:test';
import { getHumanHandMetrics, getTableTileMetrics } from './table-layout.ts';

test('牌桌尺寸变大时，桌面牌面规格同步放大', () => {
  const compact = getTableTileMetrics({ boardWidth: 868, boardHeight: 502 });
  const wide = getTableTileMetrics({ boardWidth: 1420, boardHeight: 682 });

  assert.ok(wide.riverTileHeight > compact.riverTileHeight);
  assert.ok(wide.meldTileHeight > compact.meldTileHeight);
  assert.ok(wide.handTileHeight > compact.handTileHeight);
  assert.ok(wide.wallWidth > compact.wallWidth);
  assert.ok(wide.doraTileWidth > compact.doraTileWidth);
});

test('窄屏仍保留可读的桌面牌面下限', () => {
  const narrow = getTableTileMetrics({ boardWidth: 360, boardHeight: 480 });

  assert.ok(narrow.riverTileHeight >= 25);
  assert.ok(narrow.meldTileHeight >= 26);
  assert.ok(narrow.handTileHeight >= 56);
  assert.ok(narrow.wallHeight >= 20);
  assert.ok(narrow.doraTileWidth >= 22);
});

test('窄屏手牌命中与绘制使用同一套坐标', () => {
  const metrics = getHumanHandMetrics({ width: 390, boardWidth: 360, desktop: false }, 14, 56);
  const firstCenter = metrics.handX + metrics.tileWidth / 2;
  const firstRegion = [metrics.handX, metrics.handX + metrics.tileWidth];
  const secondRegionStart = metrics.handX + metrics.tileWidth + metrics.handGap;

  assert.ok(firstCenter >= firstRegion[0] && firstCenter <= firstRegion[1]);
  assert.ok(firstCenter < secondRegionStart);
  assert.ok(metrics.handX >= 0);
  assert.ok(metrics.handX + metrics.handWidth <= 390);
});
