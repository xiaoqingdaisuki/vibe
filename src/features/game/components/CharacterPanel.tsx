"use client"

import type { ActiveTab, Character, GameInteraction } from "../types"
import { DIFFICULTY_TIERS } from "../static-data"
import { RarityBadge } from "./RarityBadge"
import styles from "./CharacterPanel.module.css"

interface CharacterPanelProps {
  character: Character
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  onAction: (action: GameInteraction | { type: "clearLogs" }) => void
}

const CLASS_NAMES: Record<Character["class"], string> = {
  warrior: "战士",
  mage: "法师",
  rogue: "盗贼",
}

const SLOT_NAMES = {
  weapon: "武器",
  armor: "护甲",
  accessory: "饰品",
} as const

function getDifficultyInfo(level: number): { name: string; tier: number } {
  const tier = DIFFICULTY_TIERS.find((entry) => level >= entry.minLevel && level <= entry.maxLevel)
  return tier ? { name: tier.name, tier: tier.tier } : { name: "未知", tier: 1 }
}

export function CharacterPanel({
  character,
  activeTab,
  onTabChange,
  onAction,
}: CharacterPanelProps) {
  const diff = getDifficultyInfo(character.level)
  const hpValue = Math.max(0, Math.min(character.hp, character.maxHp))
  const expValue = Math.max(0, Math.min(character.exp, character.expToNext))

  const bagUsed = character.inventory.length
  const bagMax = character.inventoryMax
  const bagPercent = Math.round((bagUsed / bagMax) * 100)
  const isFull = bagUsed >= bagMax

  const expandCost = bagMax >= 50
    ? Infinity
    : Math.floor(100 * Math.pow(1.35, bagMax - 20))

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{character.name}</h2>
        <span className={styles.level}>Lv.{character.level}</span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.classTag}>{CLASS_NAMES[character.class]}</div>
          <div className={`${styles.diffTag} ${styles[`diff${diff.tier}`]}`}>{diff.name}</div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.bar}>
          <span className={styles.barLabel}>HP</span>
          <progress className={styles.hpProgress} value={hpValue} max={character.maxHp} />
          <span className={styles.barText}>
            {character.hp}/{character.maxHp}
          </span>
        </div>
        <div className={styles.bar}>
          <span className={styles.barLabel}>EXP</span>
          <progress className={styles.expProgress} value={expValue} max={character.expToNext} />
          <span className={styles.barText}>
            {character.exp}/{character.expToNext}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>基础属性</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>STR</span>
            <span className={styles.statValue}>{character.stats.str}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>DEX</span>
            <span className={styles.statValue}>{character.stats.dex}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>INT</span>
            <span className={styles.statValue}>{character.stats.int}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>VIT</span>
            <span className={styles.statValue}>{character.stats.vit}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>LUK</span>
            <span className={styles.statValue}>{character.stats.luk}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>战斗属性</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>ATK</span>
            <span className={styles.statValue}>{character._combatAtk ?? "?"}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>DEF</span>
            <span className={styles.statValue}>{character._combatDef ?? "?"}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>SPELL</span>
            <span className={styles.statValue}>{character._combatSpell ?? "?"}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>装备</h3>
        <div className={styles.equipment}>
          {Object.entries(SLOT_NAMES).map(([slot, label]) => {
            const item = character.equipment[slot]
            return (
              <div key={slot} className={styles.equipSlot}>
                <span className={styles.equipSlotLabel}>{label}</span>
                {item ? (
                  <div className={styles.equipItem}>
                    <span className={styles.equipItemName}>{item.name}</span>
                    <RarityBadge rarity={item.rarity} />
                  </div>
                ) : (
                  <span className={styles.emptySlot}>-</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.gold}>
          <span>金币</span>
          <span>{character.gold.toLocaleString()}</span>
        </div>
      </div>

      {/* Bag Capacity */}
      <div className={styles.section}>
        <div className={styles.bagSection}>
          <div className={styles.bagInfo}>
            <span className={styles.bagLabel}>背包</span>
            <span className={styles.bagCount}>
              {bagUsed}/{bagMax}
            </span>
            {isFull && (
              <span className={styles.bagFull}>已满</span>
            )}
          </div>
          <div className={styles.bagBar}>
            <div
              className={`${styles.bagBarFill} ${bagPercent >= 95 ? styles.bagBarDanger : bagPercent >= 80 ? styles.bagBarWarning : ""}`}
              style={{ width: `${Math.min(bagPercent, 100)}%` }}
            />
          </div>
          {bagMax < 50 && (
            <button
              onClick={() => onAction({ type: "expand" })}
              className={`${styles.expandBtn} ${character.gold < expandCost ? styles.expandDisabled : ""}`}
              disabled={character.gold < expandCost}
              title={expandCost === Infinity ? "已达上限" : `扩充需要 ${expandCost.toLocaleString()} 金币`}
            >
              {expandCost === Infinity ? "已满" : `扩充 +${expandCost.toLocaleString()}金`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
