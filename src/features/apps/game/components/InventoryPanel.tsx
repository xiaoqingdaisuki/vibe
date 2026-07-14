'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Character, GameInteraction, Item, ItemRarity } from '../types';
import { RARITY_ORDER, RARITY_LABELS, CLASSES, resolveStatsForClass, SHOP_ITEMS } from '../static-data';
import { RarityBadge } from './RarityBadge';
import styles from './InventoryPanel.module.css';

const TYPE_LABELS: Record<string, string> = {
  equipment: '装备',
  chest: '宝箱',
  skill_book: '技能书',
};

const TYPE_ORDER = ['equipment', 'chest', 'skill_book'];

const CLASS_NAME_MAP: Record<string, string> = {};
for (const c of CLASSES) {
  CLASS_NAME_MAP[c.id] = c.name;
}

const RARITY_INDEX: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  transcendent: 6,
};

const RARITY_CLASS_NAMES: Record<ItemRarity, string> = {
  common: styles.rarityCommon,
  uncommon: styles.rarityUncommon,
  rare: styles.rarityRare,
  epic: styles.rarityEpic,
  legendary: styles.rarityLegendary,
  mythic: styles.rarityMythic,
  transcendent: styles.rarityTranscendent,
};

interface InventoryPanelProps {
  character: Character;
  onAction: (action: GameInteraction | { type: 'clearLogs' }) => void;
}

function getItemStatsPreview(item: Item, charClass: Character['class']): string {
  if (!item.stats) return '';
  const resolved = resolveStatsForClass(item.stats, charClass);
  if (!resolved) return '';
  const parts: string[] = [];
  const statLabels: Record<string, string> = { str: 'STR', dex: 'DEX', int: 'INT', vit: 'VIT', luk: 'LUK' };
  for (const [key, val] of Object.entries(resolved)) {
    if ((val as number) > 0) {
      parts.push(`${statLabels[key] || key}+${val}`);
    }
  }
  return parts.join('  ');
}

function getEquipComparison(item: Item, character: Character): string | null {
  if (!item.slot || !item.stats) return null;
  const current = character.equipment[item.slot];
  if (!current || !current.stats) return null;

  const newStats = resolveStatsForClass(item.stats, character.class);
  const oldStats = resolveStatsForClass(current.stats, character.class);
  if (!newStats || !oldStats) return null;

  const mainStatKey = character.class === 'warrior' ? 'str' : character.class === 'mage' ? 'int' : 'dex';
  const newMain = newStats[mainStatKey] || 0;
  const oldMain = oldStats[mainStatKey] || 0;
  const diff = newMain - oldMain;

  if (diff > 0) return `↑ 推荐替换（+${diff} ${mainStatKey.toUpperCase()}）`;
  if (diff < 0) return `↓ 低于当前装备（${diff} ${mainStatKey.toUpperCase()}）`;
  return null;
}

function getSellPrice(item: Item): number {
  const rarity = item.rarity;
  if (rarity === 'common') return 10;
  if (rarity === 'uncommon') return 100;
  if (rarity === 'rare') return 200;
  const rarityToChest: Record<string, string> = {
    epic: 'epic_chest',
    legendary: 'legendary_chest',
    mythic: 'mythic_chest',
    transcendent: 'mythic_chest',
  };
  const chestId = rarityToChest[rarity];
  const chestItem = SHOP_ITEMS.find((s) => s.itemId === chestId);
  return Math.floor((chestItem?.price || 1_000_000) / 10);
}

type TypeFilter = Set<string>;
type RarityFilter = Set<ItemRarity>;
type SortKey = 'rarity' | 'level' | 'name' | 'time';

export function InventoryPanel({ character, onAction }: InventoryPanelProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(new Set());
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('rarity');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!detailItem) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => detailCloseButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailItem(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [detailItem]);

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleRarityFilter = useCallback((rarity: ItemRarity) => {
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (itemName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onAction({ type: 'toggleFavorite', itemName });
    },
    [onAction],
  );

  // Generic one-click sell for a specific item type
  const handleOneClickSellForType = useCallback(
    (itemType: string) => {
      const namesToSell: string[] = [];

      for (const item of character.inventory) {
        if (item.type !== itemType) continue;
        if (!rarityFilter.has(item.rarity)) continue;
        if (character.favorites.includes(item.name)) continue;
        if (!namesToSell.includes(item.name)) {
          namesToSell.push(item.name);
        }
      }

      if (namesToSell.length === 0) {
        return;
      }

      onAction({ type: 'bulkSell', itemNames: namesToSell });
    },
    [rarityFilter, character.inventory, character.favorites, onAction],
  );

  const handleSort = useCallback(() => {
    onAction({ type: 'sort' });
  }, [onAction]);

  // Group items
  const grouped = useMemo(() => {
    const groups = new Map<string, Item[]>();

    for (const item of character.inventory) {
      if (typeFilter.size > 0 && !typeFilter.has(item.type)) continue;
      if (rarityFilter.size > 0 && !rarityFilter.has(item.rarity)) continue;

      const key = item.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    for (const items of groups.values()) {
      items.sort((a, b) => {
        if (sortBy === 'rarity') {
          const rDiff = RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity];
          if (rDiff !== 0) return rDiff;
        }
        if (sortBy === 'level') {
          const lDiff = (b.minLevel || 0) - (a.minLevel || 0);
          if (lDiff !== 0) return lDiff;
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
    }

    const sortedGroups = new Map<string, Item[]>();
    const groupOrder = TYPE_ORDER.filter((t) => groups.has(t));
    for (const type of groupOrder) {
      sortedGroups.set(type, groups.get(type)!);
    }

    return sortedGroups;
  }, [character.inventory, typeFilter, rarityFilter, sortBy]);

  const aggregated = useMemo(() => {
    const result = new Map<string, { item: Item; count: number }[]>();
    for (const [type, items] of grouped) {
      const map = new Map<string, { item: Item; count: number }>();
      for (const item of items) {
        if (map.has(item.id)) {
          map.get(item.id)!.count++;
        } else {
          map.set(item.id, { item, count: 1 });
        }
      }
      result.set(type, Array.from(map.values()));
    }
    return result;
  }, [grouped]);

  const isFavorite = useCallback(
    (itemName: string) => {
      return character.favorites.includes(itemName);
    },
    [character.favorites],
  );

  const canEquip = useCallback(
    (item: Item): boolean => {
      if (item.type !== 'equipment') return false;
      if (!item.classRequired) return true;
      return character.class === item.classRequired;
    },
    [character.class],
  );

  const getItemClassLabel = useCallback(
    (item: Item): string | null => {
      if (!item.classRequired || item.classRequired === character.class) return null;
      return CLASS_NAME_MAP[item.classRequired] || item.classRequired;
    },
    [character.class],
  );

  const sellDisabled = rarityFilter.size === 0;

  return (
    <div className={styles.container}>
      {/* Filter Row */}
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          <div className={styles.pillGroup}>
            {TYPE_ORDER.map((type) => (
              <button
                key={type}
                className={`${styles.pill} ${typeFilter.has(type) ? styles.pillActive : ''}`}
                onClick={() => toggleTypeFilter(type)}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>品质</span>
          <div className={styles.pillGroup}>
            {RARITY_ORDER.map((rarity) => (
              <button
                key={rarity}
                className={`${styles.pill} ${styles[`pillRarity${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`] || ''} ${rarityFilter.has(rarity) ? styles.pillActive : ''}`}
                onClick={() => toggleRarityFilter(rarity)}
              >
                {RARITY_LABELS[rarity]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>排序</span>
          <div className={styles.pillGroup}>
            {[
              { key: 'rarity' as SortKey, label: '品质' },
              { key: 'level' as SortKey, label: '等级' },
              { key: 'name' as SortKey, label: '名称' },
              { key: 'time' as SortKey, label: '时间' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`${styles.pill} ${sortBy === key ? styles.pillActive : ''}`}
                onClick={() => {
                  setSortBy(key);
                  handleSort();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* One-click sell buttons */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>一键出售</span>
          <div className={styles.oneClickSellGroup}>
            <button
              onClick={() => handleOneClickSellForType('equipment')}
              className={styles.oneClickSellBtn}
              disabled={sellDisabled}
              title={sellDisabled ? '请先选择品级' : '出售所有符合品质筛选的装备'}
            >
              一键出售装备
            </button>
            <button
              onClick={() => handleOneClickSellForType('chest')}
              className={`${styles.oneClickSellBtn} ${styles.oneClickSellBtnChest}`}
              disabled={sellDisabled}
              title={sellDisabled ? '请先选择品级' : '出售所有符合品质筛选的宝箱'}
            >
              一键出售宝箱
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Groups */}
      <div className={styles.list}>
        {aggregated.size === 0 ? (
          <p className={styles.empty}>背包是空的。</p>
        ) : (
          Array.from(aggregated.entries()).map(([type, items]) => {
            const isCollapsed = collapsedGroups.has(type);
            const groupRarity =
              items.length > 0
                ? items.reduce<ItemRarity>(
                    (best, { item }) => (RARITY_INDEX[item.rarity] > RARITY_INDEX[best] ? item.rarity : best),
                    items[0].item.rarity,
                  )
                : 'common';

            return (
              <div key={type} className={styles.group}>
                <button className={styles.groupHeader} onClick={() => toggleCollapse(type)}>
                  <span className={styles.groupArrow}>{isCollapsed ? '▸' : '▾'}</span>
                  <span className={styles.groupTitle}>
                    {TYPE_LABELS[type] || type}（{items.length}）
                  </span>
                  <span className={`${styles.groupLine} ${RARITY_CLASS_NAMES[groupRarity]}`} />
                </button>

                {!isCollapsed && (
                  <div className={styles.groupItems}>
                    {items.map(({ item, count }) => {
                      const equippable = canEquip(item);
                      const classLabel = getItemClassLabel(item);
                      const fav = isFavorite(item.name);
                      const comparison = item.type === 'equipment' ? getEquipComparison(item, character) : null;
                      const sellPrice = getSellPrice(item);
                      const statPreview = item.type === 'equipment' ? getItemStatsPreview(item, character.class) : '';
                      const showDetail =
                        item.rarity === 'epic' ||
                        item.rarity === 'legendary' ||
                        item.rarity === 'mythic' ||
                        item.rarity === 'transcendent';

                      return (
                        <div
                          key={item.id}
                          className={`${styles.itemCard} ${RARITY_CLASS_NAMES[item.rarity]} ${fav ? styles.itemFav : ''}`}
                        >
                          <div className={styles.itemTop}>
                            <span className={styles.itemName}>{item.name}</span>
                            <span className={styles.itemCount}>x{count}</span>
                            <button
                              className={`${styles.favBtn} ${fav ? styles.favActive : ''}`}
                              onClick={(e) => toggleFavorite(item.name, e)}
                              title={fav ? '取消收藏' : '收藏'}
                            >
                              ★
                            </button>
                            <RarityBadge rarity={item.rarity} />
                          </div>

                          <div className={styles.itemMeta}>
                            <span className={styles.itemType}>{TYPE_LABELS[item.type] || item.type}</span>
                            {item.minLevel && <span className={styles.itemLevel}>Lv.{item.minLevel}</span>}
                            {classLabel && <span className={styles.classBadge}>{classLabel}专属</span>}
                          </div>

                          {statPreview && <div className={styles.itemStats}>{statPreview}</div>}

                          {comparison && (
                            <div
                              className={`${styles.itemComparison} ${comparison.startsWith('↑') ? styles.comparisonGood : styles.comparisonBad}`}
                            >
                              {comparison}
                            </div>
                          )}

                          <div className={styles.itemActions}>
                            {equippable && item.slot && (
                              <button
                                onClick={() => onAction({ type: 'equip', slot: item.slot!, itemName: item.name })}
                                className={`${styles.actionBtn} ${styles.equipBtn}`}
                              >
                                装备
                              </button>
                            )}
                            {!equippable && item.type === 'equipment' && (
                              <span className={styles.lockHint}>
                                {item.classRequired && item.classRequired !== character.class
                                  ? `${CLASS_NAME_MAP[item.classRequired] || item.classRequired}专属`
                                  : item.minLevel && character.level < item.minLevel
                                    ? `需要 Lv.${item.minLevel}`
                                    : '无法装备'}
                              </span>
                            )}
                            {item.type === 'chest' && (
                              <button
                                onClick={() => onAction({ type: 'open', itemName: item.name })}
                                className={`${styles.actionBtn} ${styles.openBtn}`}
                              >
                                开启
                              </button>
                            )}
                            {item.type === 'skill_book' && (
                              <button
                                onClick={() => onAction({ type: 'use', itemName: item.name })}
                                className={`${styles.actionBtn} ${styles.skillBtn}`}
                              >
                                使用
                              </button>
                            )}
                            <button
                              onClick={() => onAction({ type: 'sell', itemName: item.name })}
                              className={`${styles.actionBtn} ${styles.sellBtn}`}
                            >
                              出售 +{sellPrice}
                            </button>
                            {showDetail && (
                              <button
                                onClick={() => setDetailItem(item)}
                                className={`${styles.actionBtn} ${styles.detailBtn}`}
                              >
                                详情
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Item Detail Modal */}
      {detailItem && (
        <div
          className={styles.modalOverlay}
          onClick={() => setDetailItem(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Item details"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={`${styles.modalName} ${RARITY_CLASS_NAMES[detailItem.rarity]}`}>{detailItem.name}</span>
              <button
                ref={detailCloseButtonRef}
                className={styles.modalClose}
                onClick={() => setDetailItem(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalMeta}>
              <RarityBadge rarity={detailItem.rarity} />
              <span>{TYPE_LABELS[detailItem.type] || detailItem.type}</span>
              {detailItem.slot && <span>{detailItem.slot}</span>}
              {detailItem.minLevel && <span>需要 Lv.{detailItem.minLevel}</span>}
            </div>
            {detailItem.stats &&
              (() => {
                const resolved = resolveStatsForClass(detailItem.stats, character.class);
                if (!resolved) return null;
                return (
                  <div className={styles.modalStats}>
                    {Object.entries(resolved).map(([stat, val]) => {
                      if ((val as number) <= 0) return null;
                      const labels: Record<string, string> = {
                        str: 'STR',
                        dex: 'DEX',
                        int: 'INT',
                        vit: 'VIT',
                        luk: 'LUK',
                      };
                      return (
                        <span key={stat} className={styles.modalStatItem}>
                          {labels[stat] || stat} +{val as number}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            {detailItem.description && <p className={styles.modalDesc}>{detailItem.description}</p>}
            <div className={styles.modalActions}>
              {canEquip(detailItem) && detailItem.slot && (
                <button
                  onClick={() => {
                    onAction({ type: 'equip', slot: detailItem.slot!, itemName: detailItem.name });
                    setDetailItem(null);
                  }}
                  className={`${styles.actionBtn} ${styles.equipBtn}`}
                >
                  装备
                </button>
              )}
              <button
                onClick={() => {
                  onAction({ type: 'sell', itemName: detailItem.name });
                  setDetailItem(null);
                }}
                className={`${styles.actionBtn} ${styles.sellBtn}`}
              >
                出售 +{getSellPrice(detailItem)}
              </button>
              <button
                onClick={(e) => {
                  toggleFavorite(detailItem.name, e);
                  setDetailItem(null);
                }}
                className={`${styles.actionBtn} ${isFavorite(detailItem.name) ? styles.favActive : ''}`}
              >
                {isFavorite(detailItem.name) ? '★ 已收藏' : '☆ 收藏'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
