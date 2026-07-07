"use client"

import type { Character, GameInteraction } from "../types"
import { RarityBadge } from "./RarityBadge"
import styles from "./InventoryPanel.module.css"

interface InventoryPanelProps {
  character: Character
  onAction: (action: GameInteraction | { type: "clearLogs" }) => void
}

export function InventoryPanel({ character, onAction }: InventoryPanelProps) {
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
      <h3 className={styles.title}>背包（{character.inventory.length}）</h3>
      <div className={styles.list}>
        {items.length === 0 ? (
          <p className={styles.empty}>背包是空的。</p>
        ) : (
          items.map(({ item, count }) => (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{item.name}</span>
                <RarityBadge rarity={item.rarity} />
              </div>
              <span className={styles.itemCount}>x{count}</span>
              <div className={styles.itemActions}>
                {item.type === "equipment" && item.slot && (
                  <button
                    onClick={() => onAction({ type: "equip", slot: item.slot!, itemName: item.name })}
                    className={styles.actionBtn}
                  >
                    装备
                  </button>
                )}
                {item.type === "chest" && (
                  <button
                    onClick={() => onAction({ type: "open", itemName: item.name })}
                    className={`${styles.actionBtn} ${styles.openBtn}`}
                  >
                    开启
                  </button>
                )}
                {item.type === "skill_book" && (
                  <button
                    onClick={() => onAction({ type: "use", itemName: item.name })}
                    className={`${styles.actionBtn} ${styles.skillBtn}`}
                  >
                    使用
                  </button>
                )}
                <button
                  onClick={() => onAction({ type: "sell", itemName: item.name })}
                  className={`${styles.actionBtn} ${styles.sell}`}
                >
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
