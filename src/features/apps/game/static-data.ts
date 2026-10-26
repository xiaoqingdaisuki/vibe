/** 放置角色游戏：职业、物品与掉落静态配置 */

import type {
  ClassDef,
  ClassType,
  SkillDef,
  MonsterDef,
  ItemDef,
  LootEntry,
  ItemRarity,
  Stats,
  ItemStats,
  ShopItem,
} from './types.ts';

export const CLASSES: ClassDef[] = [
  {
    id: 'warrior',
    name: '战士',
    description: '高 HP、高力量的近战型职业，擅长正面刚',
    baseStats: { str: 4, dex: 3, int: 2, vit: 4, luk: 3 },
    baseHp: 70,
    growthPerLevel: { str: 2, vit: 2, dex: 1, int: 1, luk: 1 },
    startingSkills: ['power_strike'],
    mainStat: 'str',
  },
  {
    id: 'mage',
    name: '法师',
    description: '高智力的魔法型职业，能释放强力法术',
    baseStats: { str: 2, dex: 3, int: 4, vit: 3, luk: 3 },
    baseHp: 45,
    growthPerLevel: { int: 2, vit: 1, str: 1, dex: 1, luk: 1 },
    startingSkills: ['fireball'],
    mainStat: 'int',
  },
  {
    id: 'rogue',
    name: '盗贼',
    description: '高敏捷、高幸运的暴击型职业，来去如风',
    baseStats: { str: 3, dex: 5, int: 2, vit: 3, luk: 4 },
    baseHp: 55,
    growthPerLevel: { dex: 2, luk: 2, str: 1, int: 1, vit: 1 },
    startingSkills: ['backstab'],
    mainStat: 'dex',
  },
];

export const SKILLS: SkillDef[] = [
  // 战士技能
  {
    id: 'power_strike',
    name: '重击',
    description: '造成 150% 物理伤害',
    type: 'active',
    mpCost: 5,
    effect: { type: 'damage', value: 1.5, target: 'enemy' },
    maxLevel: 10,
    classRequired: 'warrior',
    cooldown: 6,
  },
  {
    id: 'shield_wall',
    name: '盾墙',
    description: '本场战斗减伤 50%',
    type: 'active',
    mpCost: 8,
    effect: { type: 'buff', value: 0.5, target: 'self' },
    maxLevel: 10,
    classRequired: 'warrior',
    cooldown: 99, // 每场战斗仅触发一次
  },
  {
    id: 'war_cry',
    name: '战吼',
    description: '本场战斗攻击 +30%',
    type: 'active',
    mpCost: 10,
    effect: { type: 'buff', value: 0.3, target: 'self' },
    maxLevel: 10,
    classRequired: 'warrior',
    cooldown: 99, // 每场战斗仅触发一次
  },
  // 法师技能
  {
    id: 'fireball',
    name: '火球术',
    description: '造成 180% 魔法伤害',
    type: 'active',
    mpCost: 15,
    effect: { type: 'damage', value: 1.8, target: 'enemy' },
    maxLevel: 10,
    classRequired: 'mage',
    cooldown: 3,
  },
  {
    id: 'heal',
    name: '治愈术',
    description: '恢复 50% HP',
    type: 'active',
    mpCost: 18,
    effect: { type: 'heal', value: 0.5, target: 'self' },
    maxLevel: 10,
    classRequired: 'mage',
    cooldown: 5,
  },
  {
    id: 'magic_shield',
    name: '魔力护盾',
    description: '本场战斗受到伤害 -30%',
    type: 'active',
    mpCost: 22,
    effect: { type: 'buff', value: 0.3, target: 'self' },
    maxLevel: 10,
    classRequired: 'mage',
    cooldown: 99, // 每场战斗仅触发一次
  },
  // 盗贼技能
  {
    id: 'backstab',
    name: '背刺',
    description: '造成 200% 物理伤害（暴击率翻倍）',
    type: 'active',
    mpCost: 8,
    effect: { type: 'damage', value: 2.0, target: 'enemy' },
    maxLevel: 10,
    classRequired: 'rogue',
    cooldown: 4,
  },
  {
    id: 'dodge',
    name: '闪避',
    description: '本回合 100% 闪避',
    type: 'active',
    mpCost: 10,
    effect: { type: 'buff', value: 1.0, target: 'self' },
    maxLevel: 10,
    classRequired: 'rogue',
    cooldown: 99, // 每场战斗仅触发一次
  },
  {
    id: 'poison_blade',
    name: '毒刃',
    description: '造成 120% 伤害 + 持续毒伤',
    type: 'active',
    mpCost: 14,
    effect: { type: 'damage', value: 1.2, target: 'enemy' },
    maxLevel: 10,
    classRequired: 'rogue',
    cooldown: 4,
  },
];

// 技能触发类型
// 伤害型技能每回合尝试触发
// 治疗型技能仅在生命值低于百分之三十五时触发
// 增益型技能在回合开始时尝试触发，每场战斗仅生效一次

export const SKILL_CATEGORY: Record<string, 'damage' | 'heal' | 'buff'> = {
  power_strike: 'damage',
  shield_wall: 'buff',
  war_cry: 'buff',
  fireball: 'damage',
  heal: 'heal',
  magic_shield: 'buff',
  backstab: 'damage',
  dodge: 'buff',
  poison_blade: 'damage',
};

// 难度层级的属性倍率为一加层级乘以 0.4
export interface DifficultyTier {
  tier: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  description: string;
}

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { tier: 1, name: '简单', minLevel: 1, maxLevel: 5, description: '怪物属性正常' },
  { tier: 2, name: '中等', minLevel: 5, maxLevel: 10, description: '怪物属性 ×1.8' },
  { tier: 3, name: '困难', minLevel: 10, maxLevel: 20, description: '怪物属性 ×2.6，需要对应等级装备' },
  { tier: 4, name: '极难', minLevel: 20, maxLevel: 29, description: '怪物属性 ×3.4，穿满装备也极难通过' },
  { tier: 5, name: '不可能', minLevel: 30, maxLevel: 30, description: '理论上无法到达' },
];

// 装备属性曲线
// 使用二次曲线计算指定等级的基础属性
// 每个槽位一级基础值约为 4，十级约为 4 至 6，二十五级约为 14 至 22
// 结合一至六十四倍稀有度加成，限制后期属性增长
// 避免旧数组配置造成属性数值过高

// 计算武器主属性成长值（随等级二次增长）
// 计算武器主属性成长值（随等级二次增长）
function wpnStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.02);
}

// 计算护甲主属性成长值
// 计算护甲主属性成长值
function armorStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.015);
}

// 计算饰品主属性成长值
// 计算饰品主属性成长值
function accStat(lv: number): number {
  return Math.floor(2 + lv * lv * 0.01);
}

// 装备属性倍率：紫装起适配高等级怪物的生命、防御和攻击成长

// 稀有度系统
// 灰色 → 绿 → 蓝 → 紫 → 橙 → 红 → 金色
// 普通宝箱基础掉率，更高品质宝箱会放大各档概率
// 普通至超越七档掉率依次为 65%、8%、22%、3.5%、2.5%、0.15%、0.001%

export const RARITY_ORDER: ItemDef['rarity'][] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'transcendent',
];

export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
  transcendent: '超越',
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#9ca3af', // 灰
  uncommon: '#22c55e', // 绿
  rare: '#3b82f6', // 蓝
  epic: '#a855f7', // 紫
  legendary: '#f97316', // 橙
  mythic: '#ef4444', // 红
  transcendent: '#fbbf24', // 金
};

// 普通宝箱中各稀有度的独立掉落概率
// rollRarity 将独立概率转换为累计阈值
// 累计阈值按稀有度从高到低构建
// 灰68% / 绿22% / 蓝8% / 紫1.5% / 橙0.5% / 红0.1% / 金0.001%
export const RARITY_BASE_CHANCE: Record<ItemRarity, number> = {
  common: 0.68, // 68%
  uncommon: 0.22, // 22%
  rare: 0.08, // 8%
  epic: 0.015, // 1.5%
  legendary: 0.005, // 0.5%
  mythic: 0.001, // 0.1%
  transcendent: 0.00001, // 0.001%
};

// 各类宝箱对稀有度概率的放大倍数
export const CHEST_RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 12,
  epic: 50,
  legendary: 100,
  mythic: 100,
  transcendent: 100,
};

// 稀有度辅助逻辑

// 根据宝箱品质随机roll出物品稀有度
export function rollRarity(chestRarity: ItemRarity): ItemRarity {
  const mult = CHEST_RARITY_MULTIPLIER[chestRarity];
  const roll = Math.random();
  const minimumRarityIndex = RARITY_ORDER.indexOf(chestRarity);

  // 按稀有度从高到低构建累计阈值
  // 各条目表示对应稀有度的累计概率上界，包含边界
  const tiers = RARITY_ORDER.slice(minimumRarityIndex).toReversed();
  let cumulative = 0;

  for (const rarity of tiers) {
    cumulative += RARITY_BASE_CHANCE[rarity] * mult;
    if (roll < Math.min(cumulative, 1)) return rarity;
  }

  // 宝箱品级是掉落下限，未命中更高品级时回退到宝箱品级
  return chestRarity;
}

const RARITY_STAT_MULTIPLIER: Record<ItemRarity, number> = {
  common: 2,
  uncommon: 4,
  rare: 8,
  epic: 120,
  legendary: 240,
  mythic: 480,
  transcendent: 960,
};

// 根据稀有度获取装备属性倍率
function rarityBonus(rarity: ItemRarity): number {
  return RARITY_STAT_MULTIPLIER[rarity];
}

// 根据新稀有度重新计算装备属性（宝箱roll出更高稀有度时使用）
export function recalcItemStats(
  baseItem: ItemDef,
  newRarity: ItemRarity,
): { stats: ItemStats; scaleWithClass: boolean } {
  const slot = baseItem.slot || 'weapon';
  return buildItemStats(baseItem.minLevel, newRarity, slot);
}

// 技能系统
// 技能每升一级，基础效果提高百分之二十
// 技能每级需要使用一千次
// 一至八级累计一千次使用后必定升级
// 九级升至十级时累计一千次使用后有一半概率成功

export const SKILL_USES_PER_LEVEL = 1000;

// 计算技能等级效果，一级使用基础值，此后每级增加百分之二十
export function getSkillEffectValue(skillDef: SkillDef, skillLevel: number): number {
  const base = skillDef.effect.value;
  return Math.floor(base * (1 + (skillLevel - 1) * 0.2) * 100) / 100;
}

// 每千次使用尝试升级，九级升十级成功率减半，失败时清空本次进度
export function tryLevelUpSkill(
  skillUsage: Record<string, number>,
  skillId: string,
  currentLevel: number,
): { leveledUp: boolean; newLevel: number; usage: number } {
  if (currentLevel >= 10) {
    return { leveledUp: false, newLevel: currentLevel, usage: skillUsage[skillId] ?? 0 };
  }

  const usage = (skillUsage[skillId] ?? 0) + 1;
  skillUsage[skillId] = usage;

  // 每级固定需要使用一千次
  if (usage < SKILL_USES_PER_LEVEL) {
    return { leveledUp: false, newLevel: currentLevel, usage };
  }

  // 累计一千次使用后尝试升级
  if (currentLevel >= 9 && Math.random() >= 0.5) {
    // 九级升十级失败时重置进度
    skillUsage[skillId] = 0;
    return { leveledUp: false, newLevel: currentLevel, usage: 0 };
  }

  // 升级成功时提高等级并重置计数
  skillUsage[skillId] = 0;
  return { leveledUp: true, newLevel: currentLevel + 1, usage: 0 };
}

// 属性构建逻辑
// 根据槽位、职业、等级与稀有度生成属性
// scaleWithClass 为真时保存职业属性映射，并在装备时解析

// 构建装备的属性数据（含职业缩放和稀有度加成）
function buildItemStats(
  level: number,
  rarity: ItemRarity,
  slot: string,
): { stats: Record<ClassType, Partial<Stats>>; scaleWithClass: boolean; mainStatValue: number } {
  const bonus = rarityBonus(rarity);
  const lv = Math.max(1, level);
  let stats: Record<ClassType, Partial<Stats>>;

  if (slot === 'weapon') {
    const base = wpnStat(lv);
    stats = {
      warrior: { str: Math.floor(base * bonus) },
      mage: { int: Math.floor(base * bonus) },
      rogue: { dex: Math.floor(base * bonus) },
    };
  } else if (slot === 'armor') {
    const base = armorStat(lv);
    // 所有护甲统一提供体力作为防御属性
    stats = {
      warrior: { vit: Math.floor(base * bonus) },
      mage: { vit: Math.floor(base * bonus) },
      rogue: { vit: Math.floor(base * bonus) },
    };
  } else {
    const base = accStat(lv);
    // 饰品提供职业主属性，确保能进入攻击结算（与武器一致）
    stats = {
      warrior: { str: Math.floor(base * bonus) },
      mage: { int: Math.floor(base * bonus) },
      rogue: { dex: Math.floor(base * bonus) },
    };
  }

  return { stats, scaleWithClass: true, mainStatValue: 0 };
}

// 判断属性数据是否为扁平格式（非职业缩放格式）
function isFlatStats(stats: ItemStats): stats is Partial<Stats> {
  const flatStats = stats as Partial<Stats>;
  return ['str', 'dex', 'int', 'vit', 'luk'].some((key) => flatStats[key as keyof Stats] !== undefined);
}

// 将职业缩放属性解析为实际职业的属性值
export function resolveStatsForClass(stats: ItemStats | undefined, classId: ClassType): Partial<Stats> | undefined {
  if (!stats) return undefined;
  return isFlatStats(stats) ? stats : stats[classId];
}

// 按职业读取装备前后两种属性结构中的主属性数值
export function resolveMainStatValue(stats: ItemStats | undefined, classId: ClassType): number {
  if (!stats) return 0;

  // 装备前使用按职业嵌套的主属性映射
  if (!isFlatStats(stats)) {
    const classStats = stats[classId];
    if (classId === 'warrior') return classStats.str || 0;
    if (classId === 'mage') return classStats.int || 0;
    if (classId === 'rogue') return classStats.dex || 0;
  }

  // 装备后使用已解析的扁平力量或智力属性
  const flatStats = stats as Partial<Stats>;
  const statKey = classId === 'warrior' ? 'str' : classId === 'mage' ? 'int' : 'dex';
  return flatStats[statKey] || 0;
}

// 装备名称表
const WEAPON_NAMES = [
  '铁',
  '钢',
  '精钢',
  '秘银',
  '寒铁',
  '烈焰',
  '冰霜',
  '雷霆',
  '圣光',
  '暗影',
  '龙牙',
  '凤翼',
  '麒麟',
  '白虎',
  '玄武',
  '朱雀',
  '青龙',
  '混沌',
  '太古',
  '神话',
  '天堑',
  '斩星',
  '碎虚',
  '破灭',
  '创世',
];
const ARMOR_NAMES = [
  '皮',
  '锁',
  '钢',
  '秘银',
  '寒铁',
  '烈焰',
  '冰霜',
  '雷霆',
  '圣光',
  '暗影',
  '龙鳞',
  '凤羽',
  '麒麟',
  '白虎',
  '玄武',
  '朱雀',
  '青龙',
  '混沌',
  '太古',
  '神话',
  '天堑',
  '碎虚',
  '破灭',
  '创世',
  '永恒',
];
const WEAPON_LABEL: Record<string, string> = { warrior: '剑', mage: '法杖', rogue: '匕首' };
const ARMOR_LABEL: Record<string, string> = { warrior: '战甲', mage: '长袍', rogue: '皮衣' };

// 物品生成逻辑

// 奖励等级限制为一至二十五级，普通品质取角色等级正负一，超越品质取当前等级
function getChestItemLevel(charLevel: number, rarity: ItemRarity): number {
  if (rarity === 'transcendent') {
    // 超越品质特殊逻辑：始终等于角色等级
    return Math.max(1, Math.min(25, charLevel));
  }
  const lo = Math.max(1, charLevel - 1);
  const hi = Math.min(25, charLevel + 1);
  if (lo > hi) return hi;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// 按职业与等级预生成随机品质装备池，开箱时再按宝箱品质重抽稀有度
function generateEquipment(): ItemDef[] {
  const items: ItemDef[] = [];
  const SLOTS: Array<'weapon' | 'armor' | 'accessory'> = ['weapon', 'armor', 'accessory'];

  for (const cls of CLASSES) {
    // 为每个职业的武器与护甲槽位生成二十五档等级装备
    for (let level = 1; level <= 25; level++) {
      for (const slot of SLOTS.slice(0, 2)) {
        const rarity = rollRarity('common'); // 随机生成基础稀有度
        const { stats, scaleWithClass } = buildItemStats(level, rarity, slot);
        const mat =
          slot === 'weapon'
            ? WEAPON_NAMES[Math.min(level - 1, WEAPON_NAMES.length - 1)]
            : ARMOR_NAMES[Math.min(level - 1, ARMOR_NAMES.length - 1)];
        const label = slot === 'weapon' ? WEAPON_LABEL[cls.id] : ARMOR_LABEL[cls.id];

        items.push({
          id: `${cls.id}_${slot}_${String(level).padStart(2, '0')}`,
          name: `${mat}${label}`,
          type: 'equipment',
          slot,
          stats,
          rarity,
          scaleWithClass,
          description: `${RARITY_LABELS[rarity]}${mat}${label} Lv.${level}`,
          minLevel: level,
          classRequired: cls.id,
        });
      }
    }

    // 每个职业生成八件固定名称的饰品
    const accNames = ['力量护符', '敏捷戒指', '智慧之戒', '体力项链', '幸运饰品', '勇者勋章', '守护之盾', '王者之冠'];
    const accMinLevels = [3, 5, 10, 15, 18, 22, 25, 25];

    for (let i = 0; i < accNames.length; i++) {
      const rarity = rollRarity('common');
      const { stats, scaleWithClass } = buildItemStats(accMinLevels[i], rarity, 'accessory');
      items.push({
        id: `${cls.id}_acc_${String(i + 1).padStart(2, '0')}`,
        name: accNames[i],
        type: 'equipment',
        slot: 'accessory',
        stats,
        rarity,
        scaleWithClass,
        description: accNames[i],
        minLevel: accMinLevels[i],
        classRequired: cls.id,
      });
    }
  }

  return items;
}

// 从装备池选取物品，按宝箱品质重抽稀有度并按角色等级生成属性
export function randomEquipItem(chestRarity: ItemRarity, charLevel: number): ItemDef | undefined {
  // 宝箱可以掉落任意职业装备，职业限制在穿戴时检查
  const allEquip = ITEMS.filter((it) => it.type === 'equipment');
  if (allEquip.length === 0) return undefined;

  // 随机选择一件基础装备
  const base = allEquip[Math.floor(Math.random() * allEquip.length)];
  if (!base) return undefined;

  // 根据宝箱等级重新抽取稀有度
  const newRarity = rollRarity(chestRarity);

  // 生成接近角色当前等级的物品等级
  // 超越品质物品始终使用角色当前等级
  const level = getChestItemLevel(charLevel, newRarity);

  // 保留装备槽位，并按新稀有度重建属性
  const slot = base.slot || 'weapon';
  const isAccessory = slot === 'accessory';
  const { stats, scaleWithClass } = buildItemStats(level, newRarity, slot);

  // 饰品保留固定名称，武器与护甲按材质生成名称
  const name = isAccessory
    ? base.name
    : `${WEAPON_NAMES[Math.min(level - 1, WEAPON_NAMES.length - 1)]}${slot === 'weapon' ? WEAPON_LABEL[base.id.split('_')[0]] : ARMOR_LABEL[base.id.split('_')[0]]}`;

  const description = `${RARITY_LABELS[newRarity]}${name} Lv.${level}`;

  return {
    ...base,
    id: createGeneratedEquipmentId(base, level, newRarity),
    name,
    stats,
    rarity: newRarity,
    scaleWithClass,
    description,
    minLevel: level,
  };
}

// 生成保留饰品原始编号的稳定装备ID
export function createGeneratedEquipmentId(base: ItemDef, level: number, rarity: ItemRarity): string {
  const prefix = base.slot === 'accessory' ? base.id : base.id.split('_').slice(0, 2).join('_');
  return `${prefix}_${String(level).padStart(2, '0')}_${rarity}`;
}

export const ITEMS: ItemDef[] = [
  // 七档品质的宝箱
  {
    id: 'common_chest',
    name: '普通宝箱',
    type: 'chest',
    rarity: 'common',
    description: '开启后随机获得物品',
    minLevel: 1,
  },
  {
    id: 'uncommon_chest',
    name: '精良宝箱',
    type: 'chest',
    rarity: 'uncommon',
    description: '开启后随机获得精良以上物品',
    minLevel: 1,
  },
  {
    id: 'rare_chest',
    name: '稀有宝箱',
    type: 'chest',
    rarity: 'rare',
    description: '开启后随机获得稀有以上物品',
    minLevel: 1,
  },
  {
    id: 'epic_chest',
    name: '史诗宝箱',
    type: 'chest',
    rarity: 'epic',
    description: '开启后随机获得史诗以上物品',
    minLevel: 1,
  },
  {
    id: 'legendary_chest',
    name: '传说宝箱',
    type: 'chest',
    rarity: 'legendary',
    description: '开启后随机获得传说以上物品',
    minLevel: 1,
  },
  {
    id: 'mythic_chest',
    name: '神话宝箱',
    type: 'chest',
    rarity: 'mythic',
    description: '开启后随机获得神话以上物品',
    minLevel: 1,
  },
  {
    id: 'transcendent_chest',
    name: '超越宝箱',
    type: 'chest',
    rarity: 'transcendent',
    description: '开启后随机获得超越物品',
    minLevel: 1,
  },
  // 传说品质技能书，任意宝箱均有百分之一概率掉落
  {
    id: 'skill_book_warrior',
    name: '战士技能书',
    type: 'skill_book',
    rarity: 'legendary',
    description: '随机学习一个战士技能',
    minLevel: 1,
  },
  {
    id: 'skill_book_mage',
    name: '法师技能书',
    type: 'skill_book',
    rarity: 'legendary',
    description: '随机学习一个法师技能',
    minLevel: 1,
  },
  {
    id: 'skill_book_rogue',
    name: '盗贼技能书',
    type: 'skill_book',
    rarity: 'legendary',
    description: '随机学习一个盗贼技能',
    minLevel: 1,
  },
  // 自动生成的装备
  ...generateEquipment(),
];

// 三十种怪物共享同一份基础掉落表
// 第一档难度的基础概率
// 普通至超越宝箱概率依次为 30%、4%、0.8%、0.3%、0.03%、0.003%、0.0003%
// 高品质宝箱概率随怪物静态难度层级缩放
// 每提升一档难度，非普通宝箱概率增加百分之十，上限为百分之百
const CHEST_LOOT_BASE: LootEntry[] = [
  { itemId: 'common_chest', chance: 0.3, minCount: 1, maxCount: 1 },
  { itemId: 'uncommon_chest', chance: 0.04, minCount: 1, maxCount: 1 },
  { itemId: 'rare_chest', chance: 0.008, minCount: 1, maxCount: 1 },
  { itemId: 'epic_chest', chance: 0.003, minCount: 1, maxCount: 1 },
  { itemId: 'legendary_chest', chance: 0.0003, minCount: 1, maxCount: 1 },
  { itemId: 'mythic_chest', chance: 0.00003, minCount: 1, maxCount: 1 },
  { itemId: 'transcendent_chest', chance: 0.000003, minCount: 1, maxCount: 1 },
];

// 按静态难度层级缩放各项基础掉落概率，并限制最大概率
export function getTierLootTable(tier: number): LootEntry[] {
  const scale = 1 + (tier - 1) * 0.1;
  return CHEST_LOOT_BASE.map((entry) => ({
    ...entry,
    chance: Math.min(1, entry.chance * scale),
  }));
}

export const MONSTERS: MonsterDef[] = [
  // 一至五级史莱姆族
  ...Array.from(
    { length: 5 },
    // 生成一至五级史莱姆的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 1;
      return {
        id: `slime_${level}`,
        name: level <= 2 ? '小史莱姆' : level <= 4 ? '绿色史莱姆' : '巨型史莱姆',
        hp: 30 + level * 12,
        atk: 3 + level * 2,
        def: 1 + level * 0.5,
        expReward: 15 + level * 3,
        goldReward: 5 + level * 2,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
  // 六至十级哥布林族
  ...Array.from(
    { length: 5 },
    // 生成六至十级哥布林的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 6;
      return {
        id: `goblin_${level}`,
        name: level <= 7 ? '哥布林' : level <= 9 ? '哥布林战士' : '哥布林队长',
        hp: 50 + level * 15,
        atk: 6 + level * 3,
        def: 2 + level * 0.8,
        expReward: 25 + level * 4,
        goldReward: 8 + level * 3,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
  // 十一至十五级骷髅族
  ...Array.from(
    { length: 5 },
    // 生成十一至十五级骷髅的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 11;
      return {
        id: `skeleton_${level}`,
        name: level <= 12 ? '骷髅兵' : level <= 14 ? '骷髅弓手' : '骷髅领主',
        hp: 80 + level * 20,
        atk: 10 + level * 3.5,
        def: 4 + level * 1,
        expReward: 40 + level * 5,
        goldReward: 12 + level * 4,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
  // 十六至二十级兽人族
  ...Array.from(
    { length: 5 },
    // 生成十六至二十级兽人的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 16;
      return {
        id: `orc_${level}`,
        name: level <= 17 ? '兽人' : level <= 19 ? '兽人战士' : '兽人督军',
        hp: 120 + level * 25,
        atk: 16 + level * 4,
        def: 6 + level * 1.2,
        expReward: 60 + level * 6,
        goldReward: 18 + level * 5,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
  // 二十一至二十五级恶魔族
  ...Array.from(
    { length: 5 },
    // 生成二十一至二十五级恶魔的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 21;
      return {
        id: `demon_${level}`,
        name: level <= 22 ? '恶魔' : level <= 24 ? '恶魔骑士' : '恶魔领主',
        hp: 200 + level * 35,
        atk: 25 + level * 5,
        def: 10 + level * 1.5,
        expReward: 100 + level * 8,
        goldReward: 30 + level * 7,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
  // 二十六至三十级龙族，作为理论高等级配置
  ...Array.from(
    { length: 5 },
    // 生成二十六至三十级龙族的属性、奖励与掉落配置
    (_, i) => {
      const level = i + 26;
      return {
        id: `dragon_${level}`,
        name: level <= 27 ? '幼龙' : level <= 29 ? '古龙' : '龙王',
        hp: 400 + level * 50,
        atk: 40 + level * 6,
        def: 15 + level * 2,
        expReward: 200 + level * 15,
        goldReward: 50 + level * 10,
        lootTable: CHEST_LOOT_BASE,
      };
    },
  ),
];

export const SHOP_ITEMS: ShopItem[] = [
  // 按职业与等级出售优秀品质的武器和护甲
  ...ITEMS.filter(
    (item) =>
      item.type === 'equipment' && item.rarity === 'uncommon' && (item.slot === 'weapon' || item.slot === 'armor'),
  ).map((item) => ({
    itemId: item.id,
    price: Math.max(50, item.minLevel * 30),
    currency: 'gold' as const,
    minLevel: item.minLevel,
  })),

  // 宝箱售价从一千至一百万金币
  { itemId: 'common_chest', price: 1_000, currency: 'gold' as const },
  { itemId: 'uncommon_chest', price: 10_000, currency: 'gold' as const },
  { itemId: 'rare_chest', price: 50_000, currency: 'gold' as const },
  { itemId: 'epic_chest', price: 200_000, currency: 'gold' as const },
  { itemId: 'legendary_chest', price: 500_000, currency: 'gold' as const },
  { itemId: 'mythic_chest', price: 1_000_000, currency: 'gold' as const },

  // Expensive skill books (100万 gold each)
  { itemId: 'skill_book_warrior', price: 1_000_000, currency: 'gold' as const },
  { itemId: 'skill_book_mage', price: 1_000_000, currency: 'gold' as const },
  { itemId: 'skill_book_rogue', price: 1_000_000, currency: 'gold' as const },
];
