'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import type {
  Coordinate,
  MapAppearance,
  MapView,
  Place,
  RoutePlan,
  RouteRequest,
  SearchRequest,
  SearchResult,
} from './types';
import { useMapRuntime } from './use-map-runtime';
import { getLibrary, getServerLibrary, rememberSearch, saveLibrary, subscribeLibrary } from './storage';
import { createShareUrl, errorMessage, getMapScale } from './utils';
import { MapIcon } from './components/MapIcon';
import { PlaceInput } from './components/PlaceInput';
import { PlaceDetailsPanel, PlaceList, RouteResultsPanel, SearchResultsPanel } from './components/PlacePanels';
import { RoutePanel } from './components/RoutePanel';
import { ToolsPanel } from './components/ToolsPanel';
import styles from './styles/Map.module.css';

type Panel = 'search' | 'route' | 'saved' | 'layers' | 'tools' | 'place';
const PANEL_TITLES: Record<Panel, string> = {
  search: '搜索结果',
  route: '出行路线',
  saved: '我的收藏',
  layers: '地图图层',
  tools: '地图工具',
  place: '地点详情',
};
const NEARBY = [
  { name: '美食', type: '050000' },
  { name: '咖啡', type: '050500' },
  { name: '酒店', type: '100000' },
  { name: '景点', type: '110000' },
  { name: '停车场', type: '150900' },
  { name: '加油站', type: '010100' },
  { name: '充电站', type: '011100' },
  { name: '卫生间', type: '200300' },
  { name: '医院', type: '090000' },
  { name: '地铁站', type: '150500' },
];
const DEFAULT_APPEARANCE: MapAppearance = {
  base: 'standard',
  traffic: false,
  roadNet: true,
  buildings: true,
  threeD: false,
  labels: true,
  style: 'normal',
};

// 在同一张地图中组织自绘搜索、出行、地点与工具浮层
export default function MapApp() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);
  const pickId = useRef(0);
  const hasInteracted = useRef(false);
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [nearby, setNearby] = useState(false);
  const [radius, setRadius] = useState(3000);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<MapView>({ center: [116.397428, 39.90923], zoom: 13 });
  const [currentLocation, setCurrentLocation] = useState<Place | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchRequest | null>(null);
  const [route, setRoute] = useState<{ plans: RoutePlan[]; request: RouteRequest; selected: string } | null>(null);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const library = useSyncExternalStore(subscribeLibrary, getLibrary, getServerLibrary);

  const { controller, status, failure } = useMapRuntime({
    containerRef: canvasRef,
    retry,
    onPick: pickLocation,
    onPlace: selectPlace,
    onMove: setView,
    onToolResult: setNotice,
    onNotice: setNotice,
    getPadding: getMapPadding,
    onLocation: (location, active) => {
      setCurrentLocation(location.place);
      if (!hasInteracted.current) active.focus(location.place);
      setNotice(
        location.approximate
          ? '已使用城市级 IP 定位，位置仅供参考。可再次尝试精确定位。'
          : `已定位到当前位置${location.accuracy ? `，精度约 ${Math.round(location.accuracy)} 米` : ''}。`,
      );
    },
  });
  const ready = status === 'ready' && controller !== null;
  const scale = getMapScale(view);

  // 地图占满视口时停用被覆盖的站点页脚，离开应用后恢复焦点入口
  useEffect(() => {
    const footer = workspaceRef.current?.closest('main')?.nextElementSibling;
    if (!(footer instanceof HTMLElement) || footer.tagName !== 'FOOTER') return;
    const previous = footer.inert;
    footer.inert = true;
    return () => {
      footer.inert = previous;
    };
  }, []);

  // 为地图几何保留浮层占据的空间，避免路线端点落在面板下面
  function getMapPadding(): [number, number, number, number] {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const dock = dockRef.current?.getBoundingClientRect();
    const visiblePanel = panelRef.current && !panelRef.current.hidden ? panelRef.current.getBoundingClientRect() : null;
    if (!canvas || !dock) return [64, 64, 64, 64];
    if (canvas.width >= 768) return [64, 64, Math.min(dock.right - canvas.left + 16, canvas.width / 2), 64];
    const top = dock.bottom - canvas.top + 12;
    const bottom = visiblePanel ? canvas.bottom - visiblePanel.top + 16 : 80;
    const factor = Math.min(1, Math.max(120, canvas.height - 120) / (top + bottom));
    return [Math.round(top * factor), Math.round(bottom * factor), 24, 64];
  }

  // 面板开启时聚焦标题，保持键盘操作有明确起点
  useEffect(() => {
    if (!panel) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [panel]);

  // 即使浮层已收起，Escape 也能停止地图绘图交互
  useEffect(() => {
    // 关闭浮层后保留键盘使用者的操作位置
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setPanel(null);
      controller?.stopDrawing();
      panelTriggerRef.current?.focus({ preventScroll: true });
    }
    // 地图底图点击只收起浮层，保留拖拽和缩放交互
    function onOutside(event: PointerEvent): void {
      if (!(event.target instanceof Element) || !event.target.closest('[data-map-canvas]')) return;
      setPanel(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [controller]);

  // 离开页面时作废尚未完成的地点和搜索请求
  useEffect(
    () => () => {
      requestId.current += 1;
      pickId.current += 1;
    },
    [],
  );

  // 记录浮层入口，使关闭后的键盘焦点可恢复
  function openPanel(next: Panel): void {
    requestId.current += 1;
    pickId.current += 1;
    setBusy(false);
    if (next !== 'tools') controller?.stopDrawing();
    if (document.activeElement instanceof HTMLElement) panelTriggerRef.current = document.activeElement;
    setPanel((previous) => (previous === next ? null : next));
    setError('');
  }

  // 地图点选逆地理编码，晚到的旧结果不会覆盖新地点
  async function pickLocation(location: Coordinate): Promise<void> {
    if (!controller) return;
    requestId.current += 1;
    setBusy(false);
    const id = ++pickId.current;
    setError('');
    try {
      const selected = await controller.reverse(location);
      if (id !== pickId.current) return;
      selectPlace(selected);
    } catch (reason) {
      if (id === pickId.current) setError(errorMessage(reason));
    }
  }

  // 选择地点时同步地图标记与自绘详情
  function selectPlace(selected: Place): void {
    pickId.current += 1;
    requestId.current += 1;
    setBusy(false);
    controller?.stopDrawing();
    setPlace(selected);
    setPanel('place');
    controller?.focus(selected);
    setError('');
  }

  // 统一关键字、附近分类与翻页查询，并保护请求顺序
  async function searchPlaces(request: SearchRequest): Promise<void> {
    if (!controller) return;
    pickId.current += 1;
    controller.stopDrawing();
    const id = ++requestId.current;
    setBusy(true);
    setError('');
    setPanel('search');
    setLastSearch(request);
    try {
      const found = await controller.search(request);
      if (id !== requestId.current) return;
      setResult(found);
      controller.showPlaces(found.places);
      if (request.keyword) rememberSearch(request.keyword);
    } catch (reason) {
      if (id === requestId.current) {
        setError(errorMessage(reason));
        setResult(null);
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  // 提交搜索时冻结附近中心点，翻页不会因拖图改变范围
  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!keyword.trim()) {
      setError('请输入地点名称、地址或关键词。');
      return;
    }
    void searchPlaces({
      keyword: keyword.trim(),
      city: city.trim(),
      page: 1,
      ...(nearby ? { center: controller?.getView().center ?? view.center, radius } : {}),
    });
  }

  // 点击附近类别直接检索当前地图中心周围地点
  function searchNearby(category: (typeof NEARBY)[number], center?: Coordinate): void {
    setKeyword(category.name);
    setNearby(true);
    void searchPlaces({
      keyword: '',
      type: category.type,
      city,
      page: 1,
      center: center ?? controller?.getView().center ?? view.center,
      radius,
    });
  }

  // 收藏只由用户主动保存，写入失败时给出清晰反馈
  function toggleFavorite(selected: Place): void {
    const exists = library.favorites.some((item) => item.id === selected.id);
    if (!exists && library.favorites.length >= 100) {
      setError('最多保存 100 个地点，请先移除一些收藏。');
      return;
    }
    const favorites = exists
      ? library.favorites.filter((item) => item.id !== selected.id)
      : [selected, ...library.favorites];
    const saved = saveLibrary({ ...library, favorites });
    setNotice(
      saved ? (exists ? '已取消收藏。' : '已收藏到当前浏览器。') : '浏览器存储不可用，此收藏仅在当前页面保留。',
    );
  }

  // 手动重新定位并区分精确定位与 IP 定位
  async function locate(): Promise<void> {
    if (!controller || locating) return;
    requestId.current += 1;
    const id = ++pickId.current;
    setBusy(false);
    controller.stopDrawing();
    setLocating(true);
    setError('');
    try {
      const location = await controller.locate();
      if (id !== pickId.current) return;
      setCurrentLocation(location.place);
      controller.focus(location.place);
      setNotice(location.approximate ? '已回到城市级 IP 定位位置，尚未获得精确位置。' : '已回到当前位置。');
    } catch (reason) {
      if (id === pickId.current) setError(errorMessage(reason));
    } finally {
      setLocating(false);
    }
  }

  // 地点详情中的出行入口把已选地点交给路线表单
  function goTo(selected: Place): void {
    requestId.current += 1;
    pickId.current += 1;
    setBusy(false);
    controller?.stopDrawing();
    setDestination(selected);
    setPanel('route');
    setError('');
  }

  // 路线结果在自绘面板和地图几何之间保持一致
  function showPlans(plans: RoutePlan[], request: RouteRequest): void {
    requestId.current += 1;
    pickId.current += 1;
    setBusy(false);
    if (!plans.length) {
      setRoute(null);
      controller?.clearRoute();
      setError('没有找到可用路线，请检查地点和城市，或更换出行方式。');
      return;
    }
    setRoute({ plans, request, selected: plans[0].id });
    controller?.showRoute(plans[0], request);
    setResult(null);
  }

  // 切换图层时同步同一份外观配置
  function changeAppearance(update: Partial<MapAppearance>): void {
    const next = { ...appearance, ...update };
    setAppearance(next);
    controller?.setAppearance(next);
  }

  // 分享视图复制失败时提供可手动复制的链接
  async function share(): Promise<void> {
    const sharedView =
      place && panel === 'place' ? { center: place.location, zoom: 16 } : (controller?.getView() ?? view);
    const url = createShareUrl(window.location.origin, sharedView);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('地图链接已复制，打开链接即可回到此位置。');
    } catch {
      setNotice(`请复制地图链接：${url}`);
    }
  }

  // 全屏仅扩展地图组件，所有操作继续留在地图内部
  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (workspaceRef.current?.requestFullscreen) await workspaceRef.current.requestFullscreen();
      else setNotice('当前浏览器不支持全屏，可使用浏览器的全屏功能。');
    } catch {
      setError('无法进入全屏，请在浏览器允许后重试。');
    }
  }

  return (
    <section
      ref={workspaceRef}
      className={styles.workspace}
      aria-label="地图应用"
      onPointerDownCapture={() => {
        hasInteracted.current = true;
      }}
      onKeyDownCapture={() => {
        hasInteracted.current = true;
      }}
      onWheelCapture={() => {
        hasInteracted.current = true;
      }}
    >
      <h1 className={styles.srOnly}>地图</h1>
      <div ref={canvasRef} data-map-canvas className={styles.canvas} aria-label="高德地图，点击位置查看详情" />

      <div ref={dockRef} className={styles.searchDock}>
        <div className={styles.searchHeader}>
          <Link className={styles.iconButton} href="/lab" aria-label="返回 Lab">
            <MapIcon name="back" />
          </Link>
          <span className={styles.brand}>
            <MapIcon name="pin" />
            地图
          </span>
          <span className={styles.source}>高德地图</span>
        </div>
        <form onSubmit={submitSearch} className={styles.searchForm}>
          <div className={styles.searchInput}>
            <PlaceInput
              controller={controller}
              city={city}
              label="搜索地点"
              value={keyword}
              selected={null}
              onChange={(value, selected) => {
                setKeyword(value);
                if (selected) selectPlace(selected);
              }}
              placeholder="搜索地点、地址或关键词"
              disabled={!ready}
            />
          </div>
          <button className={styles.searchSubmit} type="submit" disabled={!ready || busy} aria-label="搜索">
            <MapIcon name="search" />
          </button>
        </form>
        <div className={styles.searchScope}>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="搜索城市"
            placeholder="全国 / 输入城市"
            maxLength={40}
          />
          <label>
            <input type="checkbox" checked={nearby} onChange={(event) => setNearby(event.target.checked)} />
            附近
          </label>
          {nearby ? (
            <select
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              aria-label="附近搜索半径"
            >
              <option value={1000}>1 公里</option>
              <option value={3000}>3 公里</option>
              <option value={5000}>5 公里</option>
              <option value={10000}>10 公里</option>
              <option value={50000}>50 公里</option>
            </select>
          ) : null}
        </div>
        <nav className={styles.mainActions} aria-label="地图功能">
          {(
            [
              { panel: 'route', name: '路线', icon: 'route' },
              { panel: 'saved', name: '收藏', icon: 'star' },
              { panel: 'layers', name: '图层', icon: 'layers' },
              { panel: 'tools', name: '工具', icon: 'tools' },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.panel}
              className={`${styles.navButton} ${panel === item.panel ? styles.active : ''}`}
              aria-expanded={panel === item.panel}
              aria-controls="map-panel"
              onClick={() => openPanel(item.panel)}
            >
              <MapIcon name={item.icon} />
              {item.name}
            </button>
          ))}
        </nav>
      </div>

      {!panel ? (
        <div className={styles.nearbyDock} aria-label="附近分类">
          {NEARBY.slice(0, 6).map((category) => (
            <button
              type="button"
              key={category.type}
              className={styles.chip}
              disabled={!ready}
              onClick={() => searchNearby(category)}
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      {status === 'loading' || status === 'error' ? (
        <div className={styles.runtimeState} role="status">
          <MapIcon name="pin" />
          <h2>{status === 'loading' ? '正在打开地图' : '地图暂时无法加载'}</h2>
          <p>{status === 'loading' ? '加载地图后将尝试定位，请允许浏览器访问你的位置。' : failure}</p>
          {status !== 'loading' ? (
            <button type="button" className={styles.button} onClick={() => setRetry((previous) => previous + 1)}>
              重新加载
            </button>
          ) : null}
        </div>
      ) : null}

      <section
        hidden={!panel}
        id="map-panel"
        ref={panelRef}
        tabIndex={-1}
        className={styles.panel}
        aria-label={PANEL_TITLES[panel ?? 'search']}
      >
        <header className={styles.panelHeader}>
          <h2>{PANEL_TITLES[panel ?? 'search']}</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="关闭面板"
            onClick={() => {
              setPanel(null);
              panelTriggerRef.current?.focus();
            }}
          >
            <MapIcon name="close" />
          </button>
        </header>
        <div className={styles.panelBody}>
          {panel === 'search' ? (
            <>
              <div className={styles.categories}>
                {NEARBY.map((category) => (
                  <button
                    type="button"
                    className={styles.chip}
                    key={category.type}
                    disabled={!ready || busy}
                    onClick={() => searchNearby(category)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              {busy ? (
                <p role="status" className={styles.muted}>
                  正在搜索地点…
                </p>
              ) : null}
              {result && !busy ? (
                <SearchResultsPanel
                  result={result}
                  places={result.places}
                  favorites={library.favorites}
                  busy={busy}
                  onSelect={selectPlace}
                  onFavorite={toggleFavorite}
                  onPage={(page) => {
                    if (lastSearch) void searchPlaces({ ...lastSearch, page });
                  }}
                />
              ) : !busy ? (
                <EmptyState title="输入关键词探索地图" description="按名称、地址搜索，或选择附近分类。" />
              ) : null}
            </>
          ) : null}
          {panel === 'place' && place ? (
            <PlaceDetailsPanel
              place={place}
              saved={library.favorites.some((item) => item.id === place.id)}
              onFavorite={toggleFavorite}
              onRoute={goTo}
              onNearby={(selected) => {
                setNearby(true);
                setKeyword('');
                void searchPlaces({ keyword: '', city, center: selected.location, radius, page: 1 });
              }}
              onShare={() => void share()}
            />
          ) : null}
          <div hidden={panel !== 'route'}>
            <RoutePanel
              controller={controller}
              currentLocation={currentLocation}
              destination={destination}
              onPlan={showPlans}
              onClear={() => {
                setRoute(null);
                controller?.clearRoute();
              }}
              onError={setError}
            />
            {route ? (
              <RouteResultsPanel
                {...route}
                onSelect={(plan) => {
                  setRoute({ ...route, selected: plan.id });
                  controller?.showRoute(plan, route.request);
                }}
              />
            ) : null}
          </div>
          {panel === 'saved' ? (
            <>
              <p className={styles.muted}>收藏与搜索历史保存在当前浏览器中。</p>
              {library.favorites.length ? (
                <PlaceList
                  places={library.favorites}
                  favorites={library.favorites}
                  onSelect={selectPlace}
                  onFavorite={toggleFavorite}
                />
              ) : (
                <EmptyState title="还没有收藏地点" description="搜索或点击地图，在地点详情中收藏常去的位置。" />
              )}
              <div className={styles.sectionHeading}>
                <h3>最近搜索</h3>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!library.history.length}
                  onClick={() => {
                    saveLibrary({ ...library, history: [] });
                  }}
                >
                  清空历史
                </button>
              </div>
              {library.history.length ? (
                <div className={styles.categories}>
                  {library.history.map((value) => (
                    <button
                      type="button"
                      className={styles.chip}
                      key={value}
                      disabled={!ready}
                      onClick={() => {
                        setKeyword(value);
                        void searchPlaces({ keyword: value, city, page: 1 });
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>尚无搜索记录。</p>
              )}
            </>
          ) : null}
          {panel === 'layers' ? (
            <>
              <h3 className={styles.smallTitle}>底图</h3>
              <div className={styles.row}>
                {(['standard', 'satellite'] as const).map((base) => (
                  <button
                    type="button"
                    key={base}
                    className={`${styles.button} ${appearance.base === base ? styles.active : ''}`}
                    disabled={!ready}
                    aria-pressed={appearance.base === base}
                    onClick={() => changeAppearance({ base })}
                  >
                    {base === 'standard' ? '标准地图' : '卫星地图'}
                  </button>
                ))}
              </div>
              <div className={styles.layerOptions}>
                {(
                  [
                    { key: 'traffic', title: '实时路况', hint: '显示道路拥堵情况' },
                    { key: 'roadNet', title: '道路网络', hint: '叠加道路与路名' },
                    { key: 'threeD', title: '3D 视角', hint: '倾斜地图查看建筑' },
                    { key: 'buildings', title: '建筑显示', hint: '显示地图建筑要素' },
                    { key: 'labels', title: '地点标注', hint: '显示地名和兴趣点' },
                  ] as const
                ).map((item) => (
                  <label key={item.key} className={styles.layerOption}>
                    <span>
                      <strong>{item.title}</strong>
                      <span>{item.hint}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={appearance[item.key]}
                      disabled={!ready}
                      onChange={(event) => changeAppearance({ [item.key]: event.target.checked })}
                    />
                  </label>
                ))}
              </div>
              <label className={styles.fieldLabel}>
                地图风格
                <select
                  value={appearance.style}
                  disabled={!ready}
                  onChange={(event) => {
                    const style = event.target.value;
                    if (style === 'normal' || style === 'whitesmoke' || style === 'dark') changeAppearance({ style });
                  }}
                >
                  <option value="normal">标准</option>
                  <option value="whitesmoke">简洁灰白</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <p className={styles.muted}>实时路况由高德更新；卫星影像的拍摄时间因区域而异。</p>
            </>
          ) : null}
          <div hidden={panel !== 'tools'}>
            <ToolsPanel controller={controller} onError={setError} onNotice={setNotice} />
          </div>
        </div>
      </section>

      <div className={styles.mapControls} aria-label="地图视图控制">
        <button
          type="button"
          className={styles.iconButton}
          disabled={!ready || locating}
          aria-label={locating ? '正在定位' : '定位到当前位置'}
          onClick={() => void locate()}
        >
          <MapIcon name="locate" />
        </button>
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={styles.iconButton}
            disabled={!ready || view.zoom >= 20}
            aria-label="放大地图"
            onClick={() => controller?.setView({ zoom: Math.min(20, view.zoom + 1) })}
          >
            <MapIcon name="plus" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            disabled={!ready || view.zoom <= 3}
            aria-label="缩小地图"
            onClick={() => controller?.setView({ zoom: Math.max(3, view.zoom - 1) })}
          >
            <MapIcon name="minus" />
          </button>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!ready}
          aria-label="显示所有标记和路线"
          onClick={() => controller?.fit()}
        >
          <MapIcon name="expand" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!ready}
          aria-label="恢复正北和二维视角"
          onClick={() => changeAppearance({ threeD: false })}
        >
          <MapIcon name="compass" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="地图全屏"
          onClick={() => void toggleFullscreen()}
        >
          <MapIcon name="expand" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!ready}
          aria-label="分享当前地图"
          onClick={() => void share()}
        >
          <MapIcon name="share" />
        </button>
      </div>

      {error || notice ? (
        <div className={`${styles.notice} ${error ? styles.errorNotice : ''}`} role={error ? 'alert' : 'status'}>
          <span>{error || notice}</span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="关闭提示"
            onClick={() => {
              setNotice('');
              setError('');
            }}
          >
            <MapIcon name="close" />
          </button>
        </div>
      ) : null}
      <footer className={styles.mapFooter}>
        <div className={styles.scale}>
          <span>{scale}</span>
          <div />
        </div>
        <span className={styles.coordinates}>
          {view.center.map((value) => value.toFixed(4)).join(', ')} · {Math.round(view.zoom)} 级
        </span>
        <span className={styles.mapHint}>点击地图查看位置</span>
      </footer>
    </section>
  );
}
