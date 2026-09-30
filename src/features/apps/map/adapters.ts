import type {
  BusLine,
  Coordinate,
  DistrictResult,
  Place,
  PlaceSuggestion,
  RoutePlan,
  RouteStep,
  SearchResult,
  TravelMode,
  WeatherResult,
} from './types';

export type SdkObject = Record<string, unknown>;

// 验证第三方数据是否具有可读取的对象结构
export function isObject(value: unknown): value is SdkObject {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

// 收窄未知对象，缺失对象采用空结构供字段验证使用
export function object(value: unknown): SdkObject {
  return isObject(value) ? value : {};
}

// 只接受数组，避免第三方响应中的空字符串冒充列表
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// 提取文字或有限数字，保留数值零并拒绝其他响应类型
export function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

// 仅接受有限数值，避免空字符串或异常数值污染结果
export function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// 兼容坐标数组、字符串及 SDK LngLat，统一验证经纬度范围
export function coordinate(value: unknown): Coordinate | undefined {
  let longitude: unknown;
  let latitude: unknown;
  if (Array.isArray(value) && value.length === 2) {
    [longitude, latitude] = value;
  } else if (typeof value === 'string') {
    const parts = value.split(',');
    if (parts.length !== 2) return undefined;
    [longitude, latitude] = parts;
  } else if (isObject(value)) {
    longitude = value.lng;
    latitude = value.lat;
    if (typeof value.getLng === 'function' && typeof value.getLat === 'function') {
      longitude = Reflect.apply(value.getLng, value, []);
      latitude = Reflect.apply(value.getLat, value, []);
    }
  }
  const lng = numeric(longitude);
  const lat = numeric(latitude);
  if (lng === undefined || lat === undefined || Math.abs(lng) > 180 || Math.abs(lat) > 90) return undefined;
  return [lng, lat];
}

// 解析路径并移除无效点及相邻重复点，保留原始行进顺序
export function path(value: unknown): Coordinate[] {
  const points = typeof value === 'string' ? value.split(';') : list(value);
  const result: Coordinate[] = [];
  for (const point of points) {
    const location = coordinate(point);
    const previous = result.at(-1);
    if (location && (!previous || previous[0] !== location[0] || previous[1] !== location[1])) result.push(location);
  }
  return result;
}

// 将兴趣点适配为页面稳定的数据形状，忽略缺少地点坐标的记录
export function place(value: unknown): Place | undefined {
  const data = object(value);
  const location = coordinate(data.location);
  const name = text(data.name);
  if (!location || !name) return undefined;
  return {
    id: text(data.id) || `point:${location.join(',')}:${name}`,
    name,
    location,
    address: text(data.address) || text(data.formattedAddress),
    city: text(data.cityname) || text(data.city),
    district: text(data.adname) || text(data.district),
    type: text(data.type),
    phone: text(data.tel) || undefined,
    distance: numeric(data.distance),
  };
}

// 将服务查询结果适配为分页结果，区分空结果与损坏响应
export function searchResult(value: unknown, page: number): SearchResult {
  if (value === null) return { places: [], total: 0, page };
  const data = object(value);
  const poiList = object(data.poiList);
  if (!Array.isArray(poiList.pois)) throw new Error('地点服务返回的数据格式异常，请重试。');
  const places = poiList.pois.map(place).filter((item): item is Place => item !== undefined);
  if (poiList.pois.length > 0 && places.length === 0) throw new Error('地点结果缺少有效坐标，请更换关键词。');
  return { places, total: Math.max(places.length, numeric(poiList.count) ?? places.length), page };
}

// 输入提示允许行政区等无坐标记录，由后续地点解析完成定位
export function suggestions(value: unknown): PlaceSuggestion[] {
  if (value === null) return [];
  const tips = object(value).tips;
  if (!Array.isArray(tips)) throw new Error('输入提示服务返回的数据格式异常。');
  // 输入提示只保留有名称的记录，允许城市等提示暂时没有坐标
  return tips.flatMap((value, index) => {
    const tip = object(value);
    const name = text(tip.name);
    if (!name) return [];
    return [
      {
        id: text(tip.id) || `suggestion:${index}:${name}`,
        name,
        district: text(tip.district),
        location: coordinate(tip.location),
      },
    ];
  });
}

// 将逆地理编码结果绑定原始点击坐标，避免附近 POI 替换所选位置
export function reversedPlace(value: unknown, location: Coordinate): Place {
  const regeocode = object(object(value).regeocode);
  const address = text(regeocode.formattedAddress);
  if (!address) throw new Error('该坐标暂时没有地址信息。');
  const component = object(regeocode.addressComponent);
  const nearest = object(list(regeocode.pois)[0]);
  return {
    id: `point:${location.join(',')}`,
    name: text(nearest.name) ? `${text(nearest.name)}附近` : text(component.township) || '地图选点',
    location,
    address,
    city: text(component.city) || text(component.province),
    district: text(component.district),
    type: '地图选点',
  };
}

// 正向地理编码补充普通地址搜索，保留解析出的精确坐标
export function geocodedPlace(value: unknown, keyword: string): Place {
  const geocode = object(list(object(value).geocodes)[0]);
  const location = coordinate(geocode.location);
  if (!location) throw new Error('没有找到这个地点，请补充城市或详细地址。');
  return {
    id: `point:${location.join(',')}`,
    name: keyword,
    location,
    address: text(geocode.formattedAddress),
    city: text(geocode.city) || text(geocode.province),
    district: text(geocode.district),
    type: '地址',
  };
}

// 统一导航步骤字段，秒和米在适配后保持不变
function routeStep(value: unknown): RouteStep {
  const step = object(value);
  return {
    instruction: text(step.instruction) || text(step.road) || '继续前行',
    distance: Math.max(0, numeric(step.distance) ?? 0),
    duration: Math.max(0, numeric(step.time) ?? numeric(step.duration) ?? 0),
    road: text(step.road) || undefined,
  };
}

// 从公交分段提取步行、公交、地铁及铁路路径，兼容不同版本响应
function segmentPath(value: unknown): Coordinate[] {
  const segment = object(value);
  const transit = object(segment.transit);
  const walking = object(segment.walking);
  const bus = object(segment.bus);
  const direct = path(segment.path);
  if (direct.length > 0) return direct;
  const transitPath = path(transit.path);
  if (transitPath.length > 0) return transitPath;
  const walkingPath = list(transit.steps ?? walking.steps).flatMap((step) =>
    path(object(step).path ?? object(step).polyline),
  );
  const lines = list(bus.buslines).flatMap((line) => path(object(line).path ?? object(line).polyline));
  return path([...walkingPath, ...lines]);
}

// 合并四种规划结果并验证可绘制路径，避免显示假路线
export function routePlans(value: unknown, mode: TravelMode): RoutePlan[] {
  if (value === null) return [];
  const result = object(value);
  const routes = mode === 'transit' ? result.plans : result.routes;
  if (!Array.isArray(routes)) throw new Error('路线服务返回的数据格式异常，请重试。');
  // 每条方案分别验证几何与步骤，只保留可显示的完整方案
  const plans = routes.flatMap((value, index) => {
    const route = object(value);
    const entries = list(
      mode === 'transit' ? route.segments : mode === 'riding' ? (route.rides ?? route.steps) : route.steps,
    );
    const direct = path(route.path);
    const coordinates =
      direct.length > 1
        ? direct
        : path(
            entries.flatMap((step) =>
              mode === 'transit' ? segmentPath(step) : path(object(step).path ?? object(step).polyline),
            ),
          );
    if (coordinates.length < 2) return [];
    const steps = entries.map(routeStep);
    const names: Record<TravelMode, string> = { driving: '驾车', transit: '公交', walking: '步行', riding: '骑行' };
    return [
      {
        id: `${mode}:${index}`,
        name:
          typeof route.policy === 'string' && numeric(route.policy) === undefined
            ? route.policy
            : `${names[mode]}方案 ${index + 1}`,
        distance: Math.max(0, numeric(route.distance) ?? 0),
        duration: Math.max(0, numeric(route.time) ?? numeric(route.duration) ?? 0),
        tolls: mode === 'driving' ? numeric(route.tolls) : undefined,
        fare: mode === 'transit' ? numeric(route.cost) : undefined,
        taxiCost: numeric(result.taxi_cost),
        steps,
        path: coordinates,
      },
    ];
  });
  if (routes.length > 0 && plans.length === 0) throw new Error('路线结果缺少有效路径，请尝试其他出行方式。');
  return plans;
}

// 适配实时天气与预报，保留数字零温度而不误判为空
export function weatherResult(liveValue: unknown, forecastValue: unknown): WeatherResult {
  const live = object(liveValue);
  const forecast = object(forecastValue);
  if (!text(live.city) || !text(live.weather)) throw new Error('天气服务返回的数据格式异常。');
  return {
    city: text(live.city),
    weather: text(live.weather),
    temperature: text(live.temperature),
    wind: [text(live.windDirection), text(live.windPower) ? `${text(live.windPower)}级` : ''].filter(Boolean).join(' '),
    humidity: text(live.humidity),
    reportTime: text(live.reportTime),
    // 逐日适配有效天气记录，缺少日期的记录不参与展示
    forecast: list(forecast.forecasts).flatMap((value) => {
      const day = object(value);
      const date = text(day.date);
      return date
        ? [
            {
              date,
              dayWeather: text(day.dayWeather),
              nightWeather: text(day.nightWeather),
              low: text(day.nightTemp),
              high: text(day.dayTemp),
            },
          ]
        : [];
    }),
  };
}

// 只向页面传递行政区信息，边界几何留在地图模块内部
export function districtResult(value: unknown): { result: DistrictResult; boundaries: Coordinate[][] } {
  const district = object(list(object(value).districtList)[0]);
  const center = coordinate(district.center);
  const name = text(district.name);
  if (!name || !center) throw new Error('没有找到这个行政区，请输入完整名称或行政区代码。');
  return {
    result: {
      name,
      adcode: text(district.adcode),
      level: text(district.level),
      center,
      // 提取下一级行政区，保留可选中心坐标用于地图跳转
      children: list(district.districtList).flatMap((value) => {
        const child = object(value);
        const name = text(child.name);
        return name
          ? [{ name, adcode: text(child.adcode), level: text(child.level), center: coordinate(child.center) }]
          : [];
      }),
    },
    boundaries: list(district.boundaries)
      .map(path)
      .filter((points) => points.length > 2),
  };
}

// 提取公交双向线路、首末班车和途经站点，过滤无效线路
export function busLines(value: unknown): BusLine[] {
  if (value === null) return [];
  const lines = object(value).lineInfo;
  if (!Array.isArray(lines)) throw new Error('公交线路服务返回的数据格式异常。');
  // 逐条验证公交线路名称与路径，避免展示不可绘制的线路
  return lines.flatMap((value, index) => {
    const line = object(value);
    const name = text(line.name);
    const points = path(line.path);
    if (!name || points.length < 2) return [];
    return [
      {
        id: text(line.id) || `bus:${index}`,
        name,
        start: text(line.start_stop),
        end: text(line.end_stop),
        first: text(line.stime),
        last: text(line.etime),
        price: numeric(line.basic_price),
        path: points,
        // 站点无坐标时仍保留名称用于站点列表展示
        stops: list(line.via_stops).flatMap((value) => {
          const stop = object(value);
          const name = text(stop.name);
          return name ? [{ name, location: coordinate(stop.location) }] : [];
        }),
      },
    ];
  });
}
