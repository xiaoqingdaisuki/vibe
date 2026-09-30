'use client';

import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import type { Coordinate, LocationResult, MapController, MapView, Place } from './types';
import { errorMessage, parseSharedView } from './utils';

// 在组件加载处填写高德 Web 端 JS API Key 和配套安全密钥
const AMAP_CONFIG = { key: '2ff3d8e01eda069b5d5ebaaadcfe49c6', securityJsCode: '3117306c259aae4b9263b661e74f4196' };

type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RuntimeOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  retry: number;
  onPick: (coordinate: Coordinate) => void;
  onPlace: (place: Place) => void;
  onMove: (view: MapView) => void;
  onToolResult: (message: string) => void;
  onLocation: (result: LocationResult, controller: MapController) => void;
  onNotice: (message: string) => void;
  getPadding: () => [number, number, number, number];
}

// 把配置、SDK 生命周期与自动定位集中在地图运行模块
export function useMapRuntime({ containerRef, retry, ...events }: RuntimeOptions) {
  const [controller, setController] = useState<MapController | null>(null);
  const [status, setStatus] = useState<RuntimeStatus>('idle');
  const [failure, setFailure] = useState('');
  // 使用最新操作回调，避免界面状态变化导致地图反复创建
  const onPick = useEffectEvent((coordinate: Coordinate) => events.onPick(coordinate));
  // 把标记选择事件交给自绘详情界面
  const onPlace = useEffectEvent((place: Place) => events.onPlace(place));
  // 同步视图和自绘比例尺
  const onMove = useEffectEvent((view: MapView) => events.onMove(view));
  // 显示地图绘制和测量结果
  const onToolResult = useEffectEvent((message: string) => events.onToolResult(message));
  // 向主界面报告初始定位
  const onLocation = useEffectEvent((result: LocationResult, active: MapController) =>
    events.onLocation(result, active),
  );
  // 在地图内报告初始化后的非致命错误
  const onNotice = useEffectEvent((message: string) => events.onNotice(message));
  // 根据当前自绘浮层给地图覆盖物计算真实可见区域
  const getPadding = useEffectEvent(() => events.getPadding());

  // 配置和 SDK 异步加载，离开页面或重试时销毁地图与监听
  useEffect(() => {
    let cancelled = false;
    let active: MapController | null = null;

    // 配置就绪后创建地图，分享视图优先于自动定位
    async function initialize(): Promise<void> {
      setFailure('');
      setController(null);
      if (!AMAP_CONFIG.key.trim() || !AMAP_CONFIG.securityJsCode.trim()) {
        setStatus('idle');
        return;
      }
      setStatus('loading');
      try {
        const sharedView = parseSharedView(window.location.search);
        const initialView: MapView = sharedView ?? { center: [116.397428, 39.90923], zoom: 13 };
        const { createMapController } = await import('./amap');
        if (cancelled || !containerRef.current) return;
        active = await createMapController({
          container: containerRef.current,
          key: AMAP_CONFIG.key,
          securityJsCode: AMAP_CONFIG.securityJsCode,
          initialView,
          onPick,
          onPlace,
          onMove,
          onToolResult,
          getPadding,
        });
        if (cancelled) {
          active.destroy();
          return;
        }
        setController(active);
        setStatus('ready');
        onMove(initialView);
        if (sharedView) {
          onNotice('已打开分享位置，点击地图查看地点详情。');
          return;
        }
        try {
          const result = await active.locate();
          if (cancelled) return;
          onLocation(result, active);
        } catch (error) {
          if (!cancelled) onNotice(`${errorMessage(error)} 已显示默认地图，可继续搜索或手动定位。`);
        }
      } catch (error) {
        if (cancelled) return;
        active?.destroy();
        setFailure(errorMessage(error));
        setStatus('error');
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      active?.destroy();
    };
  }, [containerRef, retry]);

  return { controller, status, failure };
}
