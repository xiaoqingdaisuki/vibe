import type {
  Character,
  ClassType,
  Item,
  SkillInstance,
  CombatResult,
  OfflineResult,
  LogEntry,
  ClassDef,
  ItemDef,
  SkillDef,
  MonsterDef,
  CombatRoundDetail,
  ItemRarity,
} from "./types"
import { CLASSES, SKILLS, MONSTERS, SHOP_ITEMS, ITEMS, DIFFICULTY_TIERS, RARITY_LABELS, resolveStatsForClass, resolveMainStatValue, rollRarity, getSkillEffectValue, tryLevelUpSkill, SKILL_USES_PER_LEVEL, SKILL_CATEGORY, recalcItemStats } from "./static-data"

export class GameEngine {
  public character: Character
  public skillLevelUpLogs: { skillName: string; newLevel: number }[] = []
  public defeatLogs: string[] = []

  constructor(character: Character) {
    this.character = character
    // Backwards compat: ensure skillUsage exists
    if (!this.character.skillUsage) {
      this.character.skillUsage = {}
      for (const sk of this.character.skills) {
        this.character.skillUsage[sk.skillId] = 0
      }
    }
  }

  autoRetryCombat(): CombatResult {
    let monsterLevel = this.character.level
    let result!: CombatResult
    this.defeatLogs = []
    const maxRetries = 30

    for (let retry = 0; retry < maxRetries; retry++) {
      result = this.runCombat(monsterLevel)

      if (result.victory) break

      const monster = this.getMonster(monsterLevel)
      this.defeatLogs.push(`💀 被 Lv.${monsterLevel} ${monster.name} 击败，寻找更弱的对手...`)
      // Full restore after death before retrying lower-level monster
      this.character.hp = this.character.maxHp

      monsterLevel = Math.max(1, monsterLevel - 1)
      if (monsterLevel < 1) break
    }

    return result
  }

  runCombat(monsterLevel: number): CombatResult {
    const monster = this.getMonster(monsterLevel)
    const difficulty = this.getDifficultyTier(monsterLevel)
    let playerHp = this.character.hp
    let monsterHp = monster.hp
    let rounds = 0
    let playerDmgDealt = 0
    let playerDmgTaken = 0
    let isCritical = false
    let isDodged = false
    const roundDetails: CombatRoundDetail[] = []

    const playerAtk = this.calculatePlayerAtk()
    const playerDef = this.calculatePlayerDef()

    // Apply warrior weapon HP bonus (set during calculatePlayerAtk)
    if (this.character.class === "warrior") {
      playerHp += this._combatHpBonus
    }

    // Buffs applied this combat (each buff can only be applied once per combat)
    const appliedBuffs = new Set<string>()

    // Skill cooldowns: skillId -> remaining rounds
    const skillCooldowns: Record<string, number> = {}

    // Build lookup for class skills
    const classSkillIds = new Set(
      SKILLS.filter(s => !s.classRequired || s.classRequired === this.character.class).map(s => s.id)
    )
    const learnedSkills = this.character.skills.filter(sk => classSkillIds.has(sk.skillId) && sk.level > 0)

    while (playerHp > 0 && monsterHp > 0 && rounds < 100) {
      rounds++

      // Decrement cooldowns at start of round
      for (const key of Object.keys(skillCooldowns)) {
        skillCooldowns[key]--
        if (skillCooldowns[key] <= 0) delete skillCooldowns[key]
      }

      // --- Skill activation (before attack) ---
      let skillUsedName: string | undefined
      let skillDmgBonus = 0
      let skillHealAmount = 0

      if (learnedSkills.length > 0) {
        const skillResult = this.tryActivateSkill(learnedSkills, appliedBuffs, skillCooldowns, playerHp, this.character.maxHp)
        if (skillResult) {
          const { skillDef, skillInst, levelUp, newLevel } = skillResult
          skillUsedName = skillDef.name

          // Log level-up in combat
          if (levelUp) {
            this.skillLevelUpLogs.push({
              skillName: skillDef.name,
              newLevel,
            })
          }

          // Apply effect
          const category = SKILL_CATEGORY[skillInst.skillId] || "damage"
          if (category === "damage") {
            const scaledValue = getSkillEffectValue(skillDef, skillInst.level)
            // Mage skills use spell power (INT + weapon INT), others use ATK
            const damageSource = this.character.class === "mage"
              ? this.getSpellPower()
              : playerAtk
            skillDmgBonus = Math.floor(damageSource * (scaledValue - 1))
          } else if (category === "heal") {
            const scaledValue = getSkillEffectValue(skillDef, skillInst.level)
            skillHealAmount = Math.floor(this.character.maxHp * scaledValue)
            playerHp = Math.min(this.character.maxHp, playerHp + skillHealAmount)
          }
          // buff: tracked in appliedBuffs, applied in calculatePlayerAtk/Def
        }
      }

      // Player attack
      const playerDamage = this.calculateDamage(playerAtk, monster.def)
      const critical = this.rollCritical()
      const finalDamage = critical ? Math.floor(playerDamage * 2) : playerDamage

      monsterHp -= finalDamage + skillDmgBonus
      playerDmgDealt += finalDamage + skillDmgBonus
      isCritical = critical

      const totalDamage = finalDamage + skillDmgBonus
      const roundDetail: CombatRoundDetail = {
        round: rounds,
        playerDmg: totalDamage,
        monsterHpAfter: Math.max(0, monsterHp),
        monsterDmg: 0,
        playerHpAfter: playerHp,
        isCritical: critical,
        isDodged: false,
        skillUsed: skillUsedName,
      }

      if (monsterHp <= 0) {
        roundDetails.push(roundDetail)
        break
      }

      // Monster attack
      const dodgeRoll = this.rollDodge()
      if (dodgeRoll) {
        isDodged = true
        roundDetail.isDodged = true
        roundDetail.monsterDmg = 0
        roundDetail.playerHpAfter = playerHp
      } else {
        const monsterDamage = this.calculateDamage(monster.atk, playerDef)
        playerHp -= Math.floor(monsterDamage)
        playerDmgTaken += Math.floor(monsterDamage)
        isDodged = false
        roundDetail.monsterDmg = Math.floor(monsterDamage)
        roundDetail.playerHpAfter = Math.max(0, playerHp)
      }

      roundDetails.push(roundDetail)
    }

    const victory = monsterHp <= 0
    const result: CombatResult = {
      victory,
      rounds,
      playerDmgDealt,
      playerDmgTaken,
      isCritical,
      isDodged,
      expGained: 0,
      goldGained: 0,
      itemsGained: [],
      levelUp: false,
      monsterLevel,
      monsterName: monster.name,
      roundDetails,
      difficulty,
    }

    if (victory) {
      const diffMult = 1 + (difficulty - 1) * 0.3
      const expGained = Math.floor((monster.expReward + Math.floor(monsterLevel * 2)) * diffMult)
      const goldGained = Math.floor((monster.goldReward + Math.floor(Math.random() * monsterLevel * 3)) * diffMult)

      result.expGained = expGained
      result.goldGained = goldGained

      this.character.hp = Math.max(0, playerHp)
      this.character.exp += expGained
      this.character.gold += goldGained

      result.itemsGained = this.rollLoot(monster.lootTable, monsterLevel)

      for (const item of result.itemsGained) {
        this.character.inventory.push(item)
      }

      result.levelUp = this.checkLevelUp()
      if (result.levelUp) {
        result.newLevel = this.character.level
      }
    } else {
      this.character.hp = Math.floor(this.character.maxHp * 0.3)
    }

    this.refreshCombatStats()
    return result
  }

  executeCommand(cmd: string, args: string[]): { logs: LogEntry[]; character: Character } {
    const logs: LogEntry[] = []

    switch (cmd.toLowerCase()) {
      case "/bag":
      case "/inventory":
        logs.push(...this.showInventory())
        break

      case "/equip": {
        if (args.length < 2) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /equip <部位> <物品名>",
            type: "info",
          })
        } else {
          logs.push(...this.equipItem(args[0]!, args[1]))
        }
        break
      }

      case "/unequip": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /unequip <部位>",
            type: "info",
          })
        } else {
          logs.push(...this.unequipItem(args[0]!))
        }
        break
      }

      case "/use": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /use <物品名>",
            type: "info",
          })
        } else {
          logs.push(...this.useItem(args[0]))
        }
        break
      }

      case "/learn": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /learn <技能名>",
            type: "info",
          })
        } else {
          logs.push(...this.learnSkill(args[0]))
        }
        break
      }

      case "/open": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /open <宝箱名>",
            type: "info",
          })
        } else {
          logs.push(...this.openChest(args[0]))
        }
        break
      }

      case "/skills": {
        logs.push(...this.showSkills())
        break
      }

      case "/rest": {
        logs.push(...this.rest())
        break
      }

      case "/shop": {
        logs.push(...this.showShop())
        break
      }

      case "/buy": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /buy <物品名> [数量]",
            type: "info",
          })
        } else {
          const count = args[1] ? parseInt(args[1]) : 1
          logs.push(...this.buyItem(args[0], count))
        }
        break
      }

      case "/sell": {
        if (args.length < 1) {
          logs.push({
            timestamp: Date.now(),
            text: "用法: /sell <物品名> [数量]",
            type: "info",
          })
        } else {
          const count = args[1] ? parseInt(args[1]) : 1
          logs.push(...this.sellItem(args[0], count))
        }
        break
      }

      case "/status": {
        logs.push(...this.showStatus())
        break
      }

      case "/help": {
        logs.push(...this.showHelp())
        break
      }

      case "/logout": {
        logs.push({
          timestamp: Date.now(),
          text: "已退出登录",
          type: "system",
        })
        break
      }

      default:
        logs.push({
          timestamp: Date.now(),
          text: `未知命令: ${cmd}，输入 /help 查看可用命令`,
          type: "info",
        })
    }

    this.refreshCombatStats()
    return {
      logs,
      character: this.character,
    }
  }

  /** Recalculate and attach combat stats to the character for UI display */
  refreshCombatStats(): void {
    this.character._combatAtk = this.getCombatAtk()
    this.character._combatDef = this.getCombatDef()
    this.character._combatSpell = this.getCombatSpellPower()
  }

  calculateOfflineProgress(): OfflineResult {
    const now = Date.now()
    const offlineMs = now - this.character.lastActive
    const offlineMinutes = Math.floor(offlineMs / 60000)
    // Reduced: only 15 minutes max offline
    const maxOfflineMinutes = 15

    const effectiveMinutes = Math.min(offlineMinutes, maxOfflineMinutes)
    // Reduced: 1 combat per 5 minutes offline
    const combats = Math.floor(effectiveMinutes / 5)

    const result: OfflineResult = {
      totalCombats: combats,
      totalWins: 0,
      totalLosses: 0,
      totalExpGained: 0,
      totalGoldGained: 0,
      totalItemsGained: [],
      levelUps: 0,
    }

    for (let i = 0; i < combats; i++) {
      const monster = this.getMonster(this.character.level)
      const playerAtk = this.calculatePlayerAtk()
      const playerDef = this.calculatePlayerDef()
      let playerHp = this.character.maxHp
      let monsterHp = monster.hp
      let rounds = 0
      let victory = false

      while (playerHp > 0 && monsterHp > 0 && rounds < 100) {
        rounds++
        monsterHp -= this.calculateDamage(playerAtk, monster.def)
        if (monsterHp <= 0) {
          victory = true
          break
        }
        playerHp -= this.calculateDamage(monster.atk, playerDef)
      }

      if (victory) {
        result.totalWins++
        const difficulty = this.getDifficultyTier(this.character.level)
        const diffMult = 1 + (difficulty - 1) * 0.3
        result.totalExpGained += Math.floor(monster.expReward * diffMult)
        result.totalGoldGained += monster.goldReward
        const loot = this.rollLoot(monster.lootTable, this.character.level)
        result.totalItemsGained.push(...loot)
      } else {
        result.totalLosses++
      }
    }

    if (result.totalWins > 0) {
      this.character.exp += result.totalExpGained
      this.character.gold += result.totalGoldGained
      for (const item of result.totalItemsGained) {
        this.character.inventory.push(item)
      }
      this.checkLevelUp()
    }

    this.character.lastActive = now
    this.refreshCombatStats()
    return result
  }

  formatCombatResult(result: CombatResult): string {
    const lines: string[] = []
    const diffNames: Record<number, string> = { 1: "简单", 2: "中等", 3: "困难", 4: "极难", 5: "不可能" }

    if (result.victory) {
      lines.push(`⚔️ 战斗胜利！`)
      lines.push(`⚔️ VS ${result.monsterName} Lv.${result.monsterLevel} [${diffNames[result.difficulty] || "?"}难度]`)
      lines.push(`📊 回合: ${result.rounds} | 伤害: ${result.playerDmgDealt} | 受伤: ${result.playerDmgTaken}`)
      lines.push(`💰 经验: +${result.expGained} | 金币: +${result.goldGained}`)
      if (result.itemsGained.length > 0) {
        for (const item of result.itemsGained) {
          const rarityLabel = RARITY_LABELS[item.rarity] || "普通"
          lines.push(`📦 掉落：[${rarityLabel}] ${item.name}`)
        }
      }
      if (result.levelUp) {
        lines.push(`🎉 升级了！当前等级：${result.newLevel}`)
      }
    } else {
      lines.push(`💀 战斗失败...`)
      lines.push(`⚔️ VS ${result.monsterName} Lv.${result.monsterLevel} [${diffNames[result.difficulty] || "?"}难度]`)
      lines.push(`📊 回合: ${result.rounds} | 伤害: ${result.playerDmgDealt} | 受伤: ${result.playerDmgTaken}`)
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  formatCombatDetail(result: CombatResult): string {
    const lines: string[] = []
    const diffNames = ["", "简单", "中等", "困难", "极难", "不可能"]

    lines.push(`═══ ${result.monsterName} Lv.${result.monsterLevel} [${diffNames[result.difficulty] || "?"}难度] ═══`)

    for (const detail of result.roundDetails) {
      let line = `  回合${detail.round}: `
      line += `你造成 ${detail.playerDmg} 伤害`
      if (detail.isCritical) line += " [暴击!]"
      if (detail.skillUsed) line += ` [${detail.skillUsed}]`
      if (detail.isDodged) {
        line += ` | 怪物攻击被闪避`
      } else {
        line += ` | 怪物造成 ${detail.monsterDmg} 伤害`
      }
      line += ` | 怪HP:${detail.monsterHpAfter} 你HP:${detail.playerHpAfter}`
      lines.push(line)
    }

    lines.push(`═══ 结果: ${result.victory ? "胜利" : "失败"} | 总伤害: ${result.playerDmgDealt} | 总受伤: ${result.playerDmgTaken} ═══`)
    return lines.join("\n")
  }

  getDifficultyTier(level: number): number {
    const tier = DIFFICULTY_TIERS.find(t => level >= t.minLevel && level <= t.maxLevel)
    return tier ? tier.tier : 1
  }

  // ---- private helpers ----

  private calculatePlayerAtk(): number {
    const classId = this.character.class
    const mainStat = this.character.stats[classId === "warrior" ? "str" : classId === "mage" ? "int" : "dex"]
    const weaponMainStat = this.character.equipment.weapon
      ? resolveMainStatValue(this.character.equipment.weapon.stats, classId)
      : 0
    const accBonus = this.character.equipment.accessory
      ? resolveMainStatValue(this.character.equipment.accessory.stats, classId)
      : 0

    if (classId === "warrior") {
      // Warrior: main stat (STR) → ATK + flat HP bonus
      const atk = mainStat + weaponMainStat + accBonus
      const hpBonus = weaponMainStat * 3
      this._combatHpBonus = hpBonus
      return Math.max(1, atk)
    }

    if (classId === "rogue") {
      // Rogue: main stat (DEX) → ATK, crit chance scales with DEX
      const atk = mainStat + weaponMainStat + accBonus
      this._rogueDex = mainStat + weaponMainStat + accBonus
      const accLuk = this.character.equipment.accessory
        ? (this.character.equipment.accessory.stats as any)?.luk || 0
        : 0
      this._rogueLuk = this.character.stats.luk + accLuk
      return Math.max(1, atk)
    }

    // Mage: basic attack uses STR only (weak without spell power), spell damage uses INT
    const str = this.character.stats.str
    const weaponStr = this.character.equipment.weapon
      ? (this.character.equipment.weapon.stats as any)?.str || 0
      : 0
    this._rogueLuk = 0
    return Math.max(1, str + weaponStr)
  }

  private calculatePlayerDef(): number {
    let def = this.character.stats.vit
    if (this.character.equipment.armor) {
      def += this.character.equipment.armor.stats?.vit || 0
    }
    if (this.character.equipment.accessory) {
      def += this.character.equipment.accessory.stats?.vit || 0
    }
    const hasShieldWall = this.character.skills.some(s => s.skillId === "shield_wall")
    if (hasShieldWall) {
      def *= 1.5
    }
    return def
  }

  // Class-specific combat bonuses resolved after ATK/DEF calculation
  private _combatHpBonus = 0
  private _rogueDex = 0
  private _rogueLuk = 0

  /** Combat ATK (main stat + weapon + accessory) */
  getCombatAtk(): number {
    return this.calculatePlayerAtk()
  }

  /** Combat DEF (vit + armor vit + accessory vit) */
  getCombatDef(): number {
    return this.calculatePlayerDef()
  }

  /** Spell power (int + weapon int + accessory int) */
  getCombatSpellPower(): number {
    return this.getSpellPower()
  }

  /** Returns remaining rest cooldown in seconds, 0 if ready */
  getRestCooldownRemaining(): number {
    const lastRest = this.character.lastRestTime
    if (!lastRest) return 0
    const elapsed = Date.now() - lastRest
    const cooldown = 10 * 60 * 1000 // 10 minutes
    const remaining = cooldown - elapsed
    return Math.max(0, Math.ceil(remaining / 1000))
  }

  getSpellPower(): number {
    const int = this.character.stats.int
    const weaponInt = this.character.equipment.weapon
      ? resolveMainStatValue(this.character.equipment.weapon.stats, "mage")
      : 0
    const accInt = this.character.equipment.accessory
      ? (this.character.equipment.accessory.stats as any)?.int || 0
      : 0
    return int + weaponInt + accInt
  }

  getCritChanceBonus(): number {
    const dex = this._rogueDex
    const lukBonus = this._rogueLuk
    // Every 8 DEX = +1% crit, every 5 LUK = +1% crit (min 0, max 15%)
    return Math.min(0.15, Math.floor(dex / 8) * 0.01 + Math.floor(lukBonus / 5) * 0.01)
  }

  private calculateDamage(atk: number, def: number): number {
    const baseDamage = Math.max(1, atk - def * 1.0)
    const variance = 0.9 + Math.random() * 0.2
    return Math.floor(baseDamage * variance)
  }

  private rollCritical(): boolean {
    const baseLuk = this.character.stats.luk
    const accLuk = this.character.equipment.accessory
      ? (this.character.equipment.accessory.stats as any)?.luk || 0
      : 0
    const totalLuk = baseLuk + accLuk
    const baseCrit = 0.05 + totalLuk * 0.005
    const rogueBonus = this.character.class === "rogue" ? this.getCritChanceBonus() : 0
    return Math.random() < baseCrit + rogueBonus
  }

  private rollDodge(): boolean {
    const baseDex = this.character.stats.dex
    const accDex = this.character.equipment.accessory
      ? (this.character.equipment.accessory.stats as any)?.dex || 0
      : 0
    const totalDex = baseDex + accDex
    const dodgeChance = 0.03 + totalDex * 0.003
    return Math.random() < dodgeChance
  }

  /**
   * Context-aware skill activation with cooldown support.
   *
   * Category logic:
   *   damage: tries to activate if off cooldown
   *   heal:   only when HP < 35% and off cooldown
   *   buff:   only once per combat (or per cooldown), 50% activation chance
   *
   * @param appliedBuffs - Set of buff skillIds already used this combat
   * @param skillCooldowns - Map of skillId -> remaining cooldown rounds (modified in-place)
   * @param currentHp - current player HP
   * @param maxHp - max player HP
   */
  private tryActivateSkill(
    learnedSkills: { skillId: string; level: number }[],
    appliedBuffs: Set<string>,
    skillCooldowns: Record<string, number>,
    currentHp: number,
    maxHp: number,
  ): { skillDef: SkillDef; skillInst: { skillId: string; level: number }; levelUp: boolean; newLevel: number } | null {
    if (learnedSkills.length === 0) return null

    // Categorize skills and filter out those on cooldown
    const damageSkills: typeof learnedSkills = []
    const healSkills: typeof learnedSkills = []
    const buffSkills: typeof learnedSkills = []

    for (const sk of learnedSkills) {
      const cat = SKILL_CATEGORY[sk.skillId] || "damage"
      // Skip if on cooldown
      if ((skillCooldowns[sk.skillId] || 0) > 0) continue
      if (cat === "heal") healSkills.push(sk)
      else if (cat === "buff") buffSkills.push(sk)
      else damageSkills.push(sk)
    }

    let pool: typeof learnedSkills = []
    let forceActivate = false

    // 1) Always try damage skills (when off cooldown)
    if (damageSkills.length > 0) {
      pool = damageSkills
      forceActivate = true
    }
    // 2) Heal: only when HP < 35%
    else if (healSkills.length > 0 && currentHp < maxHp * 0.35) {
      pool = healSkills
      forceActivate = true
    }
    // 3) Buff: only once per combat, 50% chance
    else if (buffSkills.length > 0 && !appliedBuffs.has("__buff__")) {
      pool = buffSkills
      forceActivate = false // 50% chance
    }

    // Buffs: 50% activation chance; other types always activate
    if (!forceActivate && Math.random() >= 0.5) return null

    if (pool.length === 0) return null

    const skillInst = pool[Math.floor(Math.random() * pool.length)]
    const skillDef = SKILLS.find(s => s.id === skillInst.skillId)
    if (!skillDef) return null

    // Mark buff as applied this combat
    if (SKILL_CATEGORY[skillInst.skillId] === "buff") {
      appliedBuffs.add("__buff__")
    }

    // Set cooldown
    skillCooldowns[skillInst.skillId] = skillDef.cooldown

    // Ensure skillUsage map exists
    if (!this.character.skillUsage) {
      this.character.skillUsage = {}
      for (const sk of this.character.skills) {
        this.character.skillUsage[sk.skillId] = 0
      }
    }

    // Increment usage and check level-up
    const lvlResult = tryLevelUpSkill(this.character.skillUsage, skillInst.skillId, skillInst.level)
    this.character.skillUsage[skillInst.skillId] = lvlResult.usage

    const levelUp = lvlResult.leveledUp
    const newLevel = lvlResult.newLevel

    // Update skill instance if leveled up
    if (levelUp) {
      skillInst.level = newLevel
    }

    return { skillDef, skillInst: { ...skillInst, level: levelUp ? newLevel : skillInst.level }, levelUp, newLevel }
  }

  private getMonster(level: number): MonsterDef {
    const index = Math.max(0, Math.min(level - 1, MONSTERS.length - 1))
    const baseMonster = MONSTERS[index]
    const tier = this.getDifficultyTier(level)
    // Stat multiplier: tier 1=1.0, tier 2=1.3, tier 3=1.6, tier 4=1.9, tier 5=2.2
    const diffMult = 1 + tier * 0.3

    // Scale stats with level
    const hpScale = 1 + (level - 1) * 0.12
    const atkScale = 1 + (level - 1) * 0.06
    const defScale = 1 + (level - 1) * 0.04

    return {
      ...baseMonster,
      hp: Math.floor(baseMonster.hp * hpScale * diffMult),
      atk: Math.floor(baseMonster.atk * atkScale * diffMult),
      def: Math.floor(baseMonster.def * defScale * diffMult),
    }
  }

  private rollLoot(
    lootTable: { itemId: string; chance: number; minCount: number; maxCount: number }[],
    level: number
  ): Item[] {
    const items: Item[] = []
    const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]))

    for (const entry of lootTable) {
      const scaledChance = entry.chance * (1 + (level - 1) * 0.01)
      if (Math.random() < scaledChance) {
        const count = entry.minCount + Math.floor(Math.random() * (entry.maxCount - entry.minCount + 1))
        const itemDef = ITEM_MAP.get(entry.itemId)
        if (itemDef) {
          for (let i = 0; i < count; i++) {
            items.push({ ...itemDef })
          }
        }
      }
    }

    return items
  }

  private checkLevelUp(): boolean {
    const MAX_LEVEL = 30
    let leveled = false

    while (this.character.exp >= this.character.expToNext && this.character.level < MAX_LEVEL) {
      this.character.exp -= this.character.expToNext
      this.character.level++
      leveled = true

      // Exponential XP curve: 1->2 needs ~750 exp (~50 monsters at Lv1)
      // Lv2->3: ~1163, Lv5->6: ~3010, Lv10->11: ~11481, Lv15->16: ~36504
      this.character.expToNext = Math.floor(50 * Math.pow(1.55, this.character.level - 1))

      const classDef = CLASSES.find(c => c.id === this.character.class)
      if (classDef) {
        for (const [stat, growth] of Object.entries(classDef.growthPerLevel)) {
          const growthVal = growth as number
          if (growthVal > 0) {
            this.character.stats[stat as keyof typeof this.character.stats] += growthVal
          }
        }
      }

      this.character.maxHp = Math.floor(this.character.maxHp * 1.05) + this.character.stats.vit * 2

      // Full restore after recalculating max HP
      this.character.hp = this.character.maxHp
    }

    if (this.character.level >= MAX_LEVEL) {
      this.character.exp = 0
      this.character.expToNext = 999999999
    }

    return leveled
  }

  private showInventory(): LogEntry[] {
    const logs: LogEntry[] = [
      {
        timestamp: Date.now(),
        text: `=== 背包 (${this.character.inventory.length} 件物品) ===`,
        type: "info",
      },
    ]

    if (this.character.inventory.length === 0) {
      logs.push({
        timestamp: Date.now(),
        text: "背包是空的",
        type: "info",
      })
    } else {
      const grouped = new Map<string, { item: Item; count: number }>()
      for (const item of this.character.inventory) {
        const key = item.id
        if (grouped.has(key)) {
          grouped.get(key)!.count++
        } else {
          grouped.set(key, { item, count: 1 })
        }
      }

      for (const { item, count } of grouped.values()) {
        const rarityLabel = RARITY_LABELS[item.rarity] || "普通"
        const slot = item.slot ? ` [${item.slot}]` : ""
        const minLv = (item as any).minLevel ? ` Lv.${(item as any).minLevel}` : ""
        logs.push({
          timestamp: Date.now(),
          text: `${rarityLabel}${slot}${minLv} ${item.name} x${count}`,
          type: "info",
          rarity: item.rarity,
        })
      }
    }

    return logs
  }

  private equipItem(slot: string, itemName: string): LogEntry[] {
    const logs: LogEntry[] = []
    const itemIndex = this.character.inventory.findIndex(i => i.name === itemName)

    if (itemIndex === -1) {
      logs.push({
        timestamp: Date.now(),
        text: `找不到物品: ${itemName}`,
        type: "info",
      })
      return logs
    }

    const item = this.character.inventory[itemIndex]
    if (item.type !== "equipment" || item.slot !== slot) {
      logs.push({
        timestamp: Date.now(),
        text: `无法将 ${itemName} 装备到 ${slot} 部位`,
        type: "info",
      })
      return logs
    }

    // Check equipment level requirement
    const itemMinLevel = (item as any).minLevel as number | undefined
    if (itemMinLevel && this.character.level < itemMinLevel) {
      logs.push({
        timestamp: Date.now(),
        text: `等级不足，需要 Lv.${itemMinLevel} 才能装备 ${itemName}`,
        type: "info",
      })
      return logs
    }

    // Unequip current item if any
    if (this.character.equipment[slot]) {
      this.character.inventory.push(this.character.equipment[slot]!)
    }

    // Equip new item (resolve per-class stats if needed)
    const itemToEquip = { ...item }
    if (item.scaleWithClass && item.stats) {
      itemToEquip.stats = resolveStatsForClass(item.stats, this.character.class)
    }
    itemToEquip.scaleWithClass = undefined
    this.character.equipment[slot] = itemToEquip
    this.character.inventory.splice(itemIndex, 1)

    logs.push({
      timestamp: Date.now(),
      text: `装备了 ${itemName}`,
      type: "info",
    })

    return logs
  }

  private unequipItem(slot: string): LogEntry[] {
    const logs: LogEntry[] = []
    const current = this.character.equipment[slot]

    if (!current) {
      logs.push({
        timestamp: Date.now(),
        text: `${slot} 部位没有装备任何物品`,
        type: "info",
      })
      return logs
    }

    this.character.inventory.push(current)
    this.character.equipment[slot] = null

    logs.push({
      timestamp: Date.now(),
      text: `卸下了 ${current.name}`,
      type: "info",
    })

    return logs
  }

  private useItem(itemName: string): LogEntry[] {
    const logs: LogEntry[] = []
    const itemIndex = this.character.inventory.findIndex(i => i.name === itemName)

    if (itemIndex === -1) {
      logs.push({
        timestamp: Date.now(),
        text: `找不到物品: ${itemName}`,
        type: "info",
      })
      return logs
    }

    const item = this.character.inventory[itemIndex]

    if (item.type === "skill_book") {
      logs.push(...this.useSkillBook(item))
      this.character.inventory.splice(itemIndex, 1)
      return logs
    }

    logs.push({
      timestamp: Date.now(),
      text: `${itemName} 无法使用`,
      type: "info",
    })

    return logs
  }

  private openChest(chestName: string): LogEntry[] {
    const logs: LogEntry[] = []
    const chestIndex = this.character.inventory.findIndex(i => i.name === chestName)

    if (chestIndex === -1) {
      logs.push({
        timestamp: Date.now(),
        text: `找不到宝箱: ${chestName}`,
        type: "info",
      })
      return logs
    }

    const chest = this.character.inventory[chestIndex]
    if (chest.type !== "chest") {
      logs.push({
        timestamp: Date.now(),
        text: `${chestName} 不是宝箱`,
        type: "info",
      })
      return logs
    }

    // Remove chest from inventory
    this.character.inventory.splice(chestIndex, 1)

    const chestRarity = chest.rarity
    const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]))
    const rewards: Item[] = []

    // Reward count scales with chest rarity
    const rewardCount =
      chestRarity === "common" ? 2 :
      chestRarity === "uncommon" ? 3 :
      chestRarity === "rare" ? 4 :
      chestRarity === "epic" ? 5 :
      chestRarity === "legendary" ? 6 :
      chestRarity === "mythic" ? 7 : 8

    // Helper: add a class-appropriate skill book
    const addSkillBook = () => {
      const classBooks = ITEMS.filter(it => it.type === "skill_book" && it.name.includes(this.getClassName()))
      const book = classBooks.length > 0 ? classBooks[Math.floor(Math.random() * classBooks.length)] : ITEM_MAP.get("skill_book_warrior")
      if (book) rewards.push({ ...book })
    }

    // Helper: create an equipment reward with stats matching the rolled rarity
    const addEquipReward = (rolledRarity: ItemRarity) => {
      const equipItems = ITEMS.filter(it => it.type === "equipment")
      const randomEquip = equipItems[Math.floor(Math.random() * equipItems.length)]
      if (!randomEquip) return

      // If the rolled rarity differs from the item's base rarity, recalculate stats
      let stats = randomEquip.stats
      if (rolledRarity !== randomEquip.rarity && randomEquip.scaleWithClass) {
        const recalc = recalcItemStats(randomEquip, rolledRarity)
        stats = recalc.scaleWithClass ? resolveStatsForClass(recalc.stats, this.character.class) : recalc.stats
      } else if (randomEquip.scaleWithClass && stats) {
        stats = resolveStatsForClass(stats, this.character.class)
      }

      rewards.push({
        ...randomEquip,
        rarity: rolledRarity,
        stats,
      })
    }

    // Roll for each reward slot — 1% flat skill book chance in ALL chests
    for (let i = 0; i < rewardCount; i++) {
      // 1% flat skill book drop (legendary rarity)
      if (Math.random() < 0.01) {
        addSkillBook()
        continue
      }

      const roll = Math.random()
      const rarity = rollRarity(chestRarity)

      // All chest rewards are equipment
      addEquipReward(rarity)
    }

    // Add rewards to inventory
    for (const item of rewards) {
      this.character.inventory.push(item)
    }

    logs.push({
      timestamp: Date.now(),
      text: `打开了 ${chestName}，获得 ${rewards.length} 件物品！`,
      type: "info",
    })

    for (const item of rewards) {
      logs.push({
        timestamp: Date.now(),
        text: `  📦 [${RARITY_LABELS[item.rarity] || "普通"}] ${item.name}`,
        type: "loot",
        rarity: item.rarity,
      })
    }

    return logs
  }

  private getClassName(): string {
    const names: Record<string, string> = { warrior: "战士", mage: "法师", rogue: "盗贼" }
    return names[this.character.class] || ""
  }

  private useSkillBook(item: Item): LogEntry[] {
    const logs: LogEntry[] = []

    // Find all skills for this class that haven't been learned yet
    const availableSkills = SKILLS.filter(s => !s.classRequired || s.classRequired === this.character.class)
    const unlearnedSkills = availableSkills.filter(s => !this.character.skills.find(sk => sk.skillId === s.id))

    if (unlearnedSkills.length > 0) {
      // Learn a random unlearned skill
      const randomSkill = unlearnedSkills[Math.floor(Math.random() * unlearnedSkills.length)]
      this.character.skills.push({ skillId: randomSkill.id, level: 1 })

      logs.push({
        timestamp: Date.now(),
        text: `📖 学习了技能：${randomSkill.name}！`,
        type: "info",
      })
      return logs
    }

    // All skills learned — add random progress (10%-50%) to a random learned skill
    const learnedClassSkills = this.character.skills.filter(sk =>
      availableSkills.some(s => s.id === sk.skillId)
    )

    if (learnedClassSkills.length === 0) {
      logs.push({
        timestamp: Date.now(),
        text: `${item.name} 打开后空空如也...`,
        type: "info",
      })
      return logs
    }

    // Pick a random skill that hasn't reached max level
    const upgradable = learnedClassSkills.filter(sk => {
      const def = SKILLS.find(s => s.id === sk.skillId)
      return def && sk.level < def.maxLevel
    })

    if (upgradable.length === 0) {
      logs.push({
        timestamp: Date.now(),
        text: `📖 ${item.name} — 所有技能均已满级！`,
        type: "info",
      })
      return logs
    }

    const targetSkill = upgradable[Math.floor(Math.random() * upgradable.length)]
    const skillDef = SKILLS.find(s => s.id === targetSkill.skillId)!
    const currentLevel = targetSkill.level
    const usesNeeded = SKILL_USES_PER_LEVEL

    // Add 10%-50% random progress
    const progressPercent = 10 + Math.floor(Math.random() * 41) // 10-50
    const usesAdded = Math.floor(usesNeeded * progressPercent / 100)

    if (!this.character.skillUsage) {
      this.character.skillUsage = {}
      for (const sk of this.character.skills) {
        this.character.skillUsage[sk.skillId] = 0
      }
    }
    this.character.skillUsage[targetSkill.skillId] = (this.character.skillUsage[targetSkill.skillId] || 0) + usesAdded

    const newUsage = this.character.skillUsage[targetSkill.skillId]
    const progressPercentActual = Math.min(100, Math.floor(newUsage / usesNeeded * 100))

    logs.push({
      timestamp: Date.now(),
      text: `📖 ${skillDef.name} 获得 ${progressPercent}% 升级进度 (${newUsage}/${usesNeeded} 次, ${progressPercentActual}%)`,
      type: "info",
    })

    // Check if this pushed the skill over the threshold
    const lvlResult = tryLevelUpSkill(this.character.skillUsage, targetSkill.skillId, currentLevel)
    if (lvlResult.leveledUp) {
      targetSkill.level = lvlResult.newLevel
      logs.push({
        timestamp: Date.now(),
        text: `✨ ${skillDef.name} 升级到 Lv.${lvlResult.newLevel}！`,
        type: "levelup",
      })
    }

    return logs
  }

  private learnSkill(skillName: string): LogEntry[] {
    const logs: LogEntry[] = []
    const skill = SKILLS.find(s => s.name === skillName)

    if (!skill) {
      logs.push({
        timestamp: Date.now(),
        text: `找不到技能: ${skillName}`,
        type: "info",
      })
      return logs
    }

    if (skill.classRequired && skill.classRequired !== this.character.class) {
      logs.push({
        timestamp: Date.now(),
        text: `你的职业不能学习 ${skillName}`,
        type: "info",
      })
      return logs
    }

    const existing = this.character.skills.find(s => s.skillId === skill.id)
    if (existing) {
      logs.push({
        timestamp: Date.now(),
        text: `已经学会了 ${skillName}`,
        type: "info",
      })
      return logs
    }

    this.character.skills.push({ skillId: skill.id, level: 1 })
    logs.push({
      timestamp: Date.now(),
      text: `学会了 ${skillName}！`,
      type: "info",
    })

    return logs
  }

  private showSkills(): LogEntry[] {
    const logs: LogEntry[] = [
      {
        timestamp: Date.now(),
        text: `=== 已学技能 (${this.character.skills.length}) ===`,
        type: "info",
      },
    ]

    if (this.character.skills.length === 0) {
      logs.push({
        timestamp: Date.now(),
        text: "还没有学习任何技能",
        type: "info",
      })
    } else {
      for (const skillInst of this.character.skills) {
        const skillDef = SKILLS.find(s => s.id === skillInst.skillId)
        if (!skillDef) continue

        const scaledValue = getSkillEffectValue(skillDef, skillInst.level)
        const effectStr = skillDef.effect.type === "damage"
          ? `造成 ${Math.floor(scaledValue * 100)}% 伤害`
          : skillDef.effect.type === "heal"
            ? `恢复 ${Math.floor(scaledValue * 100)}% HP`
            : skillDef.effect.type === "buff"
              ? `${skillDef.effect.value > 0 ? '+' : ''}${Math.floor(scaledValue * 100)}% ${skillDef.effect.target === 'self' ? '自身' : '目标'}${skillDef.effect.type === 'buff' ? '增益' : '减益'}`
              : skillDef.description

        // Progress bar for next level
        let progressLine = ""
        if (skillInst.level < skillDef.maxLevel) {
          const usage = this.character.skillUsage?.[skillInst.skillId] || 0
          const needed = SKILL_USES_PER_LEVEL
          const pct = Math.min(100, Math.floor(usage / needed * 100))
          const barFilled = Math.floor(pct / 10)
          const bar = "█".repeat(barFilled) + "░".repeat(10 - barFilled)
          progressLine = `\n  升级进度: [${bar}] ${pct}% (${usage}/${needed})`
        } else {
          progressLine = "\n  ★ 已满级 ★"
        }

        logs.push({
          timestamp: Date.now(),
          text: `${skillDef.name} Lv.${skillInst.level} - ${effectStr}${progressLine}`,
          type: "info",
        })
      }
    }

    return logs
  }

  private rest(): LogEntry[] {
    const logs: LogEntry[] = []
    const now = Date.now()
    const REST_COOLDOWN = 10 * 60 * 1000 // 10 minutes in ms

    // Check cooldown
    const lastRest = this.character.lastRestTime
    if (lastRest) {
      const elapsed = now - lastRest
      if (elapsed < REST_COOLDOWN) {
        const remaining = Math.ceil((REST_COOLDOWN - elapsed) / 1000)
        const mins = Math.floor(remaining / 60)
        const secs = remaining % 60
        logs.push({
          timestamp: now,
          text: `休息冷却中，请等待 ${mins}分${secs}秒`,
          type: "info",
        })
        return logs
      }
    }

    // Full restore
    this.character.hp = this.character.maxHp
    this.character.lastRestTime = now

    logs.push({
      timestamp: now,
      text: `休息完毕，HP 已完全恢复！`,
      type: "info",
    })

    return logs
  }

  private showShop(): LogEntry[] {
    const logs: LogEntry[] = [
      {
        timestamp: Date.now(),
        text: `=== 商店 ===`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `你的金币: ${this.character.gold}`,
        type: "info",
      },
    ]

    const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]))
    for (const shopItem of SHOP_ITEMS) {
      const shopMinLevel = (shopItem as any).minLevel
      if (shopMinLevel && this.character.level < shopMinLevel) {
        continue
      }
      const itemDef = ITEM_MAP.get(shopItem.itemId)
      if (itemDef) {
        logs.push({
          timestamp: Date.now(),
          text: `${itemDef.name} - ${shopItem.price} 金币`,
          type: "info",
        })
      }
    }

    logs.push({
      timestamp: Date.now(),
      text: "输入 /buy <物品名> 购买",
      type: "info",
    })

    return logs
  }

  private buyItem(itemName: string, count: number): LogEntry[] {
    const logs: LogEntry[] = []
    const ITEM_MAP = new Map(ITEMS.map(item => [item.id, item]))
    const shopItem = SHOP_ITEMS.find(s => {
      const def = ITEM_MAP.get(s.itemId)
      return def && def.name === itemName
    })

    if (!shopItem) {
      logs.push({
        timestamp: Date.now(),
        text: `商店没有出售: ${itemName}`,
        type: "info",
      })
      return logs
    }

    const shopMinLevel = (shopItem as any).minLevel
    if (shopMinLevel && this.character.level < shopMinLevel) {
      logs.push({
        timestamp: Date.now(),
        text: `等级不足，无法购买 ${itemName} (需要 Lv.${shopMinLevel})`,
        type: "info",
      })
      return logs
    }

    const totalCost = shopItem.price * count
    if (this.character.gold < totalCost) {
      logs.push({
        timestamp: Date.now(),
        text: `金币不足，需要 ${totalCost} 金币`,
        type: "info",
      })
      return logs
    }

    this.character.gold -= totalCost
    const itemDef = ITEM_MAP.get(shopItem.itemId)
    if (itemDef) {
      for (let i = 0; i < count; i++) {
        this.character.inventory.push({ ...itemDef })
      }
    }

    logs.push({
      timestamp: Date.now(),
      text: `购买了 ${itemName} x${count}，花费 ${totalCost} 金币`,
      type: "info",
    })

    return logs
  }

  private sellItem(itemName: string, count: number): LogEntry[] {
    const logs: LogEntry[] = []

    let itemDef: ItemDef | undefined
    for (const item of ITEMS) {
      if (item.name === itemName) {
        itemDef = item
        break
      }
    }

    if (!itemDef) {
      logs.push({
        timestamp: Date.now(),
        text: `找不到物品: ${itemName}`,
        type: "info",
      })
      return logs
    }

    const itemIndices: number[] = []
    for (let i = 0; i < this.character.inventory.length && itemIndices.length < count; i++) {
      if (this.character.inventory[i].id === itemDef.id) {
        itemIndices.push(i)
      }
    }

    if (itemIndices.length < count) {
      logs.push({
        timestamp: Date.now(),
        text: `没有足够的 ${itemName} (需要 ${count}，有 ${itemIndices.length})`,
        type: "info",
      })
      return logs
    }

    const shopItem = SHOP_ITEMS.find(s => s.itemId === itemDef.id)

    // Sell price: gray=10, green=100, blue=200, purple+=chestPrice/10
    let unitPrice: number
    if (itemDef.rarity === "common") {
      unitPrice = 10
    } else if (itemDef.rarity === "uncommon") {
      unitPrice = 100
    } else if (itemDef.rarity === "rare") {
      unitPrice = 200
    } else {
      // epic/legendary/mythic/transcendent: use equivalent chest price / 10
      const rarityToChest: Record<string, string> = {
        epic: "epic_chest",
        legendary: "legendary_chest",
        mythic: "mythic_chest",
        transcendent: "mythic_chest",
      }
      const chestId = rarityToChest[itemDef.rarity]
      const chestItem = SHOP_ITEMS.find(s => s.itemId === chestId)
      unitPrice = Math.floor((chestItem?.price || 1_000_000) / 10)
    }

    const sellPrice = unitPrice * count
    this.character.gold += sellPrice

    for (let i = itemIndices.length - 1; i >= 0; i--) {
      this.character.inventory.splice(itemIndices[i], 1)
    }

    logs.push({
      timestamp: Date.now(),
      text: `出售了 ${itemName} x${count}，获得 ${sellPrice} 金币`,
      type: "info",
    })

    return logs
  }

  private showStatus(): LogEntry[] {
    const logs: LogEntry[] = [
      {
        timestamp: Date.now(),
        text: `=== ${this.character.name} ===`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `职业: ${CLASSES.find(c => c.id === this.character.class)?.name}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `等级: ${this.character.level} / 30`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `经验: ${this.character.exp} / ${this.character.expToNext}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `HP: ${this.character.hp} / ${this.character.maxHp}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `金币: ${this.character.gold}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `力量: ${this.character.stats.str}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `敏捷: ${this.character.stats.dex}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `智力: ${this.character.stats.int}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `体力: ${this.character.stats.vit}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `幸运: ${this.character.stats.luk}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `⚔️ 攻击力: ${this.getCombatAtk()}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `🛡️ 防御力: ${this.getCombatDef()}`,
        type: "info",
      },
      {
        timestamp: Date.now(),
        text: `✨ 法术强度: ${this.getCombatSpellPower()}`,
        type: "info",
      },
    ]

    return logs
  }

  private showHelp(): LogEntry[] {
    const logs: LogEntry[] = [
      {
        timestamp: Date.now(),
        text: "=== 可用命令 ===",
        type: "info",
      },
      { timestamp: Date.now(), text: "/bag - 查看背包", type: "info" },
      { timestamp: Date.now(), text: "/equip <部位> <物品名> - 装备物品", type: "info" },
      { timestamp: Date.now(), text: "/unequip <部位> - 卸下装备", type: "info" },
      { timestamp: Date.now(), text: "/use <物品名> - 使用消耗品", type: "info" },
      { timestamp: Date.now(), text: "/learn <技能名> - 学习技能", type: "info" },
      { timestamp: Date.now(), text: "/skills - 查看已学技能", type: "info" },
      { timestamp: Date.now(), text: "/rest - 休息恢复 HP", type: "info" },
      { timestamp: Date.now(), text: "/shop - 查看商店", type: "info" },
      { timestamp: Date.now(), text: "/buy <物品名> - 购买物品", type: "info" },
      { timestamp: Date.now(), text: "/sell <物品名> - 出售物品", type: "info" },
      { timestamp: Date.now(), text: "/status - 查看详细属性", type: "info" },
      { timestamp: Date.now(), text: "/help - 查看帮助", type: "info" },
    ]

    return logs
  }
}
