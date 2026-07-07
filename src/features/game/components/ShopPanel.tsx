"use client"

import type { Character } from "../types"
import { SHOP_ITEMS, ITEMS, DIFFICULTY_TIERS, RARITY_COLORS, RARITY_LABELS } from "../static-data"
import styles from "./ShopPanel.module.css"

interface ShopPanelProps {
  character: Character
  onCommand: (cmd: string, args?: string[]) => void
}

const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]))

const CATEGORY_LABELS: Record<string, string> = {
  consumables: "消耗品",
  equipment: "精良装备",
  chests: "宝箱",
  skill_books: "技能书",
}

const CATEGORY_ORDER = ["consumables", "equipment", "chests", "skill_books"]

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

export function ShopPanel({ character, onCommand }: ShopPanelProps) {
  // Group by category
  const groups = new Map<string, typeof SHOP_ITEMS>()
  for (const item of SHOP_ITEMS) {
    const cat = categorizeShopItem(item.itemId)
    // Filter equipment: only weapon/armor, only closest level (±1)
    if (cat === "equipment") {
      const def = ITEM_MAP.get(item.itemId)
      if (!def) continue
      // Only weapon and armor (no accessories)
      if (def.slot === "accessory") continue
      // Only show items closest to character level (±1)
      if (Math.abs(def.minLevel - character.level) > 1) continue
    }
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(item)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>商店</h3>
        <div className={styles.gold}>
          <span>💰</span>
          <span>{character.gold.toLocaleString()} 金币</span>
        </div>
      </div>
      <div className={styles.list}>
        {CATEGORY_ORDER.filter(cat => groups.has(cat)).map(category => (
          <div key={category} className={styles.categoryGroup}>
            <div className={styles.categoryHeader}>
              {CATEGORY_LABELS[category] || category}
            </div>
            {groups.get(category)!.map(shopItem => {
              const itemDef = ITEM_MAP.get(shopItem.itemId)
              if (!itemDef) return null

              const canAfford = character.gold >= shopItem.price
              const levelReq = (shopItem as any).minLevel
              const meetsLevel = !levelReq || character.level >= levelReq
              const disabled = !canAfford || !meetsLevel

              return (
                <div key={shopItem.itemId} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemName} style={{ color: RARITY_COLORS[itemDef.rarity] }}>
                      {itemDef.name}
                    </span>
                    <span className={styles.itemDesc}>{itemDef.description}</span>
                    {itemDef.rarity !== "common" && (
                      <span
                        className={styles.rarityTag}
                        style={{ color: RARITY_COLORS[itemDef.rarity], borderColor: RARITY_COLORS[itemDef.rarity] }}
                      >
                        {RARITY_LABELS[itemDef.rarity]}
                      </span>
                    )}
                  </div>
                  <div className={styles.itemPrice}>
                    <span className={canAfford ? styles.priceTag : styles.priceTagExpensive}>
                      {formatPrice(shopItem.price)} 金币
                    </span>
                    {!meetsLevel && (
                      <span className={styles.levelReq}>需要 Lv.{levelReq}</span>
                    )}
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      onClick={() => onCommand("/buy", [itemDef.name])}
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
