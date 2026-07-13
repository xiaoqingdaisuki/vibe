'use client';

import type { ItemRarity } from '../types';
import styles from './RarityBadge.module.css';

const RARITY_LABELS: Record<ItemRarity, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
  transcendent: '超越',
};

const RARITY_CLASSES: Record<ItemRarity, string> = {
  common: styles.common,
  uncommon: styles.uncommon,
  rare: styles.rare,
  epic: styles.epic,
  legendary: styles.legendary,
  mythic: styles.mythic,
  transcendent: styles.transcendent,
};

interface RarityBadgeProps {
  rarity: ItemRarity;
  showLabel?: boolean;
}

export function RarityBadge({ rarity, showLabel = true }: RarityBadgeProps) {
  return (
    <span className={`${styles.badge} ${showLabel ? '' : styles.iconOnly} ${RARITY_CLASSES[rarity]}`}>
      {showLabel && RARITY_LABELS[rarity]}
    </span>
  );
}
