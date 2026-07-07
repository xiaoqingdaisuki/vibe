"use client"

import type { Item } from "../types"
import styles from "./RarityBadge.module.css"

const RARITY_COLORS: Record<string, string> = {
  common:       "#9ca3af", // 灰
  uncommon:     "#22c55e", // 绿
  rare:         "#3b82f6", // 蓝
  epic:         "#a855f7", // 紫
  legendary:    "#f97316", // 橙
  mythic:       "#ef4444", // 红
  transcendent: "#fbbf24", // 金
}

const RARITY_LABELS: Record<string, string> = {
  common:       "普通",
  uncommon:     "精良",
  rare:         "稀有",
  epic:         "史诗",
  legendary:    "传说",
  mythic:       "神话",
  transcendent: "超越",
}

// Badge text color: low tiers use the rarity color; top tiers use white for readability
const RARITY_TEXT_COLORS: Record<string, string> = {
  common:       "#9ca3af",
  uncommon:     "#22c55e",
  rare:         "#60a5fa",
  epic:         "#c084fc",
  legendary:    "#ffffff",
  mythic:       "#ffffff",
  transcendent: "#ffffff",
}

// Background tint for badge (very subtle)
const RARITY_BG: Record<string, string> = {
  common:       "rgba(156,163,175,0.12)",
  uncommon:     "rgba(34,197,94,0.12)",
  rare:         "rgba(59,130,246,0.12)",
  epic:         "rgba(168,85,247,0.12)",
  legendary:    "rgba(249,115,22,0.15)",
  mythic:       "rgba(239,68,68,0.15)",
  transcendent: "rgba(251,191,36,0.18)",
}

const GLOW_CLASSES: Record<string, string> = {
  legendary:    styles.legendary,
  mythic:       styles.mythic,
  transcendent: styles.transcendent,
}

interface RarityBadgeProps {
  rarity: string
  showLabel?: boolean
}

export function RarityBadge({ rarity, showLabel = true }: RarityBadgeProps) {
  const color = RARITY_COLORS[rarity] || RARITY_COLORS.common
  const label = RARITY_LABELS[rarity] || "普通"
  const textColor = RARITY_TEXT_COLORS[rarity] || color
  const bgColor = RARITY_BG[rarity] || "transparent"
  const glowClass = GLOW_CLASSES[rarity] || ""

  return (
    <span
      className={`${styles.badge} ${showLabel ? "" : styles.iconOnly} ${glowClass}`}
      style={{
        color: textColor,
        borderColor: color,
        backgroundColor: bgColor,
      }}
    >
      {showLabel && label}
    </span>
  )
}
