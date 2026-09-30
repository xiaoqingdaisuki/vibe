import type { Place } from './types';
import { isCoordinate } from './utils.ts';

export interface MapLibrary {
  favorites: Place[];
  history: string[];
}

const STORAGE_KEY = 'vibe:map:v1';
const EVENT_NAME = 'vibe-map-library';
const EMPTY: MapLibrary = { favorites: [], history: [] };
let cachedRaw: string | null | undefined;
let cachedLibrary = EMPTY;

// 只保留收藏所需字段，拒绝不可信坐标和过长文本
function parsePlace(value: unknown): Place | null {
  if (!value || typeof value !== 'object') return null;
  if (!('id' in value) || typeof value.id !== 'string' || !value.id || value.id.length > 200) return null;
  if (!('name' in value) || typeof value.name !== 'string' || !value.name || value.name.length > 200) return null;
  if (!('location' in value) || !isCoordinate(value.location)) return null;
  return {
    id: value.id,
    name: value.name,
    location: value.location,
    address: 'address' in value && typeof value.address === 'string' ? value.address.slice(0, 500) : '',
    city: 'city' in value && typeof value.city === 'string' ? value.city.slice(0, 100) : '',
    district: 'district' in value && typeof value.district === 'string' ? value.district.slice(0, 100) : '',
    type: 'type' in value && typeof value.type === 'string' ? value.type.slice(0, 100) : '',
  };
}

// 验证版本化本地数据并限制收藏和搜索历史大小
export function parseLibrary(raw: string | null): MapLibrary {
  if (!raw || raw.length > 200_000) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return EMPTY;
    const favorites: Place[] = [];
    const ids = new Set<string>();
    if ('favorites' in value && Array.isArray(value.favorites)) {
      for (const item of value.favorites) {
        const place = parsePlace(item);
        if (!place || ids.has(place.id)) continue;
        favorites.push(place);
        ids.add(place.id);
        if (favorites.length === 100) break;
      }
    }
    const history =
      'history' in value && Array.isArray(value.history)
        ? [
            ...new Set(
              value.history.filter(
                (item): item is string => typeof item === 'string' && !!item.trim() && item.length <= 100,
              ),
            ),
          ].slice(0, 12)
        : [];
    return { favorites, history };
  } catch {
    return EMPTY;
  }
}

// 读取稳定客户端快照，存储被禁用时使用当前页面内存
export function getLibrary(): MapLibrary {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedLibrary = parseLibrary(raw);
    }
  } catch {
    return cachedLibrary;
  }
  return cachedLibrary;
}

export function getServerLibrary(): MapLibrary {
  return EMPTY;
}

// 同时订阅本页和跨标签页更新，卸载时移除监听
export function subscribeLibrary(listener: () => void): () => void {
  // 仅处理地图数据变更，避免无关存储写入触发重读
  function onStorage(event: StorageEvent): void {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  }
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', onStorage);
  };
}

// 持久化最小数据并让当前页面立即刷新，返回磁盘写入是否成功
export function saveLibrary(library: MapLibrary): boolean {
  const favorites = library.favorites.slice(0, 100).flatMap((value) => {
    const place = parsePlace(value);
    return place ? [place] : [];
  });
  const raw = JSON.stringify({
    version: 1,
    favorites,
    history: library.history.slice(0, 12),
  });
  cachedLibrary = parseLibrary(raw);
  let saved = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
  } catch {
    saved = false;
  }
  window.dispatchEvent(new Event(EVENT_NAME));
  return saved;
}

// 最近搜索去重并置顶，最多保留十二项
export function rememberSearch(keyword: string): void {
  const library = getLibrary();
  const value = keyword.trim().slice(0, 100);
  if (!value) return;
  saveLibrary({ ...library, history: [value, ...library.history.filter((item) => item !== value)].slice(0, 12) });
}
