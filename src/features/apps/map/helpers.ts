/** 地图：输入校验与交互辅助逻辑 */

import type { Coordinate, MapController, Place } from './types';

// 按两点经纬度计算直线距离，缺失服务距离时仍能一致排序
function coordinateDistance(first: Coordinate, second: Coordinate): number {
  const radians = Math.PI / 180;
  const latitude = (second[1] - first[1]) * radians;
  const longitude = (second[0] - first[0]) * radians;
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(first[1] * radians) * Math.cos(second[1] * radians) * Math.sin(longitude / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

// 所有周边品类统一相对固定中心计算距离，不依赖服务热度或缺失距离字段
export function sortNearbyPlaces(places: Place[], center: Coordinate): Place[] {
  return places
    .map((place) => ({ ...place, distance: coordinateDistance(center, place.location) }))
    .sort((first, second) => first.distance - second.distance);
}

// 解析路线地点并按实际坐标补齐城市，搜索范围不能代替地点所属城市
export async function resolveRoutePlace(
  controller: Pick<MapController, 'resolve' | 'reverse'>,
  input: { text: string; place: Place | null },
  searchCity: string,
): Promise<Place> {
  const place = input.place ?? (await controller.resolve(input.text.trim(), searchCity));
  if (place.city.trim() && place.type) return { ...place, city: place.city.trim() };
  const address = await controller.reverse(place.location);
  const city = address.city.trim();
  if (!city) throw new Error(`无法自动识别“${place.name}”所在城市，请重新选点或稍后重试。`);
  return { ...place, city, district: address.district, address: place.address || address.address };
}

// 解析经纬度输入，并拒绝缺失、非数值和越界坐标
export function parseCoordinate(value: string): Coordinate | null {
  const parts = value.trim().split(/[,，\s]+/u);
  if (parts.length !== 2 || parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(part))) {
    return null;
  }

  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  ) {
    return null;
  }

  return [longitude, latitude];
}

// 忽略坐标末位的微小抖动，识别重复的路线端点
export function sameCoordinate(first: Coordinate, second: Coordinate): boolean {
  return Math.abs(first[0] - second[0]) < 0.000001 && Math.abs(first[1] - second[1]) < 0.000001;
}
