import type { ClassDef, ClassType, SkillDef, MonsterDef, ItemDef, LootEntry, ItemRarity, Stats, ItemStats, ShopItem } from "./types.ts"

export const CLASSES: ClassDef[] = [
  {
    id: "warrior",
    name: "战士",
    description: "高 HP、高力量的近战型职业，擅长正面刚",
    baseStats: { str: 4, dex: 3, int: 2, vit: 4, luk: 3 },
    baseHp: 70,
    growthPerLevel: { str: 2, vit: 2, dex: 1, int: 1, luk: 1 },
    startingSkills: ["power_strike"],
    mainStat: "str",
  },
  {
    id: "mage",
    name: "法师",
    description: "高智力的魔法型职业，能释放强力法术",
    baseStats: { str: 2, dex: 3, int: 4, vit: 3, luk: 3 },
    baseHp: 45,
    growthPerLevel: { int: 2, vit: 1, str: 1, dex: 1, luk: 1 },
    startingSkills: ["fireball"],
    mainStat: "int",
  },
  {
    id: "rogue",
    name: "盗贼",
    description: "高敏捷、高幸运的暴击型职业，来去如风",
    baseStats: { str: 3, dex: 5, int: 2, vit: 3, luk: 4 },
    baseHp: 55,
    growthPerLevel: { dex: 2, luk: 2, str: 1, int: 1, vit: 1 },
    startingSkills: ["backstab"],
    mainStat: "dex",
  },
]

export const SKILLS: SkillDef[] = [
  // 战士技能
  {
    id: "power_strike",
    name: "重击",
    description: "造成 150% 物理伤害",
    type: "active",
    mpCost: 5,
    effect: { type: "damage", value: 1.5, target: "enemy" },
    maxLevel: 10,
    classRequired: "warrior",
    cooldown: 6,
  },
  {
    id: "shield_wall",
    name: "盾墙",
    description: "本场战斗减伤 50%",
    type: "active",
    mpCost: 8,
    effect: { type: "buff", value: 0.5, target: "self" },
    maxLevel: 10,
    classRequired: "warrior",
    cooldown: 99, // once per combat
  },
  {
    id: "war_cry",
    name: "战吼",
    description: "本场战斗攻击 +30%",
    type: "active",
    mpCost: 10,
    effect: { type: "buff", value: 0.3, target: "self" },
    maxLevel: 10,
    classRequired: "warrior",
    cooldown: 99, // once per combat
  },
  // 法师技能
  {
    id: "fireball",
    name: "火球术",
    description: "造成 180% 魔法伤害",
    type: "active",
    mpCost: 15,
    effect: { type: "damage", value: 1.8, target: "enemy" },
    maxLevel: 10,
    classRequired: "mage",
    cooldown: 3,
  },
  {
    id: "heal",
    name: "治愈术",
    description: "恢复 50% HP",
    type: "active",
    mpCost: 18,
    effect: { type: "heal", value: 0.5, target: "self" },
    maxLevel: 10,
    classRequired: "mage",
    cooldown: 5,
  },
  {
    id: "magic_shield",
    name: "魔力护盾",
    description: "本场战斗受到伤害 -30%",
    type: "active",
    mpCost: 22,
    effect: { type: "buff", value: 0.3, target: "self" },
    maxLevel: 10,
    classRequired: "mage",
    cooldown: 99, // once per combat
  },
  // 盗贼技能
  {
    id: "backstab",
    name: "背刺",
    description: "造成 200% 物理伤害（暴击率翻倍）",
    type: "active",
    mpCost: 8,
    effect: { type: "damage", value: 2.0, target: "enemy" },
    maxLevel: 10,
    classRequired: "rogue",
    cooldown: 4,
  },
  {
    id: "dodge",
    name: "闪避",
    description: "本回合 100% 闪避",
    type: "active",
    mpCost: 10,
    effect: { type: "buff", value: 1.0, target: "self" },
    maxLevel: 10,
    classRequired: "rogue",
    cooldown: 99, // once per combat
  },
  {
    id: "poison_blade",
    name: "毒刃",
    description: "造成 120% 伤害 + 持续毒伤",
    type: "active",
    mpCost: 14,
    effect: { type: "damage", value: 1.2, target: "enemy" },
    maxLevel: 10,
    classRequired: "rogue",
    cooldown: 4,
  },
]

// ── Skill Activation Categories ────────────────────────────────────────────
// damage: activates every combat round (伤害型)
// heal:   activates only when HP < 35% (治疗型)
// buff:   activates once per combat, at round start (增益型)

export const SKILL_CATEGORY: Record<string, "damage" | "heal" | "buff"> = {
  power_strike:  "damage",
  shield_wall:   "buff",
  war_cry:       "buff",
  fireball:      "damage",
  heal:          "heal",
  magic_shield:  "buff",
  backstab:      "damage",
  dodge:         "buff",
  poison_blade:  "damage",
}

// Difficulty tiers: stat multiplier = 1 + tier * 0.4
export interface DifficultyTier {
  tier: number
  name: string
  minLevel: number
  maxLevel: number
  description: string
}

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { tier: 1, name: "简单",   minLevel: 1,  maxLevel: 5,  description: "怪物属性正常" },
  { tier: 2, name: "中等",   minLevel: 5,  maxLevel: 10, description: "怪物属性 ×1.8" },
  { tier: 3, name: "困难",   minLevel: 10, maxLevel: 20, description: "怪物属性 ×2.6，需要对应等级装备" },
  { tier: 4, name: "极难",   minLevel: 20, maxLevel: 29, description: "怪物属性 ×3.4，穿满装备也极难通过" },
  { tier: 5, name: "不可能", minLevel: 30, maxLevel: 30, description: "理论上无法到达" },
]

// ── Equipment Stat Curves ────────────────────────────────────────────────────
// Quadratic formulas for base stat value at a given level.
// Level 1 = ~4, Level 10 = ~4-6, Level 25 = ~14-22 base per slot.
// Combined with rarity bonus (×1 to ×64), this produces reasonable endgame numbers
// without the old array-based system's inflated values.

function wpnStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.02)
}

function armorStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.015)
}

function accStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.01)
}

// Rarity bonus multiplier: common=1x, uncommon=2x, rare=4x, epic=8x, legendary=16x, mythic=32x, transcendent=64x
// (rarityBonus function already handles this)

// ── Rarity System ──────────────────────────────────────────────────────────
// 灰色 → 绿 → 蓝 → 紫 → 橙 → 红 → 金色
// Drop rate from a COMMON chest (higher chests multiply each tier):
//   common 65%, uncommon 8%, rare 22%, epic 3.5%, legendary 2.5%, mythic 0.15%, transcendent 0.001%

export const RARITY_ORDER: ItemDef["rarity"][] = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "transcendent",
]

export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: "普通",
  uncommon: "精良",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
  mythic: "神话",
  transcendent: "超越",
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common:       "#9ca3af", // 灰
  uncommon:     "#22c55e", // 绿
  rare:         "#3b82f6", // 蓝
  epic:         "#a855f7", // 紫
  legendary:    "#f97316", // 橙
  mythic:       "#ef4444", // 红
  transcendent: "#fbbf24", // 金
}

// Individual drop probability for each rarity from a common chest.
// These are TRUE probabilities — the rollRarity function treats them as
// cumulative thresholds from highest to lowest rarity.
// 灰68% / 绿22% / 蓝8% / 紫1.5% / 橙0.5% / 红0.1% / 金0.001%
export const RARITY_BASE_CHANCE: Record<ItemRarity, number> = {
  common:       0.68,    // 68%
  uncommon:     0.22,    // 22%
  rare:         0.08,    // 8%
  epic:         0.015,   // 1.5%
  legendary:    0.005,   // 0.5%
  mythic:       0.001,  // 0.1%
  transcendent: 0.00001, // 0.001%
}

// How many times each chest multiplies the rarity chance
export const CHEST_RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 12,
  epic: 50,
  legendary: 100,
  mythic: 100,
  transcendent: 100,
}

// ── Rarity helpers ──────────────────────────────────────────────────────────

export function rollRarity(chestRarity: ItemRarity): ItemRarity {
  const mult = CHEST_RARITY_MULTIPLIER[chestRarity]
  const roll = Math.random()

  // Build cumulative thresholds from highest to lowest rarity
  // Each entry is the upper bound (inclusive) for that rarity
  const tiers: ItemRarity[] = ["transcendent", "mythic", "legendary", "epic", "rare", "uncommon", "common"]
  let cumulative = 0

  for (const rarity of tiers) {
    cumulative += RARITY_BASE_CHANCE[rarity] * mult
    if (roll < Math.min(cumulative, 1)) return rarity
  }
  return "common"
}

function rarityIndex(rarity: ItemRarity): number {
  return RARITY_ORDER.indexOf(rarity)
}

function rarityBonus(rarity: ItemRarity): number {
  const idx = rarityIndex(rarity)
  // Exponential: common=1x, uncommon=2x, rare=4x, epic=8x, legendary=16x, mythic=32x, transcendent=64x
  return Math.pow(2, idx)
}

// Recalculate equipment stats for a new rarity (used when chest rolls a higher rarity than the item's base)
export function recalcItemStats(baseItem: ItemDef, newRarity: ItemRarity): { stats: ItemStats; scaleWithClass: boolean } {
  const slot = baseItem.slot || "weapon"
  return buildItemStats(baseItem.minLevel, newRarity, slot)
}

// ── Skill System ────────────────────────────────────────────────────────────
// Each skill level adds +20% to the base effect value.
// Level-up requires 1000 uses per level.
// Levels 1-8: guaranteed on 1000 uses.
// Levels 9-10: 50% chance on 1000 uses.

export const SKILL_USES_PER_LEVEL = 1000

/**
 * Returns the scaled effect value for a skill at a given level.
 * Level 1 = base value, each additional level +20%.
 */
export function getSkillEffectValue(skillDef: SkillDef, skillLevel: number): number {
  const base = skillDef.effect.value
  return Math.floor(base * (1 + (skillLevel - 1) * 0.2) * 100) / 100
}

/**
 * Attempts to level up a skill.
 * Each level requires 1000 uses.
 * Levels 1-8: guaranteed success at 1000 uses.
 * Levels 9-10: 50% success chance at 1000 uses. On failure, progress resets to 0.
 *
 * @param skillUsage - the per-skill usage counter (modified in-place on failure)
 * @param skillId - the skill ID
 * @param currentLevel - current skill level
 * @returns { leveledUp, newLevel, usage } where usage is the counter AFTER this attempt
 */
export function tryLevelUpSkill(
  skillUsage: Record<string, number>,
  skillId: string,
  currentLevel: number,
): { leveledUp: boolean; newLevel: number; usage: number } {
  if (currentLevel >= 10) {
    return { leveledUp: false, newLevel: currentLevel, usage: skillUsage[skillId] ?? 0 }
  }

  const usage = (skillUsage[skillId] ?? 0) + 1
  skillUsage[skillId] = usage

  // Every level requires exactly 1000 uses
  if (usage < SKILL_USES_PER_LEVEL) {
    return { leveledUp: false, newLevel: currentLevel, usage }
  }

  // Hit 1000 uses — attempt level-up
  if (currentLevel >= 9 && Math.random() >= 0.5) {
    // 50% fail at Lv.9/10: reset progress
    skillUsage[skillId] = 0
    return { leveledUp: false, newLevel: currentLevel, usage: 0 }
  }

  // Success: level up and reset counter
  skillUsage[skillId] = 0
  return { leveledUp: true, newLevel: currentLevel + 1, usage: 0 }
}

// ── Stat Builder ───────────────────────────────────────────────────────────
// Returns stats for a given slot + class + level + rarity combo.
// scaleWithClass=true → the per-class stats dict is stored; resolved at equip time.

function buildItemStats(
  level: number, rarity: ItemRarity, slot: string
): { stats: Record<ClassType, Partial<Stats>>; scaleWithClass: boolean; mainStatValue: number } {
  const bonus = rarityBonus(rarity)
  const lv = Math.max(1, level)
  let stats: Record<ClassType, Partial<Stats>>

  if (slot === "weapon") {
    const base = wpnStat(lv)
    stats = {
      warrior: { str: Math.floor(base * bonus) },
      mage:    { int: Math.floor(base * bonus) },
      rogue:   { dex: Math.floor(base * bonus) },
    }
  } else if (slot === "armor") {
    const base = armorStat(lv)
    // All armor provides VIT (defense stat), keeping it simple and uniform
    stats = {
      warrior: { vit: Math.floor(base * bonus) },
      mage:    { vit: Math.floor(base * bonus) },
      rogue:   { vit: Math.floor(base * bonus) },
    }
  } else {
    const base = accStat(lv)
    stats = {
      warrior: { str: Math.floor(base * bonus) },
      mage:    { int: Math.floor(base * bonus) },
      rogue:   { luk: Math.floor(base * bonus) },
    }
  }

  return { stats, scaleWithClass: true, mainStatValue: 0 }
}

// Resolve per-class stats dict to the actual class's stats
function isFlatStats(stats: ItemStats): stats is Partial<Stats> {
  const flatStats = stats as Partial<Stats>
  return ["str", "dex", "int", "vit", "luk"].some((key) => flatStats[key as keyof Stats] !== undefined)
}

export function resolveStatsForClass(
  stats: ItemStats | undefined,
  classId: ClassType,
): Partial<Stats> | undefined {
  if (!stats) return undefined
  return isFlatStats(stats) ? stats : stats[classId]
}

/**
 * Extract the main combat stat value from an item's stats.
 * Handles both formats:
 *   - Pre-equip:  { mage: { int: 10 } } (per-class dict, scaleWithClass=true)
 *   - Post-equip: { int: 10 } (resolved flat stats, scaleWithClass cleared)
 */
export function resolveMainStatValue(stats: ItemStats | undefined, classId: ClassType): number {
  if (!stats) return 0

  // Pre-equip: nested class dict { classId: { mainStat: value } }
  if (!isFlatStats(stats)) {
    const classStats = stats[classId]
    if (classId === "warrior") return classStats.str || 0
    if (classId === "mage") return classStats.int || 0
    if (classId === "rogue") return classStats.dex || 0
  }

  // Post-equip: flat resolved stats { str: 10 } or { int: 10 }
  const flatStats = stats as Partial<Stats>
  const statKey = classId === "warrior" ? "str" : classId === "mage" ? "int" : "dex"
  return flatStats[statKey] || 0
}

// ── Equipment Name Tables ───────────────────────────────────────────────────
const WEAPON_NAMES = [
  "铁","钢","精钢","秘银","寒铁","烈焰","冰霜","雷霆","圣光","暗影",
  "龙牙","凤翼","麒麟","白虎","玄武","朱雀","青龙","混沌","太古","神话",
  "天堑","斩星","碎虚","破灭","创世",
]
const ARMOR_NAMES = [
  "皮","锁","钢","秘银","寒铁","烈焰","冰霜","雷霆","圣光","暗影",
  "龙鳞","凤羽","麒麟","白虎","玄武","朱雀","青龙","混沌","太古","神话",
  "天堑","碎虚","破灭","创世","永恒",
]
const WEAPON_LABEL: Record<string, string> = { warrior: "剑", mage: "法杖", rogue: "匕首" }
const ARMOR_LABEL:  Record<string, string> = { warrior: "战甲", mage: "长袍", rogue: "皮衣" }

// ── Item Generation ────────────────────────────────────────────────────────

/**
 * Generates a random item level for chest rewards.
 * Normal rarities: [max(1, charLevel-2), min(25, charLevel+3)] — biased near charLevel
 * Transcendent (最稀有): always at character level (special logic)
 */
function getChestItemLevel(charLevel: number, rarity: ItemRarity): number {
  if (rarity === "transcendent") {
    // 超越品质特殊逻辑：始终等于角色等级
    return Math.max(1, Math.min(25, charLevel))
  }
  const lo = Math.max(1, charLevel - 2)
  const hi = Math.min(25, charLevel + 3)
  if (lo > hi) return hi
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

/**
 * Generate all equipment definitions.
 * Items are pre-rolled with random rarity (so the database has variety).
 * When a chest is opened, the engine picks from these pools and re-rolls rarity
 * according to chest tier via rollRarity().
 */
function generateEquipment(): ItemDef[] {
  const items: ItemDef[] = []
  const SLOTS: Array<"weapon" | "armor" | "accessory"> = ["weapon", "armor", "accessory"]

  for (const cls of CLASSES) {
    // Per-level weapon & armor (25 per class per slot)
    for (let level = 1; level <= 25; level++) {
      for (const slot of SLOTS.slice(0, 2)) {
        const rarity = rollRarity("common") // random base rarity
        const { stats, scaleWithClass } = buildItemStats(level, rarity, slot)
        const mat = slot === "weapon"
          ? WEAPON_NAMES[Math.min(level - 1, WEAPON_NAMES.length - 1)]
          : ARMOR_NAMES[Math.min(level - 1, ARMOR_NAMES.length - 1)]
        const label = slot === "weapon" ? WEAPON_LABEL[cls.id] : ARMOR_LABEL[cls.id]

        items.push({
          id: `${cls.id}_${slot}_${String(level).padStart(2, "0")}`,
          name: `${mat}${label}`,
          type: "equipment",
          slot,
          stats,
          rarity,
          scaleWithClass,
          description: `${RARITY_LABELS[rarity]}${mat}${label} Lv.${level}`,
          minLevel: level,
          classRequired: cls.id,
        })
      }
    }

    // Accessories (8 per class, fixed names)
    const accNames = ["力量护符","敏捷戒指","智慧之戒","体力项链","幸运饰品","勇者勋章","守护之盾","王者之冠"]
    const accMinLevels = [3, 5, 10, 15, 18, 22, 25, 25]

    for (let i = 0; i < accNames.length; i++) {
      const rarity = rollRarity("common")
      const { stats, scaleWithClass } = buildItemStats(accMinLevels[i], rarity, "accessory")
      items.push({
        id: `${cls.id}_acc_${String(i + 1).padStart(2, "0")}`,
        name: accNames[i],
        type: "equipment",
        slot: "accessory",
        stats,
        rarity,
        scaleWithClass,
        description: accNames[i],
        minLevel: accMinLevels[i],
        classRequired: cls.id,
      })
    }
  }

  return items
}

/**
 * Get a random equipment ItemDef from the pool, with rarity re-rolled
 * according to the opening chest's tier and level restricted to the
 * character's level range.
 */
export function randomEquipItem(chestRarity: ItemRarity, charLevel: number, _charClass: ClassType): ItemDef | undefined {
  // Chests can drop ANY class's equipment — class restriction is enforced at equip time
  const allEquip = ITEMS.filter(it => it.type === "equipment")
  if (allEquip.length === 0) return undefined

  // Pick a random base item
  const base = allEquip[Math.floor(Math.random() * allEquip.length)]
  if (!base) return undefined

  // Re-roll rarity based on chest tier
  const newRarity = rollRarity(chestRarity)

  // Generate level within [1, charLevel+3] (closest to charLevel)
  // Transcendent items always drop at character level
  const level = getChestItemLevel(charLevel, newRarity)

  // Rebuild stats for the new rarity (keeping same slot)
  const slot = base.slot || "weapon"
  const isAccessory = slot === "accessory"
  const { stats, scaleWithClass } = buildItemStats(level, newRarity, slot)

  // Accessories keep their original fixed name; weapons/armor get material-based names
  const name = isAccessory
    ? base.name
    : `${WEAPON_NAMES[Math.min(level - 1, WEAPON_NAMES.length - 1)]}${slot === "weapon" ? WEAPON_LABEL[base.id.split("_")[0]] : ARMOR_LABEL[base.id.split("_")[0]]}`

  const description = `${RARITY_LABELS[newRarity]}${name} Lv.${level}`

  return {
    ...base,
    id: `${base.id.split("_").slice(0, 2).join("_")}_${String(level).padStart(2, "0")}_${newRarity}`,
    name,
    stats,
    rarity: newRarity,
    scaleWithClass,
    description,
    minLevel: level,
  }
}

export const ITEMS: ItemDef[] = [
  // Treasure chests (7 tiers)
  { id: "common_chest",       name: "普通宝箱",   type: "chest", rarity: "common",    description: "开启后随机获得物品", minLevel: 1 },
  { id: "uncommon_chest",     name: "精良宝箱",   type: "chest", rarity: "uncommon",  description: "开启后随机获得精良以上物品", minLevel: 1 },
  { id: "rare_chest",         name: "稀有宝箱",   type: "chest", rarity: "rare",      description: "开启后随机获得稀有以上物品", minLevel: 1 },
  { id: "epic_chest",         name: "史诗宝箱",   type: "chest", rarity: "epic",      description: "开启后随机获得史诗以上物品", minLevel: 1 },
  { id: "legendary_chest",    name: "传说宝箱",   type: "chest", rarity: "legendary", description: "开启后随机获得传说以上物品", minLevel: 1 },
  { id: "mythic_chest",       name: "神话宝箱",   type: "chest", rarity: "mythic",    description: "开启后随机获得神话以上物品", minLevel: 1 },
  { id: "transcendent_chest", name: "超越宝箱",   type: "chest", rarity: "transcendent", description: "开启后随机获得超越物品", minLevel: 1 },
  // Skill books (legendary rarity, 1% flat drop from any chest)
  { id: "skill_book_warrior", name: "战士技能书", type: "skill_book", rarity: "legendary", description: "随机学习一个战士技能", minLevel: 1 },
  { id: "skill_book_mage",    name: "法师技能书", type: "skill_book", rarity: "legendary", description: "随机学习一个法师技能", minLevel: 1 },
  { id: "skill_book_rogue",   name: "盗贼技能书", type: "skill_book", rarity: "legendary", description: "随机学习一个盗贼技能", minLevel: 1 },
  // Generated equipment
  ...generateEquipment(),
]

// Monster loot: one shared base lootTable for all 30 monsters.
// Base probabilities (at tier 1):
//   common=30%, uncommon=4%, rare=0.8%, epic=0.3%, legendary=0.03%, mythic=0.003%, transcendent=0.0003%
// Higher rarity chances scale with the monster's static difficulty tier:
//   each tier adds +10% to all non-common chest chances (capped at 100%).
const CHEST_LOOT_BASE: LootEntry[] = [
  { itemId: "common_chest",      chance: 0.30,      minCount: 1, maxCount: 1 },
  { itemId: "uncommon_chest",    chance: 0.04,      minCount: 1, maxCount: 1 },
  { itemId: "rare_chest",        chance: 0.008,     minCount: 1, maxCount: 1 },
  { itemId: "epic_chest",        chance: 0.003,     minCount: 1, maxCount: 1 },
  { itemId: "legendary_chest",   chance: 0.0003,    minCount: 1, maxCount: 1 },
  { itemId: "mythic_chest",      chance: 0.00003,   minCount: 1, maxCount: 1 },
  { itemId: "transcendent_chest",chance: 0.000003,  minCount: 1, maxCount: 1 },
]

/**
 * Returns a tier-scaled loot table based on the monster's static difficulty tier.
 * Common chest is always included. Higher rarity chances scale +10% per tier above 1 (capped at 100%).
 * @param tier - static difficulty tier (1 = easy, max 5 = impossible)
 * @returns scaled loot entries
 */
export function getTierLootTable(tier: number): LootEntry[] {
  const scale = 1 + (tier - 1) * 0.1
  return CHEST_LOOT_BASE.map(entry => ({
    ...entry,
    chance: Math.min(1, entry.chance * scale),
  }))
}

export const MONSTERS: MonsterDef[] = [
  // Level 1-5: Slime family
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 1
    return {
      id: `slime_${level}`,
      name: level <= 2 ? "小史莱姆" : level <= 4 ? "绿色史莱姆" : "巨型史莱姆",
      hp: 30 + level * 12,
      atk: 3 + level * 2,
      def: 1 + level * 0.5,
      expReward: 15 + level * 3,
      goldReward: 5 + level * 2,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
  // Level 6-10: Goblin family
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 6
    return {
      id: `goblin_${level}`,
      name: level <= 7 ? "哥布林" : level <= 9 ? "哥布林战士" : "哥布林队长",
      hp: 50 + level * 15,
      atk: 6 + level * 3,
      def: 2 + level * 0.8,
      expReward: 25 + level * 4,
      goldReward: 8 + level * 3,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
  // Level 11-15: Skeleton family
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 11
    return {
      id: `skeleton_${level}`,
      name: level <= 12 ? "骷髅兵" : level <= 14 ? "骷髅弓手" : "骷髅领主",
      hp: 80 + level * 20,
      atk: 10 + level * 3.5,
      def: 4 + level * 1,
      expReward: 40 + level * 5,
      goldReward: 12 + level * 4,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
  // Level 16-20: Orc family
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 16
    return {
      id: `orc_${level}`,
      name: level <= 17 ? "兽人" : level <= 19 ? "兽人战士" : "兽人督军",
      hp: 120 + level * 25,
      atk: 16 + level * 4,
      def: 6 + level * 1.2,
      expReward: 60 + level * 6,
      goldReward: 18 + level * 5,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
  // Level 21-25: Demon family
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 21
    return {
      id: `demon_${level}`,
      name: level <= 22 ? "恶魔" : level <= 24 ? "恶魔骑士" : "恶魔领主",
      hp: 200 + level * 35,
      atk: 25 + level * 5,
      def: 10 + level * 1.5,
      expReward: 100 + level * 8,
      goldReward: 30 + level * 7,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
  // Level 26-30: Dragon family (theoretical)
  ...Array.from({ length: 5 }, (_, i) => {
    const level = i + 26
    return {
      id: `dragon_${level}`,
      name: level <= 27 ? "幼龙" : level <= 29 ? "古龙" : "龙王",
      hp: 400 + level * 50,
      atk: 40 + level * 6,
      def: 15 + level * 2,
      expReward: 200 + level * 15,
      goldReward: 50 + level * 10,
      lootTable: CHEST_LOOT_BASE,
    }
  }),
]

export const SHOP_ITEMS: ShopItem[] = [
  // Green (uncommon) equipment — weapon and armor only, per class/level
  ...ITEMS.filter(item => item.type === "equipment" && item.rarity === "uncommon" && (item.slot === "weapon" || item.slot === "armor")).map(item => ({
    itemId: item.id,
    price: Math.max(50, item.minLevel * 30),
    currency: "gold" as const,
    minLevel: item.minLevel,
  })),

  // Chests (1K - 1M)
  { itemId: "common_chest",       price: 1_000,     currency: "gold" as const },
  { itemId: "uncommon_chest",     price: 10_000,    currency: "gold" as const },
  { itemId: "rare_chest",         price: 50_000,    currency: "gold" as const },
  { itemId: "epic_chest",         price: 200_000,   currency: "gold" as const },
  { itemId: "legendary_chest",    price: 500_000,   currency: "gold" as const },
  { itemId: "mythic_chest",       price: 1_000_000, currency: "gold" as const },

  // Expensive skill books (100万 gold each)
  { itemId: "skill_book_warrior", price: 1_000_000, currency: "gold" as const },
  { itemId: "skill_book_mage",    price: 1_000_000, currency: "gold" as const },
  { itemId: "skill_book_rogue",   price: 1_000_000, currency: "gold" as const },
]
