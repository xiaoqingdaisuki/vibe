"use client"

import type { Character, LogEntry, ActiveTab } from "../types"
import { CharacterPanel } from "./CharacterPanel"
import { GameLog } from "./GameLog"
import { InventoryPanel } from "./InventoryPanel"
import { EquipmentPanel } from "./EquipmentPanel"
import { SkillsPanel } from "./SkillsPanel"
import { ShopPanel } from "./ShopPanel"
import styles from "./Game.module.css"

interface GameLayoutProps {
  character: Character
  logs: LogEntry[]
  activeTab: ActiveTab
  nextCombatIn: number | null
  onTabChange: (tab: ActiveTab) => void
  onCommand: (cmd: string, args?: string[]) => void
  getRestCooldown?: () => number
}

export function GameLayout({
  character,
  logs,
  activeTab,
  nextCombatIn,
  onTabChange,
  onCommand,
  getRestCooldown,
}: GameLayoutProps) {
  return (
    <div className={styles.gameContainer}>
      <div className={styles.gameLayout}>
        {/* Left Panel - Character */}
        <div className={styles.leftPanel}>
          <CharacterPanel
            character={character}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onCommand={onCommand}
            getRestCooldown={getRestCooldown}
          />
        </div>

        {/* Center - Combat Log */}
        <div className={styles.centerPanel}>
          <GameLog
            logs={logs}
            character={character}
            nextCombatIn={nextCombatIn}
          />
        </div>

        {/* Right Panel - Tabs */}
        <div className={styles.rightPanel}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "inventory" ? styles.active : ""}`}
              onClick={() => onTabChange("inventory")}
            >
              背包
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
            {activeTab === "inventory" && <InventoryPanel character={character} onCommand={onCommand} />}
            {activeTab === "equipment" && <EquipmentPanel character={character} onCommand={onCommand} />}
            {activeTab === "skills" && <SkillsPanel character={character} onCommand={onCommand} />}
            {activeTab === "shop" && <ShopPanel character={character} onCommand={onCommand} />}
          </div>
        </div>
      </div>
    </div>
  )
}
