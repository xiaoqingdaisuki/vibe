import {
  busLines,
  coordinate,
  districtResult,
  geocodedPlace,
  isObject,
  numeric,
  object,
  path,
  reversedPlace,
  routePlans,
  searchResult,
  suggestions,
  text,
  weatherResult,
} from './adapters.ts';
import type { SdkObject } from './adapters';
import type {
  BusLine,
  Coordinate,
  DistrictResult,
  DrawingTool,
  LocationResult,
  MapAppearance,
  MapController,
  MapControllerOptions,
  MapView,
  Place,
  PlaceSuggestion,
  RoutePlan,
  RouteRequest,
  SearchRequest,
  SearchResult,
  WeatherResult,
} from './types';

type SdkLoader = (key: string, securityJsCode: string) => Promise<unknown>;
type RequestFailure = (error: Error) => void;
const REQUEST_TIMEOUT = 18000;
const SDK_TIMEOUT = 25000;
// SDK 是浏览器全局资源；按配置共享加载以兼容 StrictMode 和页面重挂载。
let sdkLoad: { key: string; securityJsCode: string; promise: Promise<unknown> } | undefined;
let sdkSequence = 0;

// 校验后调用 SDK 方法并保持其 this，第三方返回值始终从 unknown 收窄
function invoke(owner: SdkObject, method: string, args: unknown[] = []): unknown {
  const fn = owner[method];
  if (typeof fn !== 'function') throw new Error(`高德地图能力 ${method} 暂不可用，请重新加载。`);
  return Reflect.apply(fn, owner, args);
}

// 统一创建 SDK 实例，构造结果须验证为对象才可使用
function construct(owner: SdkObject, name: string, args: unknown[] = []): SdkObject {
  const constructor = owner[name];
  if (typeof constructor !== 'function') throw new Error(`高德地图插件 ${name} 未能加载。`);
  const instance: unknown = Reflect.construct(constructor, args);
  if (!isObject(instance)) throw new Error(`高德地图插件 ${name} 初始化失败。`);
  return instance;
}

// 将服务错误归一为简明提示，避免泄露完整请求地址和密钥
function serviceError(value: unknown): Error {
  const code = typeof value === 'string' ? value : text(object(value).info) || text(object(value).message);
  if (/KEY|SCODE|SECURITY|DOMAIN|USER|SERVICE_NOT_EXIST/i.test(code)) {
    return new Error('高德服务鉴权失败，请检查 Key、安全密钥、域名白名单及服务权限。');
  }
  if (/LIMIT|QUOTA|TOO_FREQUENT/i.test(code)) return new Error('高德服务调用次数已受限，请稍后重试。');
  if (/DENIED|PERMISSION/i.test(code)) return new Error('定位权限未开启，请允许浏览器访问位置。');
  return new Error('高德服务暂时无法完成请求，请检查网络或稍后重试。');
}

// 在脚本加载前设置安全密钥，并在失败后释放状态以允许重试
function loadAmap(key: string, securityJsCode: string): Promise<unknown> {
  if (!key.trim()) return Promise.reject(new Error('请先配置高德 JS API Key。'));
  if (!securityJsCode.trim()) return Promise.reject(new Error('请先配置高德安全密钥。'));
  if (sdkLoad) {
    if (sdkLoad.key !== key || sdkLoad.securityJsCode !== securityJsCode) {
      return Promise.reject(new Error('地图配置已改变，请刷新页面后重新加载。'));
    }
    return sdkLoad.promise;
  }
  const global = object(window);
  global._AMapSecurityConfig = { securityJsCode };
  // 原生脚本加载只由就绪回调或错误信号结算
  const promise = new Promise<unknown>((resolve, reject) => {
    const script = document.createElement('script');
    const callback = `__vibeMapReady${Date.now()}_${++sdkSequence}`;
    let settled = false;
    // 完成加载时清理回调和计时器，失败脚本不留在页面上
    const finish = (error?: Error): void => {
      if (settled) return;
      const sdk = global.AMap;
      if (!error && (!isObject(sdk) || typeof sdk.Map !== 'function')) {
        error = new Error('高德地图 SDK 未能初始化，请检查 Key 和网络。');
      }
      settled = true;
      clearTimeout(timeout);
      delete global[callback];
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        sdkLoad = undefined;
        reject(error);
      } else resolve(sdk);
    };
    const timeout = setTimeout(() => finish(new Error('地图加载超时，请检查网络后重试。')), SDK_TIMEOUT);
    global[callback] = () => finish();
    script.async = true;
    script.dataset.vibeAmap = '2.0';
    const url = new URL('https://webapi.amap.com/maps');
    url.search = new URLSearchParams({ v: '2.0', key, callback }).toString();
    script.src = url.href;
    // JSONP 回调代表 SDK 已就绪；脚本下载完成时内部模块可能仍在加载。
    script.onerror = () => finish(new Error('无法加载高德地图，请检查网络连接。'));
    document.head.append(script);
  });
  sdkLoad = { key, securityJsCode, promise };
  return promise;
}

// 深模块将 SDK 资源、异步服务与绘制集中在同一实现内
class AmapController implements MapController {
  private readonly sdk: SdkObject;
  private readonly map: SdkObject;
  private readonly options: MapControllerOptions;
  private readonly pending = new Set<RequestFailure>();
  private readonly pluginLoads = new Map<string, Promise<void>>();
  private readonly markers = new Map<string, { overlay: SdkObject; content: HTMLElement }>();
  private routeOverlays: SdkObject[] = [];
  private districtOverlays: SdkObject[] = [];
  private districtVersion = 0;
  private drawings: SdkObject[] = [];
  private selectedMarker?: SdkObject;
  private mouse?: SdkObject;
  private tool?: DrawingTool;
  private toolVersion = 0;
  private destroyed = false;
  private lastView: MapView;
  private readonly layers = new Map<string, SdkObject>();

  // 以三维能力初始化地图，二维模式通过俯仰角与建筑显示控制
  constructor(sdk: SdkObject, options: MapControllerOptions) {
    this.sdk = sdk;
    this.options = options;
    this.lastView = options.initialView;
    this.map = construct(sdk, 'Map', [
      options.container,
      {
        center: options.initialView.center,
        zoom: options.initialView.zoom,
        viewMode: '3D',
        pitch: 0,
        resizeEnable: true,
        showBuildingBlock: true,
        showIndoorMap: false,
        keyboardEnable: true,
        zooms: [3, 20],
      },
    ]);
    invoke(this.map, 'on', ['click', this.handlePick]);
    invoke(this.map, 'on', ['moveend', this.handleMove]);
    invoke(this.map, 'on', ['zoomend', this.handleMove]);
  }

  // 销毁后阻止新请求和绘制，避免卸载组件仍收到异步结果
  private assertActive(): void {
    if (this.destroyed) throw new Error('地图已关闭，请重新打开地图。');
  }

  // 将地图点击收敛为稳定坐标，绘制期间不触发地点拾取
  private handlePick = (value: unknown): void => {
    if (this.destroyed || this.tool) return;
    const location = coordinate(object(value).lnglat);
    if (location) this.options.onPick(location);
  };

  // 读取视野并通知页面，避免页面接触 SDK 对象
  private handleMove = (): void => {
    if (!this.destroyed) this.options.onMove(this.getView());
  };

  // 延迟加载能力插件，设置超时并允许失败后再次尝试
  private plugin(name: string): Promise<void> {
    this.assertActive();
    if (typeof this.sdk[name] === 'function') return Promise.resolve();
    const existing = this.pluginLoads.get(name);
    if (existing) return existing;
    // 一个实例同一能力共享加载结果，等待资源可被销毁取消
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      // 插件等待也纳入实例取消机制，卸载时立即清除其定时器
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel: RequestFailure = (error) => finish(error);
      const timer = setTimeout(() => finish(new Error('地图功能加载超时，请检查网络后重试。')), REQUEST_TIMEOUT);
      this.pending.add(cancel);
      // 验证插件已注册才允许调用，避免加载成功回调掩盖 SDK 错误
      const ready = (): void => {
        if (this.destroyed || typeof this.sdk[name] !== 'function') {
          finish(new Error('地图功能初始化失败，请重新加载。'));
        } else finish();
      };
      try {
        invoke(this.sdk, 'plugin', [[`AMap.${name}`], ready]);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('地图插件加载失败。'));
      }
    });
    this.pluginLoads.set(name, promise);
    void promise.catch(() => this.pluginLoads.delete(name));
    return promise;
  }

  // 创建无默认面板和地图副作用的查询插件实例
  private async service(name: string, options: SdkObject = {}): Promise<SdkObject> {
    await this.plugin(name);
    this.assertActive();
    return construct(this.sdk, name, [options]);
  }

  // 适配状态回调与天气错误优先回调，统一超时及销毁时取消
  private request(owner: SdkObject, method: string, args: unknown[], errorFirst = false): Promise<unknown> {
    this.assertActive();
    // 每次请求维护独立超时和取消，隔离并发查询的回调
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      // 每次请求只结算一次并清除所有异步资源
      const finish = (error: Error | undefined, value?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (error) reject(error);
        else resolve(value);
      };
      const cancel: RequestFailure = (error) => finish(error);
      const timer = setTimeout(() => finish(new Error('请求超时，请检查网络后重试。')), REQUEST_TIMEOUT);
      this.pending.add(cancel);
      // 服务响应通过状态识别，无结果单独保留供页面展示空状态
      const callback = (status: unknown, result: unknown): void => {
        if (this.destroyed) return finish(new Error('地图已关闭。'));
        if (errorFirst)
          return status === null || status === undefined ? finish(undefined, result) : finish(serviceError(status));
        if (status === 'complete') return finish(undefined, result);
        if (status === 'no_data') return finish(undefined, null);
        finish(serviceError(result));
      };
      try {
        invoke(owner, method, [...args, callback]);
      } catch (error) {
        finish(error instanceof Error ? error : serviceError(error));
      }
    });
  }

  // 搜索关键词或周边地点，统一分页和坐标校验
  async search(request: SearchRequest): Promise<SearchResult> {
    const page = Math.min(100, Math.max(1, Math.floor(request.page ?? 1)));
    const search = await this.service('PlaceSearch', {
      city: request.city || '全国',
      citylimit: false,
      type: request.type || '',
      pageSize: 10,
      pageIndex: page,
      extensions: 'all',
    });
    const data = request.center
      ? await this.request(search, 'searchNearBy', [
          request.keyword,
          request.center,
          Math.min(50000, Math.max(100, request.radius ?? 3000)),
        ])
      : await this.request(search, 'search', [request.keyword]);
    return searchResult(data, page);
  }

  // 获取输入建议但不接管输入框 DOM 或显示默认下拉组件
  async suggest(keyword: string, city: string): Promise<PlaceSuggestion[]> {
    if (!keyword.trim()) return [];
    const autocomplete = await this.service('AutoComplete', { city: city || '全国', citylimit: false });
    return suggestions(await this.request(autocomplete, 'search', [keyword]));
  }

  // 优先查找兴趣点，无结果时再解析详细地址
  async resolve(keyword: string, city: string): Promise<Place> {
    if (!keyword.trim()) throw new Error('请输入地点名称或地址。');
    const result = await this.search({ keyword, city });
    if (result.places[0]) return result.places[0];
    const geocoder = await this.service('Geocoder', { city: city || '全国' });
    return geocodedPlace(await this.request(geocoder, 'getLocation', [keyword]), keyword);
  }

  // 将所选 GCJ-02 坐标解析为地址和附近地标
  async reverse(location: Coordinate): Promise<Place> {
    const geocoder = await this.service('Geocoder', { extensions: 'all', radius: 1000 });
    return reversedPlace(await this.request(geocoder, 'getAddress', [location]), location);
  }

  // 先请求浏览器精确定位，失败后明确返回城市级近似定位
  async locate(): Promise<LocationResult> {
    try {
      const geolocation = await this.service('Geolocation', {
        enableHighAccuracy: true,
        convert: true,
        GeoLocationFirst: true,
        timeout: 10000,
        maximumAge: 30000,
        noIpLocate: 3,
        getCityWhenFail: false,
        needAddress: true,
        showButton: false,
        showMarker: false,
        showCircle: false,
        panToLocation: false,
        zoomToAccuracy: false,
      });
      const result = object(await this.request(geolocation, 'getCurrentPosition', []));
      const location = coordinate(result.position);
      if (!location) throw new Error('定位结果缺少有效坐标。');
      const component = object(result.addressComponent);
      const current: Place = {
        id: `location:${location.join(',')}`,
        name: '我的位置',
        location,
        address: text(result.formattedAddress) || '已获取浏览器位置',
        city: text(component.city) || text(component.province),
        district: text(component.district),
        type: '当前位置',
      };
      return {
        place: current,
        accuracy: numeric(result.accuracy),
        approximate: /ip/i.test(text(result.location_type)),
      };
    } catch (error) {
      this.assertActive();
      const citySearch = await this.service('CitySearch');
      const result = object(await this.request(citySearch, 'getLocalCity', []));
      const city = text(result.city);
      if (!city) throw error;
      const bounds = object(result.bounds);
      const center = typeof bounds.getCenter === 'function' ? coordinate(invoke(bounds, 'getCenter')) : undefined;
      const current = center
        ? {
            id: `city:${city}`,
            name: `${city}（近似位置）`,
            location: center,
            address: city,
            city,
            district: '',
            type: '城市定位',
          }
        : await this.resolve(city, city);
      return { place: { ...current, name: `${city}（近似位置）`, type: '城市定位' }, approximate: true };
    }
  }

  // 查询四种出行方式，策略和途经点仅交给支持的官方插件
  async plan(request: RouteRequest): Promise<RoutePlan[]> {
    if (request.mode !== 'driving' && request.waypoints.length > 0) throw new Error('途经点仅适用于驾车路线。');
    if (request.waypoints.length > 16) throw new Error('驾车路线最多支持 16 个途经点。');
    const plugins = { driving: 'Driving', transit: 'Transfer', walking: 'Walking', riding: 'Riding' };
    const service = await this.service(plugins[request.mode], {
      policy: request.policy,
      city: request.city || request.start.city,
      cityd: request.destinationCity || request.end.city || request.city,
      extensions: 'all',
    });
    const args: unknown[] = [request.start.location, request.end.location];
    if (request.mode === 'driving') args.push({ waypoints: request.waypoints.map((place) => place.location) });
    return routePlans(await this.request(service, 'search', args), request.mode);
  }

  // 并行获取实时天气和四日预报，共享同一个插件实例
  async weather(city: string): Promise<WeatherResult> {
    if (!city.trim()) throw new Error('请先选择城市。');
    const weather = await this.service('Weather');
    const [live, forecast] = await Promise.all([
      this.request(weather, 'getLive', [city], true),
      this.request(weather, 'getForecast', [city], true),
    ]);
    return weatherResult(live, forecast);
  }

  // 查询行政区信息并自行绘制边界，保留地图内的其他覆盖物
  async district(keyword: string): Promise<DistrictResult> {
    const version = ++this.districtVersion;
    const district = await this.service('DistrictSearch', { subdistrict: 1, extensions: 'all' });
    const data = districtResult(await this.request(district, 'search', [keyword]));
    if (version !== this.districtVersion) return data.result;
    this.remove(this.districtOverlays);
    // 行政区边界采用基础多边形绘制，保持地图内统一颜色
    this.districtOverlays = data.boundaries.map((points) =>
      construct(this.sdk, 'Polygon', [
        {
          map: this.map,
          path: points,
          strokeColor: '#555555',
          strokeWeight: 2,
          fillColor: '#888888',
          fillOpacity: 0.08,
        },
      ]),
    );
    if (this.districtOverlays.length) this.fitOverlays(this.districtOverlays);
    else this.setView({ center: data.result.center, zoom: 10 });
    return data.result;
  }

  // 查询双向公交线路的路径、站点、首末班和票价
  async bus(keyword: string, city: string): Promise<BusLine[]> {
    const search = await this.service('LineSearch', { city, pageSize: 20, extensions: 'all' });
    return busLines(await this.request(search, 'search', [keyword]));
  }

  // 使用官方坐标转换接口，避免将 GPS 或百度坐标直接放入地图
  async convert(location: Coordinate, source: 'gps' | 'baidu' | 'mapbar'): Promise<Coordinate> {
    const data = object(await this.request(this.sdk, 'convertFrom', [location, source]));
    const converted = coordinate(Array.isArray(data.locations) ? data.locations[0] : undefined);
    if (!converted) throw new Error('坐标转换结果无效，请检查输入坐标。');
    return converted;
  }

  // 所有自定义标记通过 textContent 渲染，第三方名称不参与 HTML 解析
  private marker(place: Place, label: string, endpoint = false): { overlay: SdkObject; content: HTMLElement } {
    const content = document.createElement('button');
    content.type = 'button';
    content.className = `vibe-map-marker${endpoint ? ' vibe-map-marker-endpoint' : ''}`;
    content.textContent = label;
    content.title = place.name;
    content.setAttribute('aria-label', `查看${place.name}`);
    const overlay = construct(this.sdk, 'Marker', [
      { map: this.map, position: place.location, content, anchor: 'bottom-center', bubble: false },
    ]);
    invoke(overlay, 'on', ['click', () => this.options.onPlace(place)]);
    return { overlay, content };
  }

  // 自行绘制搜索结果并根据全部地点调整视野
  showPlaces(places: Place[]): void {
    this.assertActive();
    this.remove([...this.markers.values()].map((marker) => marker.overlay));
    this.markers.clear();
    for (const [index, place] of places.entries()) this.markers.set(place.id, this.marker(place, String(index + 1)));
    if (places.length) this.fitOverlays([...this.markers.values()].map((marker) => marker.overlay));
  }

  // 聚焦已选地点，选择状态仅通过颜色表达
  focus(place: Place): void {
    this.assertActive();
    this.remove(this.selectedMarker ? [this.selectedMarker] : []);
    this.selectedMarker = undefined;
    for (const [id, marker] of this.markers)
      marker.content.classList.toggle('vibe-map-marker-selected', id === place.id);
    let selected = this.markers.get(place.id)?.overlay;
    if (!selected) {
      const marker = this.marker(place, '●');
      marker.content.classList.add('vibe-map-marker-selected');
      this.selectedMarker = marker.overlay;
      selected = marker.overlay;
    }
    this.fitOverlays([selected], Math.max(15, this.getView().zoom));
  }

  // 绘制自定义路径，路线信息和起终点均由页面自行呈现
  private line(points: Coordinate[]): SdkObject {
    return construct(this.sdk, 'Polyline', [
      {
        map: this.map,
        path: points,
        strokeColor: '#7c3aed',
        strokeWeight: 6,
        isOutline: true,
        outlineColor: '#ffffff',
        lineJoin: 'round',
        lineCap: 'round',
      },
    ]);
  }

  // 显示所选规划方案及起终点和途经点标记
  showRoute(plan: RoutePlan, request: RouteRequest): void {
    this.assertActive();
    this.clearRoute();
    this.routeOverlays = [
      this.line(plan.path),
      this.marker(request.start, '起', true).overlay,
      this.marker(request.end, '终', true).overlay,
      ...request.waypoints.map((place, index) => this.marker(place, `途${index + 1}`, true).overlay),
    ];
    this.fitOverlays(this.routeOverlays);
  }

  // 显示公交路径与可点击站点，站点名称不会注入默认信息窗体
  showBus(line: BusLine): void {
    this.assertActive();
    this.clearRoute();
    this.routeOverlays = [this.line(line.path)];
    for (const [index, stop] of line.stops.entries()) {
      if (!stop.location) continue;
      const place: Place = {
        id: `stop:${line.id}:${index}`,
        name: stop.name,
        location: stop.location,
        address: line.name,
        city: '',
        district: '',
        type: '公交站',
      };
      this.routeOverlays.push(this.marker(place, String(index + 1)).overlay);
    }
    this.fitOverlays(this.routeOverlays);
  }

  // 只清除路线覆盖物，地点结果和手工绘制保持独立
  clearRoute(): void {
    this.remove(this.routeOverlays);
    this.routeOverlays = [];
  }

  // 按需创建官方底图图层，隐藏图层不再产生地图请求
  private layer(name: string): SdkObject {
    const existing = this.layers.get(name);
    if (existing) return existing;
    const layer =
      name === 'standard'
        ? invoke(this.sdk, 'createDefaultLayer')
        : construct(
            object(this.sdk.TileLayer),
            name === 'satellite' ? 'Satellite' : name === 'traffic' ? 'Traffic' : 'RoadNet',
            [{ autoRefresh: name === 'traffic', interval: 180 }],
          );
    if (!isObject(layer)) throw new Error('地图图层初始化失败，请重新加载。');
    this.layers.set(name, layer);
    return layer;
  }

  // 组合卫星、路网、实时路况、样式和三维显示，不使用默认控件
  setAppearance(appearance: MapAppearance): void {
    this.assertActive();
    const layers = [this.layer(appearance.base)];
    if (appearance.roadNet) layers.push(this.layer('roadNet'));
    if (appearance.traffic) layers.push(this.layer('traffic'));
    invoke(this.map, 'setLayers', [layers]);
    invoke(this.map, 'setFeatures', [
      ['bg', 'road', ...(appearance.labels ? ['point'] : []), ...(appearance.buildings ? ['building'] : [])],
    ]);
    invoke(this.map, 'setMapStyle', [`amap://styles/${appearance.style}`]);
    invoke(this.map, 'setPitch', [appearance.threeD ? 50 : 0, true]);
    invoke(this.map, 'setStatus', [{ pitchEnable: appearance.threeD, rotateEnable: appearance.threeD }]);
    if (!appearance.threeD) invoke(this.map, 'setRotation', [0, true]);
  }

  // 接受部分视野更新，缩放范围始终受地图有效级别约束
  setView(view: Partial<MapView>): void {
    this.assertActive();
    const current = this.getView();
    invoke(this.map, 'setZoomAndCenter', [
      Math.min(20, Math.max(3, view.zoom ?? current.zoom)),
      view.center ?? current.center,
      true,
    ]);
  }

  // 将 SDK 视野转换为普通数据，地图初始化阶段保留可靠初始值
  getView(): MapView {
    this.assertActive();
    const center = coordinate(invoke(this.map, 'getCenter')) ?? this.lastView.center;
    const zoom = numeric(invoke(this.map, 'getZoom')) ?? this.lastView.zoom;
    this.lastView = { center, zoom };
    return this.lastView;
  }

  // 地图覆盖物统一采用稳定留白适配移动端与桌面浮层
  private fitOverlays(overlays: SdkObject[], maxZoom = 17): void {
    const padding = this.options.getPadding?.() ?? [72, 72, 64, 64];
    if (overlays.length) invoke(this.map, 'setFitView', [overlays, true, padding, maxZoom]);
  }

  // 显示当前所有有效结果，避免空地图调用自动缩放
  fit(): void {
    this.assertActive();
    this.fitOverlays([
      ...this.routeOverlays,
      ...this.districtOverlays,
      ...this.drawings,
      ...[...this.markers.values()].map((marker) => marker.overlay),
      ...(this.selectedMarker ? [this.selectedMarker] : []),
    ]);
  }

  // 根据矢量结果计算距离或面积，在自定义反馈区报告结果
  private handleDraw = (value: unknown): void => {
    const overlay = object(value).obj;
    if (this.destroyed || !isObject(overlay) || !this.tool) return;
    const tool = this.tool;
    this.drawings.push(overlay);
    let message = '图形已绘制，可继续绘制或清除标注。';
    const geometry = object(this.sdk.GeometryUtil);
    if (tool === 'distance' || tool === 'polyline') {
      const distance = numeric(invoke(geometry, 'distanceOfLine', [path(invoke(overlay, 'getPath'))]));
      if (distance !== undefined)
        message = `路径长度：${distance < 1000 ? `${Math.round(distance)} 米` : `${(distance / 1000).toFixed(2)} 千米`}`;
    } else if (tool === 'area' || tool === 'polygon' || tool === 'rectangle') {
      const area = numeric(
        tool === 'rectangle' && typeof overlay.getArea === 'function'
          ? invoke(overlay, 'getArea')
          : invoke(geometry, 'ringArea', [path(invoke(overlay, 'getPath'))]),
      );
      if (area !== undefined)
        message = `区域面积：${area < 1000000 ? `${Math.round(area).toLocaleString()} 平方米` : `${(area / 1000000).toFixed(2)} 平方千米`}`;
    } else if (tool === 'circle') {
      const radius = numeric(invoke(overlay, 'getRadius'));
      if (radius !== undefined)
        message = `圆半径：${Math.round(radius)} 米 · 面积：${Math.round(Math.PI * radius * radius).toLocaleString()} 平方米`;
    } else if (tool === 'marker') {
      const location = coordinate(invoke(overlay, 'getPosition'));
      if (location) message = `标注坐标：${location.map((number) => number.toFixed(6)).join(', ')}`;
    }
    this.options.onToolResult(message);
  };

  // 使用鼠标工具只绘制基础几何，测量结果由应用自行计算和展示
  async draw(tool: DrawingTool): Promise<void> {
    this.stopDrawing();
    const version = this.toolVersion;
    await this.plugin('MouseTool');
    this.assertActive();
    if (version !== this.toolVersion) return;
    if (!this.mouse) {
      this.mouse = construct(this.sdk, 'MouseTool', [this.map]);
      invoke(this.mouse, 'on', ['draw', this.handleDraw]);
    }
    this.tool = tool;
    const method = tool === 'distance' ? 'polyline' : tool === 'area' ? 'polygon' : tool;
    const options: SdkObject = { strokeColor: '#555555', strokeWeight: 3, fillColor: '#888888', fillOpacity: 0.16 };
    if (method === 'marker') {
      const content = document.createElement('span');
      content.className = 'vibe-map-marker';
      content.textContent = '●';
      options.content = content;
      options.anchor = 'bottom-center';
    }
    invoke(this.mouse, method, [options]);
  }

  // 关闭当前绘制交互而保留已完成图形，并取消尚未完成的启动
  stopDrawing(): void {
    this.toolVersion += 1;
    this.tool = undefined;
    if (this.mouse) invoke(this.mouse, 'close', [false]);
  }

  // 清空手工绘制及行政区边界，搜索和路线结果单独管理
  clearDrawings(): void {
    this.stopDrawing();
    this.districtVersion += 1;
    this.remove([...this.drawings, ...this.districtOverlays]);
    this.drawings = [];
    this.districtOverlays = [];
    if (this.mouse) invoke(this.mouse, 'close', [true]);
  }

  // 移除指定覆盖物，已销毁地图不再参与 SDK 操作
  private remove(overlays: SdkObject[]): void {
    if (!this.destroyed && overlays.length) invoke(this.map, 'remove', [overlays]);
  }

  // 释放地图、事件、插件和所有未完成请求，允许重复调用清理
  destroy(): void {
    if (this.destroyed) return;
    this.stopDrawing();
    if (this.mouse) invoke(this.mouse, 'off', ['draw', this.handleDraw]);
    invoke(this.map, 'off', ['click', this.handlePick]);
    invoke(this.map, 'off', ['moveend', this.handleMove]);
    invoke(this.map, 'off', ['zoomend', this.handleMove]);
    this.destroyed = true;
    this.districtVersion += 1;
    for (const cancel of this.pending) cancel(new Error('地图已关闭。'));
    this.pending.clear();
    this.markers.clear();
    this.layers.clear();
    this.routeOverlays = [];
    this.districtOverlays = [];
    this.drawings = [];
    invoke(this.map, 'destroy');
  }
}

// 注入加载依赖以通过同一接口验证真实适配行为，页面无需接触 SDK
export async function createMapController(
  options: MapControllerOptions,
  loadSdk: SdkLoader = loadAmap,
): Promise<MapController> {
  const sdk = await loadSdk(options.key, options.securityJsCode);
  if (!isObject(sdk) || typeof sdk.Map !== 'function') throw new Error('高德地图 SDK 不可用。');
  return new AmapController(sdk, options);
}
