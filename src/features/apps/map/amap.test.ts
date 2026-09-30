import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapController } from './amap.ts';
import {
  busLines,
  coordinate,
  districtResult,
  routePlans,
  searchResult,
  suggestions,
  weatherResult,
} from './adapters.ts';
import type { MapControllerOptions, RouteRequest } from './types.ts';

type Callback = (status: unknown, result: unknown) => void;

class FakeMap {
  center = [116, 40];
  zoom = 12;
  destroyed = false;
  on(): void {}
  off(): void {}
  remove(): void {}
  destroy(): void {
    this.destroyed = true;
  }
  getCenter(): number[] {
    return this.center;
  }
  getZoom(): number {
    return this.zoom;
  }
}

const options: MapControllerOptions = {
  // 测试替身不读取 DOM；真实页面始终传入已挂载的 HTMLElement。
  container: {} as HTMLElement,
  key: 'test-key',
  securityJsCode: 'test-security-code',
  initialView: { center: [116, 40], zoom: 12 },
  onPick: () => {},
  onPlace: () => {},
  onMove: () => {},
  onToolResult: () => {},
};

const start = {
  id: 'start',
  name: '起点',
  location: [116, 40] as [number, number],
  address: '',
  city: '北京',
  district: '',
  type: '',
};
const route: RouteRequest = {
  mode: 'driving',
  start,
  end: { ...start, id: 'end', location: [117, 40] },
  city: '北京',
  destinationCity: '北京',
  policy: 4,
  waypoints: [],
};

test('SDK coordinate adaptation supports valid SDK objects and rejects broken or out-of-range data', () => {
  assert.deepEqual(coordinate({ getLng: () => 116.4, getLat: () => 39.9 }), [116.4, 39.9]);
  assert.deepEqual(coordinate('0,0'), [0, 0]);
  for (const value of [null, ['', 30], [0, Infinity], [181, 0], [0, 91], '116,40,0', { lng: 'bad', lat: 40 }]) {
    assert.equal(coordinate(value), undefined);
  }
});

test('search and autocomplete distinguish no data from malformed responses and keep usable records', () => {
  assert.deepEqual(searchResult(null, 2), { places: [], total: 0, page: 2 });
  assert.deepEqual(suggestions(null), []);
  assert.throws(() => searchResult({}, 1), /数据格式/);
  assert.throws(() => searchResult({ poiList: { pois: [{ name: '坏地点', location: [500, 40] }] } }, 1), /有效坐标/);
  const result = searchResult(
    {
      poiList: {
        count: '30',
        pois: [{ id: '1', name: '<img onerror=evil()>', location: '116,40', distance: '0' }, { name: '无坐标' }],
      },
    },
    2,
  );
  assert.equal(result.total, 30);
  assert.equal(result.places.length, 1);
  assert.equal(result.places[0].distance, 0);
  assert.equal(result.places[0].name, '<img onerror=evil()>');
  assert.equal(suggestions({ tips: [{ name: '上海市', district: '上海', location: [] }] })[0].location, undefined);
});

test('route adaptation joins SDK driving, walking and riding step paths without drawing artificial straight lines', () => {
  const result = {
    taxi_cost: '18',
    routes: [
      {
        distance: '300',
        time: '90',
        tolls: '0',
        steps: [
          {
            instruction: '直行',
            distance: '100',
            time: '30',
            path: [
              { lng: 116, lat: 40 },
              { lng: 116.1, lat: 40 },
            ],
          },
          { instruction: '右转', distance: '200', time: '60', polyline: '116.1,40;116.2,40.1' },
        ],
      },
    ],
  };
  for (const mode of ['driving', 'walking', 'riding'] as const) {
    const [plan] = routePlans(result, mode);
    assert.deepEqual(plan.path, [
      [116, 40],
      [116.1, 40],
      [116.2, 40.1],
    ]);
    assert.equal(plan.duration, 90);
    assert.equal(plan.steps[1].duration, 60);
    assert.equal(plan.tolls, mode === 'driving' ? 0 : undefined);
    assert.equal(plan.taxiCost, 18);
  }
  assert.deepEqual(routePlans(null, 'driving'), []);
  assert.throws(() => routePlans({ routes: [{ distance: 1000, steps: [] }] }, 'driving'), /有效路径/);
});

test('transit alternatives preserve transfer instructions, fare and full walking/transit paths', () => {
  const plans = routePlans(
    {
      plans: [
        {
          distance: 3000,
          time: 1200,
          cost: 5,
          segments: [
            {
              instruction: '步行至车站',
              distance: 100,
              time: 60,
              transit: {
                steps: [
                  {
                    path: [
                      [116, 40],
                      [116.01, 40],
                    ],
                  },
                ],
              },
            },
            {
              instruction: '乘坐地铁到终点',
              distance: 2900,
              time: 1140,
              transit: {
                path: [
                  [116.01, 40],
                  [116.2, 40.2],
                ],
              },
            },
          ],
        },
      ],
    },
    'transit',
  );
  assert.deepEqual(plans[0].path, [
    [116, 40],
    [116.01, 40],
    [116.2, 40.2],
  ]);
  assert.equal(plans[0].steps[1].instruction, '乘坐地铁到终点');
  assert.equal(plans[0].fare, 5);
  assert.equal(plans[0].tolls, undefined);
});

test('official JS API riding results use rides while numeric policies receive readable plan names', () => {
  const [plan] = routePlans(
    {
      routes: [
        {
          policy: 1,
          distance: 500,
          time: 120,
          rides: [
            {
              instruction: '沿道路骑行',
              distance: 500,
              time: 120,
              path: [
                [116, 40],
                [116.01, 40],
              ],
            },
          ],
        },
      ],
    },
    'riding',
  );
  assert.equal(plan.name, '骑行方案 1');
  assert.equal(plan.steps[0].instruction, '沿道路骑行');
  assert.deepEqual(plan.path, [
    [116, 40],
    [116.01, 40],
  ]);
});

test('weather, district and bus adapters validate data and preserve zero-valued temperatures and fare', () => {
  const weather = weatherResult(
    { city: '北京', weather: '晴', temperature: 0, humidity: 0 },
    { forecasts: [{ date: '2026-09-30', dayTemp: 0, nightTemp: -2 }] },
  );
  assert.equal(weather.temperature, '0');
  assert.equal(weather.forecast[0].high, '0');
  assert.throws(() => weatherResult({}, {}), /数据格式/);
  const district = districtResult({
    districtList: [
      {
        name: '北京',
        center: '116,40',
        boundaries: ['116,40;116.1,40;116.1,40.1'],
        districtList: [{ name: '海淀区', adcode: '110108' }],
      },
    ],
  });
  assert.equal(district.boundaries.length, 1);
  assert.equal(district.result.children[0].adcode, '110108');
  assert.throws(() => districtResult(null), /没有找到/);
  const lines = busLines({
    lineInfo: [
      {
        id: 'bus',
        name: '1路',
        basic_price: 0,
        path: [
          [116, 40],
          [117, 40],
        ],
        via_stops: [{ name: '车站', location: [116, 40] }],
      },
    ],
  });
  assert.equal(lines[0].price, 0);
  assert.deepEqual(lines[0].stops[0].location, [116, 40]);
});

test('controller turns SDK no_data into an empty result and hides raw authentication errors', async () => {
  let fail = false;
  class PlaceSearch {
    search(_keyword: string, callback: Callback): void {
      callback(fail ? 'error' : 'no_data', fail ? { info: 'INVALID_USER_KEY https://private/?key=secret' } : {});
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, PlaceSearch }));
  assert.deepEqual(await controller.search({ keyword: '不存在', city: '北京' }), { places: [], total: 0, page: 1 });
  fail = true;
  await assert.rejects(controller.search({ keyword: '地点', city: '北京' }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /鉴权/);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
  controller.destroy();
});

test('controller rejects malformed completed data and cancels in-flight requests when destroyed', async () => {
  let hold = false;
  class PlaceSearch {
    search(_keyword: string, callback: Callback): void {
      if (!hold) callback('complete', {});
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, PlaceSearch }));
  await assert.rejects(controller.search({ keyword: '地点', city: '北京' }), /数据格式/);
  hold = true;
  const request = controller.search({ keyword: '地点', city: '北京' });
  await Promise.resolve();
  await Promise.resolve();
  controller.destroy();
  controller.destroy();
  await assert.rejects(request, /关闭/);
});

test('controller cancels lazy plugin loading immediately and allows synchronous plugin failures to retry', async () => {
  let attempts = 0;
  const sdk = {
    Map: FakeMap,
    plugin: () => {
      attempts += 1;
      throw new Error('离线');
    },
  };
  const controller = await createMapController(options, async () => sdk);
  await assert.rejects(controller.search({ keyword: '地点', city: '北京' }), /离线/);
  await assert.rejects(controller.search({ keyword: '地点', city: '北京' }), /离线/);
  assert.equal(attempts, 2);
  controller.destroy();
  const waiting = await createMapController(options, async () => ({ Map: FakeMap, plugin: () => {} }));
  const request = waiting.search({ keyword: '地点', city: '北京' });
  waiting.destroy();
  await assert.rejects(request, /关闭/);
});

test('controller fails timed-out services instead of leaving operations pending indefinitely', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  class PlaceSearch {
    search(): void {}
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, PlaceSearch }));
  const request = controller.search({ keyword: '地点', city: '北京' });
  const rejected = assert.rejects(request, /超时/);
  await Promise.resolve();
  await Promise.resolve();
  context.mock.timers.tick(18000);
  await rejected;
  controller.destroy();
});

test('clearing drawings invalidates pending district geometry before it can reappear', async () => {
  let callback: Callback | undefined;
  let polygons = 0;
  class DistrictSearch {
    search(_keyword: string, cb: Callback): void {
      callback = cb;
    }
  }
  class Polygon {
    constructor() {
      polygons += 1;
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, DistrictSearch, Polygon }));
  const request = controller.district('北京');
  await Promise.resolve();
  await Promise.resolve();
  controller.clearDrawings();
  callback?.('complete', {
    districtList: [{ name: '北京', center: [116, 40], boundaries: ['116,40;116.1,40;116.1,40.1'] }],
  });
  assert.equal((await request).name, '北京');
  assert.equal(polygons, 0);
  controller.destroy();
});

test('controller sends strategy and coordinates to driving without creating default map or panel UI', async () => {
  let receivedOptions: unknown;
  let receivedArguments: unknown[] = [];
  class Driving {
    constructor(value: unknown) {
      receivedOptions = value;
    }
    search(from: unknown, to: unknown, opts: unknown, callback: Callback): void {
      receivedArguments = [from, to, opts];
      callback('complete', {
        routes: [
          {
            distance: 100,
            time: 30,
            steps: [
              {
                path: [
                  [116, 40],
                  [117, 40],
                ],
              },
            ],
          },
        ],
      });
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, Driving }));
  const plans = await controller.plan({ ...route, waypoints: [{ ...start, location: [116.5, 40] }] });
  assert.equal(plans.length, 1);
  assert.deepEqual(receivedArguments, [[116, 40], [117, 40], { waypoints: [[116.5, 40]] }]);
  assert.deepEqual(receivedOptions, { policy: 4, city: '北京', cityd: '北京', extensions: 'all' });
  await assert.rejects(controller.plan({ ...route, mode: 'walking', waypoints: [start] }), /途经点/);
  controller.destroy();
});

test('controller uses city-level fallback explicitly when accurate positioning fails', async () => {
  class Geolocation {
    getCurrentPosition(callback: Callback): void {
      callback('error', 'PERMISSION_DENIED');
    }
  }
  class CitySearch {
    getLocalCity(callback: Callback): void {
      callback('complete', { city: '北京市', bounds: { getCenter: () => [116.4, 39.9] } });
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, Geolocation, CitySearch }));
  const result = await controller.locate();
  assert.equal(result.approximate, true);
  assert.match(result.place.name, /近似/);
  assert.deepEqual(result.place.location, [116.4, 39.9]);
  controller.destroy();
});

test('custom markers render untrusted names as plain text and focus accounts for overlay padding', async () => {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const contents: { textContent: string; title: string; attributes: Map<string, string> }[] = [];
  const fitCalls: unknown[][] = [];
  const selectedPlaces: unknown[] = [];
  class MapWithOverlays extends FakeMap {
    setFitView(...args: unknown[]): void {
      fitCalls.push(args);
    }
  }
  class Marker {
    constructor(options: { content: (typeof contents)[number] }) {
      contents.push(options.content);
    }
    on(): void {}
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const attributes = new Map<string, string>();
        return {
          textContent: '',
          title: '',
          attributes,
          classList: { add: () => {}, toggle: () => {} },
          setAttribute: (name: string, value: string) => attributes.set(name, value),
        };
      },
    },
  });
  try {
    const controller = await createMapController(
      { ...options, getPadding: () => [80, 300, 16, 64], onPlace: (place) => selectedPlaces.push(place) },
      async () => ({ Map: MapWithOverlays, Marker }),
    );
    const place = { ...start, name: '<img src=x onerror=evil()>' };
    controller.showPlaces([place]);
    controller.focus(place);
    assert.equal(contents[0].textContent, '1');
    assert.equal(contents[0].title, place.name);
    assert.equal(contents[0].attributes.get('aria-label'), `查看${place.name}`);
    assert.equal('innerHTML' in contents[0], false);
    assert.deepEqual(fitCalls[1].slice(1), [true, [80, 300, 16, 64], 15]);
    assert.equal(selectedPlaces.length, 0);
    controller.destroy();
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('appearance restores the official vector default layer and combines independent satellite and traffic layers', async () => {
  const layerCalls: unknown[] = [];
  const featureCalls: unknown[] = [];
  class MapWithLayers extends FakeMap {
    setLayers(layers: unknown): void {
      layerCalls.push(layers);
    }
    setFeatures(features: unknown): void {
      featureCalls.push(features);
    }
    setMapStyle(): void {}
    setPitch(): void {}
    setStatus(): void {}
    setRotation(): void {}
  }
  class TileLayer {
    static Satellite = class {};
    static Traffic = class {};
    static RoadNet = class {};
  }
  const standard = { vector: true };
  const controller = await createMapController(options, async () => ({
    Map: MapWithLayers,
    TileLayer,
    createDefaultLayer: () => standard,
  }));
  const appearance = {
    base: 'satellite' as const,
    traffic: true,
    roadNet: true,
    buildings: false,
    threeD: false,
    labels: false,
    style: 'normal' as const,
  };
  controller.setAppearance(appearance);
  controller.setAppearance({
    ...appearance,
    base: 'standard',
    traffic: false,
    roadNet: false,
    buildings: true,
    threeD: true,
    labels: true,
  });
  assert.ok(Array.isArray(layerCalls[0]));
  assert.equal(layerCalls[0].length, 3);
  assert.deepEqual(layerCalls[1], [standard]);
  assert.deepEqual(featureCalls, [
    ['bg', 'road'],
    ['bg', 'road', 'point', 'building'],
  ]);
  controller.destroy();
});

test('native SDK loader retries failures, shares concurrent loads and waits for the authoritative JSONP callback', async () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const fakeWindow: Record<string, unknown> = { location: { origin: 'https://vibe.test' } };
  const scripts: { src: string; onerror?: () => void; remove: () => void }[] = [];
  let configBeforeScript: unknown;
  const fakeDocument = {
    createElement: () => ({ src: '', dataset: {}, remove: () => {} }),
    head: {
      append: (script: (typeof scripts)[number]) => {
        configBeforeScript = fakeWindow._AMapSecurityConfig;
        scripts.push(script);
      },
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  try {
    await assert.rejects(createMapController({ ...options, key: '' }), /JS API Key/);
    await assert.rejects(createMapController({ ...options, securityJsCode: '' }), /安全密钥/);
    assert.equal(scripts.length, 0);
    const failed = createMapController(options);
    scripts[0].onerror?.();
    await assert.rejects(failed, /网络连接/);
    const first = createMapController(options);
    const second = createMapController(options);
    assert.equal(scripts.length, 2);
    assert.deepEqual(configBeforeScript, { securityJsCode: 'test-security-code' });
    let ready = false;
    void first.then(() => {
      ready = true;
    });
    await Promise.resolve();
    assert.equal(ready, false);
    fakeWindow.AMap = { Map: FakeMap };
    const callbackName = new URL(scripts[1].src).searchParams.get('callback');
    assert.ok(callbackName);
    const callback = fakeWindow[callbackName];
    assert.equal(typeof callback, 'function');
    if (typeof callback === 'function') callback();
    const [firstController, secondController] = await Promise.all([first, second]);
    assert.equal(ready, true);
    assert.equal(fakeWindow[callbackName], undefined);
    firstController.destroy();
    secondController.destroy();
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
