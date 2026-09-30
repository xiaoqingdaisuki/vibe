'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { EmptyState } from '@/components/shared/EmptyState';

import { parseCoordinate } from '../helpers';
import type { BusLine, Coordinate, DistrictResult, DrawingTool, MapController, Place, WeatherResult } from '../types';
import { errorMessage } from '../utils';
import styles from '../styles/Panels.module.css';

interface ToolsPanelProps {
  controller: MapController | null;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

type CoordinateSource = 'gcj02' | 'gps' | 'baidu' | 'mapbar';

const coordinateSources: { value: CoordinateSource; label: string }[] = [
  { value: 'gcj02', label: '高德 GCJ-02' },
  { value: 'gps', label: 'GPS / WGS-84' },
  { value: 'baidu', label: '百度坐标' },
  { value: 'mapbar', label: '图吧坐标' },
];

const drawingTools: { value: DrawingTool; label: string; hint: string }[] = [
  { value: 'distance', label: '测量距离', hint: '点击地图添加量算点，双击结束。' },
  { value: 'area', label: '测量面积', hint: '点击地图勾勒区域，双击结束。' },
  { value: 'marker', label: '标记地点', hint: '点击地图放置标记。' },
  { value: 'polyline', label: '绘制折线', hint: '点击地图添加节点，双击结束。' },
  { value: 'polygon', label: '绘制多边形', hint: '点击地图添加顶点，双击闭合。' },
  { value: 'rectangle', label: '绘制矩形', hint: '在地图上按住并拖动，松开完成。' },
  { value: 'circle', label: '绘制圆形', hint: '在地图上按住圆心并拖动，松开完成。' },
];

// 用递增标识防止关闭面板后异步结果继续影响地图和提示
function useRequestSequence(): { next: () => number; isCurrent: (request: number) => boolean } {
  const sequence = useRef(0);
  // 卸载时废弃尚未完成的服务请求
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  return { next: () => ++sequence.current, isCurrent: (request) => request === sequence.current };
}

// 自定义呈现城市实时天气和未来四天预报
function WeatherSection({ controller, onError }: ToolsPanelProps): React.ReactNode {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRequestSequence();

  // 查询城市天气，只接收最近一次有效请求的结果
  async function loadWeather(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!controller || pending || !city.trim()) return;
    const request = sequence.next();
    setPending(true);
    try {
      const result = await controller.weather(city.trim());
      if (sequence.isCurrent(request)) setWeather(result);
    } catch (error) {
      if (sequence.isCurrent(request)) onError(errorMessage(error));
    } finally {
      if (sequence.isCurrent(request)) setPending(false);
    }
  }

  return (
    <details className={styles.toolSection} open>
      <summary>城市天气</summary>
      <div className={styles.sectionBody}>
        <form className={styles.inlineForm} onSubmit={loadWeather}>
          <label className={styles.field}>
            <span className={styles.label}>城市名称或行政区编码</span>
            <input
              className={styles.input}
              placeholder="例如：杭州 / 330100"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              required
              disabled={!controller || pending}
            />
          </label>
          <button className={styles.button} type="submit" disabled={!controller || pending}>
            {pending ? '查询中…' : '查天气'}
          </button>
        </form>
        {weather ? (
          <div className={styles.stack} aria-live="polite">
            <div className={styles.resultCard}>
              <div className={styles.rowBetween}>
                <strong className={styles.resultTitle}>{weather.city}</strong>
                <strong className={styles.temperature}>{weather.temperature}°C</strong>
              </div>
              <p className={styles.text}>
                {weather.weather} · {weather.wind} · 湿度 {weather.humidity}%
              </p>
              <p className={styles.hint}>发布于 {weather.reportTime}</p>
            </div>
            {weather.forecast.length > 0 ? (
              <ul className={styles.forecast} aria-label="天气预报">
                {weather.forecast.map((day) => (
                  <li key={day.date}>
                    <span>{day.date.slice(5)}</span>
                    <span>
                      {day.dayWeather} / {day.nightWeather}
                    </span>
                    <strong>
                      {day.low}° / {day.high}°
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="暂无天气预报" description="已展示可用的实时天气。" />
            )}
          </div>
        ) : (
          <p className={styles.hint}>查看出发地或目的地天气，辅助安排出行。</p>
        )}
      </div>
    </details>
  );
}

// 查询并下钻行政区，在地图上绘制高德返回的行政区边界
function DistrictSection({ controller, onError, onNotice }: ToolsPanelProps): React.ReactNode {
  const [keyword, setKeyword] = useState('');
  const [district, setDistrict] = useState<DistrictResult | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRequestSequence();

  // 查询指定区划并让地图适配行政边界
  async function loadDistrict(value: string): Promise<void> {
    if (!controller || pending || !value.trim()) return;
    const request = sequence.next();
    setPending(true);
    try {
      const result = await controller.district(value.trim());
      if (!sequence.isCurrent(request)) return;
      setDistrict(result);
      setKeyword(result.name);
      onNotice(`已显示${result.name}行政区边界。`);
    } catch (error) {
      if (sequence.isCurrent(request)) onError(errorMessage(error));
    } finally {
      if (sequence.isCurrent(request)) setPending(false);
    }
  }

  return (
    <details className={styles.toolSection}>
      <summary>城市与行政区</summary>
      <div className={styles.sectionBody}>
        <form
          className={styles.inlineForm}
          onSubmit={(event) => {
            event.preventDefault();
            void loadDistrict(keyword);
          }}
        >
          <label className={styles.field}>
            <span className={styles.label}>行政区名称或编码</span>
            <input
              className={styles.input}
              placeholder="例如：浙江省 / 西湖区"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              required
              disabled={!controller || pending}
            />
          </label>
          <button className={styles.button} type="submit" disabled={!controller || pending}>
            {pending ? '查询中…' : '查询'}
          </button>
        </form>
        {district ? (
          <div className={styles.stack} aria-live="polite">
            <div className={styles.rowBetween}>
              <div>
                <strong>{district.name}</strong>
                <p className={styles.hint}>行政区编码 {district.adcode}</p>
              </div>
              <button
                className={styles.compactButton}
                type="button"
                disabled={!controller || pending}
                onClick={() =>
                  controller?.setView({
                    center: district.center,
                    zoom: district.level === 'province' ? 7 : district.level === 'city' ? 11 : 13,
                  })
                }
              >
                移至中心
              </button>
            </div>
            {district.children.length > 0 ? (
              <div className={styles.chipGrid} aria-label={`${district.name}下级行政区`}>
                {district.children.map((child) => (
                  <button
                    key={child.adcode || child.name}
                    className={styles.button}
                    type="button"
                    disabled={pending}
                    onClick={() => void loadDistrict(child.adcode || child.name)}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无下级行政区" description="可以输入其他行政区继续查询。" />
            )}
          </div>
        ) : (
          <p className={styles.hint}>搜索城市、省份或区县，查看边界并逐级浏览。</p>
        )}
      </div>
    </details>
  );
}

// 自定义公交线路结果与站点列表，使用地图绘制线路
function BusSection({ controller, onError, onNotice }: ToolsPanelProps): React.ReactNode {
  const [city, setCity] = useState('');
  const [keyword, setKeyword] = useState('');
  const [lines, setLines] = useState<BusLine[] | null>(null);
  const [selectedLine, setSelectedLine] = useState('');
  const [pending, setPending] = useState(false);
  const sequence = useRequestSequence();

  // 按城市和线路名称查找公交，不把服务原始对象传给界面
  async function loadLines(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!controller || pending || !city.trim() || !keyword.trim()) return;
    const request = sequence.next();
    setPending(true);
    try {
      const result = await controller.bus(keyword.trim(), city.trim());
      if (!sequence.isCurrent(request)) return;
      setLines(result);
      setSelectedLine('');
    } catch (error) {
      if (sequence.isCurrent(request)) onError(errorMessage(error));
    } finally {
      if (sequence.isCurrent(request)) setPending(false);
    }
  }

  // 将选中的公交线路和各站点绘制到地图
  function showLine(line: BusLine): void {
    if (!controller) return;
    controller.showBus(line);
    setSelectedLine(line.id);
    onNotice(`已在地图显示${line.name}，共 ${line.stops.length} 站。`);
  }

  return (
    <details className={styles.toolSection}>
      <summary>公交线路与站点</summary>
      <div className={styles.sectionBody}>
        <form className={styles.stack} onSubmit={loadLines}>
          <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span className={styles.label}>所在城市</span>
              <input
                className={styles.input}
                placeholder="例如：杭州"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                required
                disabled={!controller || pending}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>线路名称</span>
              <input
                className={styles.input}
                placeholder="例如：1 路 / 地铁 1 号线"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                required
                disabled={!controller || pending}
              />
            </label>
          </div>
          <button className={styles.button} type="submit" disabled={!controller || pending}>
            {pending ? '查询中…' : '搜索公交线路'}
          </button>
        </form>
        {lines ? (
          lines.length > 0 ? (
            <ul className={styles.results} aria-label="公交线路查询结果">
              {lines.map((line) => (
                <li key={line.id} className={styles.resultCard}>
                  <button
                    type="button"
                    className={selectedLine === line.id ? styles.selectedResultButton : styles.resultButton}
                    disabled={!controller}
                    onClick={() => showLine(line)}
                  >
                    <strong>{line.name}</strong>
                    <span>
                      {line.start} → {line.end}
                    </span>
                    <span>
                      {line.first ? `首班 ${line.first}` : '首班时间暂无'} ·{' '}
                      {line.last ? `末班 ${line.last}` : '末班时间暂无'}
                      {line.price !== undefined ? ` · ${line.price} 元` : ''}
                    </span>
                    <span>
                      {selectedLine === line.id ? '正在地图显示' : '在地图查看线路'} · {line.stops.length} 站
                    </span>
                  </button>
                  <details className={styles.stops}>
                    <summary>查看站点</summary>
                    {line.stops.length > 0 ? (
                      <ol>
                        {line.stops.map((stop, index) => (
                          <li key={`${stop.name}-${index}`}>
                            {stop.location ? (
                              <button
                                type="button"
                                className={styles.stopButton}
                                onClick={() => {
                                  if (stop.location) controller?.setView({ center: stop.location, zoom: 16 });
                                }}
                              >
                                {stop.name}
                              </button>
                            ) : (
                              <span>{stop.name}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState title="暂无站点信息" />
                    )}
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="未找到公交线路" description="请检查城市与线路名称后重试。" />
          )
        ) : (
          <p className={styles.hint}>公交及地铁线路按城市查询，点击结果显示完整线路。</p>
        )}
      </div>
    </details>
  );
}

// 统一处理坐标跳转、逆地理编码和第三方坐标转换
function CoordinateSection({ controller, onError, onNotice }: ToolsPanelProps): React.ReactNode {
  const [input, setInput] = useState('');
  const [source, setSource] = useState<CoordinateSource>('gcj02');
  const [result, setResult] = useState<{ coordinate: Coordinate; place: Place | null } | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRequestSequence();

  // 校验输入坐标并在需要时转换到高德坐标系
  async function queryCoordinate(action: 'jump' | 'reverse'): Promise<void> {
    if (!controller || pending) return;
    const original = parseCoordinate(input);
    if (!original) {
      onError('请输入有效经纬度，例如 116.397,39.908；经度范围 ±180，纬度范围 ±90。');
      return;
    }
    const request = sequence.next();
    setPending(true);
    try {
      const coordinate = source === 'gcj02' ? original : await controller.convert(original, source);
      if (!sequence.isCurrent(request)) return;
      if (action === 'jump') {
        controller.setView({ center: coordinate, zoom: 16 });
        setResult({ coordinate, place: null });
        onNotice(source === 'gcj02' ? '已移动到输入坐标。' : '已转换为高德坐标并移动地图。');
      } else {
        const place = await controller.reverse(coordinate);
        if (!sequence.isCurrent(request)) return;
        controller.focus(place);
        setResult({ coordinate, place });
        onNotice('已在地图显示坐标对应的地点。');
      }
    } catch (error) {
      if (sequence.isCurrent(request)) onError(errorMessage(error));
    } finally {
      if (sequence.isCurrent(request)) setPending(false);
    }
  }

  return (
    <details className={styles.toolSection}>
      <summary>坐标与地址</summary>
      <div className={styles.sectionBody}>
        <label className={styles.field}>
          <span className={styles.label}>原始坐标系</span>
          <select
            className={styles.input}
            value={source}
            disabled={!controller || pending}
            onChange={(event) => {
              const selected = coordinateSources.find((item) => item.value === event.target.value);
              if (selected) setSource(selected.value);
            }}
          >
            {coordinateSources.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>经度，纬度</span>
          <input
            className={styles.input}
            placeholder="116.397,39.908"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={!controller || pending}
            inputMode="text"
          />
        </label>
        <div className={styles.actions}>
          <button
            className={styles.button}
            type="button"
            disabled={!controller || pending}
            onClick={() => void queryCoordinate('jump')}
          >
            {pending ? '处理中…' : '前往坐标'}
          </button>
          <button
            className={styles.button}
            type="button"
            disabled={!controller || pending}
            onClick={() => void queryCoordinate('reverse')}
          >
            查询地址
          </button>
        </div>
        {result ? (
          <div className={styles.resultCard} aria-live="polite">
            <p className={styles.text}>高德坐标 {result.coordinate.map((value) => value.toFixed(6)).join(', ')}</p>
            {result.place ? (
              <>
                <strong>{result.place.name}</strong>
                <p className={styles.hint}>{result.place.address || `${result.place.city}${result.place.district}`}</p>
              </>
            ) : null}
          </div>
        ) : null}
        <p className={styles.hint}>高德使用 GCJ-02 坐标；外部坐标会先转换，避免位置偏移。</p>
      </div>
    </details>
  );
}

// 自定义量算与绘图入口，让所有工具在同一张地图中操作
function DrawingSection({ controller, onError, onNotice }: ToolsPanelProps): React.ReactNode {
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRequestSequence();
  const active = drawingTools.find((item) => item.value === activeTool);

  // 激活地图工具并提示对应的操作方式
  async function startDrawing(tool: DrawingTool): Promise<void> {
    if (!controller || pending) return;
    const request = sequence.next();
    setPending(true);
    try {
      await controller.draw(tool);
      if (!sequence.isCurrent(request)) return;
      setActiveTool(tool);
      const label = drawingTools.find((item) => item.value === tool);
      onNotice(`${label?.label ?? '绘图'}已开启，${label?.hint ?? '请在地图上操作。'}`);
    } catch (error) {
      if (sequence.isCurrent(request)) onError(errorMessage(error));
    } finally {
      if (sequence.isCurrent(request)) setPending(false);
    }
  }

  // 停止当前绘图交互，保留已完成的图形
  function stopDrawing(): void {
    controller?.stopDrawing();
    setActiveTool(null);
    onNotice('已停止绘图，完成的图形已保留。');
  }

  // 清除量算结果和绘图对象，恢复普通地图交互
  function clearDrawings(): void {
    controller?.clearDrawings();
    setActiveTool(null);
    onNotice('已清除量算和绘图。');
  }

  return (
    <details className={styles.toolSection}>
      <summary>量算与绘图</summary>
      <div className={styles.sectionBody}>
        <div className={styles.chipGrid} aria-label="地图绘图工具">
          {drawingTools.map((tool) => (
            <button
              key={tool.value}
              className={activeTool === tool.value ? styles.selectedButton : styles.button}
              type="button"
              disabled={!controller || pending}
              aria-pressed={activeTool === tool.value}
              onClick={() => void startDrawing(tool.value)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          {active
            ? `${active.label}：${active.hint}触屏可按提示点击或拖动。`
            : '选择工具后直接在地图操作，结果会显示在地图提示中。'}
        </p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" disabled={!controller || pending} onClick={stopDrawing}>
            停止工具
          </button>
          <button className={styles.button} type="button" disabled={!controller || pending} onClick={clearDrawings}>
            清除图形
          </button>
        </div>
      </div>
    </details>
  );
}

// 将地图扩展服务聚合为可按需展开的自定义工具面板
export function ToolsPanel(props: ToolsPanelProps): React.ReactNode {
  return (
    <div className={styles.toolsPanel}>
      <p className={styles.hint}>城市信息、交通线路与地图工具，结果直接显示在当前地图。</p>
      <WeatherSection {...props} />
      <DistrictSection {...props} />
      <BusSection {...props} />
      <CoordinateSection {...props} />
      <DrawingSection {...props} />
    </div>
  );
}
