"use client"

import type { Character } from "../types"
import { RARITY_COLORS } from "../static-data"
import { RarityBadge } from "./RarityBadge"
import styles from "./EquipmentPanel.module.css"

interface EquipmentPanelProps {
  character: Character
  onCommand: (cmd: string, args?: string[]) => void
}

export function EquipmentPanel({ character, onCommand }: EquipmentPanelProps) {
  const slots = [
    { key: "weapon", label: "武器" },
    { key: "armor", label: "护甲" },
    { key: "accessory", label: "饰品" },
  ]

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>装备</h3>
      <div className={styles.list}>
        {slots.map(({ key, label }) => {
          const item = character.equipment[key as keyof typeof character.equipment]
          return (
            <div key={key} className={styles.slot}>
              <div className={styles.slotHeader}>
                <span className={styles.slotLabel}>{label}</span>
                {item && <RarityBadge rarity={item.rarity} />}
              </div>
              {item ? (
                <div className={styles.equippedItem}>
                  <div
                    className={styles.itemName}
                    style={{ color: RARITY_COLORS[item.rarity] || RARITY_COLORS.common }}
                  >
                    {item.name}
                  </div>
                  {item.stats && (
                    <div className={styles.itemStats}>
                      {Object.entries(item.stats).map(([stat, value]) => (
                        <span key={stat}>
                          {stat === "str" && `力+${value}`}
                          {stat === "dex" && `敏+${value}`}
                          {stat === "int" && `智+${value}`}
                          {stat === "vit" && `体+${value}`}
                          {stat === "luk" && `运+${value}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {(item as any).minLevel && (
                    <div className={styles.itemLevel}>需求等级: Lv.{(item as any).minLevel}</div>
                  )}
                  <button
                    onClick={() => onCommand("/unequip", [key])}
                    className={styles.unequipBtn}
                  >
                    卸下
                  </button>
                </div>
              ) : (
                <div className={styles.empty}>未装备</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
