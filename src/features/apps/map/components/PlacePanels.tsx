import { EmptyState } from '@/components/shared/EmptyState';
import type { Place, RoutePlan, RouteRequest, SearchResult } from '../types';
import { createNavigationUrl, formatDistance, formatDuration } from '../utils';
import { MapIcon } from './MapIcon';
import styles from '../styles/Map.module.css';

interface PlaceListProps {
  places: Place[];
  favorites: Place[];
  onSelect: (place: Place) => void;
  onFavorite: (place: Place) => void;
}

// 自绘地点列表，把高德结果转换为一致的地点卡片
export function PlaceList({ places, favorites, onSelect, onFavorite }: PlaceListProps) {
  const favoriteIds = new Set(favorites.map((place) => place.id));
  return (
    <ul className={styles.placeList}>
      {places.map((place, index) => (
        <li key={place.id} className={styles.placeRow}>
          <button type="button" className={styles.placeButton} onClick={() => onSelect(place)}>
            <span className={styles.placeNumber}>{index + 1}</span>
            <span className={styles.placeCopy}>
              <strong>{place.name}</strong>
              <span>{place.address || [place.city, place.district].filter(Boolean).join(' ') || '查看地点详情'}</span>
              <span>
                {place.type.split(';')[0]}
                {place.distance !== undefined ? ` · ${formatDistance(place.distance)}` : ''}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${favoriteIds.has(place.id) ? styles.active : ''}`}
            aria-label={`${favoriteIds.has(place.id) ? '取消收藏' : '收藏'}${place.name}`}
            aria-pressed={favoriteIds.has(place.id)}
            onClick={() => onFavorite(place)}
          >
            <MapIcon name="star" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface SearchResultsProps extends PlaceListProps {
  result: SearchResult;
  busy: boolean;
  onPage: (page: number) => void;
}

// 展示分页搜索结果，空结果保留继续搜索的提示
export function SearchResultsPanel({ result, busy, onPage, ...listProps }: SearchResultsProps) {
  return (
    <>
      <p className={styles.muted}>
        找到 {result.total} 个地点 · 第 {result.page} 页
      </p>
      {result.places.length ? (
        <PlaceList {...listProps} />
      ) : (
        <EmptyState title="没有找到地点" description="试试更具体的名称，或更换城市和搜索范围。" />
      )}
      <div className={styles.row}>
        <button
          className={styles.button}
          type="button"
          disabled={busy || result.page <= 1}
          onClick={() => onPage(result.page - 1)}
        >
          上一页
        </button>
        <button
          className={styles.button}
          type="button"
          disabled={busy || result.page * 10 >= result.total}
          onClick={() => onPage(result.page + 1)}
        >
          下一页
        </button>
      </div>
    </>
  );
}

interface PlaceDetailsProps {
  place: Place;
  saved: boolean;
  onFavorite: (place: Place) => void;
  onRoute: (place: Place) => void;
  onNearby: (place: Place) => void;
  onShare: () => void;
}

// 自绘地点详情和导航入口，所有地点文本均由 React 安全渲染
export function PlaceDetailsPanel({ place, saved, onFavorite, onRoute, onNearby, onShare }: PlaceDetailsProps) {
  return (
    <>
      <p className={styles.badge}>{place.type.split(';')[0] || '地图位置'}</p>
      <h3 className={styles.placeTitle}>{place.name}</h3>
      <p className={styles.description}>{place.address || '该位置暂无详细地址'}</p>
      <dl className={styles.details}>
        <div>
          <dt>所在地区</dt>
          <dd>{[place.city, place.district].filter(Boolean).join(' ') || '—'}</dd>
        </div>
        <div>
          <dt>坐标</dt>
          <dd>{place.location.map((value) => value.toFixed(6)).join(', ')}</dd>
        </div>
        {place.phone ? (
          <div>
            <dt>电话</dt>
            <dd>{place.phone}</dd>
          </div>
        ) : null}
      </dl>
      <div className={styles.row}>
        <button type="button" className={styles.primaryButton} onClick={() => onRoute(place)}>
          <MapIcon name="route" />
          去这里
        </button>
        <button
          type="button"
          className={`${styles.button} ${saved ? styles.active : ''}`}
          aria-pressed={saved}
          onClick={() => onFavorite(place)}
        >
          <MapIcon name="star" />
          {saved ? '已收藏' : '收藏'}
        </button>
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={() => onNearby(place)}>
          搜索此处周边
        </button>
        <button type="button" className={styles.button} onClick={onShare}>
          分享位置
        </button>
      </div>
      <a className={styles.externalLink} href={createNavigationUrl(place)} target="_blank" rel="noopener noreferrer">
        在高德地图中导航 ↗
      </a>
    </>
  );
}

interface RouteResultsProps {
  plans: RoutePlan[];
  request: RouteRequest;
  selected: string;
  onSelect: (plan: RoutePlan) => void;
}

// 自绘路线方案、费用和逐步指引，切换方案同步地图路径
export function RouteResultsPanel({ plans, request, selected, onSelect }: RouteResultsProps) {
  const plan = plans.find((item) => item.id === selected) ?? plans[0];
  if (!plan) return <EmptyState title="没有可用路线" description="请检查起终点和公交城市，或改用其它出行方式。" />;
  return (
    <section className={styles.routeResults} aria-label="路线结果">
      <p className={styles.muted}>
        {request.start.name} → {request.end.name}
      </p>
      <div className={styles.routeOptions}>
        {plans.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`${styles.routeOption} ${item.id === plan.id ? styles.active : ''}`}
            aria-pressed={item.id === plan.id}
            onClick={() => onSelect(item)}
          >
            <strong>{formatDuration(item.duration)}</strong>
            <span>
              {item.name} · {formatDistance(item.distance)}
            </span>
            {item.tolls !== undefined ? <span>过路费约 ¥{item.tolls}</span> : null}
            {item.fare !== undefined ? <span>票价约 ¥{item.fare}</span> : null}
            {item.taxiCost !== undefined ? <span>打车参考 ¥{item.taxiCost}</span> : null}
          </button>
        ))}
      </div>
      {plan.steps.length ? (
        <ol className={styles.steps}>
          {plan.steps.map((step, index) => (
            <li key={index}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <div>
                <p>{step.instruction}</p>
                <span>
                  {formatDistance(step.distance)}
                  {step.road ? ` · ${step.road}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.muted}>地图已显示路线，此方案暂无分步指引。</p>
      )}
    </section>
  );
}
