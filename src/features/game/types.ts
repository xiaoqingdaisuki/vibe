export type ClassType = "warrior" | "mage" | "rogue"

export type ItemType = "material" | "equipment" | "chest" | "skill_book"
export type EquipSlot = "weapon" | "armor" | "accessory"
export type ItemRarity =
  | "common"       // 灰色 普通
  | "uncommon"     // 绿色 精良
  | "rare"         // 蓝色 稀有
  | "epic"         // 紫色 史诗
  | "legendary"    // 橙色 传说
  | "mythic"       // 红色 神话
  | "transcendent" // 金色 超越

export type LogType = "combat" | "loot" | "levelup" | "info" | "system"

export type ActiveTab = "inventory" | "equipment" | "skills" | "shop"

export interface Stats {
  str: number
  dex: number
  int: number
  vit: number
  luk: number
}

export type ItemStats = Partial<Stats> | Record<ClassType, Partial<Stats>>

export interface Item {
  id: string
  name: string
  type: ItemType
  slot?: EquipSlot
  stats?: ItemStats
  rarity: ItemRarity
  description: string
  scaleWithClass?: boolean
  minLevel?: number
  classRequired?: ClassType
}

export interface Equipment {
  weapon: Item | null
  armor: Item | null
  accessory: Item | null
  [key: string]: Item | null
}

export interface SkillInstance {
  skillId: string
  level: number
}

// Per-round combat detail
export interface CombatRoundDetail {
  round: number
  playerDmg: number
  monsterHpAfter: number
  monsterDmg: number
  playerHpAfter: number
  isCritical: boolean
  isDodged: boolean
  skillUsed?: string       // skill name if a skill was activated this round
}

export interface LogEntry {
  id?: number
  timestamp: number
  text: string
  type: LogType
  rarity?: ItemRarity
  details?: CombatRoundDetail[]
  difficulty?: number
}

export interface Character {
  username: string
  name: string
  class: ClassType
  level: number
  exp: number
  expToNext: number
  stats: Stats
  hp: number
  maxHp: number
  gold: number
  inventory: Item[]
  equipment: Equipment
  skills: SkillInstance[]
  skillUsage: Record<string, number>  // skillId -> total usage count
  lastActive: number
  createdAt: string
  // Computed combat stats (populated by GameEngine before rendering)
  _combatAtk?: number
  _combatDef?: number
  _combatSpell?: number
  // Rest cooldown timestamp (ms); null = ready
  lastRestTime?: number
}

export interface CharacterWithNew extends Character {
  isNew?: boolean
}

export interface GameState {
  character: Character | null
  logs: LogEntry[]
  connected: boolean
  activeTab: ActiveTab
  nextCombatIn: number | null
}

export type GameAction =
  | { type: "ADD_LOG"; payload: LogEntry }
  | { type: "UPDATE_CHAR"; payload: Character }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_ACTIVE_TAB"; payload: ActiveTab }
  | { type: "SET_COMBAT_TIMER"; payload: number | null }
  | { type: "CLEAR_LOGS" }

export type GameInteraction =
  | { type: "equip"; slot: EquipSlot; itemName: string }
  | { type: "unequip"; slot: EquipSlot }
  | { type: "use"; itemName: string }
  | { type: "open"; itemName: string }
  | { type: "rest" }
  | { type: "buy"; itemName: string; count?: number }
  | { type: "sell"; itemName: string; count?: number }
  | { type: "command"; value: string }

export interface ShopItem {
  itemId: string
  price: number
  currency: "gold"
  minLevel?: number
}

export interface ClassDef {
  id: ClassType
  name: string
  description: string
  baseStats: Stats
  baseHp: number
  growthPerLevel: Partial<Stats>
  startingSkills: string[]
  mainStat: keyof Stats  // warrior=str, mage=int, rogue=dex
}

export interface ItemDef {
  id: string
  name: string
  type: ItemType
  slot?: EquipSlot
  stats?: ItemStats
  rarity: ItemRarity
  description: string
  minLevel: number
  scaleWithClass?: boolean // true → stats are per-class at equip time
  classRequired?: ClassType // required class to equip (undefined = any class)
}

export interface SkillDef {
  id: string
  name: string
  description: string
  type: "active" | "passive"
  mpCost: number
  effect: SkillEffect
  maxLevel: number
  classRequired?: ClassType
  cooldown: number  // number of rounds before this skill can be used again (0 = no cooldown)
}

export interface SkillEffect {
  type: "damage" | "heal" | "buff"
  value: number
  target: "self" | "enemy"
}

export interface LootEntry {
  itemId: string
  chance: number
  minCount: number
  maxCount: number
}

export interface MonsterDef {
  id: string
  name: string
  hp: number
  atk: number
  def: number
  expReward: number
  goldReward: number
  lootTable: LootEntry[]
}

export interface CombatResult {
  victory: boolean
  rounds: number
  playerDmgDealt: number
  playerDmgTaken: number
  isCritical: boolean
  isDodged: boolean
  expGained: number
  goldGained: number
  itemsGained: Item[]
  levelUp: boolean
  newLevel?: number
  monsterLevel: number
  monsterName: string
  roundDetails: CombatRoundDetail[]
  difficulty: number
}

export interface OfflineResult {
  totalCombats: number
  totalWins: number
  totalLosses: number
  totalExpGained: number
  totalGoldGained: number
  totalItemsGained: Item[]
  levelUps: number
}
