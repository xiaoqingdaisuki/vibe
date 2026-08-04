'use client';

import type { Character, EquipSlot, GameInteraction, Stats } from '../types';
import { resolveStatsForClass } from '../static-data';
import { RarityBadge } from './RarityBadge';
import styles from './EquipmentPanel.module.css';

interface EquipmentPanelProps {
  character: Character;
  onAction: (action: GameInteraction | { type: 'clearLogs' }) => void;
}

const SLOTS: Array<{ key: EquipSlot; label: string }> = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '护甲' },
  { key: 'accessory', label: '饰品' },
];

const STAT_LABELS: Record<keyof Stats, string> = {
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  vit: 'VIT',
  luk: 'LUK',
};

// 装备面板，显示各部位装备及卸下操作
export function EquipmentPanel({ character, onAction }: EquipmentPanelProps) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>装备</h3>
      <div className={styles.list}>
        {SLOTS.map(({ key, label }) => {
          const item = character.equipment[key];
          const stats = item?.stats ? resolveStatsForClass(item.stats, character.class) : undefined;

          return (
            <div key={key} className={styles.slot}>
              <div className={styles.slotHeader}>
                <span className={styles.slotLabel}>{label}</span>
                {item && <RarityBadge rarity={item.rarity} />}
              </div>
              {item ? (
                <div className={styles.equippedItem}>
                  <div className={styles.itemName}>{item.name}</div>
                  {stats && (
                    <div className={styles.itemStats}>
                      {Object.entries(stats).map(([stat, value]) => (
                        <span key={stat}>
                          {STAT_LABELS[stat as keyof Stats]} +{value}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.minLevel && <div className={styles.itemLevel}>需要 Lv.{item.minLevel}</div>}
                  <button onClick={() => onAction({ type: 'unequip', slot: key })} className={styles.unequipBtn}>
                    卸下
                  </button>
                </div>
              ) : (
                <div className={styles.empty}>未装备</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
