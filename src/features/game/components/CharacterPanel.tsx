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
  getRestCooldown?: () => number
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

function formatCooldown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function CharacterPanel({
  character,
  activeTab,
  onTabChange,
  onAction,
  getRestCooldown,
}: CharacterPanelProps) {
  const diff = getDifficultyInfo(character.level)
  const restCooldown = getRestCooldown?.() ?? 0
  const restDisabled = restCooldown > 0
  const hpValue = Math.max(0, Math.min(character.hp, character.maxHp))
  const expValue = Math.max(0, Math.min(character.exp, character.expToNext))

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

      <div className={styles.actions}>
        <button
          onClick={() => onTabChange("inventory")}
          className={`${styles.actionBtn} ${activeTab === "inventory" ? styles.actionActive : ""}`}
        >
          背包
        </button>
        <button
          onClick={() => onTabChange("equipment")}
          className={`${styles.actionBtn} ${activeTab === "equipment" ? styles.actionActive : ""}`}
        >
          装备
        </button>
        <button
          onClick={() => onTabChange("skills")}
          className={`${styles.actionBtn} ${activeTab === "skills" ? styles.actionActive : ""}`}
        >
          技能
        </button>
        <button
          onClick={() => onTabChange("shop")}
          className={`${styles.actionBtn} ${activeTab === "shop" ? styles.actionActive : ""}`}
        >
          商店
        </button>
        <button onClick={() => onAction({ type: "rest" })} className={styles.actionBtn} disabled={restDisabled}>
          {restDisabled ? `休息 ${formatCooldown(restCooldown)}` : "休息"}
        </button>
        <button onClick={() => onAction({ type: "clearLogs" })} className={`${styles.actionBtn} ${styles.clearAction}`}>
          清屏
        </button>
      </div>
    </div>
  )
}
