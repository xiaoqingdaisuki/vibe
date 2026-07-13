"use client"

import type { Character, GameInteraction } from "../types"
import { ITEMS, SHOP_ITEMS } from "../static-data"
import { RarityBadge } from "./RarityBadge"
import styles from "./ShopPanel.module.css"

interface ShopPanelProps {
  character: Character
  onAction: (action: GameInteraction | { type: "clearLogs" }) => void
}

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]))

const CATEGORY_LABELS: Record<string, string> = {
  equipment: "装备",
  chests: "宝箱",
  skill_books: "技能书",
}

const CATEGORY_ORDER = ["equipment", "chests", "skill_books"]

function categorizeShopItem(itemId: string): string {
  if (itemId.includes("chest")) return "chests"
  if (itemId.includes("skill_book")) return "skill_books"
  return "equipment"
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(0)}M`
  if (price >= 10_000) return `${(price / 1_000).toFixed(0)}K`
  return price.toString()
}

export function ShopPanel({ character, onAction }: ShopPanelProps) {
  const groups = new Map<string, typeof SHOP_ITEMS>()
  for (const item of SHOP_ITEMS) {
    const category = categorizeShopItem(item.itemId)
    if (category === "equipment") {
      const def = ITEM_MAP.get(item.itemId)
      if (!def || def.slot === "accessory") continue
      if (Math.abs(def.minLevel - character.level) > 1) continue
    }
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push(item)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>商店</h3>
        <div className={styles.gold}>
          <span>金币</span>
          <span>{character.gold.toLocaleString()}</span>
        </div>
      </div>
      <div className={styles.list}>
        {CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => (
          <div key={category} className={styles.categoryGroup}>
            <div className={styles.categoryHeader}>{CATEGORY_LABELS[category] || category}</div>
            {groups.get(category)!.map((shopItem) => {
              const itemDef = ITEM_MAP.get(shopItem.itemId)
              if (!itemDef) return null

              const canAfford = character.gold >= shopItem.price
              const levelReq = shopItem.minLevel
              const meetsLevel = !levelReq || character.level >= levelReq
              const disabled = !canAfford || !meetsLevel

              return (
                <div key={shopItem.itemId} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemName}>{itemDef.name}</span>
                    <span className={styles.itemDesc}>{itemDef.description}</span>
                    {itemDef.rarity !== "common" && <RarityBadge rarity={itemDef.rarity} />}
                  </div>
                  <div className={styles.itemPrice}>
                    <span className={canAfford ? styles.priceTag : styles.priceTagExpensive}>
                      {formatPrice(shopItem.price)} 金币
                    </span>
                    {!meetsLevel && <span className={styles.levelReq}>需要 Lv.{levelReq}</span>}
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      onClick={() => onAction({ type: "buy", itemName: itemDef.name })}
                      className={styles.buyBtn}
                      disabled={disabled}
                    >
                      购买
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
