import type { Coordinate } from './types';

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
