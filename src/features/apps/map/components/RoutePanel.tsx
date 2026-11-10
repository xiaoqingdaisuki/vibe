/** 地图：路线规划面板组件 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { resolveRoutePlace, sameCoordinate } from '../helpers';
import type { MapController, Place, RoutePlan, RouteRequest, TravelMode } from '../types';
import { errorMessage } from '../utils';
import styles from '../styles/Panels.module.css';
import { PlaceInput } from './PlaceInput';

interface RoutePanelProps {
  active: boolean;
  mapPoint: { endpoint: 'start' | 'end'; place: Place } | null;
  onPick: (endpoint: 'start' | 'end') => void;
  controller: MapController | null;
  currentLocation: Place | null;
  onPlan: (plans: RoutePlan[], request: RouteRequest) => void;
  onClear: () => void;
  onError: (message: string) => void;
}

interface Endpoint {
  text: string;
  place: Place | null;
}

interface Waypoint extends Endpoint {
  key: number;
}

const modes: { value: TravelMode; name: string }[] = [
  { value: 'driving', name: '驾车' },
  { value: 'transit', name: '公交' },
  { value: 'walking', name: '步行' },
  { value: 'riding', name: '骑行' },
];

const policies: Record<TravelMode, { value: number; name: string }[]> = {
  driving: [
    { value: 0, name: '时间最短' },
    { value: 4, name: '考虑路况' },
    { value: 1, name: '费用最少' },
    { value: 2, name: '距离最短' },
  ],
  transit: [
    { value: 0, name: '时间最短' },
    { value: 1, name: '费用最少' },
    { value: 2, name: '换乘最少' },
    { value: 3, name: '步行最少' },
    { value: 4, name: '舒适优先' },
    { value: 5, name: '不乘地铁' },
  ],
  walking: [{ value: 0, name: '推荐路线' }],
  riding: [
    { value: 0, name: '综合推荐' },
    { value: 1, name: '推荐路线' },
    { value: 2, name: '最快路线' },
  ],
};

// 将地点转换为路线端点输入状态
function endpoint(place: Place | null): Endpoint {
  return { text: place?.name ?? '', place };
}

// 自定义路线表单统一完成地点解析、交通方式和途经点规划
export function RoutePanel({
  active,
  mapPoint,
  onPick,
  controller,
  currentLocation,
  onPlan,
  onClear,
  onError,
}: RoutePanelProps): React.ReactNode {
  const [startInput, setStartInput] = useState<Endpoint | null>(null);
  const [end, setEnd] = useState<Endpoint>(() => endpoint(null));
  const [mode, setMode] = useState<TravelMode>('driving');
  const [policy, setPolicy] = useState(4);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [pending, setPending] = useState<'plan' | 'location' | null>(null);
  const [wasActive, setWasActive] = useState(active);
  const [receivedMapPoint, setReceivedMapPoint] = useState(mapPoint);
  const sequence = useRef(0);
  const mapPointRef = useRef(mapPoint);
  const nextWaypoint = useRef(1);
  const start = startInput ?? endpoint(currentLocation);
  const city = start.place?.city.trim() || currentLocation?.city.trim() || '';
  const destinationCity = end.place?.city.trim() || city;
  const disabled = !controller || pending !== null;

  if (wasActive !== active) {
    setWasActive(active);
    setPending(null);
  }

  if (mapPoint !== receivedMapPoint) {
    setReceivedMapPoint(mapPoint);
    if (mapPoint?.endpoint === 'start') {
      setStartInput(endpoint(mapPoint.place));
    } else if (mapPoint) {
      setEnd(endpoint(mapPoint.place));
    }
  }

  // 面板关闭后废弃异步规划和定位回调
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [active],
  );

  // 跟踪外部起终点变化，避免旧规划结果覆盖地图中新选择的地点
  useEffect(() => {
    mapPointRef.current = mapPoint;
  }, [mapPoint]);

  // 按交通方式切换合法策略，保留驾车途经点以便切回
  function selectMode(value: TravelMode): void {
    setMode(value);
    setPolicy(value === 'driving' ? 4 : 0);
  }

  // 用当前位置设置起点，并只在必要时触发定位服务
  async function setCurrentStart(): Promise<void> {
    if (!controller || pending) return;
    if (currentLocation) {
      setStartInput(endpoint(currentLocation));
      return;
    }
    const request = ++sequence.current;
    setPending('location');
    try {
      const result = await controller.locate();
      if (request !== sequence.current) return;
      setStartInput(endpoint(result.place));
    } catch (error) {
      if (request === sequence.current) onError(errorMessage(error));
    } finally {
      if (request === sequence.current) setPending(null);
    }
  }

  // 交换起终点及所在城市，保持跨城公交查询的语义
  function swapEndpoints(): void {
    setStartInput(end);
    setEnd(start);
    setWaypoints((items) => [...items].reverse());
  }

  // 并行解析路线地点，拒绝重合端点后提交规范化规划请求
  async function planRoute(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!controller || pending) return;
    if (!start.text.trim() || !end.text.trim()) {
      onError('请填写起点和终点，或使用当前位置作为起点。');
      return;
    }
    const activeWaypoints = mode === 'driving' ? waypoints.filter((item) => item.text.trim()) : [];
    const requestId = ++sequence.current;
    // 同时校验请求序号与所选端点，丢弃过期结果
    const isCurrentRequest = () => requestId === sequence.current && mapPointRef.current === mapPoint;
    setPending('plan');
    try {
      const [resolvedStart, resolvedEnd, ...resolvedWaypoints] = await Promise.all([
        resolveRoutePlace(controller, start, city),
        resolveRoutePlace(controller, end, destinationCity),
        ...activeWaypoints.map((item) =>
          item.place ? Promise.resolve(item.place) : controller.resolve(item.text.trim(), city.trim()),
        ),
      ]);
      if (!isCurrentRequest()) return;
      if (sameCoordinate(resolvedStart.location, resolvedEnd.location)) {
        throw new Error('起点与终点是同一地点，请选择不同地点。');
      }
      const points = [resolvedStart, ...resolvedWaypoints, resolvedEnd];
      if (points.some((point, index) => index > 0 && sameCoordinate(point.location, points[index - 1].location))) {
        throw new Error('相邻的途经点重复，请修改或移除重复地点。');
      }
      const request: RouteRequest = {
        mode,
        start: resolvedStart,
        end: resolvedEnd,
        city: resolvedStart.city,
        destinationCity: resolvedEnd.city,
        policy,
        waypoints: resolvedWaypoints,
      };
      const plans = await controller.plan(request);
      if (!isCurrentRequest()) return;
      setStartInput(endpoint(resolvedStart));
      setEnd(endpoint(resolvedEnd));
      onPlan(plans, request);
    } catch (error) {
      if (isCurrentRequest()) onError(errorMessage(error));
    } finally {
      if (isCurrentRequest()) setPending(null);
    }
  }

  return (
    <form className={styles.panelContent} onSubmit={planRoute} aria-label="出行路线规划">
      <div className={styles.modeGrid} aria-label="交通方式">
        {modes.map((item) => (
          <button
            key={item.value}
            type="button"
            className={mode === item.value ? styles.selectedButton : styles.button}
            aria-pressed={mode === item.value}
            disabled={disabled}
            onClick={() => selectMode(item.value)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className={styles.routeEndpoints}>
        <div className={styles.endpointFields}>
          <PlaceInput
            controller={controller}
            city={city}
            label="起点"
            value={start.text}
            selected={start.place}
            onChange={(text, place) => setStartInput({ text, place })}
            placeholder="输入起点"
            disabled={disabled}
            required
          />
          <PlaceInput
            controller={controller}
            city={destinationCity}
            label="终点"
            value={end.text}
            selected={end.place}
            onChange={(text, place) => setEnd({ text, place })}
            placeholder="输入终点"
            disabled={disabled}
            required
          />
        </div>
        <button
          type="button"
          className={styles.compactButton}
          disabled={disabled}
          onClick={swapEndpoints}
          aria-label="交换起点和终点"
        >
          ⇅
        </button>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.compactButton}
          disabled={disabled}
          onClick={() => void setCurrentStart()}
        >
          {pending === 'location' ? '正在定位…' : '我的位置'}
        </button>
        <button type="button" className={styles.compactButton} disabled={disabled} onClick={() => onPick('start')}>
          地图选起点
        </button>
        <button type="button" className={styles.compactButton} disabled={disabled} onClick={() => onPick('end')}>
          地图选终点
        </button>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled}>
          {pending === 'plan' ? '正在规划…' : '搜索路线'}
        </button>
        <button type="button" className={styles.button} disabled={disabled} onClick={onClear}>
          清除路线
        </button>
      </div>
      <details className={styles.toolSection}>
        <summary>路线偏好与途经点</summary>
        <div className={styles.sectionBody}>
          <label className={styles.field}>
            <span className={styles.label}>路线偏好</span>
            <select
              className={styles.input}
              value={policy}
              disabled={disabled}
              onChange={(event) => setPolicy(Number(event.target.value))}
            >
              {policies[mode].map((item) => (
                <option key={item.value} value={item.value}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {mode === 'driving' ? (
            <div className={styles.stack}>
              {waypoints.map((item, index) => (
                <div key={item.key} className={styles.waypoint}>
                  <PlaceInput
                    controller={controller}
                    city={city}
                    label={`途经点 ${index + 1}`}
                    value={item.text}
                    selected={item.place}
                    disabled={disabled}
                    onChange={(text, place) =>
                      setWaypoints((items) =>
                        items.map((point) => (point.key === item.key ? { ...point, text, place } : point)),
                      )
                    }
                  />
                  <button
                    className={styles.compactButton}
                    type="button"
                    disabled={disabled}
                    aria-label={`移除途经点 ${index + 1}`}
                    onClick={() => setWaypoints((items) => items.filter((point) => point.key !== item.key))}
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={styles.button}
                disabled={disabled || waypoints.length >= 3}
                onClick={
                  // 分配稳定标识并添加一个空白途经点
                  () => {
                    const key = nextWaypoint.current++;
                    setWaypoints((items) => [...items, { key, text: '', place: null }]);
                  }
                }
              >
                ＋ 添加途经点（最多 3 个）
              </button>
            </div>
          ) : null}
        </div>
      </details>
      <p className={styles.hint}>路线和预计时间由高德提供；公交支持跨城查询，路况可能实时变化。</p>
    </form>
  );
}
