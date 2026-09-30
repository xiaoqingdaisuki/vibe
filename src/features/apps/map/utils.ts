import type { Coordinate, MapView, Place } from './types';

// 把服务错误转换为可以直接显示的提示
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求未完成，请检查网络后重试。';
}

// 根据距离选择米或公里，保持地点和路线显示一致
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}

// 将路线秒数转换为易读的预计用时
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

// 校验链接和本地存储中的高德经纬度
export function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    Math.abs(value[1]) <= 90
  );
}

// 从分享链接读取视图，忽略不完整或超出地图范围的参数
export function parseSharedView(search: string): MapView | null {
  const params = new URLSearchParams(search);
  if (!params.has('lng') || !params.has('lat')) return null;
  const lng = params.get('lng')?.trim();
  const lat = params.get('lat')?.trim();
  if (!lng || !lat) return null;
  const center: Coordinate = [Number(lng), Number(lat)];
  if (!isCoordinate(center)) return null;
  const zoom = Number(params.get('zoom') ?? 15);
  return { center, zoom: Number.isFinite(zoom) && zoom >= 3 && zoom <= 20 ? zoom : 15 };
}

// 分享当前地图视图，并移除其它无关查询参数
export function createShareUrl(origin: string, view: MapView): string {
  const url = new URL('/lab/map', origin);
  url.searchParams.set('lng', view.center[0].toFixed(6));
  url.searchParams.set('lat', view.center[1].toFixed(6));
  url.searchParams.set('zoom', String(Math.round(view.zoom)));
  return url.toString();
}

// 生成高德外部导航链接，坐标仍使用高德坐标系
export function createNavigationUrl(place: Place): string {
  const url = new URL('https://uri.amap.com/navigation');
  url.searchParams.set('to', `${place.location[0]},${place.location[1]},${place.name}`);
  url.searchParams.set('mode', 'car');
  url.searchParams.set('src', 'vibe-map');
  url.searchParams.set('callnative', '1');
  return url.toString();
}

// 按固定 112 像素尺线计算实际距离，倾斜视角仅提供近似参考
export function getMapScale(view: MapView): string {
  const metersPerPixel = (156543.03392 * Math.cos((view.center[1] * Math.PI) / 180)) / 2 ** view.zoom;
  return `约 ${formatDistance(metersPerPixel * 112)}`;
}
