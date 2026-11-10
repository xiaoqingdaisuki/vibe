/** 验证地图：高德 SDK 加载、请求与地图控制的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapController } from './amap.ts';
import {
  busLines,
  coordinate,
  districtResult,
  reversedPlace,
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
  listeners = new Map<string, (...args: unknown[]) => void>();
  on(name: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(name, listener);
  }
  off(name: string): void {
    this.listeners.delete(name);
  }
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
  // 测试替身不读取 DOM；真实页面始终传入已挂载的 HTMLElement
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

test('map picks keep a short landmark title and a separate full address without changing the picked coordinate', () => {
  const location: [number, number] = [114.155, 22.282];
  const selected = reversedPlace(
    {
      regeocode: {
        formattedAddress: '香港中环威灵顿街17-19号',
        addressComponent: {
          province: '香港特别行政区',
          city: [],
          district: '中西区',
          streetNumber: { street: '威灵顿街', number: '17-19号' },
        },
        pois: [{ name: '街角餐厅', address: '威灵顿街99号', location: [114.156, 22.283] }],
      },
    },
    location,
  );
  assert.equal(selected.name, '街角餐厅附近');
  assert.equal(selected.address, '香港中环威灵顿街17-19号');
  assert.deepEqual(selected.location, location);
});

test('map pick addresses fill missing regions and house numbers from structured data without duplication', () => {
  const component = {
    province: '北京市',
    city: '北京市',
    district: '海淀区',
    township: '清华园街道',
    streetNumber: { street: '双清路', number: '30号' },
  };
  for (const formattedAddress of ['双清路', '双清路30号', '海淀区双清路30号', '北京市海淀区双清路30号']) {
    const selected = reversedPlace({ regeocode: { formattedAddress, addressComponent: component } }, [116, 40]);
    assert.equal(selected.address, '北京市海淀区双清路30号');
    assert.equal(selected.name, '双清路30号');
  }
  assert.equal(
    reversedPlace({ regeocode: { addressComponent: component } }, [116, 40]).address,
    '北京市海淀区清华园街道双清路30号',
  );
  assert.throws(() => reversedPlace({}, [116, 40]), /没有地址信息/);
});

test('map picks never borrow a house number from a nearby POI when the selected coordinate has none', () => {
  const selected = reversedPlace(
    {
      regeocode: {
        formattedAddress: '威灵顿街',
        addressComponent: { province: '香港特别行政区', district: '中西区' },
        pois: [{ name: '附近餐厅', address: '威灵顿街99号' }],
      },
    },
    [114.155, 22.282],
  );
  assert.equal(selected.address, '香港特别行政区中西区威灵顿街');
  assert.equal(selected.address.includes('99号'), false);
});

test('map pick headings and route endpoint names never inherit the formatted administrative address', () => {
  const selected = reversedPlace(
    {
      regeocode: {
        formattedAddress: '广东省深圳市南山区粤海街道深圳湾体育中心华润深圳湾·悦府1期',
        addressComponent: { province: '广东省', city: '深圳市', district: '南山区', township: '粤海街道' },
        pois: [{ name: '华润深圳湾·悦府1期' }],
      },
    },
    [113.947587, 22.520557],
  );
  assert.equal(selected.name, '华润深圳湾·悦府1期附近');
  assert.equal(selected.address, '广东省深圳市南山区粤海街道深圳湾体育中心华润深圳湾·悦府1期');
  const fallback = reversedPlace(
    { regeocode: { formattedAddress: '广东省深圳市南山区', addressComponent: {} } },
    selected.location,
  );
  assert.equal(fallback.name, '地图选点');
  assert.equal(fallback.address, '广东省深圳市南山区');
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

test('nearby categories recover closer places hidden on later provider pages and paginate only after distance sorting', async (context) => {
  context.mock.timers.enable({ apis: ['Date'] });
  const requests: Record<string, unknown>[] = [];
  class WebService {
    static get(url: string, params: Record<string, unknown>, callback: Callback): void {
      assert.equal(url, 'https://restapi.amap.com/v3/place/around');
      requests.push(params);
      const candidates = Array.from({ length: 30 }, (_, index) => ({
        id: `${params.types}:${index}`,
        name: `地点 ${index}`,
        location: [116.4, 40 + index * 0.0005],
        distance: 0,
      }))
        .reverse()
        .filter((place) => Number(place.id.split(':')[1]) * 55.59754 <= Number(params.radius));
      const offset = Number(params.offset);
      const start = (Number(params.page) - 1) * offset;
      callback('complete', {
        status: '1',
        count: String(candidates.length),
        pois: candidates.slice(start, start + offset),
      });
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, WebService }));
  for (const [type, page] of [
    ['050000', 1],
    ['100000', 1],
    ['100000', 2],
    ['100000', 3],
    ['050500', 1],
  ] as const) {
    const result = await controller.search({
      keyword: '',
      city: '北京',
      type,
      center: [116.4, 40],
      radius: 3000,
      page,
    });
    assert.equal(result.page, page);
    assert.equal(result.total, 30);
    assert.deepEqual(
      result.places.map((place) => place.id),
      Array.from({ length: 10 }, (_, index) => `${type}:${(page - 1) * 10 + index}`),
    );
  }
  for (const request of requests) {
    assert.equal(request.location, '116.400000,40.000000');
    assert.equal(request.sortrule, 'distance');
    assert.equal(request.offset, 25);
    assert.ok(Number(request.radius) <= 3000);
  }
  const repeated = { keyword: '', city: '北京', type: '100000', center: [116.4, 40] as [number, number], radius: 3000 };
  const calls = requests.length;
  await controller.search(repeated);
  assert.equal(requests.length, calls);
  context.mock.timers.tick(60001);
  await controller.search(repeated);
  assert.ok(requests.length > calls);
  controller.destroy();
});

test('nearby searches keep empty results distinct from malformed responses and API authentication failures', async () => {
  let response: unknown = { status: '1', count: '0', pois: [] };
  class WebService {
    static get(_url: string, _params: unknown, callback: Callback): void {
      callback('complete', response);
    }
  }
  const controller = await createMapController(options, async () => ({
    Map: FakeMap,
    WebService,
  }));
  const request = { keyword: '', city: '', type: '100000', center: [116, 40] as [number, number] };
  assert.deepEqual(await controller.search(request), { places: [], total: 0, page: 1 });
  response = { status: '1', pois: 'invalid' };
  await assert.rejects(controller.search({ ...request, keyword: 'invalid' }), /数据格式/);
  response = { status: '0', info: 'INVALID_USER_KEY' };
  await assert.rejects(controller.search({ ...request, keyword: 'retry' }), /鉴权/);
  response = { status: '0', info: 'USER_ABROAD_DAILY_QUERY_OVER_LIMIT' };
  await assert.rejects(controller.search({ ...request, keyword: 'abroad' }), /境外.*额度/);
  response = { status: '0', info: 'USER_DAILY_QUERY_OVER_LIMIT' };
  await assert.rejects(controller.search({ ...request, keyword: 'quota' }), /调用次数/);
  response = { status: '1', count: '0', pois: [] };
  assert.deepEqual(await controller.search({ ...request, keyword: 'retry' }), { places: [], total: 0, page: 1 });
  controller.destroy();
});

test('destroying a map cancels active nearby requests and prevents queued category requests from starting', async () => {
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let calls = 0;
  class WebService {
    static get(): void {
      calls += 1;
      markStarted?.();
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, WebService }));
  const request = { keyword: '', city: '', type: '050000', center: [116, 40] as [number, number] };
  const first = assert.rejects(controller.search(request), /关闭/);
  const second = assert.rejects(controller.search({ ...request, type: '100000' }), /关闭/);
  await started;
  controller.destroy();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
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
  const contents: {
    textContent: string;
    title: string;
    attributes: Map<string, string>;
    listeners: Map<string, (event: { stopPropagation: () => void }) => void>;
  }[] = [];
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
        const listeners = new Map<string, (event: { stopPropagation: () => void }) => void>();
        const element = {
          textContent: '',
          title: '',
          attributes,
          listeners,
          append: (child: { textContent: string }): void => {
            element.textContent += child.textContent;
          },
          addEventListener: (name: string, listener: (event: { stopPropagation: () => void }) => void) =>
            listeners.set(name, listener),
          classList: { add: () => {}, toggle: () => {} },
          setAttribute: (name: string, value: string) => attributes.set(name, value),
        };
        return element;
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
    assert.equal(contents[1].textContent, place.name);
    assert.equal(contents[1].attributes.get('aria-label'), `查看${place.name}`);
    assert.equal('innerHTML' in contents[1], false);
    assert.equal(contents[0].title, place.name);
    assert.equal(contents[0].attributes.get('aria-label'), `查看${place.name}`);
    assert.equal('innerHTML' in contents[0], false);
    assert.deepEqual(fitCalls[1].slice(1), [true, [80, 300, 16, 64], 15]);
    assert.equal(selectedPlaces.length, 0);
    let stopped = false;
    contents[0].listeners.get('click')?.({
      stopPropagation: () => {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
    assert.deepEqual(selectedPlaces, [place]);
    controller.showPlaces([place], { preserveView: true });
    assert.equal(fitCalls.length, 2);
    controller.destroy();
    contents[0].listeners.get('click')?.({ stopPropagation: () => {} });
    assert.equal(selectedPlaces.length, 1);
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('map picking waits for a single click and ignores double-click zoom, dragging and destroyed maps', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const picks: unknown[] = [];
  const places: unknown[] = [];
  let resizes = 0;
  const listeners = new Map<string, (...args: unknown[]) => void>();
  class InteractiveMap extends FakeMap {
    constructor() {
      super();
      this.listeners = listeners;
    }
  }
  const controller = await createMapController(
    {
      ...options,
      onPick: (point) => picks.push(point),
      onPlace: (place) => places.push(place),
      onResize: () => {
        resizes += 1;
      },
    },
    async () => ({
      Map: InteractiveMap,
    }),
  );
  const click = listeners.get('click');
  const resize = listeners.get('resize');
  resize?.();
  assert.equal(resizes, 1);
  click?.({ lnglat: [116, 40] });
  assert.equal(picks.length, 0);
  context.mock.timers.tick(280);
  assert.deepEqual(picks, [[116, 40]]);
  click?.({ lnglat: [116, 40] });
  listeners.get('hotspotclick')?.({ id: 'poi', name: '地图地点', lnglat: [116, 40] });
  context.mock.timers.tick(500);
  assert.equal(picks.length, 1);
  assert.equal(places.length, 1);
  listeners.get('hotspotclick')?.({ name: '无效地点', lnglat: [500, 40] });
  assert.equal(places.length, 1);
  for (const gesture of ['dblclick', 'dragstart', 'zoomstart']) {
    click?.({ lnglat: [117, 40] });
    listeners.get(gesture)?.();
    context.mock.timers.tick(500);
    assert.equal(picks.length, 1);
  }
  click?.({ lnglat: [118, 40] });
  controller.destroy();
  resize?.();
  assert.equal(resizes, 1);
  context.mock.timers.tick(500);
  assert.equal(picks.length, 1);
  assert.equal(listeners.size, 0);
});

test('place details resolve the selected POI id rather than searching an ambiguous name', async () => {
  let requested = '';
  class PlaceSearch {
    getDetails(id: string, callback: Callback): void {
      requested = id;
      callback('complete', {
        poiList: { pois: [{ id, name: '同名地点', location: [116, 40], address: '选中地点的地址' }] },
      });
    }
  }
  const controller = await createMapController(options, async () => ({ Map: FakeMap, PlaceSearch }));
  const place = await controller.details('selected-id');
  assert.equal(requested, 'selected-id');
  assert.equal(place.id, 'selected-id');
  assert.equal(place.address, '选中地点的地址');
  controller.destroy();
});

test('drawing completes once, restores browsing and publishes the same active tool as the controller', async () => {
  let completed: ((value: unknown) => void) | undefined;
  const tools: unknown[] = [];
  let closed = 0;
  class MouseTool {
    on(_name: string, listener: (value: unknown) => void): void {
      completed = listener;
    }
    off(): void {}
    circle(): void {}
    close(): void {
      closed += 1;
    }
  }
  const results: string[] = [];
  const controller = await createMapController(
    { ...options, onDrawingChange: (tool) => tools.push(tool), onToolResult: (message) => results.push(message) },
    async () => ({ Map: FakeMap, MouseTool }),
  );
  await controller.draw('circle');
  assert.equal(tools.at(-1), 'circle');
  completed?.({ obj: { getRadius: () => 10 } });
  assert.equal(tools.at(-1), null);
  assert.equal(closed, 1);
  assert.match(results[0], /10 米/);
  completed?.({ obj: { getRadius: () => 10 } });
  assert.equal(results.length, 1);
  controller.destroy();
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
