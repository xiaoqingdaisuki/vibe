"use client"

import type { ActiveTab, Character, GameInteraction, LogEntry } from "../types"
import { CharacterPanel } from "./CharacterPanel"
import { EquipmentPanel } from "./EquipmentPanel"
import { GameLog } from "./GameLog"
import { InventoryPanel } from "./InventoryPanel"
import { ShopPanel } from "./ShopPanel"
import { SkillsPanel } from "./SkillsPanel"
import styles from "./Game.module.css"

interface GameLayoutProps {
  character: Character
  logs: LogEntry[]
  activeTab: ActiveTab
  nextCombatIn: number | null
  onTabChange: (tab: ActiveTab) => void
  onAction: (action: GameInteraction | { type: "clearLogs" }) => void
}

export function GameLayout({
  character,
  logs,
  activeTab,
  nextCombatIn,
  onTabChange,
  onAction,
}: GameLayoutProps) {
  return (
    <div className={styles.gameContainer}>
      <div className={styles.gameLayout}>
        <div className={styles.leftPanel}>
          <CharacterPanel
            character={character}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onAction={onAction}
          />
        </div>

        <div className={styles.centerPanel}>
          <GameLog logs={logs} character={character} nextCombatIn={nextCombatIn} onClearLogs={() => onAction({ type: "clearLogs" })} />
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "inventory" ? styles.active : ""}`}
              onClick={() => onTabChange("inventory")}
            >
              背包 {character.inventory.length}/{character.inventoryMax}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "equipment" ? styles.active : ""}`}
              onClick={() => onTabChange("equipment")}
            >
              装备
            </button>
            <button
              className={`${styles.tab} ${activeTab === "skills" ? styles.active : ""}`}
              onClick={() => onTabChange("skills")}
            >
              技能
            </button>
            <button
              className={`${styles.tab} ${activeTab === "shop" ? styles.active : ""}`}
              onClick={() => onTabChange("shop")}
            >
              商店
            </button>
          </div>
          <div className={styles.tabContent}>
            {activeTab === "inventory" && <InventoryPanel character={character} onAction={onAction} />}
            {activeTab === "equipment" && <EquipmentPanel character={character} onAction={onAction} />}
            {activeTab === "skills" && <SkillsPanel character={character} />}
            {activeTab === "shop" && <ShopPanel character={character} onAction={onAction} />}
          </div>
        </div>
      </div>
    </div>
  )
}
