'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { sameCoordinate } from '../helpers';
import type { MapController, Place, RoutePlan, RouteRequest, TravelMode } from '../types';
import { errorMessage } from '../utils';
import styles from '../styles/Panels.module.css';
import { PlaceInput } from './PlaceInput';

interface RoutePanelProps {
  controller: MapController | null;
  currentLocation: Place | null;
  destination: Place | null;
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

function endpoint(place: Place | null): Endpoint {
  return { text: place?.name ?? '', place };
}

// 自定义路线表单统一完成地点解析、交通方式和途经点规划
export function RoutePanel({
  controller,
  currentLocation,
  destination,
  onPlan,
  onClear,
  onError,
}: RoutePanelProps): React.ReactNode {
  const [startInput, setStartInput] = useState<Endpoint | null>(null);
  const [end, setEnd] = useState<Endpoint>(() => endpoint(destination));
  const [receivedDestination, setReceivedDestination] = useState(destination);
  const [mode, setMode] = useState<TravelMode>('driving');
  const [policy, setPolicy] = useState(4);
  const [cityInput, setCityInput] = useState<string | null>(null);
  const [destinationCityInput, setDestinationCityInput] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [pending, setPending] = useState<'plan' | 'location' | null>(null);
  const sequence = useRef(0);
  const destinationRef = useRef(destination);
  const nextWaypoint = useRef(1);
  const start = startInput ?? endpoint(currentLocation);
  const city = cityInput ?? start.place?.city ?? currentLocation?.city ?? '';
  const destinationCity = destinationCityInput ?? end.place?.city ?? city;
  const disabled = !controller || pending !== null;

  if (destination !== receivedDestination) {
    setReceivedDestination(destination);
    setPending(null);
    if (destination) {
      setEnd(endpoint(destination));
      setDestinationCityInput(null);
    }
  }

  // 面板关闭后废弃异步规划和定位回调
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  // 跟踪外部终点变化，避免旧规划结果覆盖地图中新选择的地点
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

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
      setCityInput(null);
      return;
    }
    const request = ++sequence.current;
    setPending('location');
    try {
      const result = await controller.locate();
      if (request !== sequence.current) return;
      setStartInput(endpoint(result.place));
      setCityInput(null);
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
    setCityInput(destinationCity);
    setDestinationCityInput(city);
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
    if (mode === 'transit' && (!city.trim() || !destinationCity.trim())) {
      onError('公交规划需要起点城市和终点城市，请先填写两个城市。');
      return;
    }
    const activeWaypoints = mode === 'driving' ? waypoints.filter((item) => item.text.trim()) : [];
    const requestId = ++sequence.current;
    const isCurrentRequest = () => requestId === sequence.current && destinationRef.current === destination;
    setPending('plan');
    try {
      const [resolvedStart, resolvedEnd, ...resolvedWaypoints] = await Promise.all([
        start.place ? Promise.resolve(start.place) : controller.resolve(start.text.trim(), city.trim()),
        end.place ? Promise.resolve(end.place) : controller.resolve(end.text.trim(), destinationCity.trim()),
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
        city: city.trim() || resolvedStart.city,
        destinationCity: destinationCity.trim() || resolvedEnd.city || city.trim(),
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
      <div className={styles.rowBetween}>
        <p className={styles.hint}>输入地名，或从地图地点详情设为终点。</p>
        <button
          type="button"
          className={styles.compactButton}
          disabled={disabled}
          onClick={swapEndpoints}
          aria-label="交换起点和终点"
        >
          ⇅ 交换
        </button>
      </div>
      <PlaceInput
        controller={controller}
        city={city}
        label="起点"
        value={start.text}
        selected={start.place}
        onChange={(text, place) => setStartInput({ text, place })}
        placeholder="我的位置或出发地"
        disabled={disabled}
        required
      />
      <button type="button" className={styles.textButton} disabled={disabled} onClick={() => void setCurrentStart()}>
        {pending === 'location' ? '正在定位…' : '使用我的位置'}
      </button>
      <PlaceInput
        controller={controller}
        city={destinationCity}
        label="终点"
        value={end.text}
        selected={end.place}
        onChange={(text, place) => setEnd({ text, place })}
        placeholder="想去哪里"
        disabled={disabled}
        required
      />
      <div className={styles.twoColumns}>
        <label className={styles.field}>
          <span className={styles.label}>起点城市{mode === 'transit' ? '（必填）' : ''}</span>
          <input
            className={styles.input}
            value={city}
            placeholder="城市或区号"
            disabled={disabled}
            required={mode === 'transit'}
            onChange={(event) => setCityInput(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>终点城市{mode === 'transit' ? '（必填）' : ''}</span>
          <input
            className={styles.input}
            value={destinationCity}
            placeholder="可填写其他城市"
            disabled={disabled}
            required={mode === 'transit'}
            onChange={(event) => setDestinationCityInput(event.target.value)}
          />
        </label>
      </div>
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
            onClick={() => {
              const key = nextWaypoint.current++;
              setWaypoints((items) => [...items, { key, text: '', place: null }]);
            }}
          >
            ＋ 添加途经点（最多 3 个）
          </button>
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled}>
          {pending === 'plan' ? '正在规划…' : '规划路线'}
        </button>
        <button type="button" className={styles.button} disabled={disabled} onClick={onClear}>
          清除路线
        </button>
      </div>
      <p className={styles.hint}>路线和预计时间由高德提供；公交支持跨城查询，路况可能实时变化。</p>
    </form>
  );
}
