/** 验证地图：输入校验与交互辅助逻辑的回归行为 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCoordinate, resolveRoutePlace, sameCoordinate, sortNearbyPlaces } from './helpers.ts';
import type { Place } from './types.ts';

test('coordinate input accepts Chinese commas, whitespace and valid signed boundary values', () => {
  assert.deepEqual(parseCoordinate(' 116.397，39.908 '), [116.397, 39.908]);
  assert.deepEqual(parseCoordinate('-180  +90'), [-180, 90]);
  assert.deepEqual(parseCoordinate('.5,-.25'), [0.5, -0.25]);
});

test('coordinate input rejects incomplete, ambiguous, non-decimal and out-of-range values', () => {
  for (const input of ['', '116', '116,39,', '116,39,20', 'NaN,39', 'Infinity,39', '0xff,20', '181,0', '0,-91']) {
    assert.equal(parseCoordinate(input), null, input);
  }
});

test('duplicate route points tolerate coordinate rounding while distinct nearby points remain usable', () => {
  assert.equal(sameCoordinate([116.397, 39.908], [116.3970001, 39.9080001]), true);
  assert.equal(sameCoordinate([116.397, 39.908], [116.39702, 39.908]), false);
});

const routePlace: Place = {
  id: 'selected',
  name: '选中地点',
  location: [116.4, 39.9],
  address: '',
  city: '',
  district: '',
  type: '',
};

test('every nearby category sorts by distance to the same target even with missing or misleading service distances', () => {
  const places: Place[] = [
    { ...routePlace, id: 'far', location: [116.43, 39.9], distance: 0 },
    { ...routePlace, id: 'near', location: [116.4001, 39.9] },
    { ...routePlace, id: 'center', location: [116.4, 39.9], distance: 5000 },
    { ...routePlace, id: 'same-distance', location: [116.4001, 39.9], distance: -1 },
  ];
  const sorted = sortNearbyPlaces(places, [116.4, 39.9]);
  assert.deepEqual(
    sorted.map((place) => place.id),
    ['center', 'near', 'same-distance', 'far'],
  );
  assert.equal(sorted[0].distance, 0);
  assert.ok((sorted[1].distance ?? 0) < 10);
  assert.deepEqual(
    places.map((place) => place.id),
    ['far', 'near', 'center', 'same-distance'],
  );
  assert.equal(places[0].distance, 0);
});

test('route endpoints independently infer their cities from coordinates and keep them when swapped', async () => {
  const controller = {
    resolve: async () => {
      throw new Error('已选点不应重新搜索');
    },
    reverse: async (location: Place['location']) => ({
      ...routePlace,
      location,
      city: location[0] === 116.4 ? '北京市' : '天津市',
    }),
  };
  const inputs = [routePlace, { ...routePlace, id: 'end', location: [117.2, 39.1] as Place['location'] }];
  for (const points of [inputs, [...inputs].reverse()]) {
    const results = await Promise.all(
      points.map((place) => resolveRoutePlace(controller, { text: place.name, place }, '上海市')),
    );
    assert.deepEqual(
      results.map((place) => place.city),
      points[0].id === 'selected' ? ['北京市', '天津市'] : ['天津市', '北京市'],
    );
    assert.deepEqual(
      results.map((place) => place.location),
      points.map((place) => place.location),
    );
  }
});

test('route planning resolves typed names before determining cities and reuses complete POI data', async () => {
  const complete = { ...routePlace, city: '北京市', type: '学校' };
  let searches = 0;
  const controller = {
    resolve: async (keyword: string, city: string) => {
      searches += 1;
      assert.equal(keyword, '选中地点');
      assert.equal(city, '上海市');
      return complete;
    },
    reverse: async () => {
      throw new Error('完整地点不应重复逆地理编码');
    },
  };
  assert.equal((await resolveRoutePlace(controller, { text: ' 选中地点 ', place: null }, '上海市')).city, '北京市');
  assert.equal((await resolveRoutePlace(controller, { text: complete.name, place: complete }, '')).city, '北京市');
  assert.equal(searches, 1);
});

test('legacy suggestions cannot reuse the search scope as their actual city or lose the selected location', async () => {
  const suggestion = { ...routePlace, city: '上海市', name: '北京地点' };
  const result = await resolveRoutePlace(
    {
      resolve: async () => suggestion,
      reverse: async () => ({ ...routePlace, city: '北京市', address: '真实地址', district: '海淀区' }),
    },
    { text: suggestion.name, place: suggestion },
    '上海市',
  );
  assert.equal(result.city, '北京市');
  assert.equal(result.name, '北京地点');
  assert.deepEqual(result.location, suggestion.location);
  assert.equal(result.address, '真实地址');
  assert.equal(suggestion.city, '上海市');
});

test('failed city identification never silently falls back to the other endpoint or the search city', async () => {
  await assert.rejects(
    resolveRoutePlace(
      {
        resolve: async () => routePlace,
        reverse: async () => ({ ...routePlace, city: ' ' }),
      },
      { text: routePlace.name, place: routePlace },
      '上海市',
    ),
    /无法自动识别/,
  );
});
