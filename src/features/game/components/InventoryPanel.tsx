"use client"

import type { Character } from "../types"
import { RARITY_COLORS } from "../static-data"
import { RarityBadge } from "./RarityBadge"
import styles from "./InventoryPanel.module.css"

interface InventoryPanelProps {
  character: Character
  onCommand: (cmd: string, args?: string[]) => void
}

export function InventoryPanel({ character, onCommand }: InventoryPanelProps) {
  const grouped = new Map<string, { item: Character["inventory"][0]; count: number }>()
  for (const item of character.inventory) {
    const key = item.id
    if (grouped.has(key)) {
      grouped.get(key)!.count++
    } else {
      grouped.set(key, { item, count: 1 })
    }
  }

  const items = Array.from(grouped.values()).reverse()

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>背包 ({character.inventory.length})</h3>
      <div className={styles.list}>
        {items.length === 0 ? (
          <p className={styles.empty}>背包是空的</p>
        ) : (
          items.map(({ item, count }) => (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span
                  className={styles.itemName}
                  style={{ color: RARITY_COLORS[item.rarity] || RARITY_COLORS.common }}
                >
                  {item.name}
                </span>
                <RarityBadge rarity={item.rarity} />
              </div>
              <span className={styles.itemCount}>x{count}</span>
              <div className={styles.itemActions}>
                {item.type === "equipment" && item.slot && (
                  <button
                    onClick={() => onCommand("/equip", [item.slot!, item.name])}
                    className={styles.actionBtn}
                  >
                    装备
                  </button>
                )}
                {item.type === "chest" && (
                  <button onClick={() => onCommand("/open", [item.name])} className={`${styles.actionBtn} ${styles.openBtn}`}>
                    开启
                  </button>
                )}
                {item.type === "skill_book" && (
                  <button onClick={() => onCommand("/use", [item.name])} className={`${styles.actionBtn} ${styles.skillBtn}`}>
                    使用
                  </button>
                )}
                <button onClick={() => onCommand("/sell", [item.name])} className={`${styles.actionBtn} ${styles.sell}`}>
                  出售
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
