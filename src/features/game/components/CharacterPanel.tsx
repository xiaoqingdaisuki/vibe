"use client"

import type { Character, ActiveTab } from "../types"
import { DIFFICULTY_TIERS } from "../static-data"
import { RarityBadge } from "./RarityBadge"
import { RARITY_COLORS } from "../static-data"
import styles from "./CharacterPanel.module.css"

const STAT_KEYS = ["str", "dex", "int", "vit", "luk"] as const

function getEquipBonus(character: Character, stat: string): number {
  let bonus = 0
  for (const slot of ["weapon", "armor", "accessory"] as const) {
    const item = character.equipment[slot]
    if (item?.stats) {
      const val = (item.stats as Record<string, number>)[stat]
      if (typeof val === "number") bonus += val
    }
  }
  return bonus
}

function StatRow({ label, base, bonus }: { label: string; base: number; bonus: number }) {
  const total = base + bonus
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        {total}
        {bonus > 0 && <span className={styles.statBonus}>+{bonus}</span>}
      </span>
    </div>
  )
}

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "#22c55e",
  2: "#eab308",
  3: "#f97316",
  4: "#ef4444",
  5: "#7c3aed",
}

function getDifficultyInfo(level: number): { name: string; color: string; tier: number } {
  const tier = DIFFICULTY_TIERS.find(t => level >= t.minLevel && level <= t.maxLevel)
  if (!tier) return { name: "?", color: "#888", tier: 1 }
  return { name: tier.name, color: DIFFICULTY_COLORS[tier.tier] || "#888", tier: tier.tier }
}

interface CharacterPanelProps {
  character: Character
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  onCommand: (cmd: string, args?: string[]) => void
  getRestCooldown?: () => number
}

export function CharacterPanel({ character, activeTab, onTabChange, onCommand, getRestCooldown }: CharacterPanelProps) {
  const classNames: Record<string, string> = {
    warrior: "战士",
    mage: "法师",
    rogue: "盗贼",
  }

  const diff = getDifficultyInfo(character.level)
  const restCooldown = getRestCooldown?.() ?? 0
  const restDisabled = restCooldown > 0
  const restLabel = restDisabled ? `休息(${Math.floor(restCooldown / 60)}:${String(restCooldown % 60).padStart(2, "0")})` : "休息"

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{character.name}</h2>
        <span className={styles.level}>Lv.{character.level}</span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.classTag}>{classNames[character.class]}</div>
          <div className={styles.diffTag} style={{ backgroundColor: diff.color + "20", color: diff.color, borderColor: diff.color }}>
            {diff.name}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.bar}>
          <span className={styles.barLabel}>HP</span>
          <div className={styles.barBg}>
            <div
              className={styles.barFill}
              style={{
                width: `${(character.hp / character.maxHp) * 100}%`,
                backgroundColor: character.hp < character.maxHp * 0.3 ? "#ef4444" : "#22c55e",
              }}
            />
          </div>
          <span className={styles.barText}>
            {character.hp}/{character.maxHp}
          </span>
        </div>
        <div className={styles.bar}>
          <span className={styles.barLabel}>EXP</span>
          <div className={styles.barBg}>
            <div
              className={styles.barFill}
              style={{
                width: `${(character.exp / character.expToNext) * 100}%`,
                backgroundColor: "#a855f7",
              }}
            />
          </div>
          <span className={styles.barText}>
            {character.exp}/{character.expToNext}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>属性</h3>
        <div className={styles.stats}>
          <StatRow label="力" base={character.stats.str} bonus={getEquipBonus(character, "str")} />
          <StatRow label="敏" base={character.stats.dex} bonus={getEquipBonus(character, "dex")} />
          <StatRow label="智" base={character.stats.int} bonus={getEquipBonus(character, "int")} />
          <StatRow label="体" base={character.stats.vit} bonus={getEquipBonus(character, "vit")} />
          <StatRow label="运" base={character.stats.luk} bonus={getEquipBonus(character, "luk")} />
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>战斗属性</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>⚔️ 攻击</span>
            <span className={styles.statValue}>{character._combatAtk ?? "?"}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>🛡️ 防御</span>
            <span className={styles.statValue}>{character._combatDef ?? "?"}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>✨ 法术</span>
            <span className={styles.statValue}>{character._combatSpell ?? "?"}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>装备</h3>
        <div className={styles.equipment}>
          {["weapon", "armor", "accessory"].map((slot) => {
            const item = character.equipment[slot as keyof typeof character.equipment]
            const slotNames: Record<string, string> = {
              weapon: "武器",
              armor: "护甲",
              accessory: "饰品",
            }
            return (
              <div key={slot} className={styles.equipSlot}>
                <span className={styles.equipSlotLabel}>{slotNames[slot]}</span>
                {item ? (
                  <div className={styles.equipItem}>
                    <span
                      className={styles.equipItemName}
                      style={{ color: RARITY_COLORS[item.rarity] || RARITY_COLORS.common }}
                    >
                      {item.name}
                    </span>
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
          <span>💰</span>
          <span>{character.gold}</span>
        </div>
      </div>

      <div className={styles.commands}>
        <button onClick={() => onCommand("/status")} className={styles.cmdBtn}>状态</button>
        <button onClick={() => onCommand("/bag")} className={styles.cmdBtn}>背包</button>
        <button onClick={() => onCommand("/skills")} className={styles.cmdBtn}>技能</button>
        <button onClick={() => onCommand("/shop")} className={styles.cmdBtn}>商店</button>
        <button onClick={() => !restDisabled && onCommand("/rest")} className={styles.cmdBtn} disabled={restDisabled}>
          {restLabel}
        </button>
        <button onClick={() => onCommand("/help")} className={styles.cmdBtn}>帮助</button>
        <button onClick={() => onCommand("/clear")} className={`${styles.cmdBtn} ${styles.clearCmd}`}>清屏</button>
      </div>
    </div>
  )
}
