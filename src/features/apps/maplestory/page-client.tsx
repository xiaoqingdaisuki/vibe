'use client';

import { Fragment, useEffect, useState } from 'react';

import { Input } from '@/components/base/Input';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/base/Table';

import { monsterDatabase, monstersWithDrops } from './data';
import { getMaplestoryFilterSearch } from './filter-url';
import { getMonsterTableResult, getVisibleDrops, type MonsterSortKey, type SortDirection } from './table-model';
import type { MapleMonster, MonsterStats } from './types';
import styles from './styles/Maplestory.module.css';

interface Column {
  key: MonsterSortKey | 'name';
  label: string;
  statKey?: keyof MonsterStats;
}

interface SortableColumn extends Column {
  key: MonsterSortKey;
}

interface MaplestoryProps {
  initialFilter?: string;
}

const allColumns: Column[] = [
  { key: 'level', label: '等级', statKey: 'level' },
  { key: 'name', label: '怪物' },
  { key: 'experience', label: '经验', statKey: 'experience' },
  { key: 'meso', label: '金币', statKey: 'meso' },
  { key: 'hp', label: 'HP', statKey: 'hp' },
  { key: 'mp', label: 'MP', statKey: 'mp' },
  { key: 'weaponAttack', label: '物攻', statKey: 'weaponAttack' },
  { key: 'magicAttack', label: '魔攻', statKey: 'magicAttack' },
  { key: 'weaponDefense', label: '物防', statKey: 'weaponDefense' },
  { key: 'magicDefense', label: '魔防', statKey: 'magicDefense' },
  { key: 'accuracy', label: '命中', statKey: 'accuracy' },
  { key: 'avoidability', label: '回避', statKey: 'avoidability' },
];

const columns = allColumns.filter((column) => {
  const statKey = column.statKey;
  return !statKey || monstersWithDrops.some((monster) => monster.stats[statKey] !== null);
});

const dropColumn: Column = { key: 'dropCount', label: '掉落道具' };

const displayColumns = columns.flatMap((column) => (column.key === 'mp' ? [column, dropColumn] : [column]));

const numberFormatter = new Intl.NumberFormat('zh-CN');

// 将可空数值转换为稳定的表格文案
function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

// 将弱点和抗性组合为紧凑的特性摘要
function formatTraits(monster: MapleMonster): string {
  return [...monster.traits.weaknesses, ...monster.traits.resistances].join(' / ') || '—';
}

// 渲染搜索输入框内的装饰性放大镜
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

// 渲染清除筛选用的极简关闭图标
function ClearFilterIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m5 5 14 14" />
      <path d="m19 5-14 14" />
    </svg>
  );
}

// 判断表格列是否支持数值排序
function isSortableColumn(column: Column): column is SortableColumn {
  return column.key !== 'name';
}

// 渲染支持键盘操作的排序列表头
function SortableHead({
  column,
  sortKey,
  sortDirection,
  onSort,
}: {
  column: SortableColumn;
  sortKey: MonsterSortKey;
  sortDirection: SortDirection;
  onSort: (key: MonsterSortKey) => void;
}) {
  const isActive = column.key === sortKey;
  const directionLabel = isActive ? (sortDirection === 'ascending' ? '升序' : '降序') : '未排序';

  return (
    <TableHead scope="col" aria-sort={isActive ? sortDirection : 'none'}>
      <button className={styles.sortButton} type="button" onClick={() => onSort(column.key)}>
        {column.label}
        <span className={styles.sortState} aria-hidden="true">
          {isActive ? (sortDirection === 'ascending' ? '↑' : '↓') : '↕'}
        </span>
        <span className={styles.srOnly}>{`${column.label}，${directionLabel}`}</span>
      </button>
    </TableHead>
  );
}

// 渲染一行怪物属性与掉落摘要
function MonsterRow({ monster, query }: { monster: MapleMonster; query: string }) {
  const visibleDrops = getVisibleDrops(monster, query);
  const dropNames = visibleDrops.map((drop) => drop.name).join('、');
  const traits = formatTraits(monster);

  return (
    <TableRow>
      <TableCell className={styles.imageCell}>
        {monster.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 直连外部图源，避免 Next 开发期尺寸警告
          <img
            className={styles.monsterImage}
            src={monster.imageUrl}
            alt={`${monster.name} 图片`}
            width={40}
            height={40}
            loading="lazy"
          />
        ) : (
          '—'
        )}
      </TableCell>
      {displayColumns.map((column) => {
        if (column.key === 'dropCount') {
          return (
            <Fragment key={column.key}>
              <TableCell className={styles.drops} title={dropNames || '暂无掉落数据'}>
                {visibleDrops.length ? `${visibleDrops.length} 件 · ${dropNames}` : '暂无掉落'}
              </TableCell>
              <TableCell className={styles.traits} title={traits}>
                {traits}
              </TableCell>
            </Fragment>
          );
        }

        if (column.key === 'name') {
          return (
            <TableCell key={column.key}>
              <a className={styles.monsterName} href={monster.sourceUrl} target="_blank" rel="noreferrer">
                <span>{monster.name}</span>
              </a>
            </TableCell>
          );
        }

        return column.statKey ? (
          <TableCell key={column.key}>{formatNumber(monster.stats[column.statKey])}</TableCell>
        ) : null;
      })}
    </TableRow>
  );
}

// 渲染怪物数据库的筛选、排序和完整滚动表格
export function Maplestory({ initialFilter = '' }: MaplestoryProps) {
  const [query, setQuery] = useState(initialFilter);
  const [filterQuery, setFilterQuery] = useState(initialFilter);
  const [sortKey, setSortKey] = useState<MonsterSortKey>('level');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const result = getMonsterTableResult(monstersWithDrops, { query: filterQuery, sortKey, sortDirection });

  // 输入停止 300ms 后再提交筛选，避免连续按键触发全表重排
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFilterQuery(query), 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  // 将输入内容同步到地址栏，便于直接分享当前筛选页
  useEffect(() => {
    const nextSearch = getMaplestoryFilterSearch(window.location.search, query);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextPath = `${window.location.pathname}${nextSearch}${window.location.hash}`;

    if (nextPath !== currentPath) {
      window.history.replaceState(null, '', nextPath);
    }
  }, [query]);

  // 切换同一字段时翻转顺序，切换字段时从升序开始
  function handleSort(nextSortKey: MonsterSortKey) {
    setSortDirection((currentDirection) =>
      nextSortKey === sortKey && currentDirection === 'ascending' ? 'descending' : 'ascending',
    );
    setSortKey(nextSortKey);
  }

  // 更新前端筛选关键词
  function handleSearch(value: string) {
    setQuery(value);
  }

  // 清空筛选并恢复默认等级升序
  function handleClearSearch() {
    setQuery('');
    setFilterQuery('');
    setSortKey('level');
    setSortDirection('ascending');
  }

  return (
    <section className={styles.database} aria-labelledby="maplestory-title">
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">Monster archive</p>
          <h1 id="maplestory-title" className={styles.title}>
            冒险岛怀旧服怪物资料
          </h1>
          <p className={styles.description}>按怪物等级、属性、掉落道具快速定位国服怀旧服的怪物资料。</p>
        </div>
        <dl className={styles.sourceStamp}>
          <div>
            <dt>版本</dt>
            <dd>{monsterDatabase.source.version}</dd>
          </div>
          <div>
            <dt>数据</dt>
            <dd>共 {monstersWithDrops.length} 条</dd>
          </div>
        </dl>
      </header>

      <div className={styles.toolbar}>
        <Input
          wrapperClassName={styles.searchInput}
          label="筛选怪物"
          description="支持名称和掉落道具的模糊搜索。"
          name="monster-search"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="例如：蜗牛、装备、药水…"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          startAdornment={<SearchIcon />}
          endAdornment={
            query ? (
              <button
                className={styles.clearButton}
                type="button"
                aria-label="清除筛选"
                title="清除筛选"
                onClick={handleClearSearch}
              >
                <ClearFilterIcon />
              </button>
            ) : null
          }
        />
        <p className={styles.resultSummary} aria-live="polite">
          找到 {result.filteredMonsters.length} 条记录
        </p>
      </div>

      <Table wrapperClassName={styles.tableViewport}>
        <TableCaption>滚动浏览完整数据；点击数值列标题可排序，移动端可横向滑动。</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">图片</TableHead>
            {displayColumns.map((column) => (
              <Fragment key={column.key}>
                {isSortableColumn(column) ? (
                  <SortableHead column={column} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                ) : (
                  <TableHead scope="col">{column.label}</TableHead>
                )}
                {column.key === 'dropCount' ? <TableHead scope="col">特性</TableHead> : null}
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.sortedMonsters.length > 0 ? (
            result.sortedMonsters.map((monster) => (
              <MonsterRow key={monster.id} monster={monster} query={filterQuery} />
            ))
          ) : (
            <TableRow>
              <TableCell className={styles.emptyCell} colSpan={displayColumns.length + 2}>
                没有匹配的怪物；请尝试其他关键词。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

export default Maplestory;
