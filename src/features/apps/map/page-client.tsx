/** 地图：客户端页面与交互编排 */

'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import type {
  Coordinate,
  DrawingTool,
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
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const searchScrollRef = useRef(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);
  const pickId = useRef(0);
  const hasInteracted = useRef(false);
  const nearbyAnchor = useRef<Coordinate | null>(null);
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const [routePick, setRoutePick] = useState<'start' | 'end' | null>(null);
  const picking = routePick !== null;
  const [routePoint, setRoutePoint] = useState<{ endpoint: 'start' | 'end'; place: Place } | null>(null);
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
  const [result, setResult] = useState<SearchResult | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchRequest | null>(null);
  const [route, setRoute] = useState<{ plans: RoutePlan[]; request: RouteRequest; selected: string } | null>(null);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const library = useSyncExternalStore(subscribeLibrary, getLibrary, getServerLibrary);

  const { controller, status, failure } = useMapRuntime({
    containerRef: canvasRef,
    retry,
    onPick: pickLocation,
    onPlace: selectMapPlace,
    onMove: setView,
    // 横竖屏变化后按地图的新尺寸保留气泡完整可见
    onResize: () => {
      if (place && panel === 'place') controller?.focus(place);
    },
    onToolResult: setNotice,
    onDrawingChange: setDrawingTool,
    onNotice: setNotice,
    getPadding: getMapPadding,
    // 记录定位地点，在用户尚未操作时聚焦地图并提示定位精度
    onLocation: (location, active) => {
      setCurrentLocation(location.place);
      if (!hasInteracted.current)
        active.setView({ center: location.place.location, zoom: location.approximate ? 12 : 15 });
      setNotice(
        location.approximate
          ? '已使用城市级 IP 定位，位置仅供参考。可再次尝试精确定位。'
          : `已定位到当前位置${location.accuracy ? `，精度约 ${Math.round(location.accuracy)} 米` : ''}。`,
      );
    },
  });
  const ready = status === 'ready' && controller !== null;
  const scale = getMapScale(view);

  // 返回搜索列表时恢复浏览位置，其他任务从面板顶部开始
  useEffect(() => {
    if (panelBodyRef.current) panelBodyRef.current.scrollTop = panel === 'search' ? searchScrollRef.current : 0;
  }, [panel, result]);

  // 规划成功后直接展示路线方案，移动端无需越过整张表单寻找结果
  useEffect(() => {
    if (panel === 'route' && route?.request) {
      panelRef.current?.querySelector('[aria-label="路线结果"]')?.scrollIntoView({ block: 'nearest' });
    }
  }, [panel, route?.request]);

  // 普通反馈自动消退，绘图指引和需要手动复制的分享链接保持可见
  useEffect(() => {
    if (!notice || drawingTool || notice.startsWith('请复制地图链接')) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice, drawingTool]);

  // 等详情面板完成布局后聚焦地点，避免首次选点被底部面板遮挡
  useEffect(() => {
    if (!place || !controller || panel !== 'place') return;
    const frame = requestAnimationFrame(() => controller.focus(place));
    return () => cancelAnimationFrame(frame);
  }, [place, controller, panel]);

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
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    const visiblePanel = panelRef.current && !panelRef.current.hidden ? panelRef.current.getBoundingClientRect() : null;
    if (!canvas || !dock) return [64, 64, 64, 64];
    if (canvas.width >= 768) return [64, 64, Math.min(dock.right - canvas.left + 16, canvas.width / 2), 64];
    const top = Math.max(dock.bottom, toolbar?.bottom ?? dock.bottom) - canvas.top + 12;
    const bottom = visiblePanel ? canvas.bottom - visiblePanel.top + 16 : 80;
    const factor = Math.min(1, Math.max(120, canvas.height - 120) / (top + bottom));
    return [Math.round(top * factor), Math.round(bottom * factor), 24, 64];
  }

  // Escape 优先取消选点或绘图，下一次才关闭工作面板
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (picking) {
      cancelPicking();
      return;
    }
    if (drawingTool) {
      controller?.stopDrawing();
      setNotice('已停止绘图。');
      return;
    }
    if (scopeOpen) {
      setScopeOpen(false);
      return;
    }
    closePanel();
  });

  // 注册一次全局快捷键，通过 Effect Event 读取当前操作状态
  useEffect(() => {
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  // 搜索范围只作为临时下拉区域，点击外部即可收起且不关闭工作面板
  useEffect(() => {
    if (!scopeOpen) return;
    // 保留范围区域内部的输入与选择操作
    function closeScope(event: PointerEvent): void {
      if (event.target instanceof Node && !dockRef.current?.contains(event.target)) setScopeOpen(false);
    }
    document.addEventListener('pointerdown', closeScope);
    return () => document.removeEventListener('pointerdown', closeScope);
  }, [scopeOpen]);

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
    controller?.stopDrawing();
    setRoutePick(null);
    setPanelCollapsed(false);
    if (document.activeElement instanceof HTMLElement) panelTriggerRef.current = document.activeElement;
    setPanel((previous) => (previous === next ? null : next));
    setError('');
  }

  // 明确关闭才结束当前任务，地图拖拽和缩放不改变面板状态
  function closePanel(): void {
    requestId.current += 1;
    pickId.current += 1;
    setBusy(false);
    setRoutePick(null);
    controller?.stopDrawing();
    setPanel(null);
    panelTriggerRef.current?.focus({ preventScroll: true });
  }

  // 取消选点时作废请求，并恢复被收起的路线表单
  function cancelPicking(): void {
    pickId.current += 1;
    setRoutePick(null);
    if (routePick) setPanelCollapsed(false);
  }

  // 地图点选逆地理编码，晚到的旧结果不会覆盖新地点
  async function pickLocation(location: Coordinate): Promise<void> {
    if (!controller) return;
    setRoutePick(null);
    requestId.current += 1;
    setBusy(false);
    const id = ++pickId.current;
    setError('');
    try {
      const selected = await controller.reverse(location);
      if (id !== pickId.current) return;
      if (routePick) finishRoutePick(selected, routePick);
      else selectPlace(selected);
    } catch (reason) {
      if (id === pickId.current) {
        setError(errorMessage(reason));
        setRoutePick(null);
        if (routePick) setPanelCollapsed(false);
      }
    }
  }

  // 显式选点始终按点击坐标解析完整地址，普通地点点击保留兴趣点详情
  function selectMapPlace(selected: Place): void {
    if (picking) {
      void pickLocation(selected.location);
      return;
    }
    selectPlace(selected);
  }

  // 选择地点时同步地图标记与自绘详情
  function selectPlace(selected: Place): void {
    if (panel === 'search') searchScrollRef.current = panelBodyRef.current?.scrollTop ?? 0;
    pickId.current += 1;
    requestId.current += 1;
    setBusy(false);
    controller?.stopDrawing();
    setRoutePick(null);
    setPanelCollapsed(false);
    setPlace(selected);
    setPanel('place');
    setError('');
    if (controller && !selected.type && !selected.id.startsWith('point:')) {
      const id = pickId.current;
      // 补充详情时仍校验选点序号，旧地点不得覆盖后来打开的地点
      void controller.details(selected.id).then(
        (details) => {
          if (id === pickId.current) setPlace(details);
        },
        () => {
          if (id === pickId.current) setNotice('地点详情暂不可用，仍可使用当前坐标规划路线。');
        },
      );
    }
  }

  // 统一从地图或详情设置路线端点，保留另一端并清除旧路线
  function finishRoutePick(selected: Place, endpoint: 'start' | 'end'): void {
    requestId.current += 1;
    pickId.current += 1;
    setBusy(false);
    controller?.stopDrawing();
    controller?.clearRoute();
    setRoute(null);
    setRoutePoint({ endpoint, place: selected });
    setRoutePick(null);
    setPanelCollapsed(false);
    setPanel('route');
    setError('');
  }

  // 统一关键字、附近分类与翻页查询，并保护请求顺序
  async function searchPlaces(request: SearchRequest): Promise<void> {
    if (!controller) return;
    nearbyAnchor.current = request.center ? [...request.center] : null;
    setNearby(Boolean(request.center));
    searchScrollRef.current = 0;
    pickId.current += 1;
    controller.stopDrawing();
    const id = ++requestId.current;
    setBusy(true);
    setRoutePick(null);
    setPanelCollapsed(false);
    setError('');
    setPanel('search');
    setLastSearch(request);
    setResult(null);
    controller.showPlaces([]);
    controller.clearRoute();
    setRoute(null);
    try {
      const found = await controller.search(request);
      if (id !== requestId.current) return;
      setResult(found);
      controller.showPlaces(found.places, { preserveView: Boolean(request.center) });
      if (request.keyword) rememberSearch(request.keyword);
    } catch (reason) {
      if (id === requestId.current) {
        setError(errorMessage(reason));
        setResult(null);
        controller.showPlaces([]);
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
      ...(nearby ? { center: nearbyAnchor.current ?? controller?.getView().center ?? view.center, radius } : {}),
    });
  }

  // 切换附近品类继续使用原目标点，只有显式选择新地点才更换搜索中心
  function searchNearby(category: (typeof NEARBY)[number], center?: Coordinate): void {
    setKeyword(category.name);
    setNearby(true);
    void searchPlaces({
      keyword: '',
      type: category.type,
      city,
      page: 1,
      center: center ?? nearbyAnchor.current ?? controller?.getView().center ?? view.center,
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
    controller?.showPlaces([]);
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
      data-panel={panel ? 'open' : 'closed'}
      data-collapsed={panelCollapsed}
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
      <div
        ref={canvasRef}
        data-map-canvas
        className={`${styles.canvas} ${picking ? styles.picking : ''}`}
        aria-label="高德地图，可拖动和缩放；点击位置查看完整地址"
      />

      <div ref={dockRef} className={styles.searchDock}>
        <form onSubmit={submitSearch} className={styles.searchForm}>
          <Link className={styles.iconButton} href="/lab" aria-label="返回 Lab">
            <MapIcon name="back" />
          </Link>
          <div className={styles.searchInput}>
            <PlaceInput
              controller={controller}
              city={city}
              label="搜索地点"
              value={keyword}
              selected={null}
              onChange={
                // 输入只更新关键词，选择建议时才执行地图操作
                (value) => {
                  setKeyword(value);
                }
              }
              onChoose={
                // 建议缺少坐标时按名称搜索，避免选中后没有任何反馈
                (value, selected) => {
                  if (selected) selectPlace(selected);
                  else void searchPlaces({ keyword: value, city, page: 1 });
                }
              }
              placeholder="搜地点、找路线"
              disabled={!ready}
            />
          </div>
          {keyword ? (
            <button className={styles.iconButton} type="button" aria-label="清空搜索" onClick={() => setKeyword('')}>
              <MapIcon name="close" />
            </button>
          ) : null}
          <button
            className={`${styles.iconButton} ${panel === 'route' ? styles.active : ''}`}
            type="button"
            aria-label="路线"
            aria-expanded={panel === 'route'}
            onClick={() => openPanel('route')}
          >
            <MapIcon name="route" />
          </button>
          <button className={styles.searchSubmit} type="submit" disabled={!ready || busy} aria-label="搜索">
            <MapIcon name="search" />
          </button>
        </form>
        <button
          type="button"
          className={styles.scopeToggle}
          aria-expanded={scopeOpen}
          aria-controls="map-search-scope"
          onClick={() => setScopeOpen((previous) => !previous)}
        >
          {city || '全国'} · {nearby ? `周边 ${radius / 1000} 公里` : '搜索范围'}
          <span>{scopeOpen ? '收起' : '修改'}</span>
        </button>
        <div id="map-search-scope" hidden={!scopeOpen} className={styles.searchScope}>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="搜索城市"
            placeholder="全国 / 输入城市"
            maxLength={40}
          />
          <label>
            <input
              type="checkbox"
              checked={nearby}
              onChange={
                // 用户退出周边范围后释放旧中心，下次从当前地图位置开始
                (event) => {
                  setNearby(event.target.checked);
                  if (!event.target.checked) nearbyAnchor.current = null;
                }
              }
            />
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
      </div>
      <nav ref={toolbarRef} className={styles.mainActions} aria-label="地图功能">
        <button
          type="button"
          className={`${styles.navButton} ${appearance.traffic ? styles.active : ''}`}
          disabled={!ready}
          aria-pressed={appearance.traffic}
          onClick={() => changeAppearance({ traffic: !appearance.traffic })}
        >
          路况
        </button>
        {(
          [
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
        <button type="button" className={styles.navButton} disabled={!ready} onClick={() => controller?.fit()}>
          <MapIcon name="expand" />
          总览
        </button>
        <button type="button" className={styles.navButton} onClick={() => void toggleFullscreen()}>
          全屏
        </button>
        <button type="button" className={styles.navButton} disabled={!ready} onClick={() => void share()}>
          <MapIcon name="share" />
          分享
        </button>
      </nav>

      {picking ? (
        <div className={styles.pickBanner} role="status">
          点击地图选择{routePick === 'start' ? '起点' : '终点'}
          <button type="button" className={styles.button} onClick={cancelPicking}>
            取消选点
          </button>
        </div>
      ) : null}

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
          {panel === 'place' && result ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="返回搜索结果"
              onClick={() => setPanel('search')}
            >
              <MapIcon name="back" />
            </button>
          ) : null}
          <h2>{PANEL_TITLES[panel ?? 'search']}</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={panelCollapsed ? '展开面板' : '收起面板'}
            aria-expanded={!panelCollapsed}
            onClick={() => setPanelCollapsed((previous) => !previous)}
          >
            <MapIcon name={panelCollapsed ? 'plus' : 'minus'} />
          </button>
          <button type="button" className={styles.iconButton} aria-label="关闭面板" onClick={closePanel}>
            <MapIcon name="close" />
          </button>
        </header>
        <div ref={panelBodyRef} className={styles.panelBody} hidden={panelCollapsed}>
          {panel === 'search' ? (
            <>
              {lastSearch?.center ? <p className={styles.muted}>以原目标点为中心 · 距离由近到远</p> : null}
              <details className={styles.nearbyCategories}>
                <summary>搜索周边分类</summary>
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
              </details>
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
              onRoute={finishRoutePick}
              onNearby={
                // 以选中地点为中心开始附近搜索并清空旧关键词
                (selected) => {
                  setNearby(true);
                  setKeyword('');
                  void searchPlaces({ keyword: '', city, center: selected.location, radius, page: 1 });
                }
              }
              onShare={() => void share()}
            />
          ) : null}
          <div hidden={panel !== 'route'}>
            <RoutePanel
              controller={controller}
              currentLocation={currentLocation}
              active={panel === 'route'}
              mapPoint={routePoint}
              onPick={
                // 收起表单并显式进入起终点选点模式
                (endpoint) => {
                  controller?.stopDrawing();
                  setRoutePick(endpoint);
                  setPanelCollapsed(true);
                  setNotice('');
                  pickId.current += 1;
                }
              }
              onPlan={showPlans}
              onClear={
                // 清空路线状态并移除地图上的路线图层
                () => {
                  setRoute(null);
                  controller?.clearRoute();
                }
              }
              onError={setError}
            />
            {route ? (
              <RouteResultsPanel
                {...route}
                onSelect={
                  // 更新选中方案并在地图上显示对应路线
                  (plan) => {
                    setRoute({ ...route, selected: plan.id });
                    controller?.showRoute(plan, route.request);
                  }
                }
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
                      onClick={
                        // 将历史记录恢复为关键词并重新发起地点搜索
                        () => {
                          setKeyword(value);
                          void searchPlaces({ keyword: value, city, page: 1 });
                        }
                      }
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
                  onChange={
                    // 只接受支持的地图样式值并更新外观
                    (event) => {
                      const style = event.target.value;
                      if (style === 'normal' || style === 'whitesmoke' || style === 'dark') changeAppearance({ style });
                    }
                  }
                >
                  <option value="normal">标准</option>
                  <option value="whitesmoke">简洁灰白</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <p className={styles.muted}>实时路况由高德更新；卫星影像的拍摄时间因区域而异。</p>
            </>
          ) : null}
          {panel === 'tools' ? (
            <ToolsPanel controller={controller} drawingTool={drawingTool} onError={setError} onNotice={setNotice} />
          ) : null}
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
          aria-label="恢复正北和二维视角"
          onClick={() => changeAppearance({ threeD: false })}
        >
          <MapIcon name="compass" />
        </button>
      </div>

      {error || notice ? (
        <div className={`${styles.notice} ${error ? styles.errorNotice : ''}`} role={error ? 'alert' : 'status'}>
          <span>{error || notice}</span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="关闭提示"
            onClick={
              // 同时清除普通提示与错误提示
              () => {
                setNotice('');
                setError('');
              }
            }
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
        <span className={styles.mapHint}>高德地图 · 拖动浏览，双击放大</span>
      </footer>
    </section>
  );
}
